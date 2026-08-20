/**
 * Model / BYOK visibility for hobo-code (GHCP-parity DX).
 * Never prints secret values—only env names and presence.
 */
import { HOBO_AGENT_MODEL } from "./harness-customization.js";
import { isJsonString } from "./json.js";

// public-contract: models status payload
export const CODE_MODELS_SCHEMA = "hobo.code.models/v1" as const;

/** Env names commonly used for BYOK / open-model providers (presence only). */
export const BYOK_ENV_NAMES = [
	"HOBO_CODE_MODEL",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"GOOGLE_API_KEY",
	"GEMINI_API_KEY",
	"XAI_API_KEY",
	"OPENROUTER_API_KEY",
	"AZURE_OPENAI_API_KEY",
] as const;

export type ByokEnvPresence = {
	readonly name: (typeof BYOK_ENV_NAMES)[number];
	readonly present: boolean;
};

export type ModelsStatus = {
	readonly schema: typeof CODE_MODELS_SCHEMA;
	/** Active model id (provider/model); never a secret. */
	readonly activeModel: string;
	readonly source: "HOBO_CODE_MODEL" | "default";
	readonly byok: readonly ByokEnvPresence[];
	readonly byokAny: boolean;
	readonly openModelSupport: true;
	readonly notes: readonly string[];
};

export function inspectModels(
	env: NodeJS.ProcessEnv = process.env,
): ModelsStatus {
	const fromEnv =
		isJsonString(env.HOBO_CODE_MODEL) && env.HOBO_CODE_MODEL.trim().length > 0
			? env.HOBO_CODE_MODEL.trim()
			: null;
	const byok = BYOK_ENV_NAMES.map((name) => ({
		name,
		present: Boolean(env[name] && String(env[name]).length > 0),
	}));
	const byokAny = byok.some((b) => b.present && b.name !== "HOBO_CODE_MODEL");
	return {
		schema: CODE_MODELS_SCHEMA,
		activeModel: fromEnv ?? HOBO_AGENT_MODEL,
		source: fromEnv ? "HOBO_CODE_MODEL" : "default",
		byok,
		byokAny,
		openModelSupport: true,
		notes: [
			"Set HOBO_CODE_MODEL to provider/model (e.g. anthropic/claude-sonnet-5, openai/gpt-4.1).",
			"BYOK: export the provider API key env (value never shown here).",
			"$0 / free-local: ollama/<tag> or OPENAI_BASE_URL=http://127.0.0.1:… (OrnithAI-class edge ok).",
			"Budget + savings: hobo-code cost (HOBO_CODE_BUDGET_USD, HOBO_CODE_MONETIZATION=0).",
			"Interactive title screen runs on bare TTY `hobo-code` before the agent harness.",
			"Sandbox: isolate/session keep work mediated; promote is squash-only after gates.",
		],
	};
}

export function modelsHumanSummary(status: ModelsStatus): string {
	const present = status.byok.filter((b) => b.present).map((b) => b.name);
	const byokLine =
		present.length > 0
			? `byok · ${present.join(" · ")}`
			: "byok · none set (open models still supported via env)";
	return [
		`model · ${status.activeModel}`,
		`source · ${status.source}`,
		byokLine,
		"free · ollama/… or OPENAI_BASE_URL=localhost",
		"cost · hobo-code cost ($0 path + savings)",
		"sandbox · isolate/session (mediated)",
		"title · bare TTY hobo-code (animated)",
	].join("\n");
}
