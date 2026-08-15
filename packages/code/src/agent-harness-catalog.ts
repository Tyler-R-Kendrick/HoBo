/**
 * Discoverable harness plugins. New agents are JSON files, not switch cases.
 *
 * Load order (later same-id wins):
 *   1. bundled `packages/code/harnesses/*.json`
 *   2. `$HOBO_HOME/durable/code/harnesses/*.json`
 *   3. `<cwd>/.hobo/harnesses/*.json`
 *   4. `registerHarness()` in-process
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	type AdapterContext,
	applyHarnessConfig,
	type HarnessHunk,
	type HarnessKind,
	type HarnessSpec,
} from "./agent-harness-adapters.js";
import type { DetectProbes, KnownAgent } from "./agent-registry.js";
import {
	agentKindOf,
	harnessKindOf,
	isHostSpec,
	parseHarnessSpec,
} from "./harness-spec.js";

export type { HarnessSpec } from "./agent-harness-adapters.js";
export {
	agentKindOf,
	HARNESS_CONFIG_FORMATS,
	HARNESS_SPEC_KINDS,
	HARNESS_SPEC_SCHEMA,
	type HarnessSpecKind,
	HarnessSpecParseError,
	harnessKindOf,
	isHostSpec,
	parseHarnessSpec,
} from "./harness-spec.js";

/** One skipped plugin file: which file, and why parsing rejected it. */
export interface HarnessCatalogDiagnostic {
	readonly file: string;
	readonly message: string;
}

const extras: HarnessSpec[] = [];

export function registerHarness(spec: HarnessSpec): void {
	const i = extras.findIndex((row) => row.id === spec.id);
	if (i >= 0) extras[i] = spec;
	else extras.push(spec);
}

export function resetRegisteredHarnesses(): void {
	extras.length = 0;
}

export function bundledHarnessDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..", "harnesses");
}

function readJsonSpecs(
	dir: string,
	onDiagnostic: (diagnostic: HarnessCatalogDiagnostic) => void,
): HarnessSpec[] {
	if (!existsSync(dir)) return [];
	const out: HarnessSpec[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".json")) continue;
		const file = join(dir, name);
		try {
			out.push(parseHarnessSpec(JSON.parse(readFileSync(file, "utf8"))));
		} catch (error) {
			onDiagnostic({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return out;
}

function warnHarnessDiagnostic(diagnostic: HarnessCatalogDiagnostic): void {
	process.stderr.write(
		`hobo-code: skipped harness spec ${diagnostic.file} — ${diagnostic.message}\n`,
	);
}

function mergeSpecs(
	layers: readonly (readonly HarnessSpec[])[],
): HarnessSpec[] {
	const byId = new Map<string, HarnessSpec>();
	for (const layer of layers) {
		for (const spec of layer) byId.set(spec.id, spec);
	}
	return [...byId.values()];
}

export function loadHarnessCatalog(
	options: {
		readonly hoboHome?: string;
		readonly cwd?: string;
		/** Skipped plugin files land here; defaults to a one-line stderr warning. */
		readonly onDiagnostic?: (diagnostic: HarnessCatalogDiagnostic) => void;
	} = {},
): readonly HarnessSpec[] {
	const onDiagnostic = options.onDiagnostic ?? warnHarnessDiagnostic;
	const user =
		options.hoboHome !== undefined
			? readJsonSpecs(
					join(options.hoboHome, "durable", "code", "harnesses"),
					onDiagnostic,
				)
			: [];
	const project =
		options.cwd !== undefined
			? readJsonSpecs(join(options.cwd, ".hobo", "harnesses"), onDiagnostic)
			: [];
	return mergeSpecs([
		readJsonSpecs(bundledHarnessDir(), onDiagnostic),
		user,
		project,
		extras,
	]);
}

export function knownAgentsFrom(specs: readonly HarnessSpec[]): KnownAgent[] {
	const known: KnownAgent[] = [];
	for (const spec of specs) {
		const kind = agentKindOf(spec);
		if (kind === null) continue;
		known.push({
			id: spec.id,
			label: spec.label,
			kind,
			binaries: spec.binaries ?? [],
			configPaths: spec.configPaths ?? [],
			command: spec.command ?? spec.id,
		});
	}
	return known;
}

/** Back-compat alias for the picks/init kind derivation. */
export const pickKindFromSpec: (spec: HarnessSpec) => HarnessKind =
	harnessKindOf;

export function seatingOrder(specs: readonly HarnessSpec[]): readonly string[] {
	return specs
		.filter((spec) => spec.kind === "coding-agent" && !isHostSpec(spec))
		.slice()
		.sort((left, right) => (left.seat ?? 100) - (right.seat ?? 100))
		.map((spec) => spec.id);
}

export function packageNamesPresent(
	cwd: string,
	names: readonly string[],
): readonly string[] {
	const manifest = join(cwd, "package.json");
	if (!existsSync(manifest)) return [];
	try {
		const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
			readonly dependencies?: Record<string, string>;
			readonly devDependencies?: Record<string, string>;
		};
		const listed = {
			...parsed.dependencies,
			...parsed.devDependencies,
		};
		return names.filter((name) => listed[name] !== undefined);
	} catch {
		return [];
	}
}

export function specEvidence(
	spec: HarnessSpec,
	probes: DetectProbes,
	cwd?: string,
): readonly string[] {
	const evidence: string[] = [];
	for (const binary of spec.binaries ?? []) {
		const resolved = probes.which(binary);
		if (resolved) {
			evidence.push(`bin:${resolved}`);
			break;
		}
	}
	for (const rel of spec.configPaths ?? []) {
		const abs = join(probes.home, rel);
		if (probes.exists(abs)) evidence.push(`config:${abs}`);
	}
	if (cwd) {
		for (const marker of spec.cwdMarkers ?? []) {
			if (existsSync(join(cwd, marker))) evidence.push(`cwd:${marker}`);
		}
		if ((spec.packageNames ?? []).length > 0) {
			const hits = packageNamesPresent(cwd, spec.packageNames ?? []);
			if (hits.length > 0) evidence.push(`pkg:${hits.join(",")}`);
		}
	}
	return evidence;
}

export function planSpecHunks(
	spec: HarnessSpec,
	ctx: AdapterContext,
): {
	readonly kind: HarnessKind;
	readonly hunks: readonly HarnessHunk[];
	readonly notes: readonly string[];
} {
	const kind = harnessKindOf(spec);
	if (isHostSpec(spec)) {
		return {
			kind,
			hunks: [],
			notes: ["skipped — host process, not an agent to seat"],
		};
	}
	const hunks = applyHarnessConfig(spec, ctx);
	const notes =
		spec.config?.format === "skip" && spec.config.note
			? [spec.config.note]
			: [];
	return { kind, hunks, notes };
}
