/**
 * Upstash receipts and facts — and the credential scan that guards them.
 *
 * These artifacts land in a plan, an append-only event log, and a support
 * bundle. A leaked credential in any of those cannot be retracted, and an
 * Upstash REST token grants full read/write on the database, so the module
 * does two separate things.
 *
 * **It projects rather than spreads.** A receipt is assembled field by field
 * from the record, so a future field — a token, a URL with userinfo — is not
 * republished by default. A spread would carry it out automatically.
 *
 * **It re-scans the finished artifact anyway.** The projection is a rule a
 * later edit can break; the scan is the check that notices. It is also
 * deliberately broader than Neon's: an `opaque-blob` rule catches any long
 * unbroken token-shaped run, because an Upstash REST token has no distinctive
 * prefix to key on.
 *
 * That breadth has a cost worth pinning: the blob rule fires on anything long
 * and unbroken, so receipt content has to stay below it. That is a real
 * constraint on what may be put in a detail field, not an accident.
 */
import { describe, expect, it } from "vitest";

import { UpstashProviderError } from "../src/errors.js";
import {
	assertNoCredentialMaterial,
	scanForCredentialMaterial,
	toProviderFacts,
	toProvisionReceipt,
} from "../src/receipt.js";

/** A record that projects to a clean receipt. */
function record(overrides: Record<string, unknown> = {}) {
	return {
		definitionId: "upstash.redis/v1",
		providerId: "upstash",
		resourceRef: "resource:cache",
		databaseId: "db-1",
		restEndpointHost: "db-1.upstash.io",
		expiresAtIso: "2026-07-01T00:00:00.000Z",
		expiresAtMs: Date.parse("2026-07-01T00:00:00.000Z"),
		statedTtlDays: 7,
		expirySource: "provider-reported",
		observedAtMs: Date.parse("2026-06-26T00:00:00.000Z"),
		adopted: false,
		claim: {
			state: "unclaimed",
			boundary: "resource",
			atomicity: "single-resource",
			claimUrl: "https://console.upstash.com/claim",
			actions: [],
		},
		limits: { maxCommands: 10_000 },
		...overrides,
	} as never;
}

const rulesFor = (value: unknown) =>
	scanForCredentialMaterial(value as never).map((hit) => hit.rule);

describe("the credential scan", () => {
	it("finds nothing in a value with no credential material", () => {
		expect(
			scanForCredentialMaterial({
				host: "db-1.upstash.io",
				tls: true,
			} as never),
		).toEqual([]);
	});

	it("catches a Redis URI under either scheme", () => {
		// The URI carries the token in its userinfo — the single most likely
		// thing to leak, because it is what the provider returns.
		expect(rulesFor({ uri: "redis://db/0" })).toContain("redis-uri");
		expect(rulesFor({ uri: "REDISS://db/0" })).toContain("redis-uri");
	});

	it("catches a bearer token and a token assignment", () => {
		expect(rulesFor({ auth: "Bearer abc12345" })).toContain("bearer-token");
		for (const value of ["token=abcdefghijkl", "password: abcdefghijkl"]) {
			expect(rulesFor({ note: value }), value).toContain("token-assignment");
		}
		// A quoted value does not match, because the scan runs over the JSON
		// serialization: the inner quotes arrive escaped as `\"`, and the
		// pattern's character class stops at the quote after one character.
		// Pinned as-is — the quoted form is caught by the opaque-blob rule
		// instead when the value is long enough, so the gap is narrower than it
		// looks, and tightening this pattern risks false positives on ordinary
		// JSON.
		expect(rulesFor({ note: 'pwd="abcdefghijkl"' })).not.toContain(
			"token-assignment",
		);
	});

	it("catches the REST token environment variable by name", () => {
		// A published `.env` snippet is a realistic way for a token to end up in
		// a support bundle, and the variable name is the tell.
		expect(rulesFor({ v: "UPSTASH_REDIS_REST_TOKEN=x" })).toContain(
			"upstash-rest-token-env",
		);
	});

	it("catches a userinfo pair and a private key header", () => {
		expect(rulesFor({ v: "rediss://default:pw@db/" })).toContain(
			"userinfo-pair",
		);
		expect(rulesFor({ v: "-----BEGIN EC PRIVATE KEY-----" })).toContain(
			"private-key",
		);
	});

	it("catches any long unbroken token-shaped run", () => {
		// An Upstash REST token has no distinctive prefix, so the scan falls
		// back to shape. This is broader than Neon's equivalent on purpose.
		expect(rulesFor({ v: "A".repeat(40) })).toContain("opaque-blob");
		expect(rulesFor({ v: "A".repeat(39) })).not.toContain("opaque-blob");
	});

	it("reports every rule that fired", () => {
		const rules = rulesFor({ uri: "redis://db/0", auth: "Bearer abc12345" });
		expect(rules).toContain("redis-uri");
		expect(rules).toContain("bearer-token");
	});

	it("scans nested values", () => {
		expect(rulesFor({ a: { b: ["redis://db/0"] } })).toContain("redis-uri");
	});

	it("keeps its excerpt short and free of control characters", () => {
		// The excerpt lands in an error that lands in a log. Eight characters
		// past the match is enough to locate the field and not enough to be a
		// usable credential.
		const hit = scanForCredentialMaterial({
			v: `padding-padding-rediss://default:${"p".repeat(60)}@db/`,
		} as never)[0];
		expect(hit?.excerpt.length).toBeLessThan(40);
		// Control characters are replaced with spaces so an excerpt cannot
		// forge a line in the log it lands in.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of control characters is the point.
		expect(hit?.excerpt).not.toMatch(/[\u0000-\u001f\u007f]/u);
	});

	it("leaves ordinary receipt content alone", () => {
		// A false positive refuses a legitimate receipt, so hosts, ISO
		// timestamps, and secret *references* have to pass.
		expect(
			scanForCredentialMaterial({
				host: "db-1.upstash.io",
				expiresAtIso: "2026-07-01T00:00:00.000Z",
				credentialRef: "secret://upstash/db-1/rest",
			} as never),
		).toEqual([]);
	});
});

describe("assertNoCredentialMaterial", () => {
	it("passes a clean value silently", () => {
		expect(() =>
			assertNoCredentialMaterial({ host: "db.upstash.io" } as never, "x"),
		).not.toThrow();
	});

	it("throws under the secret-reference code, naming the artifact and rules", () => {
		let error: UpstashProviderError | undefined;
		try {
			assertNoCredentialMaterial(
				{ uri: "redis://db/0" } as never,
				"the Upstash provision receipt",
			);
		} catch (thrown) {
			error = thrown as UpstashProviderError;
		}
		expect(error).toBeInstanceOf(UpstashProviderError);
		expect(error?.code).toBe("SECRET_REFERENCE_INVALID");
		expect(error?.message).toContain("the Upstash provision receipt");
		expect(error?.message).toContain("redis-uri");
	});
});

describe("toProvisionReceipt", () => {
	it("projects a clean receipt", () => {
		const receipt = toProvisionReceipt(record());
		expect(receipt.schemaVersion).toBe("hobo.provider-upstash.receipt/v1");
		expect(receipt.databaseId).toBe("db-1");
	});

	it("pins the endpoint as HTTPS REST on 443", () => {
		// Upstash's no-signup lane is REST-only over TLS. Reporting anything
		// else would have a consumer dial a port that is not open.
		expect(toProvisionReceipt(record()).endpoint).toEqual({
			host: "db-1.upstash.io",
			port: 443,
			tls: true,
			transport: "https-rest",
		});
	});

	it("declares teardown as expiry-only", () => {
		// There is no delete API on this lane; the database disappears when its
		// TTL runs out. Claiming HoBo can tear it down would be a promise it
		// cannot keep.
		expect(toProvisionReceipt(record()).teardown).toBe("expiry-only");
	});

	it("declares no migration profiles", () => {
		// Honest emptiness: a temporary Redis has no supported migration path,
		// and listing one would offer a route that does not exist.
		expect(toProvisionReceipt(record()).migrationProfiles).toEqual([]);
		expect(toProvisionReceipt(record()).bindingProfiles.length).toBeGreaterThan(
			0,
		);
	});

	it("omits each secret locator independently when absent", () => {
		const both = toProvisionReceipt(
			record({ credentialRef: "secret://a", restUrlRef: "secret://b" }),
		);
		expect(both.credentialRef).toBe("secret://a");
		expect(both.restUrlRef).toBe("secret://b");

		const neither = toProvisionReceipt(record());
		expect("credentialRef" in neither).toBe(false);
		expect("restUrlRef" in neither).toBe(false);
	});

	it("reduces claim actions to those actually blocking", () => {
		const receipt = toProvisionReceipt(
			record({
				claim: {
					...(record() as { claim: Record<string, unknown> }).claim,
					actions: [
						{ id: "reset-token", blocking: true, completed: false },
						{ id: "done", blocking: true, completed: true },
						{ id: "optional", blocking: false, completed: false },
					],
				},
			}),
		);
		expect(receipt.claim.blockingActionIds).toEqual(["reset-token"]);
	});

	it("carries both the stated TTL and the observed expiry", () => {
		// The TTL is what the provider promised; the expiry is when it lands.
		// A consumer reconciling a surprise deletion needs both.
		const receipt = toProvisionReceipt(record());
		expect(receipt.statedTtlDays).toBe(7);
		expect(receipt.expiresAtIso).toBe("2026-07-01T00:00:00.000Z");
	});

	it("refuses to emit a receipt whose record smuggled a credential", () => {
		expect(() =>
			toProvisionReceipt(
				record({ restEndpointHost: "db-1.upstash.io/?token=abcdefghijkl" }),
			),
		).toThrow(/credential-shaped material/);
	});

	it("does not republish a field the projection was never taught about", () => {
		// The property a spread would lose.
		const receipt = toProvisionReceipt(
			record({ restToken: "rediss://default:pw@db/" } as never),
		);
		expect(JSON.stringify(receipt)).not.toContain("rediss://");
	});
});

describe("toProviderFacts", () => {
	const kinds = (overrides: Record<string, unknown> = {}) =>
		toProviderFacts(record(overrides)).map((fact) => fact.kind);

	it("emits provisioned for a fresh database and adopted for a pre-existing one", () => {
		// The two differ for billing and for teardown expectations.
		expect(kinds()).toEqual(["provider.upstash.database.provisioned"]);
		expect(kinds({ adopted: true })).toEqual([
			"provider.upstash.database.adopted",
		]);
	});

	it("adds a pending-rotation fact while the pre-claim token still works", () => {
		// The ceremony is attested, but the old REST token keeps working until
		// an owner resets it in the console. Reporting the claim as finished
		// would leave a live token outstanding with nothing tracking it.
		const facts = toProviderFacts(
			record({
				claim: {
					...(record() as { claim: Record<string, unknown> }).claim,
					state: "claimed-pending-rotation",
				},
			}),
		);
		expect(facts.map((fact) => fact.kind)).toContain(
			"provider.upstash.claim.pending-rotation",
		);
		expect(JSON.stringify(facts)).toContain("resets it in the console");
	});

	it("adds completed and expired facts for their states", () => {
		expect(
			kinds({
				claim: {
					...(record() as { claim: Record<string, unknown> }).claim,
					state: "complete",
				},
			}),
		).toContain("provider.upstash.claim.completed");
		const expired = toProviderFacts(
			record({
				claim: {
					...(record() as { claim: Record<string, unknown> }).claim,
					state: "expired",
				},
			}),
		).find((fact) => fact.kind === "provider.upstash.lease.expired");
		expect(expired?.detail.expiresAtIso).toBe("2026-07-01T00:00:00.000Z");
	});

	it("emits only the base fact for a state with no extra event", () => {
		expect(kinds()).toHaveLength(1);
	});

	it("correlates every fact from one observation", () => {
		const facts = toProviderFacts(
			record({
				claim: {
					...(record() as { claim: Record<string, unknown> }).claim,
					state: "expired",
				},
			}),
		);
		expect(new Set(facts.map((fact) => fact.occurredAtMs)).size).toBe(1);
		expect(new Set(facts.map((fact) => fact.resourceRef))).toEqual(
			new Set(["resource:cache"]),
		);
	});

	it("carries an empty credential ref rather than undefined", () => {
		// The detail map is typed as scalars. `undefined` would serialize as a
		// missing key and break a consumer reading it positionally.
		expect(toProviderFacts(record())[0]?.detail.credentialRef).toBe("");
	});

	it("refuses to emit facts that smuggled a credential", () => {
		expect(() =>
			toProviderFacts(record({ expirySource: "A".repeat(40) })),
		).toThrow(/credential-shaped material/);
	});
});
