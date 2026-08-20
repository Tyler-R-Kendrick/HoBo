/**
 * Models available to HoBo Bo (and Bo subagents).
 *
 * Each offer uses a LiteLLM-style `provider/model` id plus optional routing
 * fields (`via`, `baseUrl`, `host`) so the same model from different harnesses
 * or endpoints stays distinct. Coding harness configure uses
 * `harness-model-catalog` instead — never this list for Codex/Claude/etc.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { must } from "@hobo/core/total-access";
import { loadHarnessSettings } from "./harness-settings.js";
import { isJsonString } from "./json.js";
import { DEFAULT_OLLAMA_HOST } from "./ollama-engine.js";

// public-contract: Bo model catalog offer schema id
export const BO_MODEL_CATALOG_SCHEMA = "hobo.code.bo-model-catalog/v1" as const;

export type BoModelSource =
	| "ollama"
	| "harness"
	| "env"
	| "byok"
	| "openai-compatible";

export interface BoModelOffer {
	readonly schema: typeof BO_MODEL_CATALOG_SCHEMA;
	/**
	 * Stable LiteLLM / OpenCode-style identity: `provider/model`
	 * (e.g. `openai/gpt-5.6-sol`, `ollama/qwen2.5-coder:7b`).
	 */
	readonly id: string;
	readonly provider: string;
	/** Model name within the provider (may include `:tag` for ollama). */
	readonly model: string;
	/** Short label for the picker. */
	readonly label: string;
	/** Runtime / CLI model id stored in harness-settings.model. */
	readonly runtimeId: string;
	readonly source: BoModelSource;
	/** Harness / seat path that reaches this model (codex, env, …). */
	readonly via?: string;
	/** OpenAI-/Anthropic-compatible API base URL when applicable. */
	readonly baseUrl?: string;
	/** Ollama (or similar) host when applicable. */
	readonly host?: string;
	readonly harnessId?: string;
}

/** Unique key for dedupe / cursor restore — not a URI scheme. */
export function offerKey(
	offer: Pick<BoModelOffer, "id" | "via" | "baseUrl" | "host">,
): string {
	const parts = [offer.id];
	if (offer.via) parts.push(`via=${offer.via}`);
	if (offer.baseUrl) parts.push(`baseUrl=${offer.baseUrl}`);
	if (offer.host) parts.push(`host=${offer.host}`);
	return parts.join("|");
}

export function buildModelId(provider: string, model: string): string {
	return `${provider}/${model}`;
}

export function parseModelId(
	id: string,
): { readonly provider: string; readonly model: string } | null {
	const trimmed = id.trim();
	const i = trimmed.indexOf("/");
	if (i <= 0 || i === trimmed.length - 1) return null;
	return {
		provider: trimmed.slice(0, i).toLowerCase(),
		model: trimmed.slice(i + 1),
	};
}

function hostQualifier(host: string): string {
	return host.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
}

function guessProvider(runtimeId: string): string {
	const lower = runtimeId.toLowerCase();
	if (lower.startsWith("ollama/")) return "ollama";
	if (lower.startsWith("anthropic/") || lower.startsWith("claude")) {
		return "anthropic";
	}
	if (lower.startsWith("google/") || lower.startsWith("gemini"))
		return "google";
	if (lower.startsWith("xai/") || lower.startsWith("grok")) return "xai";
	if (lower.startsWith("openrouter/")) return "openrouter";
	if (lower.startsWith("azure/")) return "openai";
	if (lower.startsWith("openai/")) return "openai";
	if (lower.startsWith("cursor/")) return "cursor";
	if (lower.startsWith("copilot/")) return "copilot";
	return "openai";
}

function stripProviderPrefix(runtimeId: string): string {
	const i = runtimeId.indexOf("/");
	if (i <= 0) return runtimeId;
	const prefix = runtimeId.slice(0, i).toLowerCase();
	if (
		[
			"ollama",
			"openai",
			"anthropic",
			"google",
			"gemini",
			"xai",
			"openrouter",
			"azure",
			"local",
			"cursor",
			"copilot",
			"opencode",
		].includes(prefix)
	) {
		return runtimeId.slice(i + 1);
	}
	return runtimeId;
}

export function makeModelOffer(input: {
	readonly provider: string;
	readonly model: string;
	readonly runtimeId: string;
	readonly label: string;
	readonly source: BoModelSource;
	readonly via?: string;
	readonly baseUrl?: string;
	readonly host?: string;
	readonly harnessId?: string;
}): BoModelOffer {
	const provider = input.provider.toLowerCase();
	const model = input.model;
	return {
		schema: BO_MODEL_CATALOG_SCHEMA,
		id: buildModelId(provider, model),
		provider,
		model,
		label: input.label,
		runtimeId: input.runtimeId,
		source: input.source,
		...(input.via !== undefined ? { via: input.via } : undefined),
		...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : undefined),
		...(input.host !== undefined ? { host: input.host } : undefined),
		...(input.harnessId !== undefined
			? { harnessId: input.harnessId }
			: undefined),
	};
}

function offerFromHarness(
	harnessId: string,
	runtimeId: string,
): BoModelOffer | null {
	const trimmed = runtimeId.trim();
	if (!trimmed) return null;
	if (trimmed.toLowerCase().startsWith("ollama/")) {
		const tag = trimmed.slice("ollama/".length);
		return makeModelOffer({
			provider: "ollama",
			model: tag,
			runtimeId: trimmed,
			label: `${tag} · ${harnessId}`,
			source: "harness",
			via: harnessId,
			harnessId,
		});
	}
	const model = stripProviderPrefix(trimmed);
	const provider = guessProvider(trimmed);
	return makeModelOffer({
		provider,
		model,
		runtimeId: trimmed,
		label: `${model} · ${harnessId}`,
		source: "harness",
		via: harnessId,
		harnessId,
	});
}

function listSavedHarnessIds(hoboHome: string): string[] {
	const dir = join(hoboHome, "durable", "code", "harness-settings");
	try {
		return readdirSync(dir)
			.filter((name) => name.endsWith(".json"))
			.map((name) => name.replace(/\.json$/u, ""));
	} catch {
		return [];
	}
}

export interface ListBoModelOffersInput {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly ollama?: {
		readonly host: string;
		readonly models: readonly string[];
	};
	/** Extra harness ids to load even if no settings file yet. */
	readonly harnessIds?: readonly string[];
}

/**
 * Aggregate models Bo can reach: live ollama tags, saved harness settings
 * (provenance for Bo routing), HOBO_CODE_MODEL, and openai-compatible locals.
 * Does **not** invent BYOK seed models — harness pickers use harness-model-catalog.
 */
export function listBoModelOffers(
	input: ListBoModelOffersInput,
): readonly BoModelOffer[] {
	const env = input.env ?? process.env;
	const byKey = new Map<string, BoModelOffer>();
	const add = (offer: BoModelOffer | null | undefined) => {
		if (!offer) return;
		const key = offerKey(offer);
		if (!byKey.has(key)) byKey.set(key, offer);
	};

	const ollamaHost =
		input.ollama?.host ?? env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
	const ollamaHostKey = hostQualifier(ollamaHost);
	for (const tag of input.ollama?.models ?? []) {
		add(
			makeModelOffer({
				provider: "ollama",
				model: tag,
				runtimeId: `ollama/${tag}`,
				label: `${tag} · ollama`,
				source: "ollama",
				host: ollamaHostKey,
			}),
		);
	}

	const harnessIds = new Set([
		...listSavedHarnessIds(input.hoboHome),
		...(input.harnessIds ?? []),
	]);
	for (const id of harnessIds) {
		if (id === "hobo-code") continue;
		const settings = loadHarnessSettings(input.hoboHome, id, "harness");
		add(offerFromHarness(id, settings.model));
	}

	const active = isJsonString(env.HOBO_CODE_MODEL)
		? env.HOBO_CODE_MODEL.trim()
		: "";
	if (active) {
		if (active.toLowerCase().startsWith("ollama/")) {
			const tag = active.slice("ollama/".length);
			add(
				makeModelOffer({
					provider: "ollama",
					model: tag,
					runtimeId: active,
					label: `${tag} · HOBO_CODE_MODEL`,
					source: "env",
					via: "env",
					host: "active",
				}),
			);
		} else {
			const model = stripProviderPrefix(active);
			const provider = guessProvider(active);
			add(
				makeModelOffer({
					provider,
					model,
					runtimeId: active,
					label: `${model} · HOBO_CODE_MODEL`,
					source: "env",
					via: "env",
				}),
			);
		}
	}

	const openaiBase = env.OPENAI_BASE_URL;
	const localBase = env.HOBO_CODE_LOCAL_BASE_URL;
	const baseUrl =
		(isJsonString(openaiBase) && openaiBase.trim()) ||
		(isJsonString(localBase) && localBase.trim()) ||
		"";
	if (baseUrl) {
		const runtimeId =
			active && !active.toLowerCase().startsWith("ollama/")
				? active
				: "local-coder";
		const model = stripProviderPrefix(runtimeId);
		add(
			makeModelOffer({
				provider: "openai",
				model,
				runtimeId,
				label: `${model} · ${hostQualifier(baseUrl)}`,
				source: "openai-compatible",
				via: "openai-compatible",
				baseUrl,
			}),
		);
	}

	return [...byKey.values()].sort((a, b) =>
		offerKey(a).localeCompare(offerKey(b)),
	);
}

export function findOfferIndex(
	offers: readonly BoModelOffer[],
	model: string,
	modelId?: string,
	via?: string,
	baseUrl?: string,
): number {
	if (modelId) {
		const byId = offers.findIndex(
			(row) =>
				row.id === modelId &&
				(via === undefined || row.via === via) &&
				(baseUrl === undefined || row.baseUrl === baseUrl),
		);
		if (byId >= 0) return byId;
		const byIdOnly = offers.findIndex((row) => row.id === modelId);
		if (byIdOnly >= 0) return byIdOnly;
	}
	const trimmed = model.trim();
	if (!trimmed) return 0;
	const byRuntime = offers.findIndex((row) => row.runtimeId === trimmed);
	if (byRuntime >= 0) return byRuntime;
	return 0;
}

export function cycleBoModelOffer(
	offers: readonly BoModelOffer[],
	index: number,
	delta: 1 | -1,
) {
	if (offers.length === 0) return { index: 0, offer: null };
	const next = (index + delta + offers.length) % offers.length;
	return { index: next, offer: must(offers[next]) };
}
