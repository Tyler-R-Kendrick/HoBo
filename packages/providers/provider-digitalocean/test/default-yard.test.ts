import type { CapabilitySlot } from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	DEFAULT_REGIONS,
	DIGITALOCEAN_DEFAULT_BINDINGS,
	digitaloceanYardSpec,
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
	return DIGITALOCEAN_DEFAULT_BINDINGS[slot] ?? [];
}

describe("the DigitalOcean Yard is an allocatable catalog", () => {
	it.each([
		["web", "web.hosted/v1", "digitalocean.app-platform-service/v1"],
		["api", "api.http/v1", "digitalocean.load-balancer/v1"],
		["service", "service.worker/v1", "digitalocean.app-platform-worker/v1"],
		["data", "data.postgres/v1", "digitalocean.managed-postgres/v1"],
		["kv", "kv.redis-compatible/v1", "digitalocean.managed-valkey/v1"],
		["bucket", "bucket.s3-compatible/v1", "digitalocean.spaces/v1"],
	] as const)("declares %s from the landed factories", (slot, profile, productId) => {
		const entries = slotEntries(slot);
		expect(entries.map((entry) => entry.profile)).toContain(profile);
		expect(entries.map((entry) => entry.productId)).toContain(productId);
	});

	it("holds a non-empty list per slot", () => {
		for (const entries of Object.values(DIGITALOCEAN_DEFAULT_BINDINGS)) {
			expect(Array.isArray(entries)).toBe(true);
			expect(entries.length).toBeGreaterThan(0);
		}
	});

	/**
	 * The catalog states what DigitalOcean *can* allocate, so a capability it
	 * serves several ways lists all of them. Collapsing `web` to one entry would
	 * make this module the selector — the decision ADR-0157 reserves for
	 * resolution time.
	 */
	it("declares every way DigitalOcean can host a web capability", () => {
		expect(slotEntries("web").map((entry) => entry.productId)).toEqual(
			expect.arrayContaining([
				"digitalocean.app-platform-service/v1",
				"digitalocean.app-platform-static-site/v1",
				"digitalocean.droplet/v1",
				"digitalocean.kubernetes-workload/v1",
			]),
		);
	});

	it("offers alternatives on every capability DigitalOcean serves more than one way", () => {
		for (const slot of ["web", "service", "data"]) {
			expect(slotEntries(slot).length).toBeGreaterThanOrEqual(2);
		}
	});

	/**
	 * A queue row would be a portability lie: DigitalOcean sells no first-party
	 * queue, so an author asking for one must see an empty slot rather than a
	 * product that cannot be allocated.
	 */
	it("leaves queue, topic and secretRef empty rather than inventing a near-miss", () => {
		for (const slot of ["queue", "topic", "secretRef", "webhook"] as const) {
			expect(slotEntries(slot)).toEqual([]);
		}
	});

	it("files every entry under the slot the binding itself names", () => {
		for (const [slot, entries] of Object.entries(
			DIGITALOCEAN_DEFAULT_BINDINGS,
		)) {
			for (const entry of entries ?? []) {
				expect(entry.slot).toBe(slot);
			}
		}
	});

	it("names only published capability profiles", () => {
		for (const entries of Object.values(DIGITALOCEAN_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(REAL_PROFILES).toContain(entry.profile);
			}
		}
	});

	it("invents no properties on a catalog entry", () => {
		for (const entries of Object.values(DIGITALOCEAN_DEFAULT_BINDINGS)) {
			for (const entry of entries ?? []) {
				expect(entry.properties).toEqual({});
			}
		}
	});

	it("freezes the catalog and its slot lists", () => {
		expect(Object.isFrozen(DIGITALOCEAN_DEFAULT_BINDINGS)).toBe(true);
		for (const entries of Object.values(DIGITALOCEAN_DEFAULT_BINDINGS)) {
			expect(Object.isFrozen(entries)).toBe(true);
		}
	});
});

describe("digitaloceanYardSpec emits raw, canonical rows", () => {
	it("carries the provider id and the published default regions", () => {
		const spec = digitaloceanYardSpec();
		expect(spec.provider).toBe("digitalocean");
		expect(spec.regions).toEqual(DEFAULT_REGIONS);
	});

	it("takes the caller's regions without reordering them", () => {
		expect(digitaloceanYardSpec({ regions: ["fra1"] }).regions).toEqual([
			"fra1",
		]);
	});

	it("emits one row per catalog entry, dropping none", () => {
		const declared = Object.values(DIGITALOCEAN_DEFAULT_BINDINGS).reduce(
			(total, entries) => total + (entries?.length ?? 0),
			0,
		);
		expect(digitaloceanYardSpec().bindings).toHaveLength(declared);
	});

	it("sorts rows by (profile, productId, connectivityId)", () => {
		const keys = digitaloceanYardSpec().bindings.map(
			(row) =>
				`${row.profile} ${row.productId ?? ""} ${row.connectivityId ?? ""}`,
		);
		expect(keys).toEqual([...keys].sort());
	});

	it("carries no duplicate (profile, productId, connectivityId) triple", () => {
		const keys = digitaloceanYardSpec().bindings.map(
			(row) =>
				`${row.profile}|${row.productId ?? ""}|${row.connectivityId ?? ""}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("omits the slot from a row, because rows key on the profile", () => {
		for (const row of digitaloceanYardSpec().bindings) {
			expect("slot" in row).toBe(false);
		}
	});

	it("is deterministic and frozen", () => {
		expect(digitaloceanYardSpec()).toEqual(digitaloceanYardSpec());
		const spec = digitaloceanYardSpec();
		expect(Object.isFrozen(spec)).toBe(true);
		expect(Object.isFrozen(spec.bindings)).toBe(true);
		expect(Object.isFrozen(spec.regions)).toBe(true);
	});
});
