import type { InferenceBudgetSnapshot } from "./types.js";

/**
 * Dogfood existing FinOps surfaces for real-time inference spend visibility.
 * Monetization hooks are privacy-first, opt-in only, never inspect prompts/code.
 */

export interface BudgetPolicy {
	readonly capUsd: number;
	readonly routingPolicy: "cheapest-capable" | "pinned" | "fallback-chain";
	readonly monetizationOptIn: boolean;
}

export const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
	capUsd: 5,
	routingPolicy: "cheapest-capable",
	/** Product default ON; disable with HOBO_CODE_MONETIZATION=0 or feature flag off. */
	monetizationOptIn: true,
};

export interface SpendEvent {
	readonly provider: string;
	readonly usd: number;
}

export function createBudgetTracker(
	policy: BudgetPolicy = DEFAULT_BUDGET_POLICY,
) {
	const spendByProvider = new Map<string, number>();
	let monetization = policy.monetizationOptIn === true;

	function snapshot(provider = "aggregate"): InferenceBudgetSnapshot {
		const spendUsd =
			provider === "aggregate"
				? [...spendByProvider.values()].reduce((a, b) => a + b, 0)
				: (spendByProvider.get(provider) ?? 0);
		return {
			provider,
			spendUsd,
			capUsd: policy.capUsd,
			monetizationEnabled: monetization,
			routingPolicy: policy.routingPolicy,
		};
	}

	return {
		record(event: SpendEvent) {
			const prev = spendByProvider.get(event.provider) ?? 0;
			spendByProvider.set(event.provider, prev + event.usd);
			return snapshot(event.provider);
		},
		snapshot,
		isMonetizationEnabled() {
			return monetization;
		},
		disableMonetization() {
			monetization = false;
		},
	};
}

/**
 * Optional sponsored wait-state surface. Never receives prompts or code.
 * Disabled by default; clear disable path.
 */
export function sponsoredWaitState(options: {
	readonly enabled: boolean;
	readonly slot: "status" | "wait";
}) {
	return {
		shown: options.enabled === true,
		inspectsCode: false,
		inspectsPrompts: false,
		slot: options.slot,
		disablePath:
			"HOBO_CODE_MONETIZATION=0 | hobo feature set code.monetization.surface --percent 0",
	};
}

export function routeProvider(
	candidates: readonly {
		provider: string;
		costUsd: number;
		capable: boolean;
	}[],
	policy: BudgetPolicy,
	pinned?: string,
): string | null {
	const capable = candidates.filter((c) => c.capable);
	if (capable.length === 0) return null;
	if (policy.routingPolicy === "pinned" && pinned) {
		return capable.find((c) => c.provider === pinned)?.provider ?? null;
	}
	if (policy.routingPolicy === "fallback-chain") {
		return capable[0]?.provider ?? null;
	}
	// cheapest-capable
	return (
		[...capable].sort((a, b) => a.costUsd - b.costUsd)[0]?.provider ?? null
	);
}
