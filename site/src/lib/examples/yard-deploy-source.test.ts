import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GET } from "../../pages/examples/yards-deploy.json.js";
import { loadYardDeploySources, yardDeployByTarget } from "./yard-deploy-source.js";

describe("Yard deploy sources", () => {
	it("keeps Node fs out of the browser controller entry", async () => {
		const controllerPath = fileURLToPath(new URL("./controller.ts", import.meta.url));
		const contractPath = fileURLToPath(
			new URL("./yard-deploy-source-contract.ts", import.meta.url),
		);
		const controller = await readFile(controllerPath, "utf8");
		const contract = await readFile(contractPath, "utf8");
		expect(controller).toContain("yard-deploy-source-contract");
		expect(controller).not.toContain('from "./yard-deploy-source.js"');
		expect(controller).not.toContain("node:fs");
		expect(contract).not.toContain("node:fs");
	});

	it("forbids Bindle/app fields on yard deploy surfaces", async () => {
		const sources = await loadYardDeploySources();
		for (const entry of sources) {
			expect(entry.source, entry.targetId).not.toMatch(/\bwaspApp\b/u);
			expect(entry.source, entry.targetId).not.toMatch(/\bcli\s*:/u);
			expect(entry.source, entry.targetId).not.toMatch(
				/examples\/try-site\/apps\//u,
			);
			expect(entry.source, entry.targetId).not.toMatch(/wasp-opensaas/u);
			expect(entry.source, entry.targetId).toMatch(/\bstationBootstrap\b/u);
		}
	});

	it("loads every Pool target deploy surface from the repository", async () => {
		const sources = await loadYardDeploySources();
		const map = yardDeployByTarget(sources);
		expect(map.has("cloudflare")).toBe(true);
		expect(map.has("railway")).toBe(true);
		expect(map.get("railway")?.source).toContain("anonymous-remote");
		expect(map.get("cloudflare")?.source).toContain("stationBootstrap");
	});

	it("prerenders yards-deploy.json for the console", async () => {
		const response = await GET({} as never);
		const body = (await response.json()) as { targetId: string }[];
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(body.map((entry) => entry.targetId)).toEqual(
			expect.arrayContaining(["browser-wasm", "cloudflare", "railway"]),
		);
	});
});
