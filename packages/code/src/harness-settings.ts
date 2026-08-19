/**
 * Per-harness (and Bo subagent) model/effort settings for `/agents` configure.
 * Stored under `$HOBO_HOME/durable/code/harness-settings/`.
 *
 * Mux seating (`applySettingsToSeatCommand`) launches the CLI with the
 * configured api_endpoint (env), model, and effort from this record.
 *
 * Model identity uses LiteLLM-style `provider/model` (`modelId`) plus optional
 * `via` / `apiEndpoint` — not Package-URLs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { at, must } from "@hobo/core/total-access";
import { parseModelId } from "./bo-model-catalog.js";

// public-contract: durable harness/subagent settings schema id
export const HARNESS_SETTINGS_SCHEMA = "hobo.code.harness-settings/v1" as const;

export const EFFORT_LEVELS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export interface HarnessSettings {
	readonly schema: typeof HARNESS_SETTINGS_SCHEMA;
	readonly id: string;
	/** Runtime / CLI model id (what `-m` / `--model` receives). */
	readonly model: string;
	/**
	 * LiteLLM-style `provider/model` identity when selected from a catalog
	 * (e.g. `openai/gpt-5.6-sol`, `ollama/qwen2.5-coder:7b`).
	 */
	readonly modelId?: string;
	/** Catalog routing path (codex, env, openai-compatible, …). */
	readonly via?: string;
	/**
	 * OpenAI- or Anthropic-compatible API base URL selected in `/agents`.
	 * Mux prefixes the matching env var when seating the CLI.
	 */
	readonly apiEndpoint?: string;
	readonly effort: EffortLevel;
}

export function isEffortLevel(value: string): value is EffortLevel {
	return (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function defaultHarnessSettings(id: string): HarnessSettings {
	return {
		schema: HARNESS_SETTINGS_SCHEMA,
		id,
		model: id === "hobo-code" ? "ollama/qwen2.5-coder:7b" : "",
		effort: "medium",
	};
}

export function harnessSettingsPath(
	hoboHome: string,
	id: string,
	scope: "harness" | "eve" = "harness",
): string {
	const safe = id.replace(/[^a-zA-Z0-9._-]/gu, "_");
	const dir =
		scope === "eve"
			? join(hoboHome, "durable", "code", "harness-settings", "eve")
			: join(hoboHome, "durable", "code", "harness-settings");
	return join(dir, `${safe}.json`);
}

/** Resolve API base URL from settings (explicit field only). */
export function resolveHarnessApiEndpoint(
	settings: HarnessSettings,
): string | undefined {
	const explicit = settings.apiEndpoint?.trim();
	return explicit || undefined;
}

/**
 * Migrate a legacy `pkg:…` modelPurl into modelId / via / apiEndpoint.
 * Returns null when the string is not a legacy Package-URL.
 */
export function migrateLegacyModelPurl(purl: string): {
	readonly modelId?: string;
	readonly via?: string;
	readonly apiEndpoint?: string;
} | null {
	const trimmed = purl.trim();
	if (!trimmed.startsWith("pkg:")) return null;
	const m =
		/^pkg:([a-z0-9][a-z0-9.-]*)\/([^?@]+)(?:@([^?]+))?(?:\?(.*))?$/iu.exec(
			trimmed,
		);
	if (!m) return null;
	const provider = at(m, 1).toLowerCase();
	const name = decodeURIComponent(at(m, 2));
	const version = m[3] ? decodeURIComponent(m[3]) : undefined;
	const model = version !== undefined ? `${name}:${version}` : name;
	const qualifiers: Record<string, string> = {};
	if (m[4]) {
		for (const part of m[4].split("&")) {
			const eq = part.indexOf("=");
			if (eq <= 0) continue;
			qualifiers[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(
				part.slice(eq + 1),
			);
		}
	}
	return {
		modelId: `${provider}/${model}`,
		...(qualifiers.via ? { via: qualifiers.via } : {}),
		...(qualifiers.base_url || qualifiers.api_endpoint
			? {
					apiEndpoint: qualifiers.base_url || qualifiers.api_endpoint,
				}
			: {}),
	};
}

export function loadHarnessSettings(
	hoboHome: string,
	id: string,
	scope: "harness" | "eve" = "harness",
): HarnessSettings {
	const path = harnessSettingsPath(hoboHome, id, scope);
	const fallback = defaultHarnessSettings(id);
	if (!existsSync(path)) return fallback;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as Record<
			string,
			unknown
		>;
		const model =
			typeof raw.model === "string" ? raw.model.trim() : fallback.model;
		let modelId =
			typeof raw.modelId === "string" && raw.modelId.trim().length > 0
				? raw.modelId.trim()
				: undefined;
		let via =
			typeof raw.via === "string" && raw.via.trim().length > 0
				? raw.via.trim()
				: undefined;
		let apiEndpoint =
			typeof raw.apiEndpoint === "string" && raw.apiEndpoint.trim().length > 0
				? raw.apiEndpoint.trim()
				: undefined;

		// Legacy Package-URL field from earlier builds.
		if (
			!modelId &&
			typeof raw.modelPurl === "string" &&
			raw.modelPurl.trim().length > 0
		) {
			const migrated = migrateLegacyModelPurl(raw.modelPurl);
			if (migrated) {
				modelId = migrated.modelId;
				via = via ?? migrated.via;
				apiEndpoint = apiEndpoint ?? migrated.apiEndpoint;
			}
		}

		if (modelId && !parseModelId(modelId)) {
			modelId = undefined;
		}

		const effortRaw =
			typeof raw.effort === "string" ? raw.effort.trim() : fallback.effort;
		const effort = isEffortLevel(effortRaw) ? effortRaw : fallback.effort;
		return {
			schema: HARNESS_SETTINGS_SCHEMA,
			id,
			model,
			...(modelId !== undefined ? { modelId } : {}),
			...(via !== undefined ? { via } : {}),
			...(apiEndpoint !== undefined ? { apiEndpoint } : {}),
			effort,
		};
	} catch {
		return fallback;
	}
}

export function saveHarnessSettings(
	hoboHome: string,
	settings: HarnessSettings,
	scope: "harness" | "eve" = "harness",
): string {
	const path = harnessSettingsPath(hoboHome, settings.id, scope);
	mkdirSync(dirname(path), { recursive: true });
	const body: HarnessSettings = {
		schema: HARNESS_SETTINGS_SCHEMA,
		id: settings.id,
		model: settings.model.trim(),
		...(settings.modelId && settings.modelId.trim().length > 0
			? { modelId: settings.modelId.trim() }
			: {}),
		...(settings.via && settings.via.trim().length > 0
			? { via: settings.via.trim() }
			: {}),
		...(settings.apiEndpoint && settings.apiEndpoint.trim().length > 0
			? { apiEndpoint: settings.apiEndpoint.trim() }
			: {}),
		effort: settings.effort,
	};
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
	return path;
}

export function cycleEffort(current: EffortLevel, delta: 1 | -1): EffortLevel {
	const i = EFFORT_LEVELS.indexOf(current);
	const next = (i + delta + EFFORT_LEVELS.length) % EFFORT_LEVELS.length;
	return must(EFFORT_LEVELS[next]);
}

function shellQuote(value: string): string {
	if (/^[a-zA-Z0-9_./:@+-]+$/u.test(value)) return value;
	return `'${value.replace(/'/gu, `'\\''`)}'`;
}

/** Env vars the seated CLI needs for a configured compatible API endpoint. */
export function seatEnvForHarness(
	agentId: string,
	settings: HarnessSettings,
): Readonly<Record<string, string>> {
	const endpoint = resolveHarnessApiEndpoint(settings);
	if (!endpoint) return {};
	const id = agentId.trim().toLowerCase();
	if (id === "claude") {
		return { ANTHROPIC_BASE_URL: endpoint };
	}
	if (
		id === "codex" ||
		id === "pi" ||
		id === "opencode" ||
		id === "aider" ||
		id === "goose" ||
		id === "sdk" ||
		id === "copilot" ||
		id === "gemini" ||
		id === "grok" ||
		id === "cursor" ||
		id === "hobo-code"
	) {
		return { OPENAI_BASE_URL: endpoint };
	}
	return { OPENAI_BASE_URL: endpoint };
}

function cliFlagsForHarness(
	agentId: string,
	settings: HarnessSettings,
): string {
	const model = settings.model.trim();
	const id = agentId.trim().toLowerCase();
	if (id === "codex") {
		const parts: string[] = [];
		if (model) parts.push(`-m ${shellQuote(model)}`);
		parts.push(`-c model_reasoning_effort=${shellQuote(settings.effort)}`);
		return parts.length > 0 ? ` ${parts.join(" ")}` : "";
	}
	if (id === "claude") {
		const parts: string[] = [];
		if (model) parts.push(`--model ${shellQuote(model)}`);
		return parts.length > 0 ? ` ${parts.join(" ")}` : "";
	}
	if (
		(id === "pi" ||
			id === "gemini" ||
			id === "cursor" ||
			id === "opencode" ||
			id === "aider" ||
			id === "grok") &&
		model
	) {
		return ` --model ${shellQuote(model)}`;
	}
	if (id === "copilot" && model) {
		return ` --model=${shellQuote(model)}`;
	}
	return "";
}

function envAssignmentPrefix(
	env: Readonly<Record<string, string>>,
	settings: HarnessSettings,
	agentId: string,
): string {
	const merged: Record<string, string> = { ...env };
	const id = agentId.trim().toLowerCase();
	if (id === "claude") {
		merged.CLAUDE_CODE_EFFORT_LEVEL = settings.effort;
	}
	const parts = Object.entries(merged).map(
		([key, value]) => `${key}=${shellQuote(value)}`,
	);
	return parts.length > 0 ? `${parts.join(" ")} ` : "";
}

/**
 * Append known CLI overrides + API endpoint env for seating.
 * Codex: `OPENAI_BASE_URL=… … codex -m … -c model_reasoning_effort=…`
 * Claude: `ANTHROPIC_BASE_URL=… CLAUDE_CODE_EFFORT_LEVEL=… claude --model …`
 * Pi / others: OpenAI-compatible base URL + `--model` when set.
 */
export function applySettingsToSeatCommand(
	agentId: string,
	baseCommand: string,
	settings: HarnessSettings,
): string {
	const env = seatEnvForHarness(agentId, settings);
	const prefix = envAssignmentPrefix(env, settings, agentId);
	const flags = cliFlagsForHarness(agentId, settings);
	if (!prefix && !flags) return baseCommand;

	if (agentId === "codex" && baseCommand.includes(" && ")) {
		const segments = baseCommand.split(" && ");
		const last = must(segments.pop());
		segments.push(`${prefix}${last}${flags}`);
		return segments.join(" && ");
	}
	return `${prefix}${baseCommand}${flags}`.trim();
}
