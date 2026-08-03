export type Redundancy =
	| "none"
	| "active-passive"
	| "active-active"
	| "mirror";

export type ResourceClass = "local" | "anonymous-remote" | "paid-remote";

export type RoutingPolicy = "local-first" | "latency-first" | "cost-first";

export interface BudgetPolicy {
	readonly preferLocal: boolean;
	readonly routing: RoutingPolicy;
	readonly redundancy: Redundancy;
	readonly maxReplicas: number;
	readonly maxConcurrent: number;
	readonly monthlySpendCapUsd: number;
	readonly resourcePool: readonly ResourceClass[];
}

export type SparseBudgetPolicy = Partial<BudgetPolicy>;

export const DEFAULT_BUDGET_POLICY: Readonly<BudgetPolicy> = Object.freeze({
	preferLocal: true,
	routing: "local-first",
	redundancy: "none",
	maxReplicas: 1,
	maxConcurrent: 4,
	monthlySpendCapUsd: 0,
	resourcePool: Object.freeze(["local", "anonymous-remote"]),
});

/** Merge only authored keys: defaults -> app -> deployment. */
export function mergeBudgetPolicy(
	appPolicy: SparseBudgetPolicy = {},
	deploymentPolicy: SparseBudgetPolicy = {},
): BudgetPolicy {
	return {
		...DEFAULT_BUDGET_POLICY,
		...appPolicy,
		...deploymentPolicy,
	};
}
