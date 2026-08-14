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
	type AgentKind,
	type DetectProbes,
	type KnownAgent,
} from "./agent-registry.js";
import {
	type AdapterContext,
	applyHarnessConfig,
	type HarnessKind,
	type HarnessHunk,
	type HarnessSpec,
} from "./agent-harness-adapters.js";

export type { HarnessSpec } from "./agent-harness-adapters.js";

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

function readJsonSpecs(dir: string): HarnessSpec[] {
	if (!existsSync(dir)) return [];
	const out: HarnessSpec[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".json")) continue;
		try {
			const raw = JSON.parse(
				readFileSync(join(dir, name), "utf8"),
			) as Partial<HarnessSpec>;
			if (typeof raw.id !== "string" || raw.id.length === 0) continue;
			if (typeof raw.label !== "string" || typeof raw.kind !== "string") {
				continue;
			}
			out.push(raw as HarnessSpec);
		} catch {
			/* skip unparseable plugin */
		}
	}
	return out;
}

function mergeSpecs(layers: readonly (readonly HarnessSpec[])[]): HarnessSpec[] {
	const byId = new Map<string, HarnessSpec>();
	for (const layer of layers) {
		for (const spec of layer) byId.set(spec.id, spec);
	}
	return [...byId.values()];
}

export function loadHarnessCatalog(options: {
	readonly hoboHome?: string;
	readonly cwd?: string;
} = {}): readonly HarnessSpec[] {
	const user =
		options.hoboHome !== undefined
			? readJsonSpecs(join(options.hoboHome, "durable", "code", "harnesses"))
			: [];
	const project =
		options.cwd !== undefined
			? readJsonSpecs(join(options.cwd, ".hobo", "harnesses"))
			: [];
	return mergeSpecs([readJsonSpecs(bundledHarnessDir()), user, project, extras]);
}

export function knownAgentsFrom(
	specs: readonly HarnessSpec[],
): KnownAgent[] {
	return specs
		.filter(
			(spec) =>
				spec.kind === "coding-agent" ||
				spec.kind === "inference" ||
				spec.kind === "harness",
		)
		.map((spec) => ({
			id: spec.id,
			label: spec.label,
			kind: spec.kind as AgentKind,
			binaries: spec.binaries ?? [],
			configPaths: spec.configPaths ?? [],
			command: spec.command ?? spec.id,
		}));
}

export function pickKindFromSpec(spec: HarnessSpec): HarnessKind {
	if (spec.host === true || spec.kind === "harness") return "acp";
	if (spec.kind === "inference") return "inference";
	if (spec.kind === "eve-agent") return "eve-agent";
	if (spec.kind === "sdk") return "sdk";
	return "coding-cli";
}

export function isHostSpec(spec: HarnessSpec): boolean {
	return spec.host === true || spec.kind === "harness";
}

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
	const kind = pickKindFromSpec(spec);
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
