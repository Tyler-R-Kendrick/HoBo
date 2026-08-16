/**
 * Per-harness (and Bo subagent) model/effort settings for `/agents` configure.
 * Stored under `$HOBO_HOME/durable/code/harness-settings/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
	readonly model: string;
	/** Package-URL provenance when selected from the Bo model catalog. */
	readonly modelPurl?: string;
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
		const modelPurl =
			typeof raw.modelPurl === "string" && raw.modelPurl.trim().length > 0
				? raw.modelPurl.trim()
				: undefined;
		const effortRaw =
			typeof raw.effort === "string" ? raw.effort.trim() : fallback.effort;
		const effort = isEffortLevel(effortRaw) ? effortRaw : fallback.effort;
		return {
			schema: HARNESS_SETTINGS_SCHEMA,
			id,
			model,
			...(modelPurl !== undefined ? { modelPurl } : {}),
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
		...(settings.modelPurl && settings.modelPurl.trim().length > 0
			? { modelPurl: settings.modelPurl.trim() }
			: {}),
		effort: settings.effort,
	};
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
	return path;
}

export function cycleEffort(current: EffortLevel, delta: 1 | -1): EffortLevel {
	const i = EFFORT_LEVELS.indexOf(current);
	const next = (i + delta + EFFORT_LEVELS.length) % EFFORT_LEVELS.length;
	return EFFORT_LEVELS[next]!;
}

/**
 * Append known CLI overrides for seating. Codex: `-m` + `-c model_reasoning_effort`.
 * Unknown harnesses leave the base command unchanged when model is empty.
 */
export function applySettingsToSeatCommand(
	agentId: string,
	baseCommand: string,
	settings: HarnessSettings,
): string {
	const model = settings.model.trim();
	if (agentId === "codex") {
		const parts = [baseCommand];
		if (model) parts.push(`-m ${shellQuote(model)}`);
		parts.push(
			`-c model_reasoning_effort=${shellQuote(settings.effort)}`,
		);
		return parts.join(" ");
	}
	if (agentId === "claude" && model) {
		return `${baseCommand} --model ${shellQuote(model)}`;
	}
	if (agentId === "pi" && model) {
		return `${baseCommand} --model ${shellQuote(model)}`;
	}
	return baseCommand;
}

function shellQuote(value: string): string {
	if (/^[a-zA-Z0-9_./:@+-]+$/u.test(value)) return value;
	return `'${value.replace(/'/gu, `'\\''`)}'`;
}
