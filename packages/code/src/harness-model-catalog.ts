/**
 * Per-harness model catalogs for `/agents` configure.
 *
 * Every bundled coding-agent / sdk harness gets real selectable CLI model ids.
 * Never the HoBo Bo / ollama catalog. Bo + Bo subagents use `bo-model-catalog`.
 *
 * Strategy:
 *   1. Curated, dated tables from provider / CLI docs (offline + CI).
 *   2. Optional live probe when the harness binary can list models
 *      (cursor-agent --list-models, opencode models, grok models) — merges
 *      on top of curated so every currently-available id is choosable.
 *   3. Pi reads `~/.pi/agent/models.json` only (configured providers).
 *
 * Tables dated 2026-08-16.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { at } from "@hobo/core/total-access";
import {
	type HarnessSpec,
	isHostSpec,
	loadHarnessCatalog,
} from "./agent-harness-catalog.js";
import {
	type BoModelOffer,
	makeModelOffer,
	offerKey,
} from "./bo-model-catalog.js";

export interface ListHarnessModelOffersOptions {
	/** Override home for Pi / Bo-catalog merge (tests). */
	readonly homeDir?: string;
	readonly hoboHome?: string;
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Attempt live CLI model listing when a probe exists.
	 * Default true outside Vitest; false under Vitest unless opted in.
	 */
	readonly live?: boolean;
	/** Inject live stdout for tests / custom discovery. */
	readonly runProbe?: (harnessId: string) => string | null | undefined;
}

function splitCompatUrls(
	env: NodeJS.ProcessEnv,
	singleKeys: readonly string[],
	listKey: string,
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (raw: string | undefined) => {
		const url = raw?.trim();
		if (!url || seen.has(url)) return;
		seen.add(url);
		out.push(url);
	};
	for (const key of singleKeys) {
		add(typeof env[key] === "string" ? env[key] : undefined);
	}
	const listed = typeof env[listKey] === "string" ? env[listKey] : "";
	for (const part of listed.split(/[,;\s]+/u)) add(part);
	return out;
}

function modelNameForCompatEndpoint(env: NodeJS.ProcessEnv): string {
	const active =
		typeof env.HOBO_CODE_MODEL === "string" ? env.HOBO_CODE_MODEL.trim() : "";
	if (active && !active.toLowerCase().startsWith("ollama/")) {
		return active.includes("/")
			? active.slice(active.indexOf("/") + 1)
			: active;
	}
	return "local-coder";
}

/** OpenAI Chat Completions / Responses compatible endpoints → catalog offers. */
export function listOpenAiCompatibleOffers(
	harnessId: string,
	options: {
		readonly env?: NodeJS.ProcessEnv;
		readonly modelName?: string;
	} = {},
): readonly BoModelOffer[] {
	const env = options.env ?? process.env;
	const urls = splitCompatUrls(
		env,
		["OPENAI_BASE_URL", "HOBO_CODE_LOCAL_BASE_URL"],
		"HOBO_CODE_OPENAI_COMPAT_URLS",
	);
	const name = options.modelName ?? modelNameForCompatEndpoint(env);
	return urls.map((baseUrl) =>
		makeModelOffer({
			provider: "openai",
			model: name,
			runtimeId: name,
			label: `${name} · ${baseUrl} · ${harnessId}`,
			source: "harness",
			via: harnessId,
			baseUrl,
			harnessId,
		}),
	);
}

/** Anthropic Messages API compatible endpoints → catalog offers. */
export function listAnthropicCompatibleOffers(
	harnessId: string,
	options: {
		readonly env?: NodeJS.ProcessEnv;
		readonly modelName?: string;
	} = {},
): readonly BoModelOffer[] {
	const env = options.env ?? process.env;
	const urls = splitCompatUrls(
		env,
		["ANTHROPIC_BASE_URL"],
		"HOBO_CODE_ANTHROPIC_COMPAT_URLS",
	);
	const active =
		typeof env.HOBO_CODE_MODEL === "string" ? env.HOBO_CODE_MODEL.trim() : "";
	const name =
		options.modelName ??
		(active.toLowerCase().startsWith("claude") ||
		active.toLowerCase().startsWith("anthropic/")
			? active.includes("/")
				? active.slice(active.indexOf("/") + 1)
				: active
			: "claude-sonnet-5");
	return urls.map((baseUrl) =>
		makeModelOffer({
			provider: "anthropic",
			model: name,
			runtimeId: name,
			label: `${name} · ${baseUrl} · ${harnessId}`,
			source: "harness",
			via: harnessId,
			baseUrl,
			harnessId,
		}),
	);
}

type CuratedEntry = {
	readonly type: string;
	readonly runtimeId: string;
};

/** Codex CLI `-m` ids — https://developers.openai.com/codex/models */
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

/** Claude Code `--model` ids — https://code.claude.com/docs/en/model-config */
const CLAUDE_MODELS: readonly CuratedEntry[] = [
	{ type: "anthropic", runtimeId: "claude-fable-5" },
	{ type: "anthropic", runtimeId: "claude-opus-5" },
	{ type: "anthropic", runtimeId: "claude-sonnet-5" },
	{ type: "anthropic", runtimeId: "claude-opus-4-8" },
	{ type: "anthropic", runtimeId: "claude-opus-4-7" },
	{ type: "anthropic", runtimeId: "claude-opus-4-6" },
	{ type: "anthropic", runtimeId: "claude-sonnet-4-6" },
	{ type: "anthropic", runtimeId: "claude-opus-4-5" },
	{ type: "anthropic", runtimeId: "claude-sonnet-4-5" },
	{ type: "anthropic", runtimeId: "claude-haiku-4-5" },
	{ type: "anthropic", runtimeId: "fable" },
	{ type: "anthropic", runtimeId: "opus" },
	{ type: "anthropic", runtimeId: "sonnet" },
	{ type: "anthropic", runtimeId: "haiku" },
	{ type: "anthropic", runtimeId: "opusplan" },
];

/** Gemini CLI model ids — https://geminicli.com/docs/cli/model/ */
const GEMINI_MODELS: readonly CuratedEntry[] = [
	{ type: "google", runtimeId: "auto" },
	{ type: "google", runtimeId: "gemini-3-pro-preview" },
	{ type: "google", runtimeId: "gemini-3-flash-preview" },
	{ type: "google", runtimeId: "gemini-2.5-pro" },
	{ type: "google", runtimeId: "gemini-2.5-flash" },
	{ type: "google", runtimeId: "gemini-2.5-flash-lite" },
];

/** Grok Build `-m` ids — https://docs.x.ai/developers/models + `grok models` */
const GROK_MODELS: readonly CuratedEntry[] = [
	{ type: "xai", runtimeId: "grok-4.6" },
	{ type: "xai", runtimeId: "grok-4.5" },
	{ type: "xai", runtimeId: "grok-4.3" },
	{ type: "xai", runtimeId: "grok-build-0.1" },
];

/**
 * Cursor Agent `--model` slugs (fallback when `agent --list-models` unavailable).
 * Live probe returns the account-full set when the binary works.
 */
const CURSOR_MODELS: readonly CuratedEntry[] = [
	{ type: "cursor", runtimeId: "auto" },
	{ type: "cursor", runtimeId: "composer-2.5" },
	{ type: "cursor", runtimeId: "composer-2.5-fast" },
	{ type: "cursor", runtimeId: "gpt-5.6-sol-medium" },
	{ type: "cursor", runtimeId: "gpt-5.6-sol-high" },
	{ type: "cursor", runtimeId: "gpt-5.6-luna-high" },
	{ type: "cursor", runtimeId: "gpt-5.5-medium" },
	{ type: "cursor", runtimeId: "gpt-5.3-codex" },
	{ type: "cursor", runtimeId: "gpt-5.3-codex-high" },
	{ type: "cursor", runtimeId: "claude-opus-5-thinking-high" },
	{ type: "cursor", runtimeId: "claude-sonnet-5-thinking-high" },
	{ type: "cursor", runtimeId: "claude-fable-5-thinking-high" },
	{ type: "cursor", runtimeId: "claude-opus-4-8-thinking-high" },
	{ type: "cursor", runtimeId: "cursor-grok-4.6-high" },
	{ type: "cursor", runtimeId: "cursor-grok-4.5-high" },
	{ type: "cursor", runtimeId: "gemini-3.7-flash-high" },
];

/**
 * GitHub Copilot CLI `--model` ids —
 * https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
 */
const COPILOT_MODELS: readonly CuratedEntry[] = [
	{ type: "copilot", runtimeId: "auto" },
	{ type: "copilot", runtimeId: "claude-sonnet-4.6" },
	{ type: "copilot", runtimeId: "claude-haiku-4.5" },
	{ type: "copilot", runtimeId: "gpt-5.4" },
	{ type: "copilot", runtimeId: "gpt-5.3-codex" },
	{ type: "copilot", runtimeId: "gemini-3.1-pro-preview" },
	{ type: "copilot", runtimeId: "gemini-3.5-flash" },
	{ type: "copilot", runtimeId: "gemini-3.6-flash" },
	{ type: "copilot", runtimeId: "mai-code-1-flash" },
];

/**
 * OpenCode `--model` / `opencode models` ids (`provider/model`).
 * Live probe lists every model from configured providers.
 */
const OPENCODE_MODELS: readonly CuratedEntry[] = [
	{ type: "opencode", runtimeId: "opencode/big-pickle" },
	{ type: "opencode", runtimeId: "opencode/deepseek-v4-flash-free" },
	{ type: "anthropic", runtimeId: "anthropic/claude-sonnet-5" },
	{ type: "anthropic", runtimeId: "anthropic/claude-opus-5" },
	{ type: "openai", runtimeId: "openai/gpt-5.6" },
	{ type: "openai", runtimeId: "openai/gpt-5.4" },
	{ type: "google", runtimeId: "google/gemini-2.5-pro" },
];

/** Aider `--model` ids (LiteLLM-style) — https://aider.chat/docs/llms/ */
const AIDER_MODELS: readonly CuratedEntry[] = [
	{ type: "anthropic", runtimeId: "claude-sonnet-5" },
	{ type: "anthropic", runtimeId: "claude-opus-4-8" },
	{ type: "anthropic", runtimeId: "anthropic/claude-sonnet-5" },
	{ type: "openai", runtimeId: "gpt-5.6" },
	{ type: "openai", runtimeId: "gpt-5.4" },
	{ type: "openai", runtimeId: "openai/gpt-5.4" },
	{ type: "openrouter", runtimeId: "openrouter/deepseek/deepseek-v4-pro" },
	{ type: "ollama", runtimeId: "ollama/qwen2.5-coder:7b" },
	{ type: "ollama", runtimeId: "ollama/llama3.2" },
];

/** goose `GOOSE_MODEL` / configure ids — https://block.github.io/goose/ */
const GOOSE_MODELS: readonly CuratedEntry[] = [
	{ type: "anthropic", runtimeId: "claude-sonnet-4-20250514" },
	{ type: "anthropic", runtimeId: "claude-opus-4-20250514" },
	{ type: "openai", runtimeId: "gpt-4o" },
	{ type: "openai", runtimeId: "gpt-4.1" },
	{ type: "google", runtimeId: "gemini-2.5-pro" },
	{ type: "ollama", runtimeId: "qwen3-coder:latest" },
	{ type: "ollama", runtimeId: "llama3.2" },
];

/** SDK harness — common AI SDK / OpenAI / Anthropic package model ids. */
const SDK_MODELS: readonly CuratedEntry[] = [
	{ type: "openai", runtimeId: "gpt-5.6" },
	{ type: "openai", runtimeId: "gpt-5.4" },
	{ type: "openai", runtimeId: "gpt-5.4-mini" },
	{ type: "openai", runtimeId: "o3" },
	{ type: "openai", runtimeId: "o4-mini" },
	{ type: "anthropic", runtimeId: "claude-opus-5" },
	{ type: "anthropic", runtimeId: "claude-sonnet-5" },
	{ type: "anthropic", runtimeId: "claude-haiku-4-5" },
	{ type: "google", runtimeId: "gemini-2.5-pro" },
	{ type: "google", runtimeId: "gemini-2.5-flash" },
];

const CURATED: Readonly<Record<string, readonly CuratedEntry[]>> = {
	codex: CODEX_MODELS,
	claude: CLAUDE_MODELS,
	gemini: GEMINI_MODELS,
	grok: GROK_MODELS,
	cursor: CURSOR_MODELS,
	copilot: COPILOT_MODELS,
	opencode: OPENCODE_MODELS,
	aider: AIDER_MODELS,
	goose: GOOSE_MODELS,
	sdk: SDK_MODELS,
};

function offerFor(harnessId: string, entry: CuratedEntry): BoModelOffer {
	const slash = entry.runtimeId.indexOf("/");
	const provider =
		slash > 0 && /^[a-z][a-z0-9-]*$/iu.test(entry.runtimeId.slice(0, slash))
			? entry.runtimeId.slice(0, slash).toLowerCase()
			: entry.type;
	const model =
		slash > 0 && provider === entry.runtimeId.slice(0, slash).toLowerCase()
			? entry.runtimeId.slice(slash + 1)
			: entry.runtimeId;
	return makeModelOffer({
		provider,
		model,
		runtimeId: entry.runtimeId,
		label: `${entry.runtimeId} · ${harnessId}`,
		source: "harness",
		via: harnessId,
		harnessId,
	});
}

function fromCurated(
	harnessId: string,
	entries: readonly CuratedEntry[],
): BoModelOffer[] {
	return entries.map((entry) => offerFor(harnessId, entry));
}

function offerFromRuntimeId(
	harnessId: string,
	type: string,
	runtimeId: string,
): BoModelOffer {
	return offerFor(harnessId, { type, runtimeId });
}

function mergeOffers(
	primary: readonly BoModelOffer[],
	fallback: readonly BoModelOffer[],
): readonly BoModelOffer[] {
	const seen = new Set(primary.map((row) => offerKey(row)));
	const out = [...primary];
	for (const row of fallback) {
		const key = offerKey(row);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(row);
	}
	return out;
}

/** Parse `cursor-agent --list-models` / `agent --list-models` stdout. */
export function parseCursorListModelsOutput(stdout: string): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const line of stdout.split(/\r?\n/u)) {
		const m = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s+-\s+/u.exec(line.trim());
		if (!m) continue;
		const id = at(m, 1);
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

/** Parse `opencode models` stdout (`provider/model` per line). */
export function parseOpencodeModelsOutput(stdout: string): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const line of stdout.split(/\r?\n/u)) {
		const id = line.trim();
		if (!id || id.includes(" ") || !id.includes("/")) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

/** Parse `grok models` stdout. */
export function parseGrokModelsOutput(stdout: string): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const line of stdout.split(/\r?\n/u)) {
		const m = /^\s*[*+-]\s+(\S+)/u.exec(line);
		if (!m) continue;
		const id = at(m, 1)
			.replace(/\(.*\)$/u, "")
			.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

const liveProbeCache = new Map<string, string | null>();

/** Clear live CLI probe cache (tests). */
export function clearHarnessModelProbeCache(): void {
	liveProbeCache.clear();
}

function defaultRunProbe(harnessId: string): string | null {
	if (liveProbeCache.has(harnessId)) {
		return liveProbeCache.get(harnessId) ?? null;
	}
	const trySpawn = (
		command: string,
		args: readonly string[],
	): string | null => {
		try {
			const result = spawnSync(command, [...args], {
				encoding: "utf8",
				// Keep short — missing/hanging CLIs must not stall /agents configure.
				timeout: 2_000,
				env: process.env,
			});
			if (result.error || result.status !== 0) return null;
			const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
			return out.trim().length > 0 ? out : null;
		} catch {
			return null;
		}
	};

	let stdout: string | null = null;
	switch (harnessId) {
		case "cursor":
			stdout =
				trySpawn("cursor-agent", ["--list-models"]) ??
				trySpawn("agent", ["--list-models"]);
			break;
		case "opencode":
			stdout = trySpawn("opencode", ["models"]);
			break;
		case "grok":
			stdout = trySpawn("grok", ["models"]);
			break;
		default:
			stdout = null;
	}
	liveProbeCache.set(harnessId, stdout);
	return stdout;
}

function liveOffers(
	harnessId: string,
	stdout: string,
): readonly BoModelOffer[] {
	switch (harnessId) {
		case "cursor":
			return parseCursorListModelsOutput(stdout).map((id) =>
				offerFromRuntimeId(harnessId, "cursor", id),
			);
		case "opencode":
			return parseOpencodeModelsOutput(stdout).map((id) =>
				offerFromRuntimeId(harnessId, "opencode", id),
			);
		case "grok":
			return parseGrokModelsOutput(stdout).map((id) =>
				offerFromRuntimeId(harnessId, "xai", id),
			);
		default:
			return [];
	}
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
			providers?: Record<string, { models?: { id?: string; name?: string }[] }>;
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
				out.push(
					makeModelOffer({
						provider: type,
						model: id,
						runtimeId: id,
						label: `${id} · pi/${provider}`,
						source: "harness",
						via: "pi",
						harnessId: "pi",
					}),
				);
			}
		}
		return out.sort((a, b) => a.runtimeId.localeCompare(b.runtimeId));
	} catch {
		return [];
	}
}

/**
 * Bundled harness ids that open as `configure-harness` (not Bo / inference / Eve).
 */
export function listConfigurableHarnessIds(
	specs: readonly HarnessSpec[] = loadHarnessCatalog(),
): readonly string[] {
	return specs
		.filter(
			(spec) =>
				!isHostSpec(spec) &&
				spec.id !== "hobo-code" &&
				spec.kind !== "inference" &&
				spec.kind !== "eve-agent" &&
				(spec.kind === "coding-agent" || spec.kind === "sdk"),
		)
		.map((spec) => spec.id)
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Models selectable when configuring a coding harness — provider-real only.
 * Codex also merges OpenAI-compatible endpoints; Claude merges Anthropic-
 * compatible endpoints. Pi is wired to the Bo catalog in `openHarnessConfigure`
 * (not here). Empty only when the harness has no curated/live/compat rows.
 */
export function listHarnessModelOffers(
	harnessId: string,
	options: ListHarnessModelOffersOptions = {},
): readonly BoModelOffer[] {
	const id = harnessId.trim().toLowerCase();
	if (id === "pi") {
		// Prefer Bo catalog via openHarnessConfigure; keep models.json as a
		// secondary source when callers hit this helper directly.
		const home = options.homeDir ?? homedir();
		return listPiModelOffersFromFile(join(home, ".pi", "agent", "models.json"));
	}

	const curated = CURATED[id];
	let offers: readonly BoModelOffer[] = curated ? fromCurated(id, curated) : [];

	// Default on interactively; off under Vitest. Explicit runProbe implies live.
	const wantLive =
		options.live ?? (options.runProbe !== undefined || !process.env.VITEST);
	if (wantLive) {
		const run = options.runProbe ?? defaultRunProbe;
		const stdout = run(id);
		if (stdout) {
			const live = liveOffers(id, stdout);
			if (live.length > 0) offers = mergeOffers(live, offers);
		}
	}

	const env = options.env ?? process.env;
	if (id === "codex" || id === "sdk") {
		offers = mergeOffers(offers, listOpenAiCompatibleOffers(id, { env }));
	}
	if (id === "claude") {
		offers = mergeOffers(offers, listAnthropicCompatibleOffers(id, { env }));
	}

	return offers;
}
