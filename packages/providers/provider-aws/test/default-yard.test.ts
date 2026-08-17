import type { CapabilitySlot } from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	AWS_DEFAULT_BINDINGS,
	awsYardSpec,
	DEFAULT_REGIONS,
} from "../src/index.js";

/** Published ADR-0151 capability profiles a catalog row may name. */
const REAL_PROFILES: readonly string[] = [
	"web.static/v1",
	"web.hosted/v1",
	"web.ssr/v1",
	"api.http/v1",
	"service.worker/v1",
	"service.batch/v1",
	"service.scheduled/v1",
	"service.queue-consumer/v1",
	"data.relational/v1",
	"data.postgres/v1",
	"data.mysql/v1",
	"data.sqlite/v1",
	"data.document/v1",
	"data.vector/v1",
	"kv.key-value/v1",
	"kv.redis-compatible/v1",
	"bucket.object/v1",
	"bucket.s3-compatible/v1",
	"bucket.file-storage/v1",
	"queue.at-least-once/v1",
	"queue.fifo/v1",
	"topic.pubsub/v1",
	"secret-ref.locator/v1",
	"webhook.inbound-http/v1",
];

/** Entries declared for one slot, or an empty list when the slot is absent. */
function slotEntries(slot: CapabilitySlot) {
	return AWS_DEFAULT_BINDINGS[slot] ?? [];
}

describe("the AWS Yard is an allocatable catalog", () => {
	it.each([
		["web", "web.hosted/v1", "aws.eks-deployment/v1"],
		["service", "service.worker/v1", "aws.lambda/v1"],
		["data", "data.postgres/v1", "aws.rds-postgres/v1"],
		["kv", "kv.key-value/v1", "aws.dynamodb/v1"],
		["bucket", "bucket.s3-compatible/v1", "aws.s3/v1"],
		["queue", "queue.at-least-once/v1", "aws.sqs/v1"],
	] as const)("declares %s from the landed factories", (slot, profile, productId) => {
		const entries = slotEntries(slot);
		expect(entries.map((entry) => entry.profile)).toContain(profile);
		expect(entries.map((entry) => entry.productId)).toContain(productId);
	});

	/**
	 * HONEST SCOPE: `slots.ts` ships six factories, so every slot here holds
	 * exactly one entry. That is a gap in the authored factory set, not a
	 * selection made by this catalog — the slot is a list precisely so an
	 * alternative can join it without any other code changing.
	 */
	it("holds a list per slot, today one entry deep", () => {
		for (const entries of Object.values(AWS_DEFAULT_BINDINGS)) {
			expect(Array.isArray(entries)).toBe(true);
			expect(entries).toHaveLength(1);
		}
	});

	it("files every entry under the slot the binding itself names", () => {
		for (const [slot, entries] of Object.entries(AWS_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(entry.slot).toBe(slot);
			}
		}
	});

	it("names only published capability profiles", () => {
		for (const entries of Object.values(AWS_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(REAL_PROFILES).toContain(entry.profile);
			}
		}
	});

	it("invents no properties on a catalog entry", () => {
		for (const entries of Object.values(AWS_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(entry.properties).toEqual({});
			}
		}
	});

	it("freezes the catalog and its slot lists", () => {
		expect(Object.isFrozen(AWS_DEFAULT_BINDINGS)).toBe(true);
		for (const entries of Object.values(AWS_DEFAULT_BINDINGS)) {
			expect(Object.isFrozen(entries)).toBe(true);
		}
	});
});

describe("awsYardSpec emits raw, canonical rows", () => {
	it("carries the provider id and the published default regions", () => {
		const spec = awsYardSpec();
		expect(spec.provider).toBe("aws");
		expect(spec.regions).toEqual(DEFAULT_REGIONS);
	});

	it("takes the caller's regions without reordering them", () => {
		expect(awsYardSpec({ regions: ["eu-west-1"] }).regions).toEqual([
			"eu-west-1",
		]);
	});

	it("emits one row per catalog entry, dropping none", () => {
		const declared = Object.values(AWS_DEFAULT_BINDINGS).reduce(
			(total, entries) => total + (entries?.length ?? 0),
			0,
		);
		expect(awsYardSpec().bindings).toHaveLength(declared);
	});

	it("sorts rows by (profile, productId, connectivityId)", () => {
		const keys = awsYardSpec().bindings.map(
			(row) =>
				`${row.profile} ${row.productId ?? ""} ${row.connectivityId ?? ""}`,
		);
		expect(keys).toEqual([...keys].sort());
	});

	it("carries no duplicate (profile, productId, connectivityId) triple", () => {
		const keys = awsYardSpec().bindings.map(
			(row) =>
				`${row.profile}|${row.productId ?? ""}|${row.connectivityId ?? ""}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("omits the slot from a row, because rows key on the profile", () => {
		for (const row of awsYardSpec().bindings) {
			expect("slot" in row).toBe(false);
		}
	});

	it("is deterministic and frozen", () => {
		expect(awsYardSpec()).toEqual(awsYardSpec());
		const spec = awsYardSpec();
		expect(Object.isFrozen(spec)).toBe(true);
		expect(Object.isFrozen(spec.bindings)).toBe(true);
		expect(Object.isFrozen(spec.regions)).toBe(true);
	});
});
