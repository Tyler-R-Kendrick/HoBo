import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";
import {
	defaultSelectedTargetIds,
	HOST_SANDBOX_TOKENS,
	mapConcurrent,
	normalizeBase,
	resolveExampleDeployPlan,
} from "./controller.js";

describe("Examples Home Station", () => {
	it("normalizes the GitHub Pages base before building static URLs", () => {
		expect(normalizeBase("/HoBo")).toBe("/HoBo/");
		expect(normalizeBase("/HoBo/")).toBe("/HoBo/");
		expect(normalizeBase(undefined)).toBe("/");
	});

	it("grants blob hosts scripts only", () => {
		expect(HOST_SANDBOX_TOKENS).toEqual(["allow-scripts"]);
	});

	it("turns repository policies into the exact local live set", async () => {
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

		expect(plans["hello-counter"]).toEqual([["browser-wasm", "primary"]]);
		expect(plans["kv-notes"]).toEqual([
			["browser-wasm", "primary"],
			["webernetes", "standby"],
		]);
		expect(plans["todo-api"]).toEqual([["browser-wasm", "primary"]]);
		expect(plans["queue-echo"]).toEqual([
			["browser-wasm", "primary"],
			["webernetes", "replica"],
			["lakebed", "replica"],
		]);
	});

	it("selects only Yard-allowed candidates and blocks remote bootstrap honestly", async () => {
		const catalog = await loadExamplesCatalog();
		const queue = catalog.find(({ id }) => id === "queue-echo")!;
		const notes = catalog.find(({ id }) => id === "kv-notes")!;

		expect([...defaultSelectedTargetIds(queue)]).toEqual([
			"browser-wasm",
			"webernetes",
			"lakebed",
		]);
		expect(
			resolveExampleDeployPlan(notes).skipped.find(
				({ target }) => target.id === "cloudflare",
			),
		).toMatchObject({
			reason: "cannot-host",
			detail: "remote bootstrap requires a trusted local bridge",
		});
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
});
