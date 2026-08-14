import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GOLDEN_DEFAULT_SUITE_ID } from "@hobo/evals";

import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";
import { startEvalSidecar } from "../src/eval-sidecar-server.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("evals sidecar server", () => {
	it("always serves the golden default suite and scores a live run", async () => {
		const project = mkdtempSync(join(tmpdir(), "hobo-eval-server-"));
		roots.push(project);
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(
			join(project, "src", "bindle.ts"),
			`export default bindle("shop", (b) => ({ web: b.web() }));\n`,
		);
		const server = await startEvalSidecar({
			campId: "camp:shop",
			projectDir: project,
			port: 0,
		});
		try {
			expect(server.url).toMatch(/evals\.code\..*\.hobo\.localhost/);
			const health = await (
				await fetch(loopbackFetchUrl(server.url))
			).json() as { live: boolean; suite: { defaultSuite: { id: string } } };
			expect(health.live).toBe(true);
			expect(health.suite.defaultSuite.id).toBe(GOLDEN_DEFAULT_SUITE_ID);
			const run = await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
				})
			).json() as {
				ok: boolean;
				reports: unknown[];
			};
			expect(run.ok).toBe(true);
			expect(run.reports).toEqual([]);
		} finally {
			await server.close();
		}
	});

	it("scores exact-match of trainable output against blessed examples", async () => {
		const project = mkdtempSync(join(tmpdir(), "hobo-eval-train-"));
		roots.push(project);
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(
			join(project, "src", "classify.ts"),
			`
export async function classify(input: { text: string }) {
  "use training";
  return training(async (body) => body, {
    methodRef: "shop.classify",
    intent: "label the ticket",
    contract: {
      examples: [
        { input: { text: "invoice overdue" }, output: { label: "billing" } },
      ],
    },
  });
}
`,
		);
		const server = await startEvalSidecar({
			campId: "camp:shop",
			projectDir: project,
			port: 0,
		});
		try {
			const miss = await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						actuals: { "shop.classify": [{ label: "shipping" }] },
					}),
				})
			).json() as { ok: boolean };
			expect(miss.ok).toBe(false);
			const hit = await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						actuals: { "shop.classify": [{ label: "billing" }] },
					}),
				})
			).json() as { ok: boolean };
			expect(hit.ok).toBe(true);
		} finally {
			await server.close();
		}
	});
});
