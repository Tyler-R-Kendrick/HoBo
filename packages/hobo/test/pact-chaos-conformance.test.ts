/**
 * The full failure-state matrix, over a pact, against the driver that ships.
 *
 * Three things changed from the first version of this file, and each was a way
 * the old one could be green while being weak:
 *
 *  1. **It drove a hand-written `upsert`, not the product.** The assertion was
 *     about a *pattern* I reproduced in the test file. A pattern I wrote cannot
 *     fail in a way the shipped driver does. This drives
 *     `createCloudflareDnsProvider` — the function `hobo up` actually calls.
 *
 *  2. **It faulted one call.** Index 1, the create. That is the highest-value
 *     single scenario and about a fifth of the failure surface: a run that dies
 *     on the lookup, or during teardown, or twice in a row, was never executed.
 *     The matrix sweeps every fault at every call index and adds the two shapes
 *     an index sweep cannot express.
 *
 *  3. **It could not prove convergence, and said so.** That was true of the
 *     *filtered* lookup interaction, which the contract records only in its
 *     pre-create form. It was not true of the document: the same pact records
 *     `list all zone records` holding `rec1` — the populated state — so absent
 *     and present are both recorded, and sequencing them proves convergence
 *     without inventing a response. The old file's "does NOT claim" test was
 *     therefore correct about the interaction it inspected and wrong about the
 *     conclusion it drew, and it is replaced here.
 *
 * What is asserted is two properties, both computed from the pact:
 *
 *  - **Convergence** — after any failure at any point, a retry lands exactly
 *    one record, never issues a second create against a record it has been
 *    shown exists, and never concludes "absent" from a read that failed.
 *  - **Fidelity** — every request issued while recovering is one the contract
 *    declares: recorded path, recorded body, recorded headers. A driver can
 *    converge while talking nonsense; that ships as a 400 on the first real
 *    retry, and only a fidelity check catches it here.
 *
 * The bound that remains: these pacts are hand-authored consumer expectations,
 * not traffic captured from Cloudflare. This proves the driver honours the
 * contract the repo agreed on. It is not evidence about the live API.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCloudflareDnsProvider } from "@hobo/connectivity";
import type { PactDocument } from "@hobo/contract-harness";
import {
	createMockProviderFromPact,
	loadPactDirectory,
} from "@hobo/contract-harness";
import { parseTenantId } from "@hobo/core";
import {
	type PactChaosSubject,
	type PactLifecycle,
	PactLifecycleError,
	pactBackedTransport,
	pactChaosViolations,
	runPactChaosMatrix,
	statelessPactAnswer,
} from "@hobo/testing";
import { beforeAll, describe, expect, it } from "vitest";

const CONTRACTS_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../connectivity/contracts/pacts",
);

const ZONE = "example.com";
const RECORD = "web.myapp.hobo.example.com";
const TENANT = parseTenantId("acme");

/**
 * The lifecycle, written entirely in terms of interactions the pact already
 * contains — every `answers` value is a recorded interaction's description, so
 * no response body originates here.
 *
 * The two overrides are the whole point. Without them the world answers each
 * request identically forever: an unfiltered list would report `rec1` before
 * anything was created, and a filtered lookup would report empty forever after.
 * Both directions are wrong, and the second is the one that makes a convergence
 * assertion meaningless.
 */
const DNS_LIFECYCLE: PactLifecycle = {
	initial: "absent",
	created: "present",
	creates: ["POST /v4/zones/zone-1/dns_records"],
	answers: {
		absent: {
			"GET /v4/zones/zone-1/dns_records?per_page=100": "list dns records empty",
		},
		present: {
			[`GET /v4/zones/zone-1/dns_records?type=CNAME&name=${RECORD}`]:
				"list all zone records",
		},
	},
	transitions: {
		"POST /v4/zones/zone-1/dns_records": "present",
		"PUT /v4/zones/zone-1/dns_records/rec1": "present",
		"DELETE /v4/zones/zone-1/dns_records/rec1": "absent",
	},
};

let dnsPact: PactDocument;
let lbPact: PactDocument;

beforeAll(async () => {
	const pacts = await loadPactDirectory(CONTRACTS_DIR);
	const dns = pacts.find((p) => p.provider.name === "CloudflareDnsApi");
	const lb = pacts.find(
		(p) => p.provider.name === "CloudflareLoadBalancingApi",
	);
	if (!dns) throw new Error("CloudflareDnsApi pact not found");
	if (!lb) throw new Error("CloudflareLoadBalancingApi pact not found");
	dnsPact = dns;
	lbPact = lb;
});

function subject(): PactChaosSubject {
	return {
		label: "cloudflare-dns/createCloudflareDnsProvider",
		lifecycle: DNS_LIFECYCLE,
		world: (lifecycle) => pactBackedTransport(dnsPact, { lifecycle }),
		bind: ({ fetchImpl }) => {
			const provider = createCloudflareDnsProvider({
				apiToken: "test-token",
				zoneId: "zone-1",
				apiBase: "https://api.cloudflare.com/v4",
				fetchImpl,
			});
			return {
				converge: async () => {
					await provider.upsert(TENANT, ZONE, {
						name: RECORD,
						type: "CNAME",
						content: "funnel.ts.net",
						gatewayTarget: true,
						ttl: 300,
					});
				},
				observe: async () => provider.list(TENANT, ZONE),
				remove: async () => {
					await provider.remove(TENANT, ZONE, RECORD, "CNAME");
				},
			};
		},
	};
}

describe("the pact-backed world sequences states without inventing responses", () => {
	it("agrees with the stateless mock in its initial state", async () => {
		// The stateful path must be an extension of the repo's existing matching
		// semantics, not a second matcher that drifts from it. Every recorded
		// request gets the same answer from both, before any transition fires.
		for (const interaction of dnsPact.interactions) {
			const world = pactBackedTransport(dnsPact, { lifecycle: DNS_LIFECYCLE });
			const stateless = await statelessPactAnswer(dnsPact, interaction.request);
			const stateful = await world.transport({
				method: interaction.request.method,
				url: `https://api.cloudflare.com${interaction.request.path}`,
				headers: {},
				timeoutMs: 5_000,
				maxResponseBytes: 65_536,
				...(interaction.request.body !== undefined
					? { body: JSON.stringify(interaction.request.body) }
					: {}),
			});
			// The two state-dependent reads are exactly the ones expected to differ.
			const overridden =
				DNS_LIFECYCLE.answers.absent?.[
					`${interaction.request.method} ${interaction.request.path}`
				] !== undefined;
			if (overridden) continue;
			expect(stateful.status).toBe(stateless.status);
		}
	});

	it("reports absent before the create and present after it", async () => {
		const world = pactBackedTransport(dnsPact, { lifecycle: DNS_LIFECYCLE });
		const run = subject().bind({
			transport: world.transport,
			fetchImpl: world.fetchImpl,
		});

		expect(await run.observe()).toHaveLength(0);
		await run.converge();
		expect(world.state()).toBe("present");
		expect(await run.observe()).toHaveLength(1);
		expect(world.countUnmatched()).toBe(0);
		expect(world.fidelityViolations()).toEqual([]);
	});

	it("refuses a lifecycle that names an interaction the pact lacks", () => {
		expect(() =>
			pactBackedTransport(dnsPact, {
				lifecycle: {
					...DNS_LIFECYCLE,
					answers: {
						absent: {
							"GET /v4/zones/zone-1/dns_records?per_page=100": "no such thing",
						},
					},
				},
			}),
		).toThrow(PactLifecycleError);
	});

	it("refuses a substitution that would answer a filtered read with an excluded record", () => {
		// The honesty check. Answering the A-record query with the CNAME
		// collection would be a lie the harness told on the driver's behalf, and
		// it is the one shortcut this design could take silently.
		const widened: PactDocument = {
			...dnsPact,
			interactions: [
				...dnsPact.interactions,
				{
					description: "list a records empty",
					request: {
						method: "GET",
						path: `/v4/zones/zone-1/dns_records?type=A&name=${RECORD}`,
					},
					response: { status: 200, body: { success: true, result: [] } },
				},
			],
		};
		expect(() =>
			pactBackedTransport(widened, {
				lifecycle: {
					...DNS_LIFECYCLE,
					answers: {
						...DNS_LIFECYCLE.answers,
						present: {
							[`GET /v4/zones/zone-1/dns_records?type=A&name=${RECORD}`]:
								"list all zone records",
						},
					},
				},
			}),
		).toThrow(/type is "CNAME" while the query asks for "A"/);
	});

	it("catches a request body the contract does not declare", async () => {
		const world = pactBackedTransport(dnsPact, { lifecycle: DNS_LIFECYCLE });
		await world.transport({
			method: "POST",
			url: "https://api.cloudflare.com/v4/zones/zone-1/dns_records",
			headers: {},
			timeoutMs: 5_000,
			maxResponseBytes: 65_536,
			body: JSON.stringify({ type: "CNAME", name: RECORD, content: "wrong" }),
		});
		const violations = world.fidelityViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0]?.kind).toBe("body-mismatch");
		expect(violations[0]?.detail).toContain("content");
	});
});

describe("createCloudflareDnsProvider under the full failure matrix", () => {
	it("converges and stays faithful to the contract in every scenario", async () => {
		const results = await runPactChaosMatrix(subject());
		expect(pactChaosViolations(results)).toEqual([]);
	});

	it("actually ran the matrix it claims to have run", async () => {
		// A matrix that silently ran zero scenarios would satisfy the assertion
		// above. 6 faults x (2 call indices + 1 double + 2 teardown) = 30.
		const results = await runPactChaosMatrix(subject());
		expect(results).toHaveLength(30);
		expect(new Set(results.map((r) => r.fault)).size).toBe(6);
		expect(new Set(results.map((r) => r.kind))).toEqual(
			new Set(["single", "double", "teardown"]),
		);
		// And at least one scenario must have reached the state where the write
		// landed but the client never learned — the case the lane exists for.
		expect(
			results.some((r) => r.writeLanded && r.firstRejected === false),
		).toBe(true);
	});

	it("adopts rather than re-creating once the record exists", async () => {
		const world = pactBackedTransport(dnsPact, { lifecycle: DNS_LIFECYCLE });
		const run = subject().bind({
			transport: world.transport,
			fetchImpl: world.fetchImpl,
		});
		await run.converge();
		await run.converge();
		await run.converge();
		expect(world.countCreates()).toBe(1);
		expect(await run.observe()).toHaveLength(1);
	});
});

describe("the contract covers the branch a second deploy takes", () => {
	it("declares the update the driver issues once the record exists", () => {
		// This interaction did not exist before this lane drove the real driver.
		// The consumer contract test only ever exercised the create branch,
		// because a stateless mock always answers "absent" — so the update path,
		// which runs on every deploy after the first, had never been checked
		// against the contract at all. The matrix found it as an
		// `unmatched-path` fidelity violation on the retry.
		const update = dnsPact.interactions.find(
			(i) =>
				i.request.method === "PUT" &&
				i.request.path === "/v4/zones/zone-1/dns_records/rec1",
		);
		expect(update).toBeDefined();
		expect((update?.response.body as { success?: boolean })?.success).toBe(
			true,
		);
	});

	it("records both the absent and the present state of the same collection", () => {
		// The pair that makes convergence provable from this document.
		const empty = dnsPact.interactions.find(
			(i) => i.description === "list dns records empty",
		);
		const populated = dnsPact.interactions.find(
			(i) => i.description === "list all zone records",
		);
		expect((empty?.response.body as { result?: unknown[] })?.result).toEqual(
			[],
		);
		expect(
			(populated?.response.body as { result?: { id: string }[] })?.result?.[0]
				?.id,
		).toBe("rec1");
	});

	it("still verifies against the stateless mock every other consumer uses", () => {
		// Adding an interaction must not change how the shared mock answers the
		// interactions that were already there.
		const stub = createMockProviderFromPact(dnsPact);
		expect(
			stub.handle({
				method: "GET",
				path: `/v4/zones/zone-1/dns_records?type=CNAME&name=${RECORD}`,
			}).status,
		).toBe(200);
	});
});

/**
 * The DNS contract records no request headers, so driving only that subject
 * would leave `header-mismatch` and `unmatched-path` as code that has never
 * been observed to fire — which is the same as not having them. The load
 * balancing contract does record `Accept`, `Authorization` and `Content-Type`,
 * so it is the subject that can exercise the header half.
 *
 * This block tests the *harness*, not a driver: it drives the world by hand so
 * each fidelity kind is produced deliberately. The driver-level proof is the
 * matrix above.
 */
describe("fidelity classification", () => {
	const LB_PUT =
		"https://api.cloudflare.com/client/v4/zones/zone-a/load_balancers/load-balancer-a";
	const LB_BODY = {
		name: "checkout.example.test",
		default_pools: ["pool-primary"],
		fallback_pool: "pool-primary",
		steering_policy: "random",
		enabled: true,
		random_steering: { pool_weights: { "pool-primary": 1 } },
	};
	const RECORDED_HEADERS = {
		Accept: "application/json",
		Authorization: "Bearer test-token",
		"Content-Type": "application/json",
	};

	async function put(
		world: ReturnType<typeof pactBackedTransport>,
		headers: Readonly<Record<string, string>>,
	) {
		return world.transport({
			method: "PUT",
			url: LB_PUT,
			headers,
			timeoutMs: 5_000,
			maxResponseBytes: 65_536,
			body: JSON.stringify(LB_BODY),
		});
	}

	it("accepts a request that carries every recorded header", async () => {
		const world = pactBackedTransport(lbPact);
		const response = await put(world, RECORDED_HEADERS);
		expect(response.status).toBe(200);
		expect(world.fidelityViolations()).toEqual([]);
	});

	it("reports a dropped credential header rather than answering as if nothing happened", async () => {
		// The failure this catches for real: a driver that assembles headers on
		// its happy path and takes a different branch while recovering. The
		// provider would answer 401; a mock that ignores headers answers 200 and
		// the lane stays green.
		const world = pactBackedTransport(lbPact);
		const { Authorization: _dropped, ...withoutAuth } = RECORDED_HEADERS;
		await put(world, withoutAuth);
		const violations = world.fidelityViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0]?.kind).toBe("header-mismatch");
		expect(violations[0]?.detail).toContain("authorization");
	});

	it("matches headers case-insensitively, as HTTP does", async () => {
		const world = pactBackedTransport(lbPact);
		await put(world, {
			accept: "application/json",
			authorization: "Bearer test-token",
			"content-type": "application/json",
		});
		expect(world.fidelityViolations()).toEqual([]);
	});

	it("reports a path no interaction declares", async () => {
		const world = pactBackedTransport(lbPact);
		await world.transport({
			method: "GET",
			url: "https://api.cloudflare.com/client/v4/zones/zone-a/nothing_recorded",
			headers: {},
			timeoutMs: 5_000,
			maxResponseBytes: 65_536,
		});
		const violations = world.fidelityViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0]?.kind).toBe("unmatched-path");
		expect(world.countUnmatched()).toBe(1);
	});

	it("sequences a PUT-idempotent lifecycle, not just the DNS shape", async () => {
		// Generality check: this contract creates with PUT on the same path it
		// reads and deletes, where the DNS one creates with POST on a collection.
		// A harness that only worked for one shape would be a harness for one test.
		const world = pactBackedTransport(lbPact, {
			lifecycle: {
				initial: "absent",
				created: "present",
				creates: ["PUT /client/v4/zones/zone-a/load_balancers/load-balancer-a"],
				answers: {},
				transitions: {
					"PUT /client/v4/zones/zone-a/load_balancers/load-balancer-a":
						"present",
					"DELETE /client/v4/zones/zone-a/load_balancers/load-balancer-a":
						"absent",
				},
			},
		});
		expect(world.state()).toBe("absent");
		await put(world, RECORDED_HEADERS);
		expect(world.state()).toBe("present");
		expect(world.countCreates()).toBe(1);
		await world.transport({
			method: "DELETE",
			url: LB_PUT,
			headers: {},
			timeoutMs: 5_000,
			maxResponseBytes: 65_536,
		});
		expect(world.state()).toBe("absent");
		expect(world.fidelityViolations()).toEqual([]);
	});
});
