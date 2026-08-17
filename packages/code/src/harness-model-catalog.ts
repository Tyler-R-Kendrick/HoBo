/**
 * Per-harness model catalogs for `/agents` configure.
 *
 * Coding harnesses (Codex, Claude, …) get that provider’s real CLI model ids —
 * never the HoBo Bo / ollama catalog. Bo + Bo subagents use `bo-model-catalog`.
 *
 * Tables dated 2026-08-16 from provider docs (Codex / Claude Code / Gemini CLI / xAI).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	BO_MODEL_CATALOG_SCHEMA,
	type BoModelOffer,
	buildProviderModelPurl,
} from "./bo-model-catalog.js";

export interface ListHarnessModelOffersOptions {
	/** Override home for Pi models.json discovery (tests). */
	readonly homeDir?: string;
}

type CuratedEntry = {
	readonly type: string;
	readonly runtimeId: string;
};

/** Codex CLI `-m` ids — https://developers.openai.com/codex/models (2026-08-16). */
const CODEX_MODELS: readonly CuratedEntry[] = [
	{ type: "openai", runtimeId: "gpt-5.6-sol" },
	{ type: "openai", runtimeId: "gpt-5.6-terra" },
	{ type: "openai", runtimeId: "gpt-5.6-luna" },
	{ type: "openai", runtimeId: "gpt-5.6" },
	{ type: "openai", runtimeId: "gpt-5.3-codex-spark" },
	{ type: "openai", runtimeId: "gpt-5.5" },
	{ type: "openai", runtimeId: "gpt-5.4" },
	{ type: "openai", runtimeId: "gpt-5.4-mini" },
];

/** Claude Code `--model` ids — https://code.claude.com/docs/en/model-config (2026-08-16). */
const CLAUDE_MODELS: readonly CuratedEntry[] = [
	{ type: "anthropic", runtimeId: "claude-opus-5" },
	{ type: "anthropic", runtimeId: "claude-sonnet-5" },
	{ type: "anthropic", runtimeId: "claude-opus-4-8" },
	{ type: "anthropic", runtimeId: "claude-opus-4-7" },
	{ type: "anthropic", runtimeId: "claude-opus-4-6" },
	{ type: "anthropic", runtimeId: "claude-sonnet-4-6" },
	{ type: "anthropic", runtimeId: "claude-opus-4-5" },
	{ type: "anthropic", runtimeId: "claude-sonnet-4-5" },
	{ type: "anthropic", runtimeId: "claude-haiku-4-5" },
	{ type: "anthropic", runtimeId: "opus" },
	{ type: "anthropic", runtimeId: "sonnet" },
	{ type: "anthropic", runtimeId: "haiku" },
];

/** Gemini CLI model ids — https://geminicli.com/docs/cli/model/ (2026-08-16). */
const GEMINI_MODELS: readonly CuratedEntry[] = [
	{ type: "google", runtimeId: "gemini-3-pro-preview" },
	{ type: "google", runtimeId: "gemini-3-flash-preview" },
	{ type: "google", runtimeId: "gemini-2.5-pro" },
	{ type: "google", runtimeId: "gemini-2.5-flash" },
	{ type: "google", runtimeId: "gemini-2.5-flash-lite" },
];

/** Grok Build `-m` ids — https://docs.x.ai/developers/models (2026-08-16). */
const GROK_MODELS: readonly CuratedEntry[] = [
	{ type: "xai", runtimeId: "grok-4.6" },
	{ type: "xai", runtimeId: "grok-4.5" },
	{ type: "xai", runtimeId: "grok-4.3" },
	{ type: "xai", runtimeId: "grok-build-0.1" },
];

function offerFor(
	harnessId: string,
	entry: CuratedEntry,
): BoModelOffer {
	return {
		schema: BO_MODEL_CATALOG_SCHEMA,
		purl: buildProviderModelPurl({
			type: entry.type,
			name: entry.runtimeId,
			via: harnessId,
		}),
		label: `${entry.runtimeId} · ${harnessId}`,
		runtimeId: entry.runtimeId,
		source: "harness",
		harnessId,
	};
}

function fromCurated(
	harnessId: string,
	entries: readonly CuratedEntry[],
): readonly BoModelOffer[] {
	return entries.map((entry) => offerFor(harnessId, entry));
}

/**
 * Read Pi agent models.json — only real configured provider models, no inventing.
 * Shape: `{ providers: { <name>: { models: [{ id, name? }] } } }`
 */
export function listPiModelOffersFromFile(
	modelsJsonPath: string,
): readonly BoModelOffer[] {
	if (!existsSync(modelsJsonPath)) return [];
	try {
		const raw = JSON.parse(readFileSync(modelsJsonPath, "utf8")) as {
			providers?: Record<
				string,
				{ models?: { id?: string; name?: string }[] }
			>;
		};
		const out: BoModelOffer[] = [];
		const seen = new Set<string>();
		for (const [provider, body] of Object.entries(raw.providers ?? {})) {
			for (const model of body.models ?? []) {
				const id = typeof model.id === "string" ? model.id.trim() : "";
				if (!id || seen.has(id)) continue;
				seen.add(id);
				const type = /^[a-z][a-z0-9-]*$/iu.test(provider)
					? provider.toLowerCase()
					: "pi";
				out.push({
					schema: BO_MODEL_CATALOG_SCHEMA,
					purl: buildProviderModelPurl({
						type,
						name: id,
						via: "pi",
						extra: { provider },
					}),
					label: `${id} · pi/${provider}`,
					runtimeId: id,
					source: "harness",
					harnessId: "pi",
				});
			}
		}
		return out.sort((a, b) => a.runtimeId.localeCompare(b.runtimeId));
	} catch {
		return [];
	}
}

/**
 * Models selectable when configuring a coding harness — provider-real only.
 * Empty ⇒ type custom in the configure form.
 */
export function listHarnessModelOffers(
	harnessId: string,
	options: ListHarnessModelOffersOptions = {},
): readonly BoModelOffer[] {
	const id = harnessId.trim().toLowerCase();
	switch (id) {
		case "codex":
			return fromCurated(id, CODEX_MODELS);
		case "claude":
			return fromCurated(id, CLAUDE_MODELS);
		case "gemini":
			return fromCurated(id, GEMINI_MODELS);
		case "grok":
			return fromCurated(id, GROK_MODELS);
		case "pi": {
			const home = options.homeDir ?? homedir();
			return listPiModelOffersFromFile(
				join(home, ".pi", "agent", "models.json"),
			);
		}
		default:
			// cursor / copilot / aider / opencode / goose / sdk / unknown
			return [];
	}
}
