import { beqOpenUi } from "./beq.js";
import { isControlledTree, libraryForTier } from "./libraries.js";
import type { MetricsLedgerRow, OpenUiTree } from "./types.js";
import { appendMetricsRow } from "./metrics.js";

export interface AblationSample {
	readonly tree: OpenUiTree;
	readonly gold: OpenUiTree;
	/** Simulated AgentV meaningfulness score in [0,1]. */
	readonly agentvMeaningful: number;
	readonly formalPreflightOk: boolean;
}

export interface AblationResult {
	readonly controlled: TierStats;
	readonly ecosystem: TierStats;
	/** Positive when controlled outperforms ecosystem (expected paper-like gap). */
	readonly meaningfulRateGap: number;
	readonly semanticPassGap: number;
	readonly rows: readonly MetricsLedgerRow[];
}

export interface TierStats {
	readonly tier: "controlled" | "ecosystem";
	readonly n: number;
	readonly meaningfulRate: number;
	readonly agentvMean: number;
	readonly semanticPassRate: number;
	readonly formalPreflightRate: number;
	readonly librarySize: number;
}

/**
 * H2 IR ablation: measure meaningful-rate / AgentV / semantic-gate gap
 * between controlled and ecosystem library tiers.
 */
export function runControlledVsEcosystemAblation(
	samples: readonly AblationSample[],
): AblationResult {
	const controlled = samples.filter((s) => s.tree.libraryTier === "controlled");
	const ecosystem = samples.filter((s) => s.tree.libraryTier === "ecosystem");

	const cStats = summarize("controlled", controlled);
	const eStats = summarize("ecosystem", ecosystem);

	const rows: MetricsLedgerRow[] = [
		appendMetricsRow({
			hypothesis: "H2",
			tier: "controlled",
			method: "ablation",
			pass_at_1: cStats.semanticPassRate,
			pass_at_k: cStats.formalPreflightRate,
			beq_or_fidelity: cStats.semanticPassRate,
			agentv_scores: { meaningful: cStats.agentvMean },
			preflight_reject_rate: 1 - cStats.formalPreflightRate,
			cost_usd: 0,
			latency_ms: 0,
			seed: "ablation-controlled",
			model: "n/a",
			prompt_digest: `lib-size:${cStats.librarySize}`,
		}),
		appendMetricsRow({
			hypothesis: "H2",
			tier: "ecosystem",
			method: "ablation",
			pass_at_1: eStats.semanticPassRate,
			pass_at_k: eStats.formalPreflightRate,
			beq_or_fidelity: eStats.semanticPassRate,
			agentv_scores: { meaningful: eStats.agentvMean },
			preflight_reject_rate: 1 - eStats.formalPreflightRate,
			cost_usd: 0,
			latency_ms: 0,
			seed: "ablation-ecosystem",
			model: "n/a",
			prompt_digest: `lib-size:${eStats.librarySize}`,
		}),
	];

	return Object.freeze({
		controlled: cStats,
		ecosystem: eStats,
		meaningfulRateGap: cStats.meaningfulRate - eStats.meaningfulRate,
		semanticPassGap: cStats.semanticPassRate - eStats.semanticPassRate,
		rows: Object.freeze(rows),
	});
}

function summarize(
	tier: "controlled" | "ecosystem",
	samples: readonly AblationSample[],
): TierStats {
	const n = Math.max(1, samples.length);
	let meaningful = 0;
	let agentv = 0;
	let semantic = 0;
	let preflight = 0;
	for (const s of samples) {
		const beq = beqOpenUi(s.tree, s.gold);
		const inControlledLib =
			tier === "controlled" ? isControlledTree(s.tree) : true;
		if (s.agentvMeaningful >= 0.5 && inControlledLib) meaningful += 1;
		// Ecosystem trees with exotic kinds rarely meaningful against controlled gold.
		if (tier === "ecosystem" && s.agentvMeaningful >= 0.5) meaningful += 0; // counted via agentv only when high
		if (tier === "ecosystem" && s.agentvMeaningful >= 0.5 && beq.ok) {
			// already handled
		}
		if (s.agentvMeaningful >= 0.5) {
			// re-count cleanly
		}
		agentv += s.agentvMeaningful;
		if (beq.ok) semantic += 1;
		if (s.formalPreflightOk) preflight += 1;
	}
	// Recompute meaningful cleanly
	meaningful = samples.filter((s) => s.agentvMeaningful >= 0.5).length;

	return Object.freeze({
		tier,
		n: samples.length,
		meaningfulRate: meaningful / n,
		agentvMean: agentv / n,
		semanticPassRate: semantic / n,
		formalPreflightRate: preflight / n,
		librarySize: libraryForTier(tier).productions.length,
	});
}
