import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
	createInMemoryIdempotencyStore,
	createUpstashClient,
} from "../src/client.js";
import { createUpstashTemporaryRedisDriver } from "../src/driver.js";
import { isProviderError } from "../src/errors.js";
import { toProviderFacts, toProvisionReceipt } from "../src/receipt.js";
import {
	createStubCustody,
	createStubTransport,
	FAKE_CONSOLE_URL,
	FAKE_DATABASE_ID,
	FAKE_REST_HOST,
	FAKE_REST_TOKEN,
	FIXTURE_EXPIRES_AT_MS,
	type StubResponse,
	VALID_PAYLOAD,
} from "./fixtures/index.js";

const BEFORE_EXPIRY = Date.parse("2026-08-08T12:00:00.000Z");
const AFTER_EXPIRY = Date.parse("2026-08-12T12:00:00.000Z");
const RESOURCE_REF = "yard/demo/cache";

function harness(
	options: {
		readonly script?: readonly StubResponse[];
		readonly now?: number;
	} = {},
) {
	let now = options.now ?? BEFORE_EXPIRY;
	const transport = createStubTransport({
		script: options.script ?? [{ status: 200, body: VALID_PAYLOAD }],
	});
	const custody = createStubCustody();
	const client = createUpstashClient({
		transport,
		store: createInMemoryIdempotencyStore(),
		clock: () => now,
	});
	const driver = createUpstashTemporaryRedisDriver({
		client,
		custody,
		clock: () => now,
	});
	return {
		transport,
		custody,
		driver,
		setNow(value: number) {
			now = value;
		},
		provision: () =>
			driver.provision({
				resourceRef: RESOURCE_REF,
				idempotencyKey: FAKE_DATABASE_ID,
			}),
	};
}

const CLAIM = {
	claimedAtMs: BEFORE_EXPIRY,
	attestedBy: "operator@example.com",
	evidenceRef: "hobo.evidence/claim/upstash-demo",
} as const;

const ROTATION = {
	rotatedAtMs: BEFORE_EXPIRY + 60_000,
	attestedBy: "operator@example.com",
	evidenceRef: "hobo.evidence/rotation/upstash-demo",
} as const;

describe("provision", () => {
	it("produces a record carrying refs, never the token", async () => {
		const { provision, custody } = harness();

		const record = await provision();

		assert.equal(record.databaseId, FAKE_DATABASE_ID);
		assert.equal(record.restEndpointHost, FAKE_REST_HOST);
		assert.equal(record.adopted, false);
		assert.ok(record.credentialRef?.startsWith("hobo-secret://"));
		// The plaintext went to custody and nowhere else.
		assert.ok([...custody.deposited.values()].includes(FAKE_REST_TOKEN));
		assert.ok(!JSON.stringify(record).includes(FAKE_REST_TOKEN));
	});

	it("records the provider-reported expiry rather than the documented one", async () => {
		const { provision } = harness();

		const record = await provision();

		assert.equal(record.expirySource, "provider-reported");
		assert.equal(record.expiresAtMs, FIXTURE_EXPIRES_AT_MS);
		assert.equal(record.statedTtlDays, 3);
		// The documented 72 hours is available, and is not what the lease is
		// derived from.
		assert.equal(record.limits.documentedExpiryHours, 72);
	});

	it("emits a redis-rest binding whose credential is a locator", async () => {
		const { provision } = harness();

		const binding = (await provision()).binding;

		assert.ok(binding !== undefined);
		assert.equal(binding.bindingProfileRef, "binding.redis-rest/v1");
		assert.equal(binding.capabilityProfileRef, "kv.redis-compatible/v1");
		assert.deepEqual(
			binding.endpoints.map((endpoint) => endpoint.addressRef.host),
			[FAKE_REST_HOST],
		);
		assert.ok(binding.credentialRef?.startsWith("hobo-secret://"));
		assert.equal(binding.expiresAtMs, FIXTURE_EXPIRES_AT_MS);
		// No delete endpoint exists on this surface, so revocation is false
		// even though rotation (by hand, post-claim) is possible.
		assert.equal(binding.revocationSupported, false);
		assert.equal(binding.rotationSupported, true);
		assert.equal(binding.renewable, false);
	});

	it("opens the claim plan with both blocking actions outstanding", async () => {
		const { provision } = harness();

		const record = await provision();

		assert.equal(record.claim.state, "unclaimed");
		assert.equal(record.claim.claimUrl, FAKE_CONSOLE_URL);
		assert.deepEqual(
			record.claim.actions.map((action) => [
				action.id,
				action.blocking,
				action.completed,
			]),
			[
				["upstash.claim.transfer-to-account", true, false],
				["upstash.claim.rotate-rest-token", true, false],
			],
		);
	});

	it("fails closed when custody refuses the deposit", async () => {
		const transport = createStubTransport({});
		const client = createUpstashClient({
			transport,
			store: createInMemoryIdempotencyStore(),
			clock: () => BEFORE_EXPIRY,
		});
		const driver = createUpstashTemporaryRedisDriver({
			client,
			custody: {
				async deposit() {
					throw new Error("vault sealed");
				},
			},
			clock: () => BEFORE_EXPIRY,
		});

		await assert.rejects(
			driver.provision({
				resourceRef: RESOURCE_REF,
				idempotencyKey: FAKE_DATABASE_ID,
			}),
			(error: unknown) =>
				isProviderError(error) && error.code === "SECRET_CUSTODY_UNAVAILABLE",
		);
	});

	it("refuses a custody port that hands back the plaintext instead of a locator", async () => {
		const transport = createStubTransport({});
		const client = createUpstashClient({
			transport,
			store: createInMemoryIdempotencyStore(),
			clock: () => BEFORE_EXPIRY,
		});
		const driver = createUpstashTemporaryRedisDriver({
			client,
			custody: {
				async deposit(value) {
					return value;
				},
			},
			clock: () => BEFORE_EXPIRY,
		});

		await assert.rejects(
			driver.provision({
				resourceRef: RESOURCE_REF,
				idempotencyKey: FAKE_DATABASE_ID,
			}),
			(error: unknown) =>
				isProviderError(error) && error.code === "SECRET_REFERENCE_INVALID",
		);
	});
});

describe("observe", () => {
	it("adopts the same database and reports it as adopted", async () => {
		const { driver, provision } = harness();
		await provision();

		const observed = await driver.observe({
			resourceRef: RESOURCE_REF,
			idempotencyKey: FAKE_DATABASE_ID,
		});

		assert.equal(observed.adopted, true);
		assert.equal(observed.databaseId, FAKE_DATABASE_ID);
	});

	it("refuses an endpoint that moved under a stable id", async () => {
		const moved = VALID_PAYLOAD.replace(
			FAKE_REST_HOST,
			"other-duck-999999.upstash.io",
		);
		const { driver, provision } = harness({
			script: [
				{ status: 200, body: VALID_PAYLOAD },
				{ status: 200, body: moved },
			],
		});
		const previous = await provision();

		await assert.rejects(
			driver.observe({
				resourceRef: RESOURCE_REF,
				idempotencyKey: FAKE_DATABASE_ID,
				previous,
			}),
			(error: unknown) =>
				isProviderError(error) && error.code === "PROVIDER_CONTRACT_CHANGED",
		);
	});
});

describe("claim and rotation", () => {
	it("will not attest a rotation before the claim ceremony", async () => {
		const { driver, provision } = harness();
		const record = await provision();

		assert.throws(
			() => driver.attestRotation(record, ROTATION),
			(error: unknown) =>
				isProviderError(error) && error.code === "CLAIM_NOT_VERIFIED",
		);
	});

	it("moves to claimed-pending-rotation on a claim attestation", async () => {
		const { driver, provision } = harness();

		const claimed = driver.attestClaim(await provision(), CLAIM);

		assert.equal(claimed.claim.state, "claimed-pending-rotation");
		const verification = driver.verifyClaim(claimed);
		// The provider considers the claim done. HoBo does not, because the
		// creating party's token still works.
		assert.equal(verification.complete, false);
		assert.deepEqual(
			verification.blockingActions.map((action) => action.id),
			["upstash.claim.rotate-rest-token"],
		);
	});

	it("completes only after the owner's rotation is attested", async () => {
		const { driver, provision } = harness();

		const complete = driver.attestRotation(
			driver.attestClaim(await provision(), CLAIM),
			ROTATION,
		);

		assert.equal(complete.claim.state, "complete");
		const verification = driver.verifyClaim(complete);
		assert.equal(verification.complete, true);
		assert.deepEqual(verification.blockingActions, []);
	});

	it("refuses an attestation with no attesting party or evidence", async () => {
		const { driver, provision } = harness();
		const record = await provision();

		assert.throws(
			() => driver.attestClaim(record, { ...CLAIM, attestedBy: "" }),
			(error: unknown) =>
				isProviderError(error) && error.code === "CLAIM_NOT_VERIFIED",
		);
	});

	it("refuses to attest a claim after the window closed", async () => {
		const { driver, provision, setNow } = harness();
		await provision();
		setNow(AFTER_EXPIRY);
		const expired = await driver.observe({
			resourceRef: RESOURCE_REF,
			idempotencyKey: FAKE_DATABASE_ID,
		});

		assert.equal(expired.claim.state, "expired");
		assert.throws(
			() => driver.attestClaim(expired, CLAIM),
			(error: unknown) =>
				isProviderError(error) && error.code === "CLAIM_EXPIRED",
		);
	});
});

describe("lease and teardown", () => {
	it("passes the lease check before the reported expiry", async () => {
		const { driver, provision } = harness();
		driver.assertLeaseLive(await provision());
	});

	it("raises LEASE_EXPIRED once the reported expiry has passed", async () => {
		const { driver, provision, setNow } = harness();
		const record = await provision();
		setNow(AFTER_EXPIRY);

		assert.throws(
			() => driver.assertLeaseLive(record),
			(error: unknown) =>
				isProviderError(error) && error.code === "LEASE_EXPIRED",
		);
	});

	it("raises CLAIM_EXPIRED from the claim check, which is terminal", async () => {
		const { driver, provision, setNow } = harness();
		const record = await provision();
		setNow(AFTER_EXPIRY);

		assert.throws(
			() => driver.assertClaimable(record),
			(error: unknown) =>
				isProviderError(error) &&
				error.code === "CLAIM_EXPIRED" &&
				/no re-claim path/u.test(error.message),
		);
	});

	it("refuses to destroy a live database, because there is no delete endpoint", async () => {
		const { driver, provision } = harness();
		const record = await provision();

		await assert.rejects(
			driver.destroy(record),
			(error: unknown) =>
				isProviderError(error) && error.code === "CLEANUP_FAILED",
		);
	});

	it("reports an already-expired database as destroyed", async () => {
		const { driver, provision, setNow } = harness();
		const record = await provision();
		setNow(AFTER_EXPIRY);

		const outcome = await driver.destroy(record);

		assert.equal(outcome.destroyed, true);
		assert.match(outcome.reason, /reaped/u);
	});

	it("refuses to destroy a claimed database, which belongs to its owner now", async () => {
		const { driver, provision } = harness();

		await assert.rejects(
			driver.destroy(driver.attestClaim(await provision(), CLAIM)),
			(error: unknown) =>
				isProviderError(error) && error.code === "CLEANUP_FAILED",
		);
	});
});

describe("verifyOwnership", () => {
	it("is not verified on the control plane alone", async () => {
		const { driver, provision } = harness();
		const record = await provision();

		const verification = await driver.verifyOwnership(record);

		// The provider vouching for itself is not independent evidence.
		assert.equal(verification.verified, false);
		assert.ok(
			verification.reasons.some((reason) => reason.includes("RedisProbePort")),
			"the missing independent signal should be named",
		);
	});

	it("verifies when an independent data-plane probe agrees", async () => {
		const transport = createStubTransport({});
		const client = createUpstashClient({
			transport,
			store: createInMemoryIdempotencyStore(),
			clock: () => BEFORE_EXPIRY,
		});
		const driver = createUpstashTemporaryRedisDriver({
			client,
			custody: createStubCustody(),
			clock: () => BEFORE_EXPIRY,
			probe: {
				async probe() {
					return { reachable: true, detail: "PING answered PONG" };
				},
			},
		});

		const record = await driver.provision({
			resourceRef: RESOURCE_REF,
			idempotencyKey: FAKE_DATABASE_ID,
		});
		const verification = await driver.verifyOwnership(record);

		assert.equal(verification.verified, true);
		assert.deepEqual(verification.signals.map((signal) => signal.id).sort(), [
			"control-plane-reread",
			"data-plane-probe",
		]);
	});
});

describe("receipts and facts", () => {
	it("emits a receipt with locators and no credential material", async () => {
		const { provision } = harness();

		const receipt = toProvisionReceipt(await provision());

		assert.equal(receipt.databaseId, FAKE_DATABASE_ID);
		assert.equal(receipt.endpoint.host, FAKE_REST_HOST);
		assert.equal(receipt.expiresAtIso, "2026-08-11T00:00:00.000Z");
		assert.equal(receipt.teardown, "expiry-only");
		assert.deepEqual(receipt.migrationProfiles, []);
		assert.ok(!JSON.stringify(receipt).includes(FAKE_REST_TOKEN));
	});

	it("emits a provisioned fact and, after a claim, a pending-rotation fact", async () => {
		const { driver, provision } = harness();
		const record = await provision();

		assert.deepEqual(
			toProviderFacts(record).map((fact) => fact.kind),
			["provider.upstash.database.provisioned"],
		);
		assert.deepEqual(
			toProviderFacts(driver.attestClaim(record, CLAIM)).map(
				(fact) => fact.kind,
			),
			[
				"provider.upstash.database.provisioned",
				"provider.upstash.claim.pending-rotation",
			],
		);
	});
});
