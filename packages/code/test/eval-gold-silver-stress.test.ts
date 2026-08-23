import { describe, expect, it } from "vitest";
import { campEvalSidecar } from "../src/eval-sidecar.js";
import { runEvalSidecarSuite } from "../src/eval-sidecar-server.js";
import { isJsonObject, type JsonObject, type JsonValue } from "../src/json.js";

function classify(input: JsonValue) {
	const text =
		input && isJsonObject(input) && "text" in input
			? // SAFETY: parsed or fixture value is the named domain type after this assertion.
				String(
					// SAFETY: object+text-in guard above proved input.text exists.
					(input as { text?: unknown }).text ?? "",
				)
			: "";
	return { label: text.includes("invoice") ? "billing" : "other" };
}

function suite() {
	return campEvalSidecar("camp:shop", {
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
					{
						input: { text: "hello" },
						output: { label: "other" },
					},
				],
			},
		],
	});
}

describe("gold/silver sidecar stress", () => {
	it("matching actuals pass both suites; any drift fails gold and silver", () => {
		for (const firstHit of [true, false]) {
			for (const secondHit of [true, false]) {
				const actuals = {
					"shop.classify": [
						{ label: firstHit ? "billing" : "shipping" },
						{ label: secondHit ? "other" : "billing" },
					],
				};
				const run = runEvalSidecarSuite({ suite: suite(), actuals });
				const shouldPass = firstHit && secondHit;
				expect(run.gold.ok).toBe(shouldPass);
				expect(run.silver.ok).toBe(shouldPass);
				expect(run.ok).toBe(shouldPass);
			}
		}
	});

	it("examples without actuals or invoker fail silver, the run, and the gate", () => {
		const run = runEvalSidecarSuite({ suite: suite() });
		expect(run.gold.ok).toBe(true);
		expect(run.silver.ok).toBe(false);
		expect(run.ok).toBe(false);
		expect(run.gate.ok).toBe(false);
	});

	it("partial actuals fail silver", () => {
		const run = runEvalSidecarSuite({
			suite: suite(),
			actuals: { "shop.classify": [{ label: "billing" }] },
		});
		expect(run.silver.ok).toBe(false);
		expect(run.ok).toBe(false);
		expect(run.gate.ok).toBe(false);
	});

	it("polluted actuals fail silver", () => {
		const run = runEvalSidecarSuite({
			suite: suite(),
			actuals: {
				"shop.classify": [
					{ label: "billing", constructor: { admin: true } },
					{ label: "other" },
				],
			},
		});
		expect(run.silver.ok).toBe(false);
		expect(run.ok).toBe(false);
	});

	it("a correct invoker fills gold actuals and passes both suites", () => {
		const run = runEvalSidecarSuite({
			suite: suite(),
			invokers: { "shop.classify": classify },
		});
		expect(run.gold.ok).toBe(true);
		expect(
			run.gold.reports[0]?.scores.some(
				(row) => row.criterionId === "example.0",
			),
		).toBe(true);
		expect(run.silver.ok).toBe(true);
		expect(run.ok).toBe(true);
	});

	it("a throwing invoker fails gold and silver instead of skipping gold", () => {
		const run = runEvalSidecarSuite({
			suite: suite(),
			invokers: {
				"shop.classify": () => {
					throw new Error("boom");
				},
			},
		});
		expect(run.gold.ok).toBe(false);
		expect(run.silver.ok).toBe(false);
		expect(run.ok).toBe(false);
		expect(run.gate.ok).toBe(false);
	});

	it("does not crash when posted actuals are circular", () => {
		const circ: JsonObject = { label: "billing" };
		circ.self = circ;
		expect(() =>
			runEvalSidecarSuite({
				suite: suite(),
				actuals: { "shop.classify": [circ, { label: "other" }] },
			}),
		).not.toThrow();
		const run = runEvalSidecarSuite({
			suite: suite(),
			actuals: { "shop.classify": [circ, { label: "other" }] },
		});
		expect(run.ok).toBe(false);
		expect(run.silver.ok).toBe(false);
	});

	it("wrong invoker fails silver and must fail the combined run and gate", () => {
		const run = runEvalSidecarSuite({
			suite: suite(),
			actuals: {
				"shop.classify": [{ label: "billing" }, { label: "other" }],
			},
			invokers: {
				"shop.classify": () => ({ label: "shipping" }),
			},
		});
		expect(run.gold.ok).toBe(true);
		expect(run.silver.ok).toBe(false);
		expect(run.ok).toBe(false);
		expect(run.gate.ok).toBe(false);
	});

	it("two regions stay isolated: A drift does not flip B", () => {
		const two = campEvalSidecar("camp:shop", {
			trainable: [
				{
					methodRef: "shop.classify",
					file: "a.ts",
					form: "directive",
					grounded: true,
					examples: [
						{
							input: { text: "invoice overdue" },
							output: { label: "billing" },
						},
					],
				},
				{
					methodRef: "shop.route",
					file: "b.ts",
					form: "directive",
					grounded: true,
					examples: [{ input: { path: "/" }, output: { dest: "home" } }],
				},
			],
		});
		const run = runEvalSidecarSuite({
			suite: two,
			actuals: {
				"shop.classify": [{ label: "shipping" }],
				"shop.route": [{ dest: "home" }],
			},
		});
		expect(run.gold.reports[0]?.ok).toBe(false);
		expect(run.gold.reports[1]?.ok).toBe(true);
		expect(run.silver.reports[0]?.ok).toBe(false);
		expect(run.silver.reports[1]?.ok).toBe(true);
		expect(run.ok).toBe(false);
		expect(run.gate.ok).toBe(false);
	});
});
