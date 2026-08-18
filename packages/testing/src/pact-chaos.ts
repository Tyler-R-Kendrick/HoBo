/**
 * Chaos over a PACT, with the two things a chaos lane has to prove:
 * **convergence** (a retry after an ambiguous failure lands one resource, not
 * two) and **fidelity** (the requests it sends still match the contract while
 * it is recovering).
 *
 * ## Why a pact rather than a fake
 *
 * `chaos-conformance.ts` drives resolvers through faults over hand-written
 * worlds. That is an honest test of a resolver's control flow and a weak test
 * of its reading of the provider, because the fake answers the way whoever
 * wrote it *believed* the provider answers. If that belief is wrong, a green
 * chaos run proves convergence against a fiction.
 *
 * A pact is the other thing. To be exact about what these documents are —
 * because the word "recorded" invites an overclaim: the pacts in this repo are
 * **hand-authored consumer expectations**, reviewed and shared across every
 * consumer of that provider, not traffic captured from a live provider and not
 * verified by one. So the upgrade is real but bounded: one reviewed definition
 * of the contract instead of a private fake per test, and a single place where
 * being wrong about the provider is visible to everybody rather than to one
 * test file. It is not evidence about the live API. Closing *that* gap needs a
 * real account, and is tracked as the branch's irreducible gap.
 *
 * ## Why the world has to be stateful
 *
 * Convergence is a claim about a *sequence*: absent before the write, present
 * after it, so a retry can look and adopt. `createMockProviderFromPact` is a
 * stateless request/response replay — it answers a lookup identically forever,
 * so a replayed retry always sees absent and always creates again. Against
 * that mock a convergence assertion passes for a non-convergent driver and
 * fails for a convergent one, which is worse than having no assertion.
 *
 * This module adds the sequence *without inventing a single response byte*. A
 * `PactLifecycle` says which **recorded interaction** answers which request in
 * which state, and which requests move the world between states. Every body
 * served is a body some interaction in the document already declares. What is
 * new is only the ordering — and the ordering is the part a pact deliberately
 * does not express.
 *
 * The substitution that makes this work is also the one that could quietly
 * lie: answering a *filtered* read (`?type=CNAME&name=web…`) in the "present"
 * state with a *collection* interaction's body. `assertFilterConsistency`
 * refuses to build a world where that substitution would hand back a record
 * the query string excludes, so the shortcut cannot silently widen into a
 * wrong answer.
 *
 * ## What is still a model, not an observation
 *
 * The pact declares what the provider returns when things go well. It says
 * nothing about mid-failure behaviour, and no pact in this repo records any.
 * Replaying a recorded 200 and then truncating it models "the write landed,
 * the client never learned" — the exact ambiguity that matters — but it is a
 * model of that failure, not a recording of one.
 */
import {
	createMockProviderFromPact,
	isRecursiveSubset,
	type PactDocument,
	type PactInteraction,
	type PactRequest,
	subsetMismatchPath,
} from "@hobo/contract-harness";
import type { HttpTransport, TransportResponse } from "@hobo/core";

// public-contract: the ways a request can fail to honour the contract it is replayed against.
export const PACT_FIDELITY_KINDS = Object.freeze([
	/** No interaction declares this method and path at all. */
	"unmatched-path",
	/** An interaction declares this path, but its recorded request body is not a subset of what was sent. */
	"body-mismatch",
	/** An interaction declares this path, but a header it records was missing or different. */
	"header-mismatch",
] as const);

export type PactFidelityKind = (typeof PACT_FIDELITY_KINDS)[number];

export interface PactFidelityViolation {
	readonly kind: PactFidelityKind;
	readonly method: string;
	readonly path: string;
	/** Which call index broke, so a matrix failure names one reproducible scenario. */
	readonly callIndex: number;
	readonly detail: string;
}

/**
 * A lifecycle over interactions the document already contains.
 *
 * Selectors are `"METHOD /path?query"` — the exact path a recorded interaction
 * declares, so a typo is a construction-time refusal rather than a world that
 * silently degrades to stateless.
 */
export interface PactLifecycle {
	/** State the world starts in. */
	readonly initial: string;
	/** The state meaning "the resource exists". */
	readonly created: string;
	/**
	 * Selectors that **create** the resource, as opposed to updating one that
	 * already exists.
	 *
	 * This has to be declared rather than inferred from the transitions, and the
	 * distinction is the whole duplication check. A convergent driver that finds
	 * its record present issues an *update* — `PUT /dns_records/rec1` — which
	 * also lands in the `created` state. Inferring "anything that reaches
	 * `created` is a create" would count that update as a second create and fail
	 * the exact driver the lane exists to bless.
	 */
	readonly creates: readonly string[];
	/**
	 * Who chooses the resource's identity — and therefore whether repeating a
	 * create can duplicate anything.
	 *
	 * `"provider-minted"` is the dangerous shape: a POST to a collection where
	 * the provider allocates the id. Issue it twice and two resources exist,
	 * which is what every duplication rule in the matrix is looking for.
	 *
	 * `"client-supplied"` is a PUT to a path the caller already named. Repeating
	 * it is not duplication, it is *the* correct recovery — the second PUT lands
	 * on the same resource as the first. A matrix that applied the duplication
	 * rules here would fail a driver for doing exactly the right thing, so it
	 * asserts convergence on the observed result and final state instead.
	 *
	 * Defaults to `"provider-minted"`, the stricter reading: a lifecycle that
	 * forgets to say gets the rules that can only produce false alarms, never
	 * false clearances.
	 */
	readonly identity?: "provider-minted" | "client-supplied";
	/**
	 * `state -> (selector -> description of the interaction whose response to serve)`.
	 *
	 * A selector absent here is answered by its own recorded interaction, which
	 * is why only the state-dependent reads need listing.
	 */
	readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/** `selector -> state the world moves to when that call answers 2xx`. */
	readonly transitions: Readonly<Record<string, string>>;
}

export interface PactWorld {
	/** For drivers built on `@hobo/core`'s `HttpTransport`. */
	readonly transport: HttpTransport;
	/** For drivers that take a `fetchImpl`, which is most of the connectivity ones. */
	readonly fetchImpl: typeof fetch;
	/** Every call the world saw, in order. */
	readonly calls: readonly PactRequest[];
	/** Where the lifecycle currently sits. */
	state: () => string;
	/** Create-shaped calls issued, whether or not they succeeded. */
	countCreates: () => number;
	/** Calls no interaction declares. Non-zero means the probe is wrong, not the driver. */
	countUnmatched: () => number;
	/** Every way a call failed to honour the contract. */
	fidelityViolations: () => readonly PactFidelityViolation[];
}

export class PactLifecycleError extends Error {
	readonly code = "PACT_LIFECYCLE_INVALID";
	readonly remediation: string;
	constructor(message: string, remediation: string) {
		super(message);
		this.name = "PactLifecycleError";
		this.remediation = remediation;
	}
}

function selectorOf(method: string, path: string): string {
	return `${method} ${path}`;
}

function parseSelector(selector: string): {
	method: string;
	path: string;
} {
	const space = selector.indexOf(" ");
	if (space <= 0) {
		throw new PactLifecycleError(
			`selector ${JSON.stringify(selector)} is not "METHOD /path"`,
			'write selectors as "GET /v4/zones/zone-1/dns_records?per_page=100"',
		);
	}
	return {
		method: selector.slice(0, space),
		path: selector.slice(space + 1),
	};
}

function parseBody(body: string | undefined): unknown {
	if (body === undefined || body.length === 0) return undefined;
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return body;
	}
}

function lowerKeys(
	headers: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers ?? {})) {
		out[key.toLowerCase()] = value;
	}
	return out;
}

/**
 * Refuses a world whose state substitution would answer a filtered read with a
 * record the filter excludes.
 *
 * This is the one place the lifecycle could quietly lie. Answering
 * `?type=CNAME&name=web.myapp…` in the "present" state with the body of the
 * unfiltered `?per_page=100` interaction is legitimate exactly when every
 * element of that body satisfies the query — and a mechanical check is
 * cheaper than trusting that it always will be. Query keys no element carries
 * (`per_page`, `status`) are paging and filtering concerns the body does not
 * express, so they are skipped rather than failed.
 */
function assertFilterConsistency(
	selector: string,
	answering: PactInteraction,
): void {
	const { path } = parseSelector(selector);
	const queryStart = path.indexOf("?");
	if (queryStart < 0) return;
	const params = new URLSearchParams(path.slice(queryStart + 1));
	if ([...params.keys()].length === 0) return;

	for (const element of collectionElements(answering.response.body)) {
		for (const [key, expected] of params) {
			if (!(key in element)) continue;
			const actual = element[key];
			if (String(actual) !== expected) {
				throw new PactLifecycleError(
					`answering ${JSON.stringify(selector)} with interaction ${JSON.stringify(
						answering.description,
					)} would return a record whose ${key} is ${JSON.stringify(
						actual,
					)} while the query asks for ${JSON.stringify(expected)}`,
					"answer a filtered read only with an interaction whose records satisfy that filter, or record a filtered interaction for the populated state",
				);
			}
		}
	}
}

/** Every object inside any array in the body — the records a collection read returns. */
function collectionElements(
	body: unknown,
): readonly Readonly<Record<string, unknown>>[] {
	const found: Readonly<Record<string, unknown>>[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) {
				if (typeof item === "object" && item !== null && !Array.isArray(item)) {
					found.push(item as Record<string, unknown>);
				}
			}
			return;
		}
		if (typeof node === "object" && node !== null) {
			for (const value of Object.values(node)) visit(value);
		}
	};
	visit(body);
	return found;
}

function assertLifecycle(pact: PactDocument, lifecycle: PactLifecycle): void {
	const byDescription = new Map(
		pact.interactions.map((i) => [i.description, i]),
	);
	const declared = new Set(
		pact.interactions.map((i) => selectorOf(i.request.method, i.request.path)),
	);
	// A state is introduced by any of the three: where the world starts, a state
	// with response overrides, or a state some transition moves to. A lifecycle
	// whose states differ only in what they transition to — the PUT-idempotent
	// shape, where the same path creates, reads and deletes — declares no
	// overrides at all, so collecting states from `answers` alone would reject it.
	const states = new Set([
		lifecycle.initial,
		...Object.keys(lifecycle.answers),
		...Object.values(lifecycle.transitions),
	]);

	if (!states.has(lifecycle.created)) {
		throw new PactLifecycleError(
			`created state ${JSON.stringify(lifecycle.created)} is not one of ${[...states].join(", ")}`,
			"name a state the world can actually reach — one that is the initial state, has answers, or is some transition's target",
		);
	}

	for (const [stateName, answers] of Object.entries(lifecycle.answers)) {
		for (const [selector, description] of Object.entries(answers)) {
			parseSelector(selector);
			if (!declared.has(selector)) {
				throw new PactLifecycleError(
					`state ${JSON.stringify(stateName)} answers ${JSON.stringify(selector)}, which no interaction declares`,
					`declared selectors: ${[...declared].sort().join(", ")}`,
				);
			}
			const answering = byDescription.get(description);
			if (!answering) {
				throw new PactLifecycleError(
					`state ${JSON.stringify(stateName)} answers with interaction ${JSON.stringify(description)}, which the pact does not contain`,
					`available descriptions: ${[...byDescription.keys()].join(", ")}`,
				);
			}
			assertFilterConsistency(selector, answering);
		}
	}

	for (const selector of lifecycle.creates) {
		parseSelector(selector);
		if (!declared.has(selector)) {
			throw new PactLifecycleError(
				`creates lists ${JSON.stringify(selector)}, which no interaction declares`,
				`declared selectors: ${[...declared].sort().join(", ")}`,
			);
		}
	}

	for (const [selector, to] of Object.entries(lifecycle.transitions)) {
		parseSelector(selector);
		if (!declared.has(selector)) {
			throw new PactLifecycleError(
				`transition on ${JSON.stringify(selector)} names a request no interaction declares`,
				`declared selectors: ${[...declared].sort().join(", ")}`,
			);
		}
		if (!states.has(to)) {
			throw new PactLifecycleError(
				`transition on ${JSON.stringify(selector)} moves to unknown state ${JSON.stringify(to)}`,
				`known states: ${[...states].join(", ")}`,
			);
		}
	}
}

/**
 * A world that answers from a pact's interactions and *sequences* them.
 *
 * Without `lifecycle` this is a stateless replay whose answers are identical
 * to `createMockProviderFromPact` — deliberately, so the stateful path is a
 * strict extension of the repo's existing matching semantics rather than a
 * second, subtly different matcher. `pact-chaos.test.ts` pins that agreement.
 */
export function pactBackedTransport(
	pact: PactDocument,
	options: { readonly lifecycle?: PactLifecycle } = {},
): PactWorld {
	const lifecycle = options.lifecycle;
	if (lifecycle) assertLifecycle(pact, lifecycle);

	const byDescription = new Map(
		pact.interactions.map((i) => [i.description, i]),
	);
	const calls: PactRequest[] = [];
	const violations: PactFidelityViolation[] = [];
	let state = lifecycle?.initial ?? "";
	let creates = 0;
	let unmatched = 0;

	function classify(
		request: PactRequest,
		callIndex: number,
	): PactInteraction | undefined {
		const samePath = pact.interactions.filter(
			(i) =>
				i.request.method === request.method && i.request.path === request.path,
		);
		if (samePath.length === 0) {
			unmatched += 1;
			violations.push({
				kind: "unmatched-path",
				method: request.method,
				path: request.path,
				callIndex,
				detail: "no interaction declares this method and path",
			});
			return undefined;
		}

		const actualHeaders = lowerKeys(request.headers);
		const headerOk = samePath.filter((i) =>
			Object.entries(lowerKeys(i.request.headers)).every(
				([key, value]) => actualHeaders[key] === value,
			),
		);
		if (headerOk.length === 0) {
			const missing = Object.entries(lowerKeys(samePath[0]?.request.headers))
				.filter(([key, value]) => actualHeaders[key] !== value)
				.map(
					([key, value]) =>
						`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actualHeaders[key])}`,
				);
			violations.push({
				kind: "header-mismatch",
				method: request.method,
				path: request.path,
				callIndex,
				detail: missing.join("; "),
			});
			return samePath[0];
		}

		const withBody = headerOk.filter((i) => i.request.body !== undefined);
		if (withBody.length > 0) {
			const bodyOk = withBody.filter((i) =>
				isRecursiveSubset(i.request.body, request.body),
			);
			if (bodyOk.length === 0) {
				violations.push({
					kind: "body-mismatch",
					method: request.method,
					path: request.path,
					callIndex,
					detail: `recorded request body is not a subset of what was sent; first divergence at ${subsetMismatchPath(
						withBody[0]?.request.body,
						request.body,
					)}`,
				});
				return withBody[0];
			}
			return bodyOk[0];
		}

		return headerOk[0];
	}

	async function handle(request: PactRequest): Promise<TransportResponse> {
		const callIndex = calls.length;
		calls.push(request);

		const selector = selectorOf(request.method, request.path);
		const matched = classify(request, callIndex);

		// Counted on issue, not on success: a create-shaped call the provider
		// refused still tells us the driver tried to create, which is the thing
		// a duplication check is asking about.
		if (lifecycle?.creates.includes(selector)) creates += 1;

		if (!matched) {
			return {
				status: 404,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ error: { code: "PACT_NO_INTERACTION" } }),
			};
		}

		// The state override, if any, replaces WHICH recorded response is served —
		// never what it contains.
		const override = lifecycle?.answers[state]?.[selector];
		const serving = override
			? (byDescription.get(override) ?? matched)
			: matched;

		const next = lifecycle?.transitions[selector];
		if (next !== undefined && serving.response.status < 300) state = next;

		return {
			status: serving.response.status,
			headers: {
				"content-type": "application/json",
				...(serving.response.headers ?? {}),
			},
			body:
				serving.response.body === undefined
					? ""
					: JSON.stringify(serving.response.body),
		};
	}

	const transport: HttpTransport = async (request) => {
		const url = new URL(request.url);
		const body = parseBody(request.body);
		return handle({
			method: request.method as PactRequest["method"],
			path: `${url.pathname}${url.search}`,
			headers: request.headers,
			...(body !== undefined ? { body } : {}),
		});
	};

	const fetchImpl: typeof fetch = async (input, init) => {
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url,
		);
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((value, key) => {
			headers[key] = value;
		});
		const raw = typeof init?.body === "string" ? init.body : undefined;
		const body = parseBody(raw);
		const response = await handle({
			method: (init?.method ?? "GET").toUpperCase() as PactRequest["method"],
			path: `${url.pathname}${url.search}`,
			headers,
			...(body !== undefined ? { body } : {}),
		});
		return new Response(response.body, {
			status: response.status,
			headers: response.headers as HeadersInit,
		});
	};

	return {
		transport,
		fetchImpl,
		get calls() {
			return Object.freeze([...calls]);
		},
		state: () => state,
		countCreates: () => creates,
		countUnmatched: () => unmatched,
		fidelityViolations: () => Object.freeze([...violations]),
	};
}

/**
 * The stateless answer `createMockProviderFromPact` would give, for the guard
 * that pins the two matchers together.
 */
export async function statelessPactAnswer(
	pact: PactDocument,
	request: PactRequest,
): Promise<{ readonly status: number; readonly body: unknown }> {
	const response = await Promise.resolve(
		createMockProviderFromPact(pact).handle(request),
	);
	return { status: response.status, body: response.body };
}
