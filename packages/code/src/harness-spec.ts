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
	HarnessConfigFormat,
	HarnessConfigSpec,
	HarnessKind,
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
