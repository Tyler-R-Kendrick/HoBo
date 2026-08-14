import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOLDEN_DEFAULT_SUITE_ID, SILVER_DEFAULT_SUITE_ID } from "@hobo/evals";
import { afterEach, describe, expect, it } from "vitest";

import {
	campEvalSidecar,
	EVAL_SIDECAR_HOSTING,
	EVAL_SIDECAR_NAME,
	inspectProjectEvalTests,
	inspectTrainableRegions,
} from "../src/eval-sidecar.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-eval-sidecar-"));
	roots.push(root);
	return root;
}

describe("always-on evals sidecar", () => {
	it("always hosts the golden default suite in the app camp", () => {
		const sidecar = campEvalSidecar("camp:shop");
		expect(sidecar).toEqual({
			kind: "sidecar",
			name: EVAL_SIDECAR_NAME,
			hosting: EVAL_SIDECAR_HOSTING,
			campId: "camp:shop",
			defaultSuite: {
				id: GOLDEN_DEFAULT_SUITE_ID,
				source: "trainable-exact-match",
			},
			silverSuite: {
				id: SILVER_DEFAULT_SUITE_ID,
				source: "trainable-property-fuzz",
			},
			trainable: [],
		});
	});

	it("overlays optional project eval tests for trainable regions", () => {
		const root = tempProject();
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				name: "shop",
				scripts: { "test:eval": "vitest run test/shop.eval.test.ts" },
			}),
		);
		mkdirSync(join(root, "src"), { recursive: true });
		mkdirSync(join(root, "test"));
		writeFileSync(join(root, "test", "shop.eval.test.ts"), "export {};\n");
		writeFileSync(
			join(root, "src", "classify.ts"),
			`
export async function classify(input: { text: string }) {
  "use training";
  return training(async (body) => body, {
    methodRef: "shop.classify",
    intent: "label the ticket",
    contract: {
      input: {},
      output: {},
      examples: [
        { input: { text: "invoice overdue" }, output: { label: "billing" } },
      ],
    },
  });
}
`,
		);
		const tests = inspectProjectEvalTests(root);
		const trainable = inspectTrainableRegions(root);
		expect(tests).toEqual({
			source: "project-test-suite",
			command: "pnpm run test:eval",
			files: ["test/shop.eval.test.ts"],
		});
		expect(trainable).toEqual([
			expect.objectContaining({
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
			}),
		]);
		expect(campEvalSidecar("camp:shop", { tests, trainable })).toMatchObject({
			defaultSuite: { source: "trainable-exact-match" },
			project: tests,
			trainable,
		});
	});

	it("finds no project overlay when the suite is only the golden default", () => {
		const root = tempProject();
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "shop", scripts: { test: "vitest run" } }),
		);
		expect(inspectProjectEvalTests(root)).toBeUndefined();
		expect(inspectTrainableRegions(root)).toEqual([]);
	});
});
