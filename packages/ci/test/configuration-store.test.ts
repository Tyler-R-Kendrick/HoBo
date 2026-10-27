import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create, toJsonString } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";
import {
	type Configuration,
	ConfigurationSchema,
	JobSchema,
} from "../src/_generated/ci_pb.js";
import { parseConfiguration } from "../src/config.js";
import { parsePipeline } from "../src/execution.js";
import { route } from "../src/routing.js";
import { LeaseStore } from "../src/store.js";

const NOW = "2026-10-27T12:00:00Z";
const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});
async function configuration() {
	const config = parseConfiguration(
		await readFile(
			new URL(
				"../data-models/fixtures/valid/configuration.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const a = config.accounts[0];
	const o = a?.offers[0];
	if (!a || !o) throw new Error("fixture missing");
	a.maxRuntimeMinutes = 1;
	a.startupMinutes = 1;
	a.budgetMicros = 100000;
	o.enabled = true;
	o.bridgeAcknowledged = true;
	o.observedAt = "2026-10-27T11:00:00Z";
	o.validUntil = "2026-10-28T12:00:00Z";
	o.budgetMicros = 100000;
	o.priceMicrosPerMinute = 1000;
	o.freeMinutes = 2;
	return config;
}
function clone(config: Configuration) {
	return parseConfiguration(toJsonString(ConfigurationSchema, config));
}
async function disk() {
	const path = await mkdtemp(join(tmpdir(), "hobo-ci-policy-"));
	directories.push(path);
	return join(path, "actor.sqlite");
}
function original() {
	return create(JobSchema, {
		id: 1,
		runId: 11,
		runAttempt: 1,
		repositoryId: 1,
		repository: "example/repository",
		installationId: 1,
		labels: ["hobo"],
		action: "queued",
	});
}

describe("durable account policy and usage snapshots", () => {
	it("atomically revisions policy and protobuf setup records, reopens and rebuilds both", async () => {
		const path = await disk();
		const config = await configuration();
		let store = new LeaseStore(path);
		try {
			const saved = store.configure(config, 0, NOW);
			expect(saved.revision).toBe(1);
			store.putControlRecord(
				"onboarding:request",
				"example",
				'{"id":"request","status":"planned"}',
				NOW,
			);
			expect(() => store.configure(config, 0, NOW)).toThrow(
				/revision conflict/,
			);
			expect(() =>
				store.putControlRecord("onboarding:request", "other", "{}", NOW),
			).toThrow(/another account/);
			store.close();
			store = new LeaseStore(path);
			store.rebuild();
			expect(store.configuration()).toEqual(saved);
			expect(store.controlRecord("onboarding:request")?.bodyJson).toBe(
				'{"id":"request","status":"planned"}',
			);
			expect(store.events().map((event) => event.type)).toEqual([
				"ci.ConfigurationChanged",
				"ci.ControlRecordUpdated",
			]);
		} finally {
			store.close();
		}
	});
	it("rejects destructive bridge/provider edits while a host holds a lease, but permits budget updates", async () => {
		const store = new LeaseStore(":memory:");
		try {
			const config = await configuration();
			store.configure(config, 0, NOW);
			const a = config.accounts[0];
			if (!a) throw new Error("fixture");
			const lease = store.reserve(a, original(), NOW);
			expect(lease).toBeDefined();
			const changed = clone(config);
			const c = changed.connections[0];
			if (!c) throw new Error("fixture");
			c.bridgeSha = "a".repeat(40);
			expect(() => store.configure(changed, 1, NOW)).toThrow(/active lease/);
			const changedProvider = clone(config);
			const o = changedProvider.accounts[0]?.offers[0];
			if (!o) throw new Error("fixture");
			o.providerAccountId = "another-provider-account";
			expect(() => store.configure(changedProvider, 1, NOW)).toThrow(
				/active lease/,
			);
			a.budgetMicros = 200000;
			expect(store.configure(config, 1, NOW).revision).toBe(2);
			expect(store.all()).toHaveLength(1);
			expect(
				store
					.events()
					.filter((event) => event.type === "ci.ConfigurationChanged"),
			).toHaveLength(2);
		} finally {
			store.close();
		}
	});
	it("does not charge a refreshed inclusive snapshot twice when reconciliation arrives late", async () => {
		const store = new LeaseStore(":memory:");
		try {
			const config = await configuration();
			const a = config.accounts[0];
			const o = a?.offers[0];
			if (!a || !o) throw new Error("fixture");
			o.freeMinutes = 0;
			store.configure(config, 0, NOW);
			const pipeline = parsePipeline(
				JSON.stringify({
					id: "build",
					accountId: a.id,
					timeoutSeconds: 60,
					steps: [{ id: "test", argv: ["true"] }],
				}),
			);
			const lease = store.reservePipeline(
				a,
				pipeline,
				"input-digest",
				[o.id],
				NOW,
			);
			if (!lease) throw new Error("fixture reservation");
			store.settle(lease.id, 0, 1, "2026-10-27T12:02:00Z", undefined, NOW);
			a.usageObservedAt = "2026-10-27T12:01:00Z";
			a.spentMicros = 1000;
			a.budgetMicros = 3000;
			o.observedAt = a.usageObservedAt;
			o.spentMicros = 1000;
			o.budgetMicros = 3000;
			store.configure(config, 1, "2026-10-27T12:03:00Z");
			expect(route(a, store.all(), "2026-10-27T12:03:00Z")?.paidMicros).toBe(
				2000,
			);
			expect(store.all()[0]?.usageCompletedAt).toBe(NOW);
		} finally {
			store.close();
		}
	});
	it("subtracts free usage only after the inclusive provider observation watermark", async () => {
		const store = new LeaseStore(":memory:");
		try {
			const config = await configuration();
			const a = config.accounts[0];
			const o = a?.offers[0];
			if (!a || !o) throw new Error("fixture");
			store.configure(config, 0, NOW);
			const lease = store.reserve(a, original(), NOW);
			if (!lease) throw new Error("fixture reservation");
			store.settle(lease.id, 0, 1, "2026-10-27T12:02:00Z", undefined, NOW);
			o.freeMinutes = 1;
			o.observedAt = "2026-10-27T12:01:00Z";
			store.configure(config, 1, "2026-10-27T12:03:00Z");
			const decision = route(a, store.all(), "2026-10-27T12:03:00Z");
			expect(decision?.freeMinutes).toBe(1);
			expect(decision?.paidMicros).toBe(1000);
		} finally {
			store.close();
		}
	});
	it("persists budget signal ordering across reopen and rejects stale or discarded watermarks", async () => {
		const path = await disk();
		let store = new LeaseStore(path);
		try {
			const config = await configuration();
			const account = config.accounts[0];
			if (!account) throw new Error("fixture");
			const key = "broker:example:1";
			account.routingSignalCycles[key] = 1;
			account.routingSignalCrossed[key] = true;
			store.configure(config, 0, NOW);
			store.close();
			store = new LeaseStore(path);
			store.rebuild();
			expect(
				store.configuration()?.configuration?.accounts[0]?.routingSignalCycles[
					key
				],
			).toBe(1);
			const missing = clone(config);
			const missingAccount = missing.accounts[0];
			if (!missingAccount) throw new Error("fixture");
			delete missingAccount.routingSignalCycles[key];
			delete missingAccount.routingSignalCrossed[key];
			expect(() => store.configure(missing, 1, NOW)).toThrow(
				/watermark cannot move backwards/,
			);
			account.routingSignalCrossed[key] = false;
			expect(() => store.configure(config, 1, NOW)).toThrow(/newer cycle/);
			account.routingSignalCycles[key] = 2;
			expect(store.configure(config, 1, NOW).revision).toBe(2);
			expect(() =>
				store.configure(create(ConfigurationSchema), 2, NOW),
			).toThrow(/watermark cannot move backwards/);
			delete account.routingSignalCrossed[key];
			expect(() => store.configure(config, 2, NOW)).toThrow(
				/invalid routing signal state/,
			);
			expect(store.configuration()?.revision).toBe(2);
		} finally {
			store.close();
		}
	});
	it("refuses future and backwards usage watermarks without mutating its journal", async () => {
		const store = new LeaseStore(":memory:");
		try {
			const config = await configuration();
			const a = config.accounts[0];
			if (!a) throw new Error("fixture");
			a.usageObservedAt = "2026-10-27T11:00:00Z";
			store.configure(config, 0, NOW);
			a.usageObservedAt = "2026-10-28T11:00:00Z";
			expect(() => store.configure(config, 1, NOW)).toThrow(/future/);
			a.usageObservedAt = "2026-10-26T11:00:00Z";
			expect(() => store.configure(config, 1, NOW)).toThrow(/backwards/);
			expect(store.configuration()?.revision).toBe(1);
			expect(store.events()).toHaveLength(1);
		} finally {
			store.close();
		}
	});
});
