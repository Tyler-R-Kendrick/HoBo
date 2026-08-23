/**
 * Evals sidecar: always-on same-Camp host for gold (exact-match) and
 * silver (property/fuzz) suites over trainable regions.
 * Project eval tests and trainable-region overlays are optional extras.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { GOLDEN_DEFAULT_SUITE_ID, SILVER_DEFAULT_SUITE_ID } from "@hobo/evals";
import {
	cloneAsJson,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

// public-contract: occupancy name of the always-on trainable evals sidecar
export const EVAL_SIDECAR_NAME = "evals" as const;
// public-contract: evals sidecar lives in the app Camp, not as a Bindle kind
export const EVAL_SIDECAR_HOSTING = "same-camp" as const;

const SCRIPT_CANDIDATES = [
	"test:eval",
	"test:evals",
	"eval",
	"eval:live",
	"eval:mock",
] as const;

const EVAL_FILE = /\.eval\.(test|spec)\.[cm]?[jt]sx?$/u;
const SUITE_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/u;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	".git",
	".hobo",
	"coverage",
	"test",
	"tests",
]);
const SCAN_ROOTS = ["src", "app", "lib"] as const;

export interface ProjectEvalTests {
	readonly source: "project-test-suite";
	readonly command: string;
	readonly files: readonly string[];
}

export type TrainableRegionForm =
	| "directive"
	| "define"
	| "training"
	| "decorator";

export interface TrainableExample {
	readonly input: JsonValue;
	// `JsonValue`, matching `input`: the only producer runs the value through
	// `cloneAsJson`, which returns exactly that. Declaring `unknown` threw the
	// narrowing away at the boundary and left every consumer — the golden-case
	// and fuzz-seed builders among them — unable to accept a value that was
	// already JSON.
	readonly output: JsonValue;
}

export interface TrainableRegion {
	readonly methodRef: string;
	readonly file: string;
	readonly form: TrainableRegionForm;
	readonly grounded: boolean;
	readonly examples: readonly TrainableExample[];
}

export interface GoldenDefaultSuiteRef {
	readonly id: typeof GOLDEN_DEFAULT_SUITE_ID;
	readonly source: "trainable-exact-match";
}

export interface SilverDefaultSuiteRef {
	readonly id: typeof SILVER_DEFAULT_SUITE_ID;
	readonly source: "trainable-property-fuzz";
}

export interface CampEvalSidecar {
	readonly kind: "sidecar";
	readonly name: typeof EVAL_SIDECAR_NAME;
	readonly hosting: typeof EVAL_SIDECAR_HOSTING;
	readonly campId: string;
	readonly defaultSuite: GoldenDefaultSuiteRef;
	readonly silverSuite: SilverDefaultSuiteRef;
	readonly trainable: readonly TrainableRegion[];
	readonly project?: ProjectEvalTests;
}

export interface AssembleEvalSidecarInput {
	readonly tests?: ProjectEvalTests;
	readonly trainable?: readonly TrainableRegion[];
}

export function inspectProjectEvalTests(
	projectDir: string,
): ProjectEvalTests | undefined {
	const command = evalScriptCommand(projectDir);
	const files = listEvalTestFiles(projectDir);
	if (!command && files.length === 0) return undefined;
	return {
		source: "project-test-suite",
		command: command ?? `pnpm test -- ${files.join(" ")}`,
		files,
	};
}

export async function loadTrainableInvokers(
	projectDir: string,
	regions: readonly TrainableRegion[],
): Promise<
	Readonly<Record<string, (input: JsonValue | undefined) => JsonValue>>
> {
	const invokers: Record<string, (input: JsonValue | undefined) => JsonValue> =
		{};
	for (const region of regions) {
		const short = region.methodRef.split(".").pop() ?? region.methodRef;
		for (const file of invokerCandidateFiles(region.file)) {
			const abs = join(projectDir, file);
			if (!existsSync(abs)) continue;
			try {
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				const mod = (await import(pathToFileURL(abs).href)) as JsonObject;
				const candidate = pickInvokerExport(mod, short);
				if (candidate) {
					invokers[region.methodRef] = (input: JsonValue | undefined) =>
						candidate(input);
					break;
				}
			} catch {
				// Try the next compiled sibling; silver stays fail-closed if none load.
			}
		}
	}
	return invokers;
}

function invokerCandidateFiles(file: string): readonly string[] {
	const out: string[] = [];
	const push = (next: string) => {
		if (!out.includes(next)) out.push(next);
	};
	if (/\.[cm]?js$/u.test(file)) push(file);
	const base = file.replace(/\.[cm]?[jt]sx?$/u, "");
	for (const ext of [".js", ".mjs", ".cjs"]) push(`${base}${ext}`);
	if (/^src[/\\]/u.test(base)) {
		const distBase = `dist/${base.slice(4)}`;
		for (const ext of [".js", ".mjs", ".cjs"]) push(`${distBase}${ext}`);
	}
	return out;
}

function asInvoker<T>(
	value: T,
): ((input: JsonValue | undefined) => JsonValue) | undefined {
	if (!(value instanceof Function)) return undefined;
	return (input) => cloneAsJson(value(input));
}

function pickInvokerExport(
	mod: JsonObject,
	short: string,
): ((input: JsonValue | undefined) => JsonValue) | undefined {
	const named = asInvoker(mod[short]);
	if (named) return named;
	const fallbacks = [mod.default, mod.fn, mod];
	for (const value of fallbacks) {
		const invoker = asInvoker(value);
		if (invoker) return invoker;
		if (value && isJsonObject(value)) {
			const nested = asInvoker(value[short]);
			if (nested) return nested;
		}
	}
	return undefined;
}

export function inspectTrainableRegions(
	projectDir: string,
): readonly TrainableRegion[] {
	const found: TrainableRegion[] = [];
	const seen = new Set<string>();
	for (const file of listSourceFiles(projectDir)) {
		let source: string;
		try {
			source = readFileSync(join(projectDir, file), "utf8");
		} catch {
			continue;
		}
		for (const region of parseTrainableRegions(file, source)) {
			if (seen.has(region.methodRef)) continue;
			seen.add(region.methodRef);
			found.push(region);
		}
	}
	return found.sort((left, right) =>
		left.methodRef.localeCompare(right.methodRef),
	);
}

export function campEvalSidecar(
	campId: string,
	input: AssembleEvalSidecarInput = {},
): CampEvalSidecar {
	const trainable = input.trainable ?? [];
	const project = input.tests;
	return {
		kind: "sidecar",
		name: EVAL_SIDECAR_NAME,
		hosting: EVAL_SIDECAR_HOSTING,
		campId,
		defaultSuite: {
			id: GOLDEN_DEFAULT_SUITE_ID,
			source: "trainable-exact-match",
		},
		silverSuite: {
			id: SILVER_DEFAULT_SUITE_ID,
			source: "trainable-property-fuzz",
		},
		trainable,
		...(project !== undefined ? { project } : undefined),
	};
}

function evalScriptCommand(projectDir: string): string | undefined {
	const manifest = readPackageScripts(projectDir);
	if (!manifest) return undefined;
	for (const name of SCRIPT_CANDIDATES) {
		if (isJsonString(manifest[name]) && manifest[name].length > 0) {
			return `pnpm run ${name}`;
		}
	}
	return undefined;
}

function readPackageScripts(
	projectDir: string,
): Readonly<Record<string, string>> | undefined {
	const path = join(projectDir, "package.json");
	if (!existsSync(path)) return undefined;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			scripts?: unknown;
		};
		if (!parsed.scripts || !isJsonObject(parsed.scripts)) return undefined;
		const scripts: Record<string, string> = {};
		for (const [key, value] of Object.entries(
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			parsed.scripts as JsonObject,
		)) {
			if (isJsonString(value) && value.length > 0) scripts[key] = value;
		}
		return scripts;
	} catch {
		return undefined;
	}
}

function listEvalTestFiles(projectDir: string): readonly string[] {
	const found = new Set<string>();
	for (const file of listDirFiles(join(projectDir, "evals"))) {
		if (SUITE_FILE.test(file) || EVAL_FILE.test(file)) {
			found.add(join("evals", file));
		}
	}
	for (const file of listDirFiles(join(projectDir, "test", "evals"))) {
		if (SUITE_FILE.test(file) || EVAL_FILE.test(file)) {
			found.add(join("test", "evals", file));
		}
	}
	for (const file of listDirFiles(join(projectDir, "test"))) {
		if (EVAL_FILE.test(file)) found.add(join("test", file));
	}
	return [...found].sort((left, right) => left.localeCompare(right));
}

function listDirFiles(dir: string): readonly string[] {
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
	return readdirSync(dir).filter((name) => {
		try {
			return statSync(join(dir, name)).isFile();
		} catch {
			return false;
		}
	});
}

function listSourceFiles(projectDir: string): readonly string[] {
	const files: string[] = [];
	const visit = (abs: string): void => {
		if (files.length >= 200) return;
		let entries: string[];
		try {
			entries = readdirSync(abs);
		} catch {
			return;
		}
		for (const name of entries) {
			if (files.length >= 200) return;
			if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
			const next = join(abs, name);
			let stats: ReturnType<typeof statSync>;
			try {
				stats = statSync(next);
			} catch {
				continue;
			}
			if (stats.isDirectory()) {
				visit(next);
				continue;
			}
			if (!stats.isFile() || stats.size > 256_000) continue;
			if (!SOURCE_FILE.test(name)) continue;
			files.push(relative(projectDir, next));
		}
	};
	for (const root of SCAN_ROOTS) {
		const abs = join(projectDir, root);
		if (existsSync(abs) && statSync(abs).isDirectory()) visit(abs);
	}
	for (const name of listDirFiles(projectDir)) {
		if (SOURCE_FILE.test(name)) files.push(name);
	}
	return files;
}

const DEFINE = /training\.define\s*\(\s*["']([^"']+)["']/gu;
const METHOD_REF = /methodRef\s*:\s*["']([^"']+)["']/u;
const USE_TRAINING = /["']use training["']/u;
const DECORATOR = /@trainable\b/u;
const TRAINING_CALL = /\btraining\s*\(/u;
const FN_NAME = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/u;

function parseTrainableRegions(
	file: string,
	source: string,
): readonly TrainableRegion[] {
	const regions: TrainableRegion[] = [];
	const push = (methodRef: string, form: TrainableRegionForm, at: number) => {
		const ref = methodRef.trim();
		if (ref.length === 0) return;
		regions.push({
			methodRef: ref,
			file,
			form,
			grounded: isGrounded(source, at),
			examples: extractTrainingExamples(source, at),
		});
	};

	for (const match of source.matchAll(DEFINE)) {
		if (match[1]) push(match[1], "define", match.index ?? 0);
	}
	if (USE_TRAINING.test(source)) {
		const at = source.search(USE_TRAINING);
		const methodRef =
			nearbyMethodRef(source, at) ?? nearbyFunctionName(source, at) ?? file;
		push(methodRef, "directive", at);
	}
	if (DECORATOR.test(source)) {
		const at = source.search(DECORATOR);
		const methodRef =
			nearbyMethodRef(source, at) ?? nearbyFunctionName(source, at) ?? file;
		push(methodRef, "decorator", at);
	}
	if (TRAINING_CALL.test(source) && !source.includes("training.define")) {
		const at = source.search(TRAINING_CALL);
		const methodRef = nearbyMethodRef(source, at);
		if (methodRef) push(methodRef, "training", at);
	}
	return regions;
}

function nearbyMethodRef(source: string, at: number): string | undefined {
	const window = source.slice(Math.max(0, at - 200), at + 400);
	return METHOD_REF.exec(window)?.[1];
}

function nearbyFunctionName(source: string, at: number): string | undefined {
	const before = source.slice(Math.max(0, at - 240), at + 80);
	return FN_NAME.exec(before)?.[1];
}

function isGrounded(source: string, at: number): boolean {
	const window = source.slice(Math.max(0, at - 80), at + 800);
	return /\bintent\s*:/.test(window) && /\bcontract\s*:/.test(window);
}

function extractTrainingExamples(
	source: string,
	at: number,
): readonly TrainableExample[] {
	const window = source.slice(Math.max(0, at - 80), at + 1600);
	const block = /examples\s*:\s*(\[[\s\S]*?\])/u.exec(window);
	if (!block?.[1]) return [];
	const parsed = parseJsData(block[1]);
	if (!Array.isArray(parsed)) return [];
	const examples: TrainableExample[] = [];
	for (const row of parsed) {
		if (!row || !isJsonObject(row)) continue;
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const record = row as { input?: JsonValue; output?: unknown };
		if (!Object.hasOwn(record, "input") || !Object.hasOwn(record, "output")) {
			continue;
		}
		examples.push({
			input: record.input ?? null,
			output: cloneAsJson(record.output),
		});
	}
	return examples;
}

function parseJsData(text: string): JsonValue {
	const quoted = text
		.replace(/'/g, '"')
		.replace(/([,{[]\s*)([A-Za-z_]\w*)\s*:/gu, '$1"$2":')
		.replace(/,(\s*[}\]])/gu, "$1");
	try {
		return parseJsonValue(quoted);
	} catch {
		return null;
	}
}
