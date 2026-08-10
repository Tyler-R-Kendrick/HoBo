/**
 * The one test that would catch every other mistake in this package: take the
 * artifacts that actually leave — plan, receipt, facts, binding, errors — and
 * scan the serialized bytes for anything credential-shaped.
 */
import { describe, expect, it } from "vitest";

import {
	createInMemoryIdempotencyStore,
	createNeonClient,
} from "../src/client.js";
import { createNeonClaimableDatabaseDriver } from "../src/driver.js";
import { NeonProviderError } from "../src/errors.js";
import {
	scanForCredentialMaterial,
	toProviderFacts,
	toProvisionReceipt,
} from "../src/receipt.js";
import {
	createStubCustody,
	createStubTransport,
	FIXTURE_DATABASE_ID,
	FIXTURE_NOW_MS,
	fixedClock,
	fixture,
} from "./harness.js";

const FORBIDDEN_LITERALS = [
	"postgres://",
	"postgresql://",
	"Bearer ",
	"REDACTED",
	"neondb_owner:",
	"password=",
];

async function artifacts() {
	const custody = createStubCustody();
	const clock = fixedClock(FIXTURE_NOW_MS);
	const client = createNeonClient({
		transport: createStubTransport([
			{ status: 200, body: fixture("create-database.unclaimed.json") },
			{ status: 200, body: fixture("get-database.claimed.json") },
		]),
		store: createInMemoryIdempotencyStore(),
		clock,
	});
	const driver = createNeonClaimableDatabaseDriver({ client, custody, clock });
	const provisioned = await driver.provision({
		ref: "hobo-test",
		idempotencyKey: "hobo:resource:demo-db:0001",
		resourceRef: "hobo://yard/demo/data/main",
	});
	const claimed = await driver.observe({
		databaseId: FIXTURE_DATABASE_ID,
		resourceRef: provisioned.resourceRef,
		previous: provisioned,
	});
	return {
		provisioned,
		claimed,
		receipts: [toProvisionReceipt(provisioned), toProvisionReceipt(claimed)],
		facts: [...toProviderFacts(provisioned), ...toProviderFacts(claimed)],
		bindings: [provisioned.binding, claimed.binding],
		claimVerification: driver.verifyClaim(claimed),
	};
}

describe("no credential material in serialized outputs", () => {
	it("finds nothing credential-shaped in records, receipts, facts, or bindings", async () => {
		const output = await artifacts();
		for (const [name, value] of Object.entries(output)) {
			expect(
				scanForCredentialMaterial(value),
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
		const error = new NeonProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"upstream said: postgresql://neondb_owner:npg_supersecret@ep-fake-000000.us-east-2.aws.neon.tech/neondb and Bearer abc.def.ghi",
		);
		expect(error.message).not.toContain("postgresql://");
		expect(error.message).not.toContain("npg_supersecret");
		expect(error.message).not.toContain("Bearer abc");
		expect(scanForCredentialMaterial(error.toJSON())).toEqual([]);
	});

	it("actually detects a leak when one is planted", () => {
		const hits = scanForCredentialMaterial({
			connection:
				"postgresql://neondb_owner:npg_supersecret@ep-fake-000000.us-east-2.aws.neon.tech/neondb",
		});
		expect(hits.map((hit) => hit.rule)).toContain("postgres-uri");
	});

	it("refuses to emit a receipt built from a record carrying a raw connection string", async () => {
		const { provisioned } = await artifacts();
		const poisoned = {
			...provisioned,
			databaseName:
				"postgresql://neondb_owner:npg_supersecret@ep-fake-000000.us-east-2.aws.neon.tech/neondb",
		};
		expect(() => toProvisionReceipt(poisoned)).toThrowError(
			/credential-shaped material/u,
		);
	});
});
