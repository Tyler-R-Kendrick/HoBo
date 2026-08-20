/**
 * The one test that would catch every other mistake in this package: take the
 * artifacts that actually leave — record, claim plan, associated-resource ref,
 * receipt, facts, binding, errors — and scan the serialized bytes.
 */
import { describe, expect, it } from "vitest";

import {
	createInMemoryIdempotencyStore,
	createPrismaClient,
} from "../src/client.js";
import { createPrismaClaimableDatabaseDriver } from "../src/driver.js";
import { PrismaProviderError } from "../src/errors.js";
import { parseJsonValue } from "../src/json.js";
import {
	scanForCredentialMaterial,
	toProviderFacts,
	toProvisionReceipt,
} from "../src/receipt.js";
import {
	createStubCustody,
	createStubRunner,
	FIXTURE_NOW_MS,
	fixedClock,
	fixture,
	stdout,
} from "./harness.js";

const FORBIDDEN_LITERALS = [
	"postgres://",
	"postgresql://",
	"prisma+postgres://",
	"Bearer ",
	"REDACTED",
	"fake_user_000000:",
	"password=",
	"api_key=",
];

async function artifacts() {
	const clock = fixedClock(FIXTURE_NOW_MS);
	const client = createPrismaClient({
		runner: createStubRunner([stdout(fixture("create.success.json"))]),
		store: createInMemoryIdempotencyStore(),
		clock,
	});
	const driver = createPrismaClaimableDatabaseDriver({
		client,
		custody: createStubCustody(),
		clock,
	});
	const provisioned = await driver.provision({
		idempotencyKey: "hobo:resource:demo-db:0001",
		resourceRef: "hobo://yard/demo/data/main",
	});
	const claimed = driver.attestClaim(provisioned, {
		claimedAtMs: FIXTURE_NOW_MS,
		attestedBy: "operator@example.test",
		workspaceId: "ws_fake",
	});
	return {
		provisioned,
		claimed,
		associatedResource: driver.associatedResource(provisioned),
		receipts: [toProvisionReceipt(provisioned), toProvisionReceipt(claimed)],
		facts: [...toProviderFacts(provisioned), ...toProviderFacts(claimed)],
		binding: provisioned.binding,
		claimVerification: driver.verifyClaim(claimed),
		ownership: await driver.verifyOwnership(provisioned),
	};
}

describe("no credential material in serialized outputs", () => {
	it("finds nothing credential-shaped in records, receipts, facts, or bindings", async () => {
		const output = await artifacts();
		for (const [name, value] of Object.entries(output)) {
			expect(
				scanForCredentialMaterial(parseJsonValue(JSON.stringify(value))),
				`${name} leaked credential material`,
			).toEqual([]);
		}
	});

	it("finds none of the forbidden literals anywhere in the serialized artifacts", async () => {
		const serialized = JSON.stringify(await artifacts());
		for (const literal of FORBIDDEN_LITERALS) {
			expect(
				serialized,
				`serialized artifacts contain ${literal}`,
			).not.toContain(literal);
		}
	});

	it("keeps credential material out of thrown provider errors", () => {
		const error = new PrismaProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"create-db said: postgresql://fake_user_000000:REDACTED@db.prisma.io:5432/postgres and prisma+postgres://accelerate.example/?api_key=REDACTED and Bearer abc.def.ghi",
		);
		expect(error.message).not.toContain("postgresql://");
		expect(error.message).not.toContain("prisma+postgres://");
		expect(error.message).not.toContain("Bearer abc");
		expect(
			scanForCredentialMaterial(parseJsonValue(JSON.stringify(error.toJSON()))),
		).toEqual([]);
	});

	it("actually detects a leak when one is planted", () => {
		const hits = scanForCredentialMaterial({
			connection:
				"postgresql://fake_user_000000:REDACTED@db.prisma.io:5432/postgres",
		});
		expect(hits.map((hit) => hit.rule)).toContain("postgres-uri");
	});

	it("detects Prisma's own credential-bearing URI scheme", () => {
		const hits = scanForCredentialMaterial({
			connection:
				"prisma+postgres://accelerate.prisma-data.net/?api_key=REDACTED",
		});
		expect(hits.map((hit) => hit.rule)).toContain("prisma-postgres-uri");
	});

	it("refuses to emit a receipt built from a record carrying a raw connection string", async () => {
		const { provisioned } = await artifacts();
		const poisoned = {
			...provisioned,
			databaseName:
				"postgresql://fake_user_000000:REDACTED@db.prisma.io:5432/postgres",
		};
		expect(() => toProvisionReceipt(poisoned)).toThrowError(
			/credential-shaped material/u,
		);
	});
});
