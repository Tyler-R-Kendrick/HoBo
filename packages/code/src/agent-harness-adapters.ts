/**
 * Config-format applicators for harness plugins.
 * Dispatch is on *format* (toml-append / json-env / …), never on agent id.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveHoboHome } from "@hobo/core/hobo-home";
import type { HarnessSpecKind } from "./harness-spec.js";
import {
	cloneAsJson,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

export type HarnessConfigFormat =
	| "toml-append"
	| "json-env"
	| "json-merge"
	| "note"
	| "eve-vfs"
	| "sdk-env"
	| "skip";

/** AI SDK HarnessV1 adapter id. Dispatch on this, never on agent id. */
export type HarnessRuntimeAdapter =
	| "claude-code"
	| "codex"
	| "pi"
	| "opencode"
	| "grok-build"
	| "cline"
	| "deepagents"
	| "acp"
	| "cli"
	| "eve"
	| "sdk"
	| "skip";

export type HarnessCliPromptPlacement = "trailing-arg" | "stdin";

export interface HarnessCliPromptSpec {
	readonly placement: HarnessCliPromptPlacement;
	readonly prefixArgs?: readonly string[];
}

export interface HarnessRuntimeSpec {
	readonly adapter: HarnessRuntimeAdapter;
	readonly prompt?: HarnessCliPromptSpec;
}

export interface HarnessConfigSpec {
	readonly format: HarnessConfigFormat;
	readonly path?: string;
	readonly configuredWhen?: readonly string[];
	readonly block?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly merge?: unknown;
	readonly summary?: string;
	readonly after?: string;
	readonly note?: string;
}

export interface HarnessSpec {
	readonly id: string;
	readonly label: string;
	readonly kind: HarnessSpecKind;
	readonly host?: boolean;
	readonly binaries?: readonly string[];
	readonly configPaths?: readonly string[];
	readonly command?: string;
	readonly seat?: number;
	readonly cwdMarkers?: readonly string[];
	readonly packageNames?: readonly string[];
	readonly config?: HarnessConfigSpec;
	readonly runtime?: HarnessRuntimeSpec;
}

export function interpolateDest(
	template: string,
	dest: AgentsInitDestination,
): string {
	return template
		.replaceAll("{{openaiUrl}}", dest.openaiUrl)
		.replaceAll("{{anthropicUrl}}", dest.anthropicUrl)
		.replaceAll("{{envKey}}", dest.envKey)
		.replaceAll("{{envRef}}", `\${${dest.envKey}}`);
}

export type HarnessKind =
	| "coding-cli"
	| "eve-agent"
	| "inference"
	| "acp"
	| "sdk";

export interface HarnessHunk {
	readonly path: string;
	readonly action: "create" | "edit" | "note";
	readonly summary: string;
	readonly after: string;
}

export interface AgentsInitDestination {
	readonly source: "sidecar" | "openai-base-url" | "ollama" | "local-base-url";
	readonly openaiUrl: string;
	readonly anthropicUrl: string;
	readonly namedUrl: string;
	readonly envKey: "HOBO_CODE_SESSION_REF";
}

export interface AdapterContext {
	readonly home: string;
	readonly dest: AgentsInitDestination;
	readonly force?: boolean;
	readonly cwd?: string;
	readonly hoboHome?: string;
}

function resolveHomePath(home: string, rel: string): string {
	return join(home, ...rel.split("/"));
}

function tomlAppend(
	spec: HarnessSpec,
	ctx: AdapterContext,
): readonly HarnessHunk[] {
	const rel = spec.config?.path;
	const blockTpl = spec.config?.block;
	if (!rel || !blockTpl) return [];
	const path = resolveHomePath(ctx.home, rel);
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
	const markers = spec.config?.configuredWhen ?? [];
	if (
		ctx.force !== true &&
		markers.length > 0 &&
		markers.every((mark) => existing.includes(mark))
	) {
		return [];
	}
	const block = interpolateDest(blockTpl, ctx.dest);
	const after = existing.includes(markers[0] ?? "\0")
		? existing
		: `${existing.trimEnd()}${existing.trim().length > 0 ? "\n\n" : ""}${block}`;
	return [
		{
			path,
			action: existing.length > 0 ? "edit" : "create",
			summary: `point ${spec.label} at the Station model surface`,
			after: after.endsWith("\n") ? after : `${after}\n`,
		},
	];
}

function jsonEnv(
	spec: HarnessSpec,
	ctx: AdapterContext,
): readonly HarnessHunk[] {
	const rel = spec.config?.path;
	const envSpec = spec.config?.env;
	if (!rel || !envSpec) return [];
	const path = resolveHomePath(ctx.home, rel);
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "{}";
	let parsed: JsonObject = {};
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		parsed = JSON.parse(existing) as JsonObject;
	} catch {
		return [
			{
				path,
				action: "note",
				summary: `skip — unparseable ${spec.label} settings`,
				after: existing,
			},
		];
	}
	const env =
		isJsonObject(parsed.env) && parsed.env !== null
			? // SAFETY: parsed or fixture value is the named domain type after this assertion.
				{
					...// SAFETY: [object Object] guard proved parsed.env is a string map.
					(parsed.env as Record<string, string>),
				}
			: {};
	interface WantedEnv {
		[name: string]: string;
	}
	const wanted: WantedEnv = {};
	for (const [key, value] of Object.entries(envSpec)) {
		wanted[key] = interpolateDest(value, ctx.dest);
	}
	if (
		ctx.force !== true &&
		Object.entries(wanted).every(([key, value]) => env[key] === value)
	) {
		return [];
	}
	const next = { ...parsed, env: { ...env, ...wanted } };
	return [
		{
			path,
			action: existsSync(path) ? "edit" : "create",
			summary: `point ${spec.label} at the Station model surface`,
			after: `${JSON.stringify(next, null, 2)}\n`,
		},
	];
}

function interpolateDeep(
	value: JsonValue | undefined,
	dest: AgentsInitDestination,
): JsonValue {
	if (isJsonString(value)) return interpolateDest(value, dest);
	if (Array.isArray(value)) {
		return value.map((item) => interpolateDeep(item, dest));
	}
	if (value && isJsonObject(value)) {
		const out: JsonObject = {};
		for (const [key, child] of Object.entries(value)) {
			Object.assign(out, { [key]: interpolateDeep(child, dest) });
		}
		return out;
	}
	return value ?? null;
}

function deepMerge(
	base: JsonValue | undefined,
	overlay: JsonValue | undefined,
): JsonValue {
	if (Array.isArray(overlay) || overlay === null || !isJsonObject(overlay)) {
		return overlay ?? null;
	}
	const root =
		base && isJsonObject(base) && !Array.isArray(base)
			? // SAFETY: parsed or fixture value is the named domain type after this assertion.
				{
					...// SAFETY: [object Object] guard proved base is a JSON object.
					(base as JsonObject),
				}
			: {};
	for (const [key, child] of Object.entries(
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		overlay as JsonObject,
	)) {
		root[key] = deepMerge(root[key], child);
	}
	return root;
}

function jsonMerge(
	spec: HarnessSpec,
	ctx: AdapterContext,
): readonly HarnessHunk[] {
	const rel = spec.config?.path;
	const merge = spec.config?.merge;
	if (!rel || merge === undefined) return [];
	const path = resolveHomePath(ctx.home, rel);
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "{}";
	const markers = spec.config?.configuredWhen ?? [];
	if (
		ctx.force !== true &&
		markers.length > 0 &&
		markers.every((mark) => existing.includes(mark))
	) {
		return [];
	}
	let parsed: JsonValue = null;
	try {
		parsed = parseJsonValue(existing);
	} catch {
		return [
			{
				path,
				action: "note",
				summary: `skip — unparseable ${spec.label} settings`,
				after: existing,
			},
		];
	}
	const next = deepMerge(parsed, interpolateDeep(cloneAsJson(merge), ctx.dest));
	return [
		{
			path,
			action: existsSync(path) ? "edit" : "create",
			summary: `point ${spec.label} at the Station model surface`,
			after: `${JSON.stringify(next, null, 2)}\n`,
		},
	];
}

function noteHunk(
	spec: HarnessSpec,
	ctx: AdapterContext,
): readonly HarnessHunk[] {
	const rel = spec.config?.path ?? `.${spec.id}`;
	return [
		{
			path: resolveHomePath(ctx.home, rel),
			action: "note",
			summary:
				spec.config?.summary ??
				`set ${spec.label} OpenAI-compatible base URL to the Station surface`,
			after: interpolateDest(
				spec.config?.after ?? `base_url={{openaiUrl}}\nenv_key={{envKey}}`,
				ctx.dest,
			),
		},
	];
}

function eveVfsHunks(ctx: AdapterContext): readonly HarnessHunk[] {
	const cwd = ctx.cwd;
	if (!cwd) {
		return [
			{
				path: "/agents/index",
				action: "note",
				summary: "no Eve tree in cwd — init will materialize under HOBO_HOME",
				after: "/agents/<id> mounts default coordinator + subagents",
			},
		];
	}
	const root = join(cwd, "agent");
	if (!existsSync(root) || !statSync(root).isDirectory()) {
		return [
			{
				path: "/agents/index",
				action: "note",
				summary: "no Eve tree in cwd — init will materialize under HOBO_HOME",
				after: "/agents/<id> mounts default coordinator + subagents",
			},
		];
	}
	const trees = [`/agents/agent → ${root}`];
	const sub = join(root, "subagents");
	if (existsSync(sub) && statSync(sub).isDirectory()) {
		for (const name of readdirSync(sub)) {
			const path = join(sub, name);
			if (statSync(path).isDirectory()) trees.push(`/agents/${name} → ${path}`);
		}
	}
	return [
		{
			path: "/agents/index",
			action: "note",
			summary: "register Eve trees in the virtual filesystem",
			after: trees.join("\n"),
		},
	];
}

function sdkEnvHunk(ctx: AdapterContext): readonly HarnessHunk[] {
	const path = join(
		ctx.hoboHome ?? resolveHoboHome({ HOME: ctx.home }),
		"durable",
		"code",
		"agents",
		"sdk.env",
	);
	return [
		{
			path,
			action: "create",
			summary: "SDK env file — OpenAI-compatible dest, no secret values",
			after: [
				`OPENAI_BASE_URL=${ctx.dest.openaiUrl}`,
				`# source $HOBO_HOME/durable/code/agents/env.sh for ${ctx.dest.envKey}`,
				"",
			].join("\n"),
		},
	];
}

export function applyHarnessConfig(
	spec: HarnessSpec,
	ctx: AdapterContext,
): readonly HarnessHunk[] {
	const format = spec.config?.format;
	if (format === "toml-append") return tomlAppend(spec, ctx);
	if (format === "json-env") return jsonEnv(spec, ctx);
	if (format === "json-merge") return jsonMerge(spec, ctx);
	if (format === "note") return noteHunk(spec, ctx);
	if (format === "eve-vfs") return eveVfsHunks(ctx);
	if (format === "sdk-env") return sdkEnvHunk(ctx);
	if (format === "skip") return [];
	return noteHunk(spec, ctx);
}
