import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { fuzzTrainable } from "../../src/index.js";

describe("trainable gold/silver stress", () => {
	it("a pure deterministic labeler survives random gold seeds", () => {
		const fn = (input: unknown) => {
			const text =
				input && typeof input === "object" && "text" in input
					? String((input as { text?: unknown }).text ?? "")
					: "";
			return { label: text.includes("invoice") ? "billing" : "other" };
		};
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						text: fc.string({ maxLength: 40 }),
					}),
					{ minLength: 1, maxLength: 8 },
				),
				(rows) => {
					const seeds = rows.map((row) => ({
						input: row,
						output: fn(row),
					}));
					const report = fuzzTrainable(fn, seeds, {
						methodRef: "shop.classify",
					});
					expect(
						report.ok,
						report.verdicts.map((row) => row.message).join("; "),
					).toBe(true);
				},
			),
			{ numRuns: 80 },
		);
	});

	it("detects drift, non-determinism, throws, and oversize", () => {
		const seed = {
			input: { text: "invoice overdue" },
			output: { label: "billing" },
		};
		expect(fuzzTrainable(() => ({ label: "shipping" }), [seed]).seedHolds).toBe(
			false,
		);
		let flip = false;
		expect(
			fuzzTrainable(() => {
				flip = !flip;
				return { label: flip ? "billing" : "other" };
			}, [seed]).deterministic,
		).toBe(false);
		expect(
			fuzzTrainable(() => {
				throw new Error("boom");
			}, [seed]).seedHolds,
		).toBe(false);
		expect(
			fuzzTrainable(() => "x".repeat(70_000), [{ input: { text: "a" } }])
				.bounded,
		).toBe(false);
	});

	it("does not treat an identity echo as fail-closed", () => {
		const report = fuzzTrainable(
			(input) => input,
			[{ input: { text: "ok" }, output: { text: "ok" } }],
		);
		expect(report.failClosed).toBe(false);
	});

	it("treats a thenable trainable as not fail-closed", () => {
		const report = fuzzTrainable(
			() => Promise.resolve({ label: "billing" }),
			[
				{
					input: { text: "invoice overdue" },
					output: { label: "billing" },
				},
			],
		);
		expect(report.failClosed).toBe(false);
		expect(report.seedHolds).toBe(false);
		expect(report.ok).toBe(false);
	});
});
