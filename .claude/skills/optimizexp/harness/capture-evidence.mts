#!/usr/bin/env node
/**
 * OptimizeXP evidence harness — drive scenarios and capture persona-visible evidence.
 *
 * node --import tsx .agents/skills/optimizexp/harness/capture-evidence.mts --help
 * node --experimental-strip-types .agents/skills/optimizexp/harness/capture-evidence.mts --help
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
	rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { captureCli } from "./drivers/cli.mts";
import { captureTui } from "./drivers/tui.mts";
import { captureWeb } from "./drivers/web.mts";
import { captureNative } from "./drivers/native.mts";
import {
	clearPrimaryArtifacts,
	fileBytes,
	sha256File,
	tryStitchFrames,
	writeJson,
} from "./lib/media.mts";
import {
	evidenceDir,
	featureDir,
	featuresRoot,
	repoRoot,
} from "./lib/paths.mts";
import { scenarioSlug } from "./lib/slug.mts";

type FeatureMeta = {
	id: string;
	title?: string;
	experiences?: string[];
	personas?: string[];
	interfaces?: string[];
	driver?: string;
	surfaces?: string[];
	tags?: string[];
};

function parseArgs(argv: string[]) {
	const out: Record<string, string> = { mode: "help" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") out.mode = "help";
		else if (a === "--mode") out.mode = argv[++i] ?? "help";
		else if (a === "--id" || a === "--feature") out.feature = argv[++i] ?? "";
		else if (a === "--scenario") out.scenario = argv[++i] ?? "";
		else if (a === "--driver") out.driver = argv[++i] ?? "";
		else if (a === "--command") out.command = argv[++i] ?? "";
		else if (a === "--url") out.url = argv[++i] ?? "";
		else if (a === "--native-cmd") out.nativeCmd = argv[++i] ?? "";
		else if (a === "--run-id") out.runId = argv[++i] ?? "";
		else if (a === "--personas") out.personas = argv[++i] ?? "";
		else if (a === "--experiences") out.experiences = argv[++i] ?? "";
		else if (a === "--title") out.title = argv[++i] ?? "";
		else if (a === "--strict") out.strict = "1";
		else if (!a.startsWith("-") && out.mode === "help") out.mode = a;
	}
	return out;
}

function help() {
	console.log(`optimizexp capture-evidence

Modes:
  init-feature   --id <slug> [--title …] [--personas a,b] [--experiences dx] [--driver cli]
  list-scenarios --feature <id>
  capture        --feature <id> --scenario <slug|title> [--driver cli|tui|web|native]
                 [--command '…'] [--url https://…] [--native-cmd '…'] [--run-id …]
  stitch         --feature <id> --scenario <slug>
  validate       [--feature <id>] [--strict]

Evidence is written to:
  .optimizexp/features/<feature>/evidence/<scenario-slug>/
and overwrites the previous primary artifact for that scenario.
`);
}

function loadFeature(featureId: string, root: string): FeatureMeta {
	const p = path.join(featureDir(featureId, root), "feature.json");
	if (!existsSync(p)) throw new Error(`missing feature.json for ${featureId}`);
	return JSON.parse(readFileSync(p, "utf8")) as FeatureMeta;
}

function initFeature(args: Record<string, string>) {
	const root = repoRoot();
	const id = args.feature || args.id;
	if (!id) {
		console.error("--id required");
		process.exit(2);
	}
	const dir = featureDir(id, root);
	mkdirSync(path.join(dir, "evidence"), { recursive: true });
	mkdirSync(path.join(dir, "steps"), { recursive: true });
	const personas = (args.personas || "developer")
		.split(/[,\s]+/)
		.filter(Boolean);
	const experiences = (args.experiences || "dx")
		.split(/[,\s]+/)
		.filter(Boolean);
	const driver = args.driver || "cli";
	const title = args.title || id;
	const meta: FeatureMeta = {
		id,
		title,
		experiences,
		personas,
		interfaces: [driver === "web" ? "gui" : driver],
		driver,
		surfaces: [],
		tags: ["@optimizexp"],
	};
	writeJson(path.join(dir, "feature.json"), meta);
	const featureFile = path.join(dir, `${id}.feature`);
	if (!existsSync(featureFile)) {
		const personaTag = personas.map((p) => `@persona:${p}`).join(" ");
		writeFileSync(
			featureFile,
			`@optimizexp ${personaTag} @interface:${driver}
Feature: ${title}
  As a persona under optimizexp review
  I want a reproducible journey with captured evidence
  So that harms, friction, and uncertainty can be scored against what I see

  Scenario: Placeholder scenario for ${id}
    Given persona "${personas[0]}" is active
    When the surface under test is exercised
    Then evidence is captured under evidence/
`,
			"utf8",
		);
	}
	if (!existsSync(path.join(dir, "README.md"))) {
		writeFileSync(
			path.join(dir, "README.md"),
			`# ${title}\n\nFeature id: \`${id}\`\n\nPersonas: ${personas.join(", ")}\n\nEvidence: \`evidence/<scenario-slug>/\` (one primary recording per scenario; new runs overwrite).\n`,
			"utf8",
		);
	}
	console.log(JSON.stringify({ ok: true, dir, meta }, null, 2));
}

function parseScenarios(featureId: string, root: string) {
	const dir = featureDir(featureId, root);
	const files = readdirSync(dir).filter((f) => f.endsWith(".feature"));
	const scenarios: { name: string; slug: string; file: string }[] = [];
	for (const f of files) {
		const text = readFileSync(path.join(dir, f), "utf8");
		for (const line of text.split(/\r?\n/)) {
			const m = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)\s*$/);
			if (m) {
				const name = m[1]!.trim();
				scenarios.push({ name, slug: scenarioSlug(name), file: f });
			}
		}
	}
	return scenarios;
}

function listScenarios(featureId: string) {
	const root = repoRoot();
	const scenarios = parseScenarios(featureId, root);
	console.log(JSON.stringify({ featureId, scenarios }, null, 2));
}

function resolveScenarioSlug(
	featureId: string,
	scenarioArg: string,
	root: string,
): string {
	const slug = scenarioSlug(scenarioArg);
	const known = parseScenarios(featureId, root);
	const hit = known.find((s) => s.slug === slug || s.name === scenarioArg);
	return hit?.slug ?? slug;
}

function capture(args: Record<string, string>) {
	const root = repoRoot();
	const featureId = args.feature;
	if (!featureId) {
		console.error("--feature required");
		process.exit(2);
	}
	const meta = loadFeature(featureId, root);
	const scenario = resolveScenarioSlug(
		featureId,
		args.scenario || "default",
		root,
	);
	const outDir = evidenceDir(featureId, scenario, root);
	mkdirSync(outDir, { recursive: true });
	const hadPrevious = clearPrimaryArtifacts(outDir);
	// clear stale handoff scripts
	for (const f of readdirSync(outDir)) {
		if (f.startsWith("_")) rmSync(path.join(outDir, f), { force: true });
	}

	const driver = (args.driver || meta.driver || "cli").toLowerCase();
	const runId = args.runId || "";
	const personaIds = meta.personas || [];

	let primaryFile = "";
	let kind = "transcript";
	let screen: Record<string, unknown> = {};
	let degraded = false;
	let notes: string[] = [];
	let exitCode: number | null = null;
	let repro: Record<string, unknown> = {};

	if (driver === "cli") {
		const command = args.command || meta.surfaces?.[0];
		if (!command) {
			console.error("--command required for cli driver (or feature.surfaces[0])");
			process.exit(2);
		}
		const r = captureCli(outDir, { command, cwd: root });
		primaryFile = r.primaryFile;
		kind = r.kind;
		screen = r.screen;
		exitCode = r.exitCode;
		repro = { command, cwd: "." };
	} else if (driver === "tui") {
		const command = args.command || meta.surfaces?.[0];
		if (!command) {
			console.error("--command required for tui driver");
			process.exit(2);
		}
		const r = captureTui(outDir, { command, cwd: root });
		primaryFile = r.castFile || r.primaryFile;
		kind = r.castFile ? "recording" : r.kind;
		screen = r.screen;
		exitCode = r.exitCode;
		degraded = r.degraded;
		notes = r.notes;
		repro = { command, cwd: "." };
	} else if (driver === "web") {
		const url = args.url || meta.surfaces?.[0];
		if (!url) {
			console.error("--url required for web driver");
			process.exit(2);
		}
		const r = captureWeb(outDir, { url, cwd: root, video: true });
		primaryFile = r.primaryFile;
		kind = r.kind;
		screen = r.screen;
		degraded = r.degraded;
		notes = r.notes;
		repro = { url };
	} else if (driver === "native") {
		const r = captureNative(outDir, {
			command: args.nativeCmd,
			cwd: root,
		});
		primaryFile = r.primaryFile;
		kind = r.kind;
		screen = r.screen;
		degraded = r.degraded;
		notes = r.notes;
		repro = { nativeCmd: args.nativeCmd || process.env.OPTIMIZEXP_NATIVE_CAPTURE };
	} else {
		console.error(`unknown driver: ${driver}`);
		process.exit(2);
	}

	const primaryName = path.basename(primaryFile);
	// ensure primary.* naming
	if (!primaryName.startsWith("primary.")) {
		const dest = path.join(
			outDir,
			`primary${path.extname(primaryFile) || ".bin"}`,
		);
		if (primaryFile !== dest && existsSync(primaryFile)) {
			writeFileSync(dest, readFileSync(primaryFile));
			primaryFile = dest;
		}
	}

	const metaOut = {
		featureId,
		scenarioSlug: scenario,
		personaIds,
		interface: driver,
		driver,
		capturedAt: new Date().toISOString(),
		runId,
		screen,
		primary: {
			file: path.basename(primaryFile),
			kind,
			bytes: fileBytes(primaryFile),
			sha256: existsSync(primaryFile) ? sha256File(primaryFile) : null,
		},
		frames: existsSync(path.join(outDir, "frames"))
			? readdirSync(path.join(outDir, "frames"))
			: [],
		repro,
		exitCode,
		degraded,
		notes,
	};
	writeJson(path.join(outDir, "meta.json"), metaOut);
	writeJson(path.join(outDir, "manifest.json"), {
		scenarioSlug: scenario,
		primaryPath: path.basename(primaryFile),
		kind,
		updatedAt: metaOut.capturedAt,
		overridesPrevious: hadPrevious,
	});

	console.log(
		JSON.stringify(
			{
				ok: true,
				featureId,
				scenario,
				path: path.relative(root, outDir),
				primary: path.relative(root, primaryFile),
				kind,
				overridesPrevious: hadPrevious,
				degraded,
				notes,
			},
			null,
			2,
		),
	);
}

function stitch(args: Record<string, string>) {
	const root = repoRoot();
	const featureId = args.feature;
	const scenario = resolveScenarioSlug(
		featureId!,
		args.scenario || "",
		root,
	);
	if (!featureId || !scenario) {
		console.error("--feature and --scenario required");
		process.exit(2);
	}
	const outDir = evidenceDir(featureId, scenario, root);
	const framesDir = path.join(outDir, "frames");
	const result = tryStitchFrames(framesDir, path.join(outDir, "_stitch"));
	if (!result) {
		console.error("no frames to stitch or stitch failed");
		process.exit(1);
	}
	const ext = path.extname(result.file) || ".bin";
	const primary = path.join(outDir, `primary${ext}`);
	const bytes = readFileSync(result.file);
	clearPrimaryArtifacts(outDir);
	writeFileSync(primary, bytes);
	if (result.file.startsWith(path.join(outDir, "_stitch"))) {
		rmSync(result.file, { force: true });
	}
	const metaPath = path.join(outDir, "meta.json");
	const meta = existsSync(metaPath)
		? (JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>)
		: {};
	meta.primary = {
		file: path.basename(primary),
		kind: result.kind,
		bytes: fileBytes(primary),
		sha256: sha256File(primary),
	};
	meta.capturedAt = new Date().toISOString();
	writeJson(metaPath, meta);
	writeJson(path.join(outDir, "manifest.json"), {
		scenarioSlug: scenario,
		primaryPath: path.basename(primary),
		kind: result.kind,
		updatedAt: meta.capturedAt,
		overridesPrevious: true,
	});
	console.log(
		JSON.stringify(
			{ ok: true, primary: path.relative(root, primary), kind: result.kind },
			null,
			2,
		),
	);
}

function validate(args: Record<string, string>) {
	const root = repoRoot();
	const base = featuresRoot(root);
	const strict = args.strict === "1" || args.strict === "true";
	if (!existsSync(base)) {
		console.log(JSON.stringify({ ok: true, features: 0, problems: [], missing: [] }));
		return;
	}
	const features = args.feature
		? [args.feature]
		: readdirSync(base).filter((d) =>
				existsSync(path.join(base, d, "feature.json")),
			);
	const problems: string[] = [];
	const missing: string[] = [];
	for (const id of features) {
		const scenarios = parseScenarios(id, root);
		for (const s of scenarios) {
			const dir = evidenceDir(id, s.slug, root);
			const man = path.join(dir, "manifest.json");
			if (!existsSync(man)) {
				missing.push(`${id}/${s.slug}`);
				if (strict) {
					problems.push(`${id}/${s.slug}: missing evidence/manifest.json`);
				}
				continue;
			}
			const m = JSON.parse(readFileSync(man, "utf8")) as {
				primaryPath?: string;
			};
			if (!m.primaryPath || !existsSync(path.join(dir, m.primaryPath))) {
				problems.push(`${id}/${s.slug}: primary missing`);
			}
			const primaries = existsSync(dir)
				? readdirSync(dir).filter((f) => f.startsWith("primary."))
				: [];
			if (primaries.length > 1) {
				problems.push(
					`${id}/${s.slug}: multiple primary.* files: ${primaries.join(",")}`,
				);
			}
		}
		// also validate any evidence dirs that exist without scenarios
		const eRoot = path.join(featureDir(id, root), "evidence");
		if (existsSync(eRoot)) {
			for (const slug of readdirSync(eRoot)) {
				const dir = path.join(eRoot, slug);
				const man = path.join(dir, "manifest.json");
				if (!existsSync(man)) {
					problems.push(`${id}/${slug}: evidence dir without manifest.json`);
				}
			}
		}
	}
	const ok = problems.length === 0;
	console.log(
		JSON.stringify(
			{ ok, features: features.length, problems, missing, strict },
			null,
			2,
		),
	);
	if (!ok) process.exitCode = 1;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const mode = args.mode || "help";
	if (mode === "help") return help();
	if (mode === "init-feature") return initFeature(args);
	if (mode === "list-scenarios") {
		if (!args.feature) {
			console.error("--feature required");
			process.exit(2);
		}
		return listScenarios(args.feature);
	}
	if (mode === "capture") return capture(args);
	if (mode === "stitch") return stitch(args);
	if (mode === "validate") return validate(args);
	console.error(`unknown mode: ${mode}`);
	help();
	process.exit(2);
}

main();
