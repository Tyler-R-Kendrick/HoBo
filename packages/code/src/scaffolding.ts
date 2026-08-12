import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { composeAtoms } from "./atom-compose.js";
import {
	type EmissionDecision,
	emitFromAtoms,
	loadAtomCorpus,
	materializeAtomFiles,
	retrieveAtoms,
} from "./atom-index.js";
import { parseAtomParams } from "./atom-template.js";
import type { ScaffoldResult } from "./types.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_ROOT = join(PACKAGE_ROOT, "templates");

// public-contract: default high-value scaffold id when no atom composition wins.
export const HIGH_VALUE_TEMPLATE_ID = "openui-astryx-bindle" as const;

export interface ScaffoldOptions {
	readonly outputDir: string;
	readonly appName: string;
	readonly templateId?: string;
}

function walkFiles(dir: string, base = dir): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			out.push(...walkFiles(full, base));
		} else {
			out.push(relative(base, full).replace(/\\/g, "/"));
		}
	}
	return out;
}

/**
 * Materialize the high-value OpenUI + Astryx Bindle template with
 * Gherkin linked to OpenFeature. ts-autocode specialization respects
 * konsistent layout + `_generated/` + proof promotion rules.
 */
export function scaffoldHighValueTemplate(
	options: ScaffoldOptions,
): ScaffoldResult {
	const templateId = options.templateId ?? HIGH_VALUE_TEMPLATE_ID;
	const templateDir = join(TEMPLATES_ROOT, templateId);
	if (!existsSync(templateDir)) {
		throw new Error(`template not found: ${templateId}`);
	}
	mkdirSync(options.outputDir, { recursive: true });
	cpSync(templateDir, options.outputDir, { recursive: true });

	// Specialize placeholders for HoBo package layout.
	const packageJsonPath = join(options.outputDir, "package.json");
	if (existsSync(packageJsonPath)) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
			string,
			unknown
		>;
		pkg.name = `@hobo/app-${options.appName}`;
		writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	}

	// Ensure konsistent-shaped dirs for Bindle apps that grow into packages.
	for (const dir of [
		"src",
		"test",
		"contracts",
		"data-models",
		"src/_generated",
	]) {
		mkdirSync(join(options.outputDir, dir), { recursive: true });
	}
	writeFileSync(
		join(options.outputDir, "src/_generated", ".gitkeep"),
		"",
		"utf8",
	);
	writeFileSync(
		join(options.outputDir, "hobo.scaffold.json"),
		JSON.stringify(
			{
				templateId,
				appName: options.appName,
				ui: "openui+astryx",
				smallUiFallback: "aha",
				openFeature: true,
				gherkin: true,
				tsAutocode: true,
				konsistent: true,
				generatedDir: "src/_generated",
			},
			null,
			2,
		),
		"utf8",
	);

	const files = walkFiles(options.outputDir);
	return {
		templateId,
		outputDir: options.outputDir,
		files,
		openFeatureFlag: "app.visual.primary",
		gherkinFeature: "features/visual.feature",
		respectsKonsistent: true,
		respectsGenerated: true,
	};
}

export interface SuccessRateSample {
	readonly templateId: string;
	readonly attempts: number;
	readonly successes: number;
	readonly rate: number;
}

/**
 * Measurement path for agent success rate on the canonical high-value template.
 * Callers append samples; rate is successes/attempts.
 */
export function measureTemplateSuccessRate(
	samples: readonly { success: boolean }[],
	templateId: string = HIGH_VALUE_TEMPLATE_ID,
): SuccessRateSample {
	const attempts = samples.length;
	const successes = samples.filter((s) => s.success).length;
	return {
		templateId,
		attempts,
		successes,
		rate: attempts === 0 ? 0 : successes / attempts,
	};
}

export interface ScaffoldFromIntentOptions {
	readonly outputDir: string;
	readonly appName: string;
	readonly intent: string;
	readonly params?: Readonly<Record<string, string>>;
	readonly allowEscalate?: boolean;
}

export interface ScaffoldFromAtomsOptions {
	readonly outputDir: string;
	readonly appName: string;
	readonly atomIds: readonly string[];
	readonly params?: Readonly<Record<string, string>>;
}

export interface AtomScaffoldResult {
	readonly ok: boolean;
	readonly source: "atoms" | "none";
	readonly decision: EmissionDecision;
	readonly fallback?: "llm";
	readonly result?: ScaffoldResult;
}

function ensureKonsistentDirs(outputDir: string): void {
	for (const dir of [
		"src",
		"test",
		"contracts",
		"data-models",
		"src/_generated",
	]) {
		mkdirSync(join(outputDir, dir), { recursive: true });
	}
	writeFileSync(join(outputDir, "src/_generated", ".gitkeep"), "", "utf8");
}

function toScaffoldResult(
	templateId: string,
	outputDir: string,
	openFeatureFlag: string,
	gherkinFeature: string,
): ScaffoldResult {
	return {
		templateId,
		outputDir,
		files: walkFiles(outputDir),
		openFeatureFlag,
		gherkinFeature,
		respectsKonsistent: true,
		respectsGenerated: true,
	};
}

/**
 * Retrieve → compose → Valibot → fill → write. Additive to
 * scaffoldHighValueTemplate. Low-confidence intents refuse.
 */
export function scaffoldFromIntent(
	options: ScaffoldFromIntentOptions,
): AtomScaffoldResult {
	const retrieved = retrieveAtoms(
		options.intent,
		options.allowEscalate !== undefined
			? { allowEscalate: options.allowEscalate }
			: {},
	);
	if (!retrieved.ok) {
		return {
			ok: false,
			source: "none",
			decision: retrieved.decision,
			fallback: "llm",
		};
	}
	const emitted = emitFromAtoms({
		intent: options.intent,
		outputDir: options.outputDir,
		params: { name: options.appName, ...options.params },
		...(options.allowEscalate !== undefined
			? { allowEscalate: options.allowEscalate }
			: {}),
	});
	if (!emitted.ok) {
		return {
			ok: false,
			source: "none",
			decision: emitted.decision,
			...(emitted.fallback !== undefined ? { fallback: emitted.fallback } : {}),
		};
	}
	ensureKonsistentDirs(options.outputDir);
	const openFeature = emitted.files.some((file) => file.includes("flags"));
	const gherkin = emitted.files.find((file) => file.endsWith(".feature"));
	writeFileSync(
		join(options.outputDir, "hobo.scaffold.json"),
		JSON.stringify(
			{
				templateId: emitted.compositionId ?? retrieved.atoms[0]?.id ?? "atoms",
				appName: options.appName,
				source: "atoms",
				intent: options.intent,
				decision: "emit",
				atomIds: retrieved.atoms.map((atom) => atom.id),
				tsAutocode: true,
				konsistent: true,
				generatedDir: "src/_generated",
			},
			null,
			2,
		),
		"utf8",
	);
	return {
		ok: true,
		source: "atoms",
		decision: "emit",
		result: toScaffoldResult(
			emitted.compositionId ?? retrieved.atoms[0]?.id ?? "atoms",
			options.outputDir,
			openFeature ? "app.feature.primary" : "",
			gherkin ?? "",
		),
	};
}

/** Emit an explicit atom set after compose + Valibot. Skips retrieval. */
export function scaffoldFromAtoms(
	options: ScaffoldFromAtomsOptions,
): AtomScaffoldResult {
	const corpus = loadAtomCorpus();
	const selected = options.atomIds
		.map((id) => corpus.atoms.find((atom) => atom.id === id))
		.filter((atom): atom is NonNullable<typeof atom> => atom !== undefined);
	if (selected.length !== options.atomIds.length) {
		return { ok: false, source: "none", decision: "refuse" };
	}
	const composed = composeAtoms(selected, corpus.atoms);
	if (!composed.ok) {
		return { ok: false, source: "none", decision: "refuse" };
	}
	const parsed = parseAtomParams(composed.atoms, {
		name: options.appName,
		...options.params,
	});
	if (!parsed.ok) {
		return { ok: false, source: "none", decision: "refuse" };
	}
	const materialized = materializeAtomFiles(composed.atoms, parsed.params);
	if (!materialized.ok) {
		return { ok: false, source: "none", decision: "refuse" };
	}
	mkdirSync(options.outputDir, { recursive: true });
	for (const [relativePath, body] of materialized.files) {
		const target = join(options.outputDir, relativePath);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, body);
	}
	ensureKonsistentDirs(options.outputDir);
	writeFileSync(
		join(options.outputDir, "hobo.scaffold.json"),
		JSON.stringify(
			{
				templateId: options.atomIds[0] ?? "atoms",
				appName: options.appName,
				source: "atoms",
				atomIds: composed.atoms.map((atom) => atom.id),
				tsAutocode: true,
				konsistent: true,
				generatedDir: "src/_generated",
			},
			null,
			2,
		),
		"utf8",
	);
	return {
		ok: true,
		source: "atoms",
		decision: "emit",
		result: toScaffoldResult(
			options.atomIds[0] ?? "atoms",
			options.outputDir,
			"",
			"",
		),
	};
}

/** ts-autocode specialization hooks for HoBo conventions. */
export function tsAutocodeConventions(): {
	readonly packageLayout: readonly string[];
	readonly generatedDir: string;
	readonly proofPromotion: boolean;
	readonly konsistent: boolean;
	readonly bindleTopology: boolean;
} {
	return {
		packageLayout: [
			"package.json",
			"tsconfig.json",
			"src/",
			"test/",
			"contracts/",
			"data-models/",
		],
		generatedDir: "src/_generated",
		proofPromotion: true,
		konsistent: true,
		bindleTopology: true,
	};
}
