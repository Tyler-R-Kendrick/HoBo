import { describe, expect, it } from "vitest";

import {
	DEFAULT_BUDGET_POLICY,
	mergeBudgetPolicy,
} from "./policy-planner";

describe("mergeBudgetPolicy", () => {
	it("merges sparse app and deployment policy without clobbering later redundancy", () => {
		expect(
			mergeBudgetPolicy(
				{ routing: "latency-first", monthlySpendCapUsd: 12 },
				{ redundancy: "active-passive", maxReplicas: 2 },
			),
		).toEqual({
			...DEFAULT_BUDGET_POLICY,
			routing: "latency-first",
			monthlySpendCapUsd: 12,
			redundancy: "active-passive",
			maxReplicas: 2,
		});
	});
});
