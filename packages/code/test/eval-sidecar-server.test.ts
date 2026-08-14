import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOLDEN_DEFAULT_SUITE_ID, SILVER_DEFAULT_SUITE_ID } from "@hobo/evals";
import { afterEach, describe, expect, it } from "vitest";
import { campEvalSidecar } from "../src/eval-sidecar.js";
import {
	runEvalSidecarSuite,
	startEvalSidecar,
} from "../src/eval-sidecar-server.js";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";

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
			const health = (await (
				await fetch(loopbackFetchUrl(server.url))
			).json()) as {
				live: boolean;
				suite: {
					defaultSuite: { id: string };
					silverSuite: { id: string };
				};
			};
			expect(health.live).toBe(true);
			expect(health.suite.defaultSuite.id).toBe(GOLDEN_DEFAULT_SUITE_ID);
			expect(health.suite.silverSuite.id).toBe(SILVER_DEFAULT_SUITE_ID);
			const run = (await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
				})
			).json()) as {
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
			const miss = (await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						actuals: { "shop.classify": [{ label: "shipping" }] },
					}),
				})
			).json()) as { ok: boolean };
			expect(miss.ok).toBe(false);
			const hit = (await (
				await fetch(new URL("/run", loopbackFetchUrl(server.url)), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						actuals: { "shop.classify": [{ label: "billing" }] },
					}),
				})
			).json()) as { ok: boolean; silver: { ok: boolean } };
			expect(hit.ok).toBe(true);
			expect(hit.silver.ok).toBe(true);
		} finally {
			await server.close();
		}
	});

	it("runs silver fuzz against a live trainable function", () => {
		const suite = campEvalSidecar("camp:shop", {
			trainable: [
				{
					methodRef: "shop.classify",
					file: "src/classify.ts",
					form: "directive",
					grounded: true,
					examples: [
						{
							input: { text: "invoice overdue" },
							output: { label: "billing" },
						},
					],
				},
			],
		});
		const pass = runEvalSidecarSuite({
			suite,
			invokers: {
				"shop.classify": (input) => {
					const text =
						input && typeof input === "object" && "text" in input
							? String((input as { text?: unknown }).text ?? "")
							: "";
					return { label: text.includes("invoice") ? "billing" : "other" };
				},
			},
		});
		expect(pass.ok).toBe(true);
		expect(pass.gold.ok).toBe(true);
		expect(pass.silver.ok).toBe(true);
		const drift = runEvalSidecarSuite({
			suite,
			invokers: {
				"shop.classify": () => ({ label: "shipping" }),
			},
		});
		expect(drift.silver.ok).toBe(false);
		expect(drift.ok).toBe(false);
	});
});
