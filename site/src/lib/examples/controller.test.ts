import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";
import {
	defaultSelectedStationIds,
	defaultSelectedTargetIds,
	HOST_SANDBOX_TOKENS,
	mapConcurrent,
	normalizeBase,
	pickSourceFocusId,
	resolveExampleDeployPlan,
	resolveExampleStationPlan,
	resolveStageSourceFocusId,
	resolveStationDeployPlan,
	SHIP_GATE_PLAN_LINE,
	SHIP_LOCKED_DEPLOY_LABEL,
	shipStationsReady,
	targetPackCanHostNow,
} from "./controller.js";
import { resolveDemoPolicy } from "./demo-policies.js";
import type { DeployedStation } from "./station-registry.js";
import { loadYardDeploySources } from "./yard-deploy-source.js";

describe("Examples Home Station", () => {
	it("normalizes the GitHub Pages base before building static URLs", () => {
		expect(normalizeBase("/HoBo")).toBe("/HoBo/");
		expect(normalizeBase("/HoBo/")).toBe("/HoBo/");
		expect(normalizeBase(undefined)).toBe("/");
	});

	it("grants blob hosts scripts only", () => {
		expect(HOST_SANDBOX_TOKENS).toEqual(["allow-scripts"]);
	});

	it("plans station deploy from the provider pool with demo policy presets", async () => {
		const catalog = await loadExamplesCatalog();
		const yards = catalog[0]!.topology.yards;
		const localOnly = resolveStationDeployPlan(
			yards,
			new Set(["browser-wasm", "webernetes", "cloudflare"]),
			"local-only",
		);
		// Selecting Cloudflare widens the pool — operator stamps are not blocked.
		expect(localOnly.policy.resourcePool).toEqual(
			expect.arrayContaining(["local", "anonymous-remote"]),
		);
		expect(localOnly.provision.map(({ target }) => target.id).sort()).toEqual([
			"browser-wasm",
			"cloudflare",
			"webernetes",
		]);
		expect(localOnly.skipped.find(({ target }) => target.id === "cloudflare")).toBeUndefined();
		expect(targetPackCanHostNow("cloudflare")).toBe(true);
		expect(targetPackCanHostNow("railway")).toBe(true);
		expect(targetPackCanHostNow("netlify")).toBe(true);
		expect(targetPackCanHostNow("vercel")).toBe(true);

		const multi = resolveStationDeployPlan(
			yards,
			new Set(["browser-wasm", "webernetes", "lakebed"]),
			"cost-first-multi",
		);
		expect(multi.provision).toHaveLength(3);
	});

	it("gates example deploy onto deployed stations only", async () => {
		const catalog = await loadExamplesCatalog();
		const queue = catalog.find(({ id }) => id === "queue-echo")!;
		const stations: DeployedStation[] = [
			{
				id: "station:browser:home:browser-wasm",
				targetId: "browser-wasm",
				yardId: "yard:browser-wasm",
				providerId: "browser-wasm",
				policy: resolveDemoPolicy("local-only"),
				label: "Browser WASM",
				createdAt: "2026-08-05T00:00:00.000Z",
			},
			{
				id: "station:browser:home:webernetes",
				targetId: "webernetes",
				yardId: "yard:webernetes",
				providerId: "webernetes",
				policy: resolveDemoPolicy("local-only"),
				label: "Webernetes (local)",
				createdAt: "2026-08-05T00:00:00.000Z",
			},
		];

		expect([...defaultSelectedStationIds(queue, stations)]).toEqual([
			"station:browser:home:browser-wasm",
			"station:browser:home:webernetes",
		]);
		expect(
			resolveExampleStationPlan(queue, stations).provision.map(({ target }) => target.id),
		).toEqual(["browser-wasm", "webernetes"]);
		expect(resolveExampleStationPlan(queue, []).provision).toEqual([]);
	});

	it("keeps repository policy fixtures for example→yard planning", async () => {
		const catalog = await loadExamplesCatalog();
		const plans = Object.fromEntries(
			catalog.map((example) => [
				example.id,
				resolveExampleDeployPlan(example).provision.map(({ target, role }) => [
					target.id,
					role,
				]),
			]),
		);

		expect(plans["hello-world"]).toEqual([["browser-wasm", "primary"]]);
		expect(plans["kv-notes"]).toEqual([
			["browser-wasm", "primary"],
			["cloudflare", "standby"],
		]);
		expect(plans["todo-api"]).toEqual([["browser-wasm", "primary"]]);
		expect(plans["queue-echo"]).toEqual([
			["browser-wasm", "primary"],
			["webernetes", "replica"],
			["lakebed", "replica"],
		]);
		expect(plans["opensaas"]).toEqual([["webernetes", "primary"]]);
	});

	it("selects only Yard-allowed candidates; Cloudflare/Railway stay hostable", async () => {
		const catalog = await loadExamplesCatalog();
		const queue = catalog.find(({ id }) => id === "queue-echo")!;
		const notes = catalog.find(({ id }) => id === "kv-notes")!;
		const saas = catalog.find(({ id }) => id === "opensaas")!;

		expect([...defaultSelectedTargetIds(queue)]).toEqual([
			"browser-wasm",
			"webernetes",
			"lakebed",
		]);
		const notesCf = resolveExampleDeployPlan(notes).skipped.find(
			({ target }) => target.id === "cloudflare",
		);
		// Cloudflare is hostable; may still be skipped for budget/role reasons, never cannot-host.
		if (notesCf) expect(notesCf.reason).not.toBe("cannot-host");
		expect(saas.topology.allowedYardIds).toEqual([
			"yard:webernetes",
			"yard:lakebed",
			"yard:cloudflare",
			"yard:railway",
		]);
		expect(targetPackCanHostNow("cloudflare")).toBe(true);
		expect(targetPackCanHostNow("railway")).toBe(true);
	});

	it("loads yard deploy surfaces for Pool Stage Source", async () => {
		const sources = await loadYardDeploySources();
		const byId = Object.fromEntries(sources.map((entry) => [entry.targetId, entry]));
		expect(byId.cloudflare?.sourcePath).toBe(
			"examples/try-site/yards/cloudflare.deploy.ts",
		);
		expect(byId.railway?.source).toContain("anonymous-remote");
		expect(byId.railway?.source).not.toContain("waspApp");
		expect(byId.cloudflare?.source).not.toMatch(/\bcli\s*:/);
		expect(byId.cloudflare?.source).toContain("stationBootstrap");
		expect(byId["browser-wasm"]?.source).toContain("browser-wit");
	});

	it("waits for in-flight bootstrap workers before a failed deployment rejects", async () => {
		let inFlightFinished = false;
		await expect(
			mapConcurrent(["fail", "slow"], 2, async (value) => {
				if (value === "fail") throw new Error("bootstrap failed");
				await new Promise((resolve) => setTimeout(resolve, 10));
				inFlightFinished = true;
			}),
		).rejects.toThrow("bootstrap failed");
		expect(inFlightFinished).toBe(true);
	});

	it("keeps Stage Source focused on the last selected app (OpenSaaS over hello-world)", async () => {
		const catalog = await loadExamplesCatalog();
		const selected = new Set(["hello-world", "opensaas"]);
		expect(pickSourceFocusId(selected, "opensaas", "hello-world")).toBe("opensaas");
		expect(pickSourceFocusId(selected, "hello-world", "hello-world")).toBe("hello-world");
		expect(pickSourceFocusId(new Set(["opensaas"]), "hello-world", "hello-world")).toBe(
			"opensaas",
		);
		const focusId = pickSourceFocusId(selected, "opensaas", catalog[0]!.id);
		const focus = catalog.find((example) => example.id === focusId);
		expect(focus?.source).toContain("opensaas");
		expect(focus?.source).toContain("b.container");
		expect(focus?.deployKind).toBe("local-bridge");
	});

	it("prefers the active live host over Ship selection for Stage Source", async () => {
		const catalog = await loadExamplesCatalog();
		const selected = new Set(["hello-world", "opensaas"]);
		expect(
			resolveStageSourceFocusId({
				selected,
				sourceFocusId: "hello-world",
				fallbackId: "hello-world",
				activeLiveExampleId: "opensaas",
			}),
		).toBe("opensaas");
		const focus = catalog.find(
			(example) =>
				example.id ===
				resolveStageSourceFocusId({
					selected,
					sourceFocusId: "hello-world",
					fallbackId: catalog[0]!.id,
					activeLiveExampleId: "opensaas",
				}),
		);
		expect(focus?.source).toContain("b.container");
		expect(focus?.source).not.toContain("b.web(Hello)");
	});

	it("hard-locks Ship until registry.stations.length > 0", async () => {
		const catalog = await loadExamplesCatalog();
		const hello = catalog.find(({ id }) => id === "hello-world")!;
		expect(shipStationsReady(0)).toBe(false);
		expect(shipStationsReady(1)).toBe(true);
		expect(SHIP_LOCKED_DEPLOY_LABEL).toBe("Locked — deploy stations first");
		expect(SHIP_GATE_PLAN_LINE).toBe("Deploy at least one station in Pool first.");
		expect(resolveExampleStationPlan(hello, []).provision).toEqual([]);
	});

	it("keeps hello Source as Bindle-only app.ts (no guest/try-runtime theater)", async () => {
		const catalog = await loadExamplesCatalog();
		const hello = catalog.find(({ id }) => id === "hello-world")!;
		expect(hello.source.trimStart().startsWith("import")).toBe(true);
		expect(hello.source).toContain("b.web(Hello)");
		expect(hello.source).not.toContain("guest handlers");
		expect(hello.source).not.toContain("schemaVersion");
	});
});
