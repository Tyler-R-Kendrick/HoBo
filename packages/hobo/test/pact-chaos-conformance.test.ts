/**
 * Chaos driven from a recorded PACT, rather than from a fake I wrote.
 *
 * `chaos-conformance.test.ts` puts each provider's resolver through the five
 * ambiguous faults over a hand-written world. That tests the resolver's control
 * flow honestly and its reading of the provider only as far as my belief about
 * the provider is correct — the fake answers the way I think Cloudflare answers.
 * A green run there proves convergence against whatever I imagined.
 *
 * This file removes that degree of freedom for the paths a contract covers. The
 * responses come from `cloudflare-dns-api.pact.json`, the same document
 * `packages/connectivity/contracts/consumer/cloudflare-dns.contract.test.ts`
 * verifies — recorded statuses, recorded envelopes (`{success, result}`),
 * recorded ids. The faults still come from `chaosTransport`. So the question
 * asked here is sharper: *given the responses the provider has actually agreed
 * to return, does a retry after an ambiguous failure converge?*
 *
 * Two honest limits, because this is easy to over-claim:
 *
 *  1. The pact was recorded **without faults**. It says what the provider
 *     returns when things go well. Replaying a recorded 200 after a truncated
 *     body models "the write landed, the client never learned" — the exact
 *     ambiguity that matters — but it is a model of the failure, not a
 *     recording of one. No pact in this repo records mid-failure behaviour,
 *     and pretending otherwise would be the same fiction in a better costume.
 *  2. It covers only the paths the contract records. `countUnmatched()` is
 *     asserted zero precisely so a run cannot look green while every call fell
 *     through to `PACT_NO_INTERACTION`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PactDocument } from "@hobo/contract-harness";
import { loadPactDirectory } from "@hobo/contract-harness";
import { chaosTransport, pactBackedTransport } from "@hobo/testing";
import { beforeAll, describe, expect, it } from "vitest";

const CONTRACTS_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../connectivity/contracts/pacts",
);

const ZONE = "zone-1";
const RECORD_NAME = "web.myapp.hobo.example.com";
const LOOKUP = `https://api.cloudflare.com/v4/zones/${ZONE}/dns_records?type=CNAME&name=${RECORD_NAME}`;
const CREATE = `https://api.cloudflare.com/v4/zones/${ZONE}/dns_records`;

/** The five faults that leave a write ambiguous, from `@hobo/testing`. */
const AMBIGUOUS_FAULTS = [
	"network-error",
	"timeout",
	"server-error",
	"truncated-body",
	"malformed-body",
] as const;

let dnsPact: PactDocument;

beforeAll(async () => {
	const pacts = await loadPactDirectory(CONTRACTS_DIR);
	const found = pacts.find((p) => p.provider.name === "CloudflareDnsApi");
	if (!found) throw new Error("CloudflareDnsApi pact not found");
	dnsPact = found;
});

/**
 * The upsert under test, written the way a convergent driver must be: look the
 * record up first, create only when the lookup says it is absent. This is the
 * shape the real `createCloudflareDnsProvider` uses; reproducing it here keeps
 * the chaos assertion about the *pattern* rather than about one implementation.
 */
async function upsert(
	transport: (req: {
		readonly method: "GET" | "POST";
		readonly url: string;
		readonly headers: Readonly<Record<string, string>>;
		readonly timeoutMs: number;
		readonly maxResponseBytes: number;
		readonly body?: string;
	}) => Promise<{ readonly status: number; readonly body: string }>,
) {
	const base = {
		headers: { authorization: "Bearer pact-token" },
		timeoutMs: 5_000,
		maxResponseBytes: 64 * 1024,
	};

	const lookup = await transport({ method: "GET", url: LOOKUP, ...base });
	const existing = JSON.parse(lookup.body) as {
		readonly result?: readonly { readonly id: string }[];
	};
	if (existing.result && existing.result.length > 0) {
		return { id: existing.result[0]?.id, created: false };
	}

	const created = await transport({
		method: "POST",
		url: CREATE,
		...base,
		body: JSON.stringify({
			type: "CNAME",
			name: RECORD_NAME,
			content: "funnel.ts.net",
		}),
	});
	const parsed = JSON.parse(created.body) as {
		readonly result?: { readonly id?: string };
	};
	return { id: parsed.result?.id, created: true };
}

describe("the pact-backed world itself", () => {
	it("answers from the recorded contract, not from an invention", async () => {
		const world = pactBackedTransport(dnsPact);
		const outcome = await upsert(world.transport as never);
		// `rec1` is the id the CONTRACT records — not a value this file chose.
		expect(outcome.id).toBe("rec1");
		expect(outcome.created).toBe(true);
		expect(world.countUnmatched()).toBe(0);
	});

	it("reports an unrecorded path instead of quietly 404ing", async () => {
		// Without this the suite could probe paths the contract never covered and
		// still look green, which would be testing the mock rather than the provider.
		const world = pactBackedTransport(dnsPact);
		await world.transport({
			method: "GET",
			url: "https://api.cloudflare.com/v4/zones/zone-1/nothing_recorded",
			headers: {},
			timeoutMs: 1_000,
			maxResponseBytes: 1_024,
		});
		expect(world.countUnmatched()).toBe(1);
	});
});

describe.each(
	AMBIGUOUS_FAULTS,
)("cloudflare dns driver survives %s over the recorded contract", (fault) => {
	it("takes the fault, then still parses the contract-recorded response", async () => {
		const world = pactBackedTransport(dnsPact);
		// Index 1 is the create: call 0 is the existence probe, and faulting a
		// read is a different, unambiguous question — nothing was applied.
		const faulted = chaosTransport(world.transport, [{ at: 1, fault }]);

		await upsert(faulted.transport as never).catch(() => undefined);

		// The fault must actually have fired, or "survives" describes a
		// scenario that never happened.
		expect(faulted.fired).toHaveLength(1);
		expect(faulted.fired[0]?.fault).toBe(fault);

		// Retry unfaulted: the driver still reads the envelope the provider
		// verification agreed to — `{success, result:{id}}`, id `rec1` — rather
		// than a shape this test invented.
		const retry = await upsert(world.transport as never);
		expect(retry.id).toBe("rec1");

		// And every call it made hit a recorded interaction. Without this the
		// run could be green while each request fell through to the mock's
		// PACT_NO_INTERACTION, testing nothing but the mock.
		expect(world.countUnmatched()).toBe(0);
	});
});

describe("what this file deliberately does NOT claim", () => {
	it("cannot prove convergence from this pact, and says so rather than pretending", () => {
		// Convergence — "a retry after an ambiguous write creates no second
		// resource" — needs the world to SEQUENCE states: absent before the
		// create, present after it. A pact mock is a stateless request/response
		// replay, and this contract records the lookup-by-name only in its
		// pre-create form (`result: []`). There is no recorded "lookup by name
		// after create returns rec1", so a replayed retry always sees absent and
		// always creates again — which would make a convergence assertion here
		// pass for a non-convergent driver and fail for a convergent one.
		//
		// That is a property of the corpus, not a gap in the driver: these pacts
		// exist to verify request/response pairs, not lifecycles. Convergence is
		// covered by `chaos-conformance.test.ts`, whose stateful worlds can
		// express it. The two are complementary — that one owns the state
		// machine, this one owns the response shapes — and conflating them is
		// how a suite ends up proving neither.
		const lookups = dnsPact.interactions.filter(
			(i) => i.request.method === "GET" && i.request.path.includes("name="),
		);
		expect(lookups).toHaveLength(1);
		expect(
			(lookups[0]?.response.body as { result?: unknown[] })?.result,
		).toEqual([]);
	});
});
