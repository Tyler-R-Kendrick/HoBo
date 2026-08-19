/**
 * Harness plugin spec record: schema id, the single source of truth for spec
 * kinds, parse-don't-validate for `harnesses/*.json` plugin files, and the
 * pure kind derivations each view (registry, picks/init) is built from.
 *
 * Wire form: data-models/harness_spec.proto + harness_spec.cue
 * (#HarnessSpecRecord). Untrusted JSON becomes a frozen HarnessSpec or throws
 * HarnessSpecParseError; downstream code accepts only parsed specs.
 */
import type {
	HarnessCliPromptPlacement,
	HarnessCliPromptSpec,
	HarnessConfigFormat,
	HarnessConfigSpec,
	HarnessKind,
	HarnessRuntimeAdapter,
	HarnessRuntimeSpec,
	HarnessSpec,
} from "./agent-harness-adapters.js";
import type { AgentKind } from "./agent-registry.js";

// public-contract: harness plugin spec schema id.
export const HARNESS_SPEC_SCHEMA = "hobo.code.harness-spec/v1" as const;

// public-contract: source of truth for spec kinds (#HarnessSpecKind).
export const HARNESS_SPEC_KINDS = [
	"coding-agent",
	"inference",
	"harness",
	"eve-agent",
	"sdk",
] as const;
export type HarnessSpecKind = (typeof HARNESS_SPEC_KINDS)[number];

// public-contract: config-format dispatch values (#HarnessConfigFormat).
export const HARNESS_CONFIG_FORMATS = [
	"toml-append",
	"json-env",
	"json-merge",
	"note",
	"eve-vfs",
	"sdk-env",
	"skip",
] as const;

// public-contract: AI SDK harness adapter ids (#HarnessRuntimeAdapter).
export const HARNESS_RUNTIME_ADAPTERS = [
	"claude-code",
	"codex",
	"pi",
	"opencode",
	"grok-build",
	"cline",
	"deepagents",
	"acp",
	"cli",
	"eve",
	"sdk",
	"skip",
] as const;

export const BUILTIN_HARNESS_ADAPTERS = [
	"claude-code",
	"codex",
	"pi",
	"opencode",
	"grok-build",
	"cline",
	"deepagents",
	"acp",
] as const;

export const CUSTOM_HARNESS_ADAPTERS = ["cli", "eve", "sdk", "skip"] as const;

export const HARNESS_CLI_PROMPT_PLACEMENTS = ["trailing-arg", "stdin"] as const;

/** Host-process adapters: local just-bash sandbox is enough. */
export const HOST_HARNESS_ADAPTERS = [
	"pi",
	"cline",
	"cli",
	"eve",
	"sdk",
] as const;

/** Bridge adapters: need a network sandbox (`@ai-sdk/sandbox-vercel`). */
export const BRIDGE_HARNESS_ADAPTERS = [
	"claude-code",
	"codex",
	"opencode",
	"grok-build",
	"deepagents",
	"acp",
] as const;

export const JUST_BASH_SANDBOX_PACKAGE = "@ai-sdk/sandbox-just-bash";
export const HARNESS_AGENT_PACKAGE = "@ai-sdk/harness";
export const VERCEL_SANDBOX_PACKAGE = "@ai-sdk/sandbox-vercel";

export const BUILTIN_HARNESS_PACKAGES = {
	"claude-code": "@ai-sdk/harness-claude-code",
	codex: "@ai-sdk/harness-codex",
	pi: "@ai-sdk/harness-pi",
	opencode: "@ai-sdk/harness-opencode",
	"grok-build": "@ai-sdk/harness-grok-build",
	cline: "@ai-sdk/harness-cline",
	deepagents: "@ai-sdk/harness-deepagents",
	acp: "@ai-sdk/harness-acp",
} as const satisfies Record<(typeof BUILTIN_HARNESS_ADAPTERS)[number], string>;

const HARNESS_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Typed parse failure: which field, what was expected, what arrived. */
export class HarnessSpecParseError extends Error {
	readonly path: string;
	readonly expected: string;
	readonly received: string;

	constructor(path: string, expected: string, received: string) {
		super(`${path}: expected ${expected}, received ${received}`);
		this.name = "HarnessSpecParseError";
		this.path = path;
		this.expected = expected;
		this.received = received;
	}
}

function describeReceived(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "string") {
		return JSON.stringify(value.length > 48 ? `${value.slice(0, 48)}…` : value);
	}
	if (Array.isArray(value)) return "array";
	if (typeof value === "object") return "object";
	return `${typeof value} ${String(value)}`;
}

function fail(path: string, expected: string, value: unknown): never {
	throw new HarnessSpecParseError(path, expected, describeReceived(value));
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		fail(path, "an object", value);
	}
	return value as Record<string, unknown>;
}

function requireString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.length === 0) {
		fail(path, "a non-empty string", value);
	}
	return value;
}

function optionalString(value: unknown, path: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") fail(path, "a boolean", value);
	return value;
}

function optionalSeat(value: unknown, path: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		fail(path, "a non-negative integer", value);
	}
	return value;
}

function optionalStringArray(
	value: unknown,
	path: string,
): readonly string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) fail(path, "an array of non-empty strings", value);
	return Object.freeze(
		value.map((item, index) => requireString(item, `${path}[${index}]`)),
	);
}

function optionalEnv(
	value: unknown,
	path: string,
): Readonly<Record<string, string>> | undefined {
	if (value === undefined) return undefined;
	const source = requireObject(value, path);
	const env: Record<string, string> = {};
	for (const [key, item] of Object.entries(source)) {
		if (typeof item !== "string") fail(`${path}.${key}`, "a string", item);
		env[key] = item;
	}
	return Object.freeze(env);
}

function isSpecKind(value: unknown): value is HarnessSpecKind {
	return (
		typeof value === "string" &&
		(HARNESS_SPEC_KINDS as readonly string[]).includes(value)
	);
}

function isConfigFormat(value: unknown): value is HarnessConfigFormat {
	return (
		typeof value === "string" &&
		(HARNESS_CONFIG_FORMATS as readonly string[]).includes(value)
	);
}

function isRuntimeAdapter(value: unknown): value is HarnessRuntimeAdapter {
	return (
		typeof value === "string" &&
		(HARNESS_RUNTIME_ADAPTERS as readonly string[]).includes(value)
	);
}

function parseHarnessConfigSpec(
	value: unknown,
	path: string,
): HarnessConfigSpec {
	const source = requireObject(value, path);
	if (!isConfigFormat(source.format)) {
		fail(
			`${path}.format`,
			`one of ${HARNESS_CONFIG_FORMATS.join("|")}`,
			source.format,
		);
	}
	const configuredWhen = optionalStringArray(
		source.configuredWhen,
		`${path}.configuredWhen`,
	);
	const rel = optionalString(source.path, `${path}.path`);
	const block = optionalString(source.block, `${path}.block`);
	const env = optionalEnv(source.env, `${path}.env`);
	const summary = optionalString(source.summary, `${path}.summary`);
	const after = optionalString(source.after, `${path}.after`);
	const note = optionalString(source.note, `${path}.note`);
	return Object.freeze({
		format: source.format,
		...(rel === undefined ? {} : { path: rel }),
		...(configuredWhen === undefined ? {} : { configuredWhen }),
		...(block === undefined ? {} : { block }),
		...(env === undefined ? {} : { env }),
		...(source.merge === undefined ? {} : { merge: source.merge }),
		...(summary === undefined ? {} : { summary }),
		...(after === undefined ? {} : { after }),
		...(note === undefined ? {} : { note }),
	});
}

function isPromptPlacement(value: unknown): value is HarnessCliPromptPlacement {
	return (
		typeof value === "string" &&
		(HARNESS_CLI_PROMPT_PLACEMENTS as readonly string[]).includes(value)
	);
}

function parseHarnessCliPromptSpec(
	value: unknown,
	path: string,
): HarnessCliPromptSpec {
	const source = requireObject(value, path);
	if (!isPromptPlacement(source.placement)) {
		fail(
			`${path}.placement`,
			`one of ${HARNESS_CLI_PROMPT_PLACEMENTS.join("|")}`,
			source.placement,
		);
	}
	const prefixArgs = optionalStringArray(
		source.prefixArgs,
		`${path}.prefixArgs`,
	);
	return Object.freeze({
		placement: source.placement,
		...(prefixArgs === undefined ? {} : { prefixArgs }),
	});
}

function parseHarnessRuntimeSpec(
	value: unknown,
	path: string,
): HarnessRuntimeSpec {
	const source = requireObject(value, path);
	if (!isRuntimeAdapter(source.adapter)) {
		fail(
			`${path}.adapter`,
			`one of ${HARNESS_RUNTIME_ADAPTERS.join("|")}`,
			source.adapter,
		);
	}
	const prompt =
		source.prompt === undefined
			? undefined
			: parseHarnessCliPromptSpec(source.prompt, `${path}.prompt`);
	return Object.freeze({
		adapter: source.adapter,
		...(prompt === undefined ? {} : { prompt }),
	});
}

/**
 * Parse an untrusted harness plugin spec (JSON file, wire) into a frozen
 * HarnessSpec or throw HarnessSpecParseError. Existing plugin files carry no
 * `schema` field, so it is optional — but when present it must equal
 * HARNESS_SPEC_SCHEMA.
 */
export function parseHarnessSpec(value: unknown): HarnessSpec {
	const source = requireObject(value, "harness-spec");
	if (source.schema !== undefined && source.schema !== HARNESS_SPEC_SCHEMA) {
		fail("schema", `${HARNESS_SPEC_SCHEMA} (or omitted)`, source.schema);
	}
	const id = requireString(source.id, "id");
	if (!HARNESS_ID.test(id)) {
		fail("id", `a slug matching ${HARNESS_ID.source}`, source.id);
	}
	const label = requireString(source.label, "label");
	if (!isSpecKind(source.kind)) {
		fail("kind", `one of ${HARNESS_SPEC_KINDS.join("|")}`, source.kind);
	}
	const host = optionalBoolean(source.host, "host");
	const binaries = optionalStringArray(source.binaries, "binaries");
	const configPaths = optionalStringArray(source.configPaths, "configPaths");
	const command = optionalString(source.command, "command");
	const seat = optionalSeat(source.seat, "seat");
	const cwdMarkers = optionalStringArray(source.cwdMarkers, "cwdMarkers");
	const packageNames = optionalStringArray(source.packageNames, "packageNames");
	const config =
		source.config === undefined
			? undefined
			: parseHarnessConfigSpec(source.config, "config");
	const runtime =
		source.runtime === undefined
			? undefined
			: parseHarnessRuntimeSpec(source.runtime, "runtime");
	return Object.freeze({
		id,
		label,
		kind: source.kind,
		...(host === undefined ? {} : { host }),
		...(binaries === undefined ? {} : { binaries }),
		...(configPaths === undefined ? {} : { configPaths }),
		...(command === undefined ? {} : { command }),
		...(seat === undefined ? {} : { seat }),
		...(cwdMarkers === undefined ? {} : { cwdMarkers }),
		...(packageNames === undefined ? {} : { packageNames }),
		...(config === undefined ? {} : { config }),
		...(runtime === undefined ? {} : { runtime }),
	});
}

/**
 * hobo-code itself is the host: `host: true` and the legacy `kind: "harness"`
 * both mark it. This is the one place that redundancy is absorbed.
 */
export function isHostSpec(spec: HarnessSpec): boolean {
	return spec.host === true || spec.kind === "harness";
}

/**
 * Registry view: the AgentKind a spec surfaces as, or null when the spec is
 * not a registry agent (eve-agent, sdk).
 */
export function agentKindOf(spec: HarnessSpec): AgentKind | null {
	return spec.kind === "coding-agent" ||
		spec.kind === "inference" ||
		spec.kind === "harness"
		? spec.kind
		: null;
}

/**
 * Picks/init view: how a spec is seated. Hosts are ACP; everything else keys
 * off the spec kind, defaulting to a coding CLI.
 */
export function harnessKindOf(spec: HarnessSpec): HarnessKind {
	if (isHostSpec(spec)) return "acp";
	if (spec.kind === "inference") return "inference";
	if (spec.kind === "eve-agent") return "eve-agent";
	if (spec.kind === "sdk") return "sdk";
	return "coding-cli";
}

export type HarnessRuntimeOrigin = "builtin" | "custom";

export type ResolvedHarnessRuntime =
	| {
			readonly origin: "builtin";
			readonly adapter: (typeof BUILTIN_HARNESS_ADAPTERS)[number];
			readonly packageName: string;
	  }
	| {
			readonly origin: "custom";
			readonly adapter: (typeof CUSTOM_HARNESS_ADAPTERS)[number];
			readonly packageName?: undefined;
	  };

function defaultRuntimeAdapter(spec: HarnessSpec): HarnessRuntimeAdapter {
	if (isHostSpec(spec) || spec.kind === "inference") return "skip";
	if (spec.kind === "eve-agent") return "eve";
	if (spec.kind === "sdk") return "sdk";
	return "cli";
}

function isBuiltinAdapter(
	adapter: HarnessRuntimeAdapter,
): adapter is (typeof BUILTIN_HARNESS_ADAPTERS)[number] {
	return (BUILTIN_HARNESS_ADAPTERS as readonly string[]).includes(adapter);
}

/**
 * Runtime view: AI SDK builtin package vs in-repo custom HarnessV1.
 * Dispatch is on `runtime.adapter` (or kind default), never on agent id.
 */
export function resolveHarnessRuntime(
	spec: HarnessSpec,
): ResolvedHarnessRuntime {
	const adapter = spec.runtime?.adapter ?? defaultRuntimeAdapter(spec);
	if (isBuiltinAdapter(adapter)) {
		return {
			origin: "builtin",
			adapter,
			packageName: BUILTIN_HARNESS_PACKAGES[adapter],
		};
	}
	return { origin: "custom", adapter };
}

export function isHostHarnessAdapter(adapter: HarnessRuntimeAdapter): boolean {
	return (HOST_HARNESS_ADAPTERS as readonly string[]).includes(adapter);
}

export function isBridgeHarnessAdapter(
	adapter: HarnessRuntimeAdapter,
): boolean {
	return (BRIDGE_HARNESS_ADAPTERS as readonly string[]).includes(adapter);
}
