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

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EXAMPLES_ROOT = join(PACKAGE_ROOT, "examples");
const TEMPLATES_ROOT = join(PACKAGE_ROOT, "templates");

const SKIP_COPY = new Set([
	"node_modules",
	"dist",
	".git",
	".hobo",
	"coverage",
]);

export interface ExampleManifest {
	readonly id: string;
	readonly title: string;
	readonly blurb: string;
	readonly aliases: readonly string[];
	readonly tags: readonly string[];
	readonly fallback?: boolean;
}

export interface ExampleCatalogEntry extends ExampleManifest {
	readonly sourceDir: string;
	readonly source: "package" | "repo";
}

export interface MaterializeExampleOptions {
	readonly exampleId: string;
	readonly outputDir: string;
	readonly appName: string;
	readonly catalog?: readonly ExampleCatalogEntry[];
}

export interface MaterializeExampleResult {
	readonly templateId: string;
	readonly outputDir: string;
	readonly files: readonly string[];
	readonly source: "repo";
}

interface ParsedManifest {
	readonly id?: unknown;
	readonly title?: unknown;
	readonly blurb?: unknown;
	readonly aliases?: unknown;
	readonly tags?: unknown;
	readonly fallback?: unknown;
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, " ")
		.trim();
}

function words(value: string): string[] {
	return normalize(value).split(" ").filter(Boolean);
}

function readJson(path: string): ParsedManifest | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as ParsedManifest;
	} catch {
		return null;
	}
}

function asStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function fromManifest(
	manifest: ParsedManifest,
	sourceDir: string,
	source: ExampleCatalogEntry["source"],
): ExampleCatalogEntry | null {
	if (typeof manifest.id !== "string" || manifest.id.length === 0) return null;
	return {
		id: manifest.id,
		title: typeof manifest.title === "string" ? manifest.title : manifest.id,
		blurb: typeof manifest.blurb === "string" ? manifest.blurb : "",
		aliases: asStringList(manifest.aliases),
		tags: asStringList(manifest.tags),
		fallback: manifest.fallback === true,
		sourceDir,
		source,
	};
}

function inferRepoExample(
	id: string,
	sourceDir: string,
	extra: Partial<ExampleManifest> = {},
): ExampleCatalogEntry {
	return {
		id,
		title: extra.title ?? id,
		blurb: extra.blurb ?? "",
		aliases: extra.aliases ?? [id.replace(/-/gu, " ")],
		tags: extra.tags ?? [],
		fallback: extra.fallback === true,
		sourceDir,
		source: "repo",
	};
}

function listChildDirs(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() && !SKIP_COPY.has(name);
	});
}

function loadPackagedExamples(): ExampleCatalogEntry[] {
	const entries: ExampleCatalogEntry[] = [];
	for (const name of listChildDirs(EXAMPLES_ROOT)) {
		const sourceDir = join(EXAMPLES_ROOT, name);
		const parsed = readJson(join(sourceDir, "example.json"));
		const entry = parsed
			? fromManifest(parsed, sourceDir, "package")
			: inferRepoExample(name, sourceDir);
		if (entry) entries.push({ ...entry, source: "package" });
	}
	const openui = join(TEMPLATES_ROOT, "openui-astryx-bindle");
	if (existsSync(openui)) {
		entries.push(
			inferRepoExample("openui-astryx-bindle", openui, {
				title: "OpenUI Astryx",
				blurb: "OpenUI + Astryx Bindle with first-paint evidence.",
				aliases: ["openui", "astryx", "visual"],
				tags: ["openui", "bindle", "web"],
			}),
		);
	}
	return entries;
}

function findRepoExamplesRoot(start: string): string | null {
	let current = start;
	for (let i = 0; i < 8; i += 1) {
		const candidate = join(current, "examples");
		if (
			existsSync(join(candidate, "hello-bindle")) ||
			existsSync(join(candidate, "README.md"))
		) {
			return candidate;
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return null;
}

function loadRepoExamples(seen: Set<string>): ExampleCatalogEntry[] {
	const roots = new Set(
		[
			findRepoExamplesRoot(PACKAGE_ROOT),
			findRepoExamplesRoot(process.cwd()),
		].filter((root): root is string => root !== null),
	);
	const extras: ExampleCatalogEntry[] = [];
	for (const root of roots) {
		for (const name of listChildDirs(root)) {
			if (seen.has(name)) continue;
			const sourceDir = join(root, name);
			const manifest = readJson(join(sourceDir, "example.json"));
			if (manifest) {
				const entry = fromManifest(manifest, sourceDir, "repo");
				if (entry && !seen.has(entry.id)) {
					extras.push(entry);
					seen.add(entry.id);
				}
				continue;
			}
			if (existsSync(join(sourceDir, "src", "bindle.ts"))) {
				extras.push(
					inferRepoExample(name, sourceDir, {
						aliases: [name.replace(/-/gu, " ")],
					}),
				);
				seen.add(name);
			}
			const apps = join(sourceDir, "apps");
			if (!existsSync(apps)) continue;
			for (const appName of listChildDirs(apps)) {
				if (seen.has(appName)) continue;
				const appDir = join(apps, appName);
				const meta = readJson(join(appDir, "meta.json"));
				const entry = meta
					? fromManifest(
							{
								...meta,
								id: typeof meta.id === "string" ? meta.id : appName,
								aliases: [
									...asStringList(meta.aliases),
									appName.replace(/-/gu, " "),
								],
							},
							appDir,
							"repo",
						)
					: inferRepoExample(appName, appDir);
				if (entry && !seen.has(entry.id)) {
					extras.push(entry);
					seen.add(entry.id);
				}
			}
		}
	}
	return extras;
}

export function loadExampleCatalog(
	options: { readonly includeRepo?: boolean } = {},
): ExampleCatalogEntry[] {
	const packaged = loadPackagedExamples();
	const seen = new Set(packaged.map((entry) => entry.id));
	const repo = options.includeRepo === false ? [] : loadRepoExamples(seen);
	return [...packaged, ...repo];
}

function phrases(entry: ExampleCatalogEntry): string[] {
	return [entry.id, entry.title, ...entry.aliases]
		.map(normalize)
		.filter((phrase) => phrase.length > 0);
}

const CREATE_INTENT =
	/\b(make|create|scaffold|generate|new|spin up|give me|build me)\b/u;
const APP_NOUN = /\b(app|application|example|bindle|project|template)\b/u;
const REFINE_INTENT =
	/\b(refine|edit|change|update|fix|add|improve|tweak|modify)\b/u;

export function matchExampleRequest(
	prompt: string,
	catalog: readonly ExampleCatalogEntry[] = loadExampleCatalog(),
): ExampleCatalogEntry | undefined {
	const normalized = normalize(prompt);
	if (normalized.length === 0) return undefined;
	if (REFINE_INTENT.test(normalized) && !CREATE_INTENT.test(normalized)) {
		return undefined;
	}

	let best: { entry: ExampleCatalogEntry; score: number } | undefined;
	for (const entry of catalog) {
		for (const phrase of phrases(entry)) {
			const phraseTokens = words(phrase);
			if (phraseTokens.length === 0) continue;
			const idPhrase = phrase === normalize(entry.id);
			if (
				phraseTokens.length < 2 &&
				!idPhrase &&
				!CREATE_INTENT.test(normalized)
			) {
				continue;
			}
			const contained =
				normalized === phrase ||
				normalized.startsWith(`${phrase} `) ||
				normalized.endsWith(` ${phrase}`) ||
				normalized.includes(` ${phrase} `);
			if (!contained) continue;
			const score = phraseTokens.length * 10 + entry.aliases.length;
			if (!best || score > best.score) best = { entry, score };
		}
	}
	if (best) return best.entry;

	const wantsApp = CREATE_INTENT.test(normalized) && APP_NOUN.test(normalized);
	if (!wantsApp) return undefined;
	return catalog.find((entry) => entry.fallback === true);
}

function walkFiles(dir: string, base = dir): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		if (SKIP_COPY.has(name)) continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walkFiles(full, base));
		else out.push(relative(base, full).replace(/\\/gu, "/"));
	}
	return out;
}

export function materializeExample(
	options: MaterializeExampleOptions,
): MaterializeExampleResult {
	const catalog = options.catalog ?? loadExampleCatalog();
	const entry = catalog.find((item) => item.id === options.exampleId);
	if (!entry) throw new Error(`example not found: ${options.exampleId}`);
	mkdirSync(options.outputDir, { recursive: true });
	cpSync(entry.sourceDir, options.outputDir, {
		recursive: true,
		filter: (source) =>
			!source.split(/[/\\]/u).some((part) => SKIP_COPY.has(part)),
	});
	const packageJsonPath = join(options.outputDir, "package.json");
	if (existsSync(packageJsonPath)) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
			string,
			unknown
		>;
		pkg.name = `@hobo/app-${options.appName}`;
		writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	}
	writeFileSync(
		join(options.outputDir, "hobo.scaffold.json"),
		`${JSON.stringify(
			{
				templateId: entry.id,
				appName: options.appName,
				source: "repo",
			},
			null,
			2,
		)}\n`,
	);
	return {
		templateId: entry.id,
		outputDir: options.outputDir,
		files: walkFiles(options.outputDir),
		source: "repo",
	};
}

export function renderExampleCatalogInstructions(
	catalog: readonly ExampleCatalogEntry[] = loadExampleCatalog(),
): string {
	const lines = catalog.slice(0, 24).map((entry) => {
		const aliases = entry.aliases.slice(0, 4).join(", ");
		return `- ${entry.id}: ${entry.blurb || entry.title}${aliases ? ` (aliases: ${aliases})` : ""}${entry.fallback ? " [fallback]" : ""}`;
	});
	return [
		"Shipped examples load from this repo at process start. Never fetch templates or example state from the network.",
		"If the user asks for one of these, or something close, materialize that example into the workspace. Do not tell them to run `hobo`.",
		...lines,
	].join("\n");
}
