/**
 * Chaos over a PACT, instead of chaos over a fake somebody imagined.
 *
 * The repo already had both halves and never joined them. `chaosTransport`
 * injects the five faults that leave a write *ambiguous*; `createMockProviderFromPact`
 * turns a recorded contract into a responder. Chaos ran against hand-written
 * fake worlds — which is a real test of the resolver's control flow, and a
 * weak test of its reading of the provider, because the fake answers the way
 * whoever wrote it *believed* the provider answers. If that belief is wrong,
 * a green chaos run proves convergence against a fiction.
 *
 * A pact is the other thing: a recorded, provider-verified interaction. Driving
 * chaos through one keeps the fault model and swaps the fiction for evidence —
 * the status codes, envelopes and field names come from the contract, so a
 * resolver that only converges because the fake was generous now fails.
 *
 * The two-sided honesty of the result is worth stating plainly:
 *
 *  - What this **does** buy: convergence tested against response shapes a
 *    provider verification has actually agreed to, for every recorded path.
 *  - What it does **not** buy: the pact was recorded without faults. It says
 *    what the provider returns when things go well, and nothing whatsoever
 *    about what it returns mid-failure. Replaying a recorded 200 after a
 *    truncated body models "the write landed, the client never learned" — the
 *    exact ambiguity we want — but it is a model, not an observation.
 *
 * `PACT_NO_INTERACTION` is deliberately surfaced rather than smoothed into a
 * generic 404: a chaos run that silently probes paths the contract never
 * recorded is testing the mock, not the provider.
 */
import {
	createMockProviderFromPact,
	type PactDocument,
	type PactRequest,
	type ProviderStub,
} from "@hobo/contract-harness";
import type { HttpTransport, TransportResponse } from "@hobo/core";

/** How the pact-backed world behaved, for a chaos subject's counters. */
export interface PactWorld {
	readonly transport: HttpTransport;
	/** Every call the transport saw, in order. */
	readonly calls: readonly PactRequest[];
	/** Calls whose method creates — the number a convergent retry must not raise. */
	countCreates: () => number;
	/** Paths the pact had no interaction for. Non-zero means the probe is wrong. */
	countUnmatched: () => number;
}

const CREATE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT"]);

/** JSON in, JSON out — the shape every recorded contract in this repo uses. */
function parseBody(body: string | undefined): unknown {
	if (body === undefined || body.length === 0) return undefined;
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return body;
	}
}

function toTransportResponse(
	status: number,
	headers: Readonly<Record<string, string>> | undefined,
	body: unknown,
): TransportResponse {
	return {
		status,
		headers: { "content-type": "application/json", ...(headers ?? {}) },
		body: body === undefined ? "" : JSON.stringify(body),
	};
}

/**
 * An `HttpTransport` that answers from a pact's recorded interactions.
 *
 * Pass the result as the inner transport of a chaos scenario: the faults come
 * from `chaosTransport`, the response shapes come from the contract.
 */
export function pactBackedTransport(pact: PactDocument): PactWorld {
	const provider: ProviderStub = createMockProviderFromPact(pact);
	const calls: PactRequest[] = [];
	let unmatched = 0;

	const transport: HttpTransport = async (request) => {
		const url = new URL(request.url);
		const pactRequest: PactRequest = {
			method: request.method as PactRequest["method"],
			path: `${url.pathname}${url.search}`,
			...(parseBody(request.body) !== undefined
				? { body: parseBody(request.body) }
				: {}),
		};
		calls.push(pactRequest);

		const response = await Promise.resolve(provider.handle(pactRequest));
		// The mock reports an unrecorded path as its own 404 code. Counting it
		// separately is what stops a chaos run from looking green while every
		// call missed the contract entirely.
		const body = response.body as { error?: { code?: string } } | undefined;
		if (body?.error?.code === "PACT_NO_INTERACTION") unmatched += 1;

		return toTransportResponse(
			response.status,
			response.headers,
			response.body,
		);
	};

	return {
		transport,
		calls,
		countCreates: () =>
			calls.filter((call) => CREATE_METHODS.has(call.method)).length,
		countUnmatched: () => unmatched,
	};
}
