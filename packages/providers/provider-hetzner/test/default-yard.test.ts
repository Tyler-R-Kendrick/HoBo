import type { CapabilitySlot } from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	DEFAULT_REGIONS,
	HETZNER_DEFAULT_BINDINGS,
	hetznerYardSpec,
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
	return HETZNER_DEFAULT_BINDINGS[slot] ?? [];
}

describe("the Hetzner Yard is an allocatable catalog", () => {
	it.each([
		["web", "web.hosted/v1", "hetzner.cloud-server/v1"],
		["api", "api.http/v1", "hetzner.load-balancer/v1"],
		["service", "service.worker/v1", "hetzner.cloud-server/v1"],
		["bucket", "bucket.s3-compatible/v1", "hetzner.object-storage/v1"],
	] as const)("declares %s from the landed factories", (slot, profile, productId) => {
		const entries = slotEntries(slot);
		expect(entries.map((entry) => entry.profile)).toContain(profile);
		expect(entries.map((entry) => entry.productId)).toContain(productId);
	});

	it("holds a non-empty list per slot", () => {
		for (const entries of Object.values(HETZNER_DEFAULT_BINDINGS)) {
			expect(Array.isArray(entries)).toBe(true);
			expect(entries.length).toBeGreaterThan(0);
		}
	});

	/**
	 * The load-bearing honesty test. A `data` row would say Hetzner can allocate
	 * a database; it cannot. An empty slot is a gap an author can see, and
	 * "Postgres you install yourself on a Cloud Server" is not a product a
	 * catalog can allocate.
	 */
	it("leaves the five slots Hetzner sells nothing for empty", () => {
		for (const slot of ["data", "kv", "queue", "topic", "secretRef"] as const) {
			expect(slotEntries(slot)).toEqual([]);
		}
	});

	it("declares both file-storage products beside the S3 one", () => {
		expect(slotEntries("bucket").map((entry) => entry.productId)).toEqual(
			expect.arrayContaining([
				"hetzner.object-storage/v1",
				"hetzner.storage-box/v1",
				"hetzner.volume/v1",
			]),
		);
	});

	it("files every entry under the slot the binding itself names", () => {
		for (const [slot, entries] of Object.entries(HETZNER_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(entry.slot).toBe(slot);
			}
		}
	});

	it("names only published capability profiles", () => {
		for (const entries of Object.values(HETZNER_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(REAL_PROFILES).toContain(entry.profile);
			}
		}
	});

	it("invents no properties on a catalog entry", () => {
		for (const entries of Object.values(HETZNER_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(entry.properties).toEqual({});
			}
		}
	});

	it("freezes the catalog and its slot lists", () => {
		expect(Object.isFrozen(HETZNER_DEFAULT_BINDINGS)).toBe(true);
		for (const entries of Object.values(HETZNER_DEFAULT_BINDINGS)) {
			expect(Object.isFrozen(entries)).toBe(true);
		}
	});
});

describe("hetznerYardSpec emits raw, canonical rows", () => {
	it("carries the provider id and the published default locations", () => {
		const spec = hetznerYardSpec();
		expect(spec.provider).toBe("hetzner");
		expect(spec.regions).toEqual(DEFAULT_REGIONS);
	});

	it("takes the caller's locations without reordering them", () => {
		expect(hetznerYardSpec({ regions: ["nbg1"] }).regions).toEqual(["nbg1"]);
	});

	it("emits one row per catalog entry, dropping none", () => {
		const declared = Object.values(HETZNER_DEFAULT_BINDINGS).reduce(
			(total, entries) => total + (entries?.length ?? 0),
			0,
		);
		expect(hetznerYardSpec().bindings).toHaveLength(declared);
	});

	/**
	 * `cloudServer()` and `cloudServerWorker()` emit the same productId under
	 * different profiles. Rows key on `(profile, productId, connectivityId)`, so
	 * both survive — a dedup on productId alone would silently drop one.
	 */
	it("keeps one product reached through two profiles as two rows", () => {
		const rows = hetznerYardSpec().bindings.filter(
			(row) => row.productId === "hetzner.cloud-server/v1",
		);
		expect(rows.map((row) => row.profile).sort()).toEqual([
			"service.worker/v1",
			"web.hosted/v1",
		]);
	});

	it("sorts rows by (profile, productId, connectivityId)", () => {
		const keys = hetznerYardSpec().bindings.map(
			(row) =>
				`${row.profile} ${row.productId ?? ""} ${row.connectivityId ?? ""}`,
		);
		expect(keys).toEqual([...keys].sort());
	});

	it("carries no duplicate (profile, productId, connectivityId) triple", () => {
		const keys = hetznerYardSpec().bindings.map(
			(row) =>
				`${row.profile}|${row.productId ?? ""}|${row.connectivityId ?? ""}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("omits the slot from a row, because rows key on the profile", () => {
		for (const row of hetznerYardSpec().bindings) {
			expect("slot" in row).toBe(false);
		}
	});

	it("is deterministic and frozen", () => {
		expect(hetznerYardSpec()).toEqual(hetznerYardSpec());
		const spec = hetznerYardSpec();
		expect(Object.isFrozen(spec)).toBe(true);
		expect(Object.isFrozen(spec.bindings)).toBe(true);
		expect(Object.isFrozen(spec.regions)).toBe(true);
	});
});
