/**
 * Cost / budget / free-local / savings visibility for cost-conscious open-source devs.
 *
 * Complements FinOps tracker (finops.ts) with a discoverable CLI surface:
 * $0 path, free/local model recipes, savings vs frontier, token-tool stack,
 * cheapest-capable routing — never prints secrets.
 */

import {
	type BudgetPolicy,
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
	routeProvider,
} from "./finops.js";
import { inspectModels, type ModelsStatus } from "./models.js";

// public-contract: cost status payload
export const CODE_COST_SCHEMA = "hobo.code.cost/v1" as const;

export type FreeLocalEndpoint = {
	readonly id: string;
	readonly kind: "local-openai-compatible" | "ollama" | "free-router" | "edge";
	readonly baseUrlEnv: string;
	readonly modelEnv: string;
	readonly exampleModel: string;
	readonly notes: string;
	/** Rough relative speed on modest hardware (not a benchmark claim). */
	readonly reasonableTime: "fast" | "ok" | "slow-cpu";
};

export type TokenTool = {
	readonly id: string;
	readonly role: string;
	readonly savingsAngle: string;
};

export type CostSavingsEstimate = {
	/** Hypothetical always-frontier baseline for a similar session (illustrative). */
	readonly frontierBaselineUsd: number;
	readonly actualSpendUsd: number;
	readonly savedUsd: number;
	readonly savedPct: number;
	readonly narrative: string;
};

export type CostStatus = {
	readonly schema: typeof CODE_COST_SCHEMA;
	readonly zeroDollarPath: true;
	readonly budget: {
		readonly capUsd: number;
		readonly spendUsd: number;
		readonly remainingUsd: number;
		readonly routingPolicy: BudgetPolicy["routingPolicy"];
		readonly monetizationEnabled: boolean;
		readonly monetizationDisable: string;
	};
	readonly models: ModelsStatus;
	readonly freeLocal: readonly FreeLocalEndpoint[];
	readonly activeIsLocalHint: boolean;
	readonly routing: {
		readonly policy: BudgetPolicy["routingPolicy"];
		readonly picked: string | null;
		readonly candidates: readonly {
			provider: string;
			costUsd: number;
			capable: boolean;
		}[];
		readonly narrative: string;
	};
	readonly savings: CostSavingsEstimate;
	readonly tokenTools: readonly TokenTool[];
	readonly legend: string;
	readonly notes: readonly string[];
};

const FREE_LOCAL: readonly FreeLocalEndpoint[] = [
	{
		id: "ollama",
		kind: "ollama",
		baseUrlEnv: "OLLAMA_HOST",
		modelEnv: "HOBO_CODE_MODEL",
		exampleModel: "ollama/qwen2.5-coder:7b",
		notes: "Local free inference; set HOBO_CODE_MODEL to ollama/<tag>.",
		reasonableTime: "ok",
	},
	{
		id: "openai-compatible-local",
		kind: "local-openai-compatible",
		baseUrlEnv: "OPENAI_BASE_URL",
		modelEnv: "HOBO_CODE_MODEL",
		exampleModel: "openai/local-coder",
		notes:
			"Point OPENAI_BASE_URL at localhost (llama.cpp, vLLM, LM Studio, OrnithAI-class edge). OPENAI_API_KEY can be dummy for pure local.",
		reasonableTime: "ok",
	},
	{
		id: "openrouter-free",
		kind: "free-router",
		baseUrlEnv: "OPENROUTER_API_KEY",
		modelEnv: "HOBO_CODE_MODEL",
		exampleModel: "openrouter/free",
		notes:
			"Free-tier / free-model routes when available; still prefer true local for $0 offline.",
		reasonableTime: "fast",
	},
	{
		id: "edge-ornith-class",
		kind: "edge",
		baseUrlEnv: "HOBO_CODE_LOCAL_BASE_URL",
		modelEnv: "HOBO_CODE_MODEL",
		exampleModel: "local/ornith-coder",
		notes:
			"Tight-budget device runners (OrnithAI-class / small coding models). Expect slower CPU; free wall-clock tradeoff.",
		reasonableTime: "slow-cpu",
	},
] as const;

const TOKEN_TOOLS: readonly TokenTool[] = [
	{
		id: "headroom",
		role: "compress context-in (tool outputs, logs, files)",
		savingsAngle: "Fewer input tokens into the model",
	},
	{
		id: "rtk",
		role: "Rust Token Killer — compress shell/git/test noise",
		savingsAngle: "Huge cut on command output tokens",
	},
	{
		id: "caveman",
		role: "compress agent natural-language output",
		savingsAngle: "Fewer output tokens / shorter traces",
	},
	{
		id: "ponytail",
		role: "minimalist solutions (YAGNI) → less code churn",
		savingsAngle: "Fewer agent turns and tokens of edits",
	},
	{
		id: "serena",
		role: "semantic retrieval instead of dumping whole files",
		savingsAngle: "Narrow context windows",
	},
] as const;

function parseCap(env: NodeJS.ProcessEnv): number {
	const raw = env.HOBO_CODE_BUDGET_USD ?? env.HOBO_CODE_CAP_USD;
	if (raw === undefined || raw === "") return DEFAULT_BUDGET_POLICY.capUsd;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BUDGET_POLICY.capUsd;
}

function parseRouting(env: NodeJS.ProcessEnv): BudgetPolicy["routingPolicy"] {
	const r = (env.HOBO_CODE_ROUTING ?? "").toLowerCase();
	if (r === "pinned") return "pinned";
	if (r === "fallback-chain" || r === "fallback") return "fallback-chain";
	return "cheapest-capable";
}

function isLocalHint(activeModel: string, env: NodeJS.ProcessEnv): boolean {
	const m = activeModel.toLowerCase();
	if (m.includes("ollama") || m.includes("local") || m.includes("ornith")) {
		return true;
	}
	const base =
		env.OPENAI_BASE_URL ??
		env.HOBO_CODE_LOCAL_BASE_URL ??
		env.OLLAMA_HOST ??
		"";
	return /localhost|127\.0\.0\.1|0\.0\.0\.0|:11434/.test(base);
}

/**
 * Build cost status. Optional spendUsd simulates recorded spend for demos/tests.
 */
export function inspectCost(
	env: NodeJS.ProcessEnv = process.env,
	options: { readonly spendUsd?: number } = {},
): CostStatus {
	const capUsd = parseCap(env);
	const routingPolicy = parseRouting(env);
	const monetizationOff =
		env.HOBO_CODE_MONETIZATION === "0" ||
		env.HOBO_CODE_MONETIZATION === "false";
	const policy: BudgetPolicy = {
		capUsd,
		routingPolicy,
		monetizationOptIn:
			!monetizationOff && DEFAULT_BUDGET_POLICY.monetizationOptIn,
	};
	const tracker = createBudgetTracker(policy);
	const spend =
		typeof options.spendUsd === "number" && options.spendUsd >= 0
			? options.spendUsd
			: 0;
	if (spend > 0) {
		tracker.record({ provider: "session", usd: spend });
	}
	const snap = tracker.snapshot("aggregate");
	const models = inspectModels(env);
	const localHint = isLocalHint(models.activeModel, env);

	const candidates = [
		{ provider: "local-free", costUsd: 0, capable: true },
		{ provider: "openrouter-free", costUsd: 0.001, capable: true },
		{ provider: "open-weight-cheap", costUsd: 0.02, capable: true },
		{ provider: "frontier", costUsd: 1.5, capable: true },
	] as const;
	const picked = routeProvider(candidates, policy);

	// Illustrative savings: frontier always-on vs actual (local=$0 → full save).
	const frontierBaselineUsd = Math.max(1.5, capUsd * 0.4);
	const actualSpendUsd = snap.spendUsd;
	const savedUsd = Math.max(0, frontierBaselineUsd - actualSpendUsd);
	const savedPct =
		frontierBaselineUsd > 0
			? Math.min(100, Math.round((savedUsd / frontierBaselineUsd) * 100))
			: 0;

	return {
		schema: CODE_COST_SCHEMA,
		zeroDollarPath: true,
		budget: {
			capUsd: snap.capUsd,
			spendUsd: actualSpendUsd,
			remainingUsd: Math.max(0, snap.capUsd - actualSpendUsd),
			routingPolicy,
			monetizationEnabled: snap.monetizationEnabled,
			monetizationDisable: "HOBO_CODE_MONETIZATION=0",
		},
		models,
		freeLocal: FREE_LOCAL,
		activeIsLocalHint: localHint,
		routing: {
			policy: routingPolicy,
			picked,
			candidates: [...candidates],
			narrative:
				"cheapest-capable routes simple work to local/free; pin frontier only when needed (HOBO_CODE_ROUTING=pinned + HOBO_CODE_MODEL).",
		},
		savings: {
			frontierBaselineUsd,
			actualSpendUsd,
			savedUsd,
			savedPct,
			narrative: localHint
				? `Local/free model active → ~${savedPct}% illustrative save vs always-frontier session baseline.`
				: `Recorded spend $${actualSpendUsd.toFixed(2)} vs frontier baseline $${frontierBaselineUsd.toFixed(2)} (~${savedPct}% save). Pair with headroom/RTK/caveman for more.`,
		},
		tokenTools: TOKEN_TOOLS,
		legend: "cost · $0 path · savings · route",
		notes: [
			"$0 path: local OpenAI-compatible / Ollama + HOBO_CODE_MONETIZATION=0 + no paid keys required.",
			"Cap: HOBO_CODE_BUDGET_USD (default 5). Routing: HOBO_CODE_ROUTING=cheapest-capable|pinned|fallback-chain.",
			"Stack savings: RTK (shell) · headroom (context-in) · caveman (agent-out) · Serena (retrieval) · ponytail (less churn).",
			"Intelligence per token: route hard tasks up only after free/local fails capable checks.",
			"Never prints API key values (models/cost presence only).",
		],
	};
}

function capacityBar(spend: number, cap: number, width = 10): string {
	const c = Math.max(cap, 0.01);
	const filled = Math.min(width, Math.round((spend / c) * width));
	return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

/** Human panel body for hobo-code cost. */
export function costHumanSummary(status: CostStatus): string {
	const b = status.budget;
	const bar = capacityBar(b.spendUsd, b.capUsd, 10);
	const mon = b.monetizationEnabled ? "● mon" : "○ mon";
	const local = status.activeIsLocalHint ? "● local/free" : "○ cloud-ish";
	const save = `save · $${status.savings.savedUsd.toFixed(2)} (~${status.savings.savedPct}%)`;
	return [
		`cap · $${b.capUsd.toFixed(2)} · spend $${b.spendUsd.toFixed(2)} · left $${b.remainingUsd.toFixed(2)}`,
		`${bar} · ${mon} · route ${b.routingPolicy}`,
		`model · ${status.models.activeModel} · ${local}`,
		save,
		`pick · ${status.routing.picked ?? "—"} (cheapest capable)`,
		`$0 · OLLAMA_HOST|OPENAI_BASE_URL + HOBO_CODE_MODEL · mon=0`,
		`tools · rtk·headroom·caveman·serena·ponytail`,
		status.legend,
	].join("\n");
}
