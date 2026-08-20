/**
 * The cost surface's own branches.
 *
 * `inspectCost` is pure over an injected environment, which makes every one of
 * its decisions cheap to pin: cap parsing with two env spellings and a
 * malformed-value fallback, three routing policies, the local-model heuristic
 * across both the model name and four base-URL variables, and the savings
 * arithmetic including its divide-by-zero guard.
 *
 * Worth stating what these tests are *not*: the savings figure is explicitly
 * illustrative — a hypothetical always-frontier baseline, not a measurement.
 * Pinning it means pinning that it stays clamped, monotonic and honest about
 * being an estimate, not asserting that any dollar figure is true.
 */
import { describe, expect, it } from "vitest";

import {
	CODE_COST_SCHEMA,
	costHumanSummary,
	inspectCost,
} from "../src/cost.js";
import { DEFAULT_BUDGET_POLICY } from "../src/finops.js";

/** An environment with nothing set, so no ambient key leaks into a result. */
const bare: NodeJS.ProcessEnv = {};

describe("the budget cap", () => {
	it("falls back to the default when nothing is set", () => {
		expect(inspectCost(bare).budget.capUsd).toBe(DEFAULT_BUDGET_POLICY.capUsd);
	});

	it("reads HOBO_CODE_BUDGET_USD", () => {
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "12" }).budget.capUsd).toBe(12);
	});

	it("accepts HOBO_CODE_CAP_USD as the alternate spelling", () => {
		expect(inspectCost({ HOBO_CODE_CAP_USD: "7" }).budget.capUsd).toBe(7);
	});

	it("prefers HOBO_CODE_BUDGET_USD when both are set", () => {
		expect(
			inspectCost({ HOBO_CODE_BUDGET_USD: "3", HOBO_CODE_CAP_USD: "9" }).budget
				.capUsd,
		).toBe(3);
	});

	it("falls back rather than trusting a non-numeric cap", () => {
		// A cap of NaN would compare false against every spend, which is a budget
		// that silently never binds.
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "lots" }).budget.capUsd).toBe(
			DEFAULT_BUDGET_POLICY.capUsd,
		);
	});

	it("falls back rather than accepting a negative cap", () => {
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "-5" }).budget.capUsd).toBe(
			DEFAULT_BUDGET_POLICY.capUsd,
		);
	});

	it("treats an empty string as unset", () => {
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "" }).budget.capUsd).toBe(
			DEFAULT_BUDGET_POLICY.capUsd,
		);
	});

	it("accepts a cap of zero, which is a real choice", () => {
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "0" }).budget.capUsd).toBe(0);
	});
});

describe("routing policy", () => {
	it("defaults to cheapest-capable", () => {
		expect(inspectCost(bare).budget.routingPolicy).toBe("cheapest-capable");
	});

	it("reads pinned", () => {
		expect(inspectCost({ HOBO_CODE_ROUTING: "pinned" }).routing.policy).toBe(
			"pinned",
		);
	});

	it("accepts both spellings of the fallback chain", () => {
		for (const value of ["fallback-chain", "fallback"])
			expect(inspectCost({ HOBO_CODE_ROUTING: value }).routing.policy).toBe(
				"fallback-chain",
			);
	});

	it("is case-insensitive", () => {
		expect(inspectCost({ HOBO_CODE_ROUTING: "PINNED" }).routing.policy).toBe(
			"pinned",
		);
	});

	it("falls back to cheapest-capable for an unknown policy", () => {
		expect(inspectCost({ HOBO_CODE_ROUTING: "wishful" }).routing.policy).toBe(
			"cheapest-capable",
		);
	});

	it("picks the free local candidate under cheapest-capable", () => {
		expect(inspectCost(bare).routing.picked).toBe("local-free");
	});

	it("still picks the cheapest under pinned, because no pin is supplied", () => {
		// `inspectCost` passes no pinned provider, so routeProvider's `&& pinned`
		// guard falls through to cheapest-capable. Worth pinning precisely because
		// it reads as a contradiction: the reported policy says "pinned" while the
		// selection was made on price. The policy is recorded, not applied.
		expect(inspectCost({ HOBO_CODE_ROUTING: "pinned" }).routing.picked).toBe(
			"local-free",
		);
	});

	it("picks the first candidate under the fallback chain", () => {
		expect(inspectCost({ HOBO_CODE_ROUTING: "fallback" }).routing.picked).toBe(
			"local-free",
		);
	});
});

describe("monetization", () => {
	it("is on by default", () => {
		expect(inspectCost(bare).budget.monetizationEnabled).toBe(
			DEFAULT_BUDGET_POLICY.monetizationOptIn,
		);
	});

	it('is disabled by "0"', () => {
		expect(
			inspectCost({ HOBO_CODE_MONETIZATION: "0" }).budget.monetizationEnabled,
		).toBe(false);
	});

	it('is disabled by "false"', () => {
		expect(
			inspectCost({ HOBO_CODE_MONETIZATION: "false" }).budget
				.monetizationEnabled,
		).toBe(false);
	});

	it("is not disabled by an unrelated value", () => {
		expect(
			inspectCost({ HOBO_CODE_MONETIZATION: "yes" }).budget.monetizationEnabled,
		).toBe(DEFAULT_BUDGET_POLICY.monetizationOptIn);
	});

	it("advertises how to turn it off", () => {
		expect(inspectCost(bare).budget.monetizationDisable).toBe(
			"HOBO_CODE_MONETIZATION=0",
		);
	});
});

describe("the local-model hint", () => {
	it.each([
		"ollama/llama3",
		"local/ornith-coder",
		"vendor/ornith-x",
	])("recognises %s by name", (model) => {
		expect(inspectCost({ HOBO_CODE_MODEL: model }).activeIsLocalHint).toBe(
			true,
		);
	});

	it("matches the model name case-insensitively", () => {
		expect(
			inspectCost({ HOBO_CODE_MODEL: "OLLAMA/Llama3" }).activeIsLocalHint,
		).toBe(true);
	});

	it.each([
		["OPENAI_BASE_URL", "http://localhost:8080"],
		["HOBO_CODE_LOCAL_BASE_URL", "http://127.0.0.1:1234"],
		["OLLAMA_HOST", "http://0.0.0.0:11434"],
	])("recognises a local %s", (name, value) => {
		expect(inspectCost({ [name]: value }).activeIsLocalHint).toBe(true);
	});

	it("recognises the Ollama port on any host", () => {
		expect(
			inspectCost({ OPENAI_BASE_URL: "http://box.lan:11434" })
				.activeIsLocalHint,
		).toBe(true);
	});

	it("does not treat a remote base URL as local", () => {
		expect(
			inspectCost({ OPENAI_BASE_URL: "https://api.openai.com/v1" })
				.activeIsLocalHint,
		).toBe(false);
	});

	it("is false when nothing suggests local", () => {
		expect(inspectCost(bare).activeIsLocalHint).toBe(false);
	});
});

describe("spend and savings", () => {
	it("records zero spend by default", () => {
		expect(inspectCost(bare).budget.spendUsd).toBe(0);
	});

	it("records simulated spend", () => {
		expect(inspectCost(bare, { spendUsd: 2 }).budget.spendUsd).toBe(2);
	});

	it("ignores a negative simulated spend", () => {
		// Negative spend would read as a refund the tracker never saw.
		expect(inspectCost(bare, { spendUsd: -3 }).budget.spendUsd).toBe(0);
	});

	it("never reports negative remaining budget", () => {
		const status = inspectCost({ HOBO_CODE_BUDGET_USD: "1" }, { spendUsd: 50 });
		expect(status.budget.remainingUsd).toBe(0);
	});

	it("floors the baseline at the frontier figure for a small cap", () => {
		expect(
			inspectCost({ HOBO_CODE_BUDGET_USD: "1" }).savings.frontierBaselineUsd,
		).toBe(1.5);
	});

	it("scales the baseline with a large cap", () => {
		expect(
			inspectCost({ HOBO_CODE_BUDGET_USD: "100" }).savings.frontierBaselineUsd,
		).toBe(40);
	});

	it("reports a full save when nothing was spent", () => {
		expect(inspectCost(bare).savings.savedPct).toBe(100);
	});

	it("never reports a negative save when spend exceeds the baseline", () => {
		const savings = inspectCost(bare, { spendUsd: 999 }).savings;
		expect(savings.savedUsd).toBe(0);
		expect(savings.savedPct).toBe(0);
	});

	it("clamps the percentage to 100", () => {
		expect(
			inspectCost(bare, { spendUsd: 0 }).savings.savedPct,
		).toBeLessThanOrEqual(100);
	});

	it("survives a zero cap without dividing by zero", () => {
		// capUsd 0 still floors the baseline at 1.5, so the guard is belt and
		// braces — but a NaN percentage here would render as "NaN%" to a user.
		const savings = inspectCost({ HOBO_CODE_BUDGET_USD: "0" }).savings;
		expect(Number.isFinite(savings.savedPct)).toBe(true);
	});

	it("narrates the local case differently from the cloud case", () => {
		const local = inspectCost({ HOBO_CODE_MODEL: "ollama/x" }).savings
			.narrative;
		const cloud = inspectCost(bare).savings.narrative;
		expect(local).not.toBe(cloud);
		expect(local).toContain("Local/free");
		expect(cloud).toContain("frontier baseline");
	});
});

describe("the payload contract", () => {
	it("carries its schema id", () => {
		expect(inspectCost(bare).schema).toBe(CODE_COST_SCHEMA);
	});

	it("always advertises the zero-dollar path", () => {
		expect(inspectCost(bare).zeroDollarPath).toBe(true);
	});

	it("never prints a key value, only its presence", () => {
		// The one thing this surface must not do.
		const status = inspectCost({ ANTHROPIC_API_KEY: "sk-secret-value" });
		expect(JSON.stringify(status)).not.toContain("sk-secret-value");
	});

	it("offers free-local endpoints and token tools", () => {
		const status = inspectCost(bare);
		expect(status.freeLocal.length).toBeGreaterThan(0);
		expect(status.tokenTools.length).toBeGreaterThan(0);
	});

	it("is a pure function of its inputs", () => {
		expect(inspectCost({ HOBO_CODE_BUDGET_USD: "9" }, { spendUsd: 1 })).toEqual(
			inspectCost({ HOBO_CODE_BUDGET_USD: "9" }, { spendUsd: 1 }),
		);
	});
});

describe("costHumanSummary", () => {
	it("renders every line of the panel", () => {
		const summary = costHumanSummary(inspectCost(bare));
		expect(summary.split("\n")).toHaveLength(8);
	});

	it("shows an empty bar at zero spend", () => {
		expect(costHumanSummary(inspectCost(bare))).toContain("░".repeat(10));
	});

	it("shows a full bar once spend reaches the cap", () => {
		const summary = costHumanSummary(
			inspectCost({ HOBO_CODE_BUDGET_USD: "10" }, { spendUsd: 10 }),
		);
		expect(summary).toContain("█".repeat(10));
	});

	it("does not overflow the bar when spend exceeds the cap", () => {
		// Without the clamp, "█".repeat of a larger count and "░".repeat of a
		// negative one would throw rather than render.
		const summary = costHumanSummary(
			inspectCost({ HOBO_CODE_BUDGET_USD: "1" }, { spendUsd: 100 }),
		);
		expect(summary).toContain("█".repeat(10));
		expect(summary).not.toContain("█".repeat(11));
	});

	it("marks monetization on and off differently", () => {
		expect(costHumanSummary(inspectCost(bare))).toContain("● mon");
		expect(
			costHumanSummary(inspectCost({ HOBO_CODE_MONETIZATION: "0" })),
		).toContain("○ mon");
	});

	it("marks a local model differently from a cloud one", () => {
		expect(
			costHumanSummary(inspectCost({ HOBO_CODE_MODEL: "ollama/x" })),
		).toContain("● local/free");
		expect(costHumanSummary(inspectCost(bare))).toContain("○ cloud-ish");
	});

	it("renders the picked provider, and an em dash when there is none", () => {
		expect(costHumanSummary(inspectCost(bare))).toContain("pick · local-free");
		// The em-dash branch is reachable only through a null pick, which
		// `inspectCost` never produces today — asserted directly so the fallback
		// is still covered rather than assumed.
		const status = inspectCost(bare);
		expect(
			costHumanSummary({
				...status,
				routing: { ...status.routing, picked: null },
			}),
		).toContain("pick · —");
	});

	it("never renders a key value", () => {
		expect(
			costHumanSummary(inspectCost({ OPENAI_API_KEY: "sk-leak" })),
		).not.toContain("sk-leak");
	});
});
