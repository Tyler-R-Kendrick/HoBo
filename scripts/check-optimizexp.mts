/**
 * OptimizeXP drift-protection gate (`pnpm run optimizexp:check`).
 *
 * Hard-fail lanes (reusing the skill harness — import/spawn, never duplicate):
 *   a. Persona schema validation across the global tree (`.optimizexp/personas/`)
 *      and project-local trees (`packages/<pkg>/.optimizexp/personas/`) via the
 *      skill's `generate-persona.mts --mode validate` CLI (the harness modules
 *      execute `main()` on import, so they are spawned, not imported).
 *   b. Feature-quality/template lint over `.optimizexp/features/**` (plus
 *      project-local feature trees) via `checkGherkinQuality` from the skill's
 *      `lib/feature-quality.mts` — bans template-only "exercise the surface"
 *      Gherkin and missing `@persona:`/`@interface:` tags.
 *
 *   c. `validate-bus` over `.optimizexp/bus/entries/` via the review-loop CLI.
 *      The 282 legacy entries that predated the current scorecard-evidence
 *      contract were archived to `.optimizexp/bus-archive/` (not scanned), so
 *      this lane is a hard fail. New runs are additionally gated per-run by
 *      `assert-complete` inside the review loop itself.
 *
 * Usage: node --import tsx scripts/check-optimizexp.mts
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkGherkinQuality } from "../.agents/skills/optimizexp/harness/lib/feature-quality.mts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runHarness(script: string, args: string[]) {
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", path.join(root, script), ...args],
		{ cwd: root, encoding: "utf8" },
	);
	if (result.error) throw result.error;
	return {
		status: result.status ?? 2,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

type PersonaReport = {
	ok: boolean;
	personas: { id: string; path: string; scope: string; problems: string[] }[];
};

/** Lane (a): persona schema validation. */
function checkPersonas(): string[] {
	const generatePersona =
		".agents/skills/optimizexp/harness/generate-persona.mts";
	const full = runHarness(generatePersona, ["--mode", "validate"]);
	let report: PersonaReport;
	try {
		report = JSON.parse(full.stdout) as PersonaReport;
	} catch {
		return [
			`persona validator did not emit JSON (exit ${full.status}): ${full.stderr.slice(0, 400)}`,
		];
	}
	if (full.status === 0 && report.ok) {
		console.log(
			`personas: OK (${report.personas.length} personas, all projects)`,
		);
		return [];
	}
	return report.personas
		.filter((p) => p.problems.length > 0)
		.map((p) => `${p.path}: ${p.problems.join("; ")}`);
}

/** Feature-folder roots mirroring `.optimizexp/cucumber.yaml` path globs. */
function featureDirs(): string[] {
	const roots = [
		".optimizexp/features",
		...["site", "packages", "examples", "src/draft/projects"].flatMap(
			(parent) => {
				const abs = path.join(root, parent);
				if (!existsSync(abs)) return [];
				return readdirSync(abs)
					.map((child) => path.join(parent, child, ".optimizexp/features"))
					.filter((rel) => existsSync(path.join(root, rel)));
			},
		),
	];
	const dirs: string[] = [];
	for (const rel of roots) {
		const abs = path.join(root, rel);
		for (const entry of readdirSync(abs)) {
			const dir = path.join(abs, entry);
			if (statSync(dir).isDirectory()) dirs.push(dir);
		}
	}
	return dirs;
}

/** Lane (b): feature-quality/template lint. */
function checkFeatureQuality(): string[] {
	const problems: string[] = [];
	const dirs = featureDirs();
	for (const dir of dirs) {
		const result = checkGherkinQuality(dir);
		for (const problem of result.problems) {
			problems.push(`${path.relative(root, dir)}: ${problem}`);
		}
	}
	if (problems.length === 0) {
		console.log(`feature-quality: OK (${dirs.length} feature folders)`);
	}
	return problems;
}

/** Lane (c): bus validation (hard fail). */
function checkBus(): string[] {
	const reviewLoop =
		".agents/skills/optimizexp/workflows/cross-agent/review-loop.mts";
	const result = runHarness(reviewLoop, ["--mode", "validate-bus"]);
	let report: { ok?: boolean; entries?: number; problems?: string[] };
	try {
		report = JSON.parse(result.stdout) as typeof report;
	} catch {
		return [
			`bus: validate-bus did not emit JSON (exit ${result.status}): ${result.stderr.slice(0, 400)}`,
		];
	}
	if (result.status === 0 && report.ok) {
		console.log(`bus: OK (${report.entries ?? 0} entries)`);
		return [];
	}
	return (report.problems ?? []).map((p) => `bus: ${p}`);
}

const problems = [...checkPersonas(), ...checkFeatureQuality(), ...checkBus()];

if (problems.length > 0) {
	console.error(`\noptimizexp:check FAILED (${problems.length} problem(s)):`);
	for (const problem of problems.slice(0, 20)) {
		console.error(`  ✗ ${problem}`);
	}
	if (problems.length > 20) {
		console.error(`  … and ${problems.length - 20} more`);
	}
	process.exit(1);
}
console.log("\noptimizexp:check OK");
