/**
 * Best-effort discovery of real repo entrypoints that can back feature step implementations.
 * Never invents live service calls; prefers package.json scripts, documented CLIs, local files.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./paths.mts";

export type DiscoveredBinding = {
	kind: "package-script" | "shell-command" | "file" | "unknown";
	id: string;
	command?: string;
	scriptName?: string;
	path?: string;
	confidence: "high" | "medium" | "low";
	reason: string;
	implementsSteps: string[];
};

export type DiscoveryReport = {
	featureId: string;
	seed: string;
	scannedAt: string;
	bindings: DiscoveredBinding[];
	packageScripts: string[];
	notes: string[];
};

function readPackageScripts(root: string): Record<string, string> {
	const pkgPath = path.join(root, "package.json");
	if (!existsSync(pkgPath)) return {};
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
			scripts?: Record<string, string>;
		};
		return pkg.scripts ?? {};
	} catch {
		return {};
	}
}

/** Extract `backtick commands` and pnpm/npm script hints from free text. */
export function extractCommandHints(text: string): string[] {
	const hints = new Set<string>();
	for (const m of text.matchAll(/`([^`]+)`/g)) {
		const cmd = m[1]!.trim();
		if (cmd.length > 0 && cmd.length < 200) hints.add(cmd);
	}
	for (const m of text.matchAll(
		/\b(?:pnpm|npm|yarn|bun)(?:\s+run)?\s+([a-zA-Z0-9:_:.-]+)/g,
	)) {
		hints.add(`pnpm run ${m[1]}`);
	}
	for (const m of text.matchAll(/\bhobo\s+[a-z][a-z0-9:-]*/gi)) {
		hints.add(m[0]!);
	}
	return [...hints];
}

function scoreScript(
	name: string,
	body: string,
	keywords: string[],
): number {
	const hay = `${name} ${body}`.toLowerCase();
	let score = 0;
	for (const k of keywords) {
		if (!k || k.length < 3) continue;
		if (hay.includes(k.toLowerCase())) score += 2;
		if (name.toLowerCase().includes(k.toLowerCase())) score += 3;
	}
	return score;
}

function keywordsFromSeed(seed: string): string[] {
	const stop = new Set([
		"the",
		"and",
		"for",
		"with",
		"that",
		"this",
		"from",
		"after",
		"before",
		"when",
		"then",
		"given",
		"want",
		"should",
		"must",
		"have",
		"does",
		"into",
		"over",
	]);
	return seed
		.toLowerCase()
		.replace(/[^a-z0-9\s:_-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length >= 3 && !stop.has(w))
		.slice(0, 24);
}

/** Scan Gherkin files for step text + command hints. */
export function collectFeatureText(featureDirPath: string): string {
	if (!existsSync(featureDirPath)) return "";
	const parts: string[] = [];
	for (const f of readdirSync(featureDirPath)) {
		if (f.endsWith(".feature") || f === "SEED.md" || f === "README.md") {
			parts.push(readFileSync(path.join(featureDirPath, f), "utf8"));
		}
	}
	return parts.join("\n");
}

export function discoverCode(input: {
	featureId: string;
	seed: string;
	featureDir: string;
	surfaces?: string[];
	root?: string;
}): DiscoveryReport {
	const root = input.root ?? repoRoot();
	const scripts = readPackageScripts(root);
	const scriptNames = Object.keys(scripts);
	const text = [
		input.seed,
		...(input.surfaces ?? []),
		collectFeatureText(input.featureDir),
	].join("\n");
	const hints = extractCommandHints(text);
	const keywords = keywordsFromSeed(input.seed);
	const notes: string[] = [];
	const bindings: DiscoveredBinding[] = [];

	// Explicit command hints win
	for (const hint of hints) {
		const runMatch = hint.match(/^(?:pnpm|npm|yarn)(?:\s+run)?\s+(\S+)/);
		if (runMatch) {
			const name = runMatch[1]!;
			if (scripts[name]) {
				bindings.push({
					kind: "package-script",
					id: `script:${name}`,
					scriptName: name,
					command: `pnpm run ${name}`,
					confidence: "high",
					reason: `package.json scripts["${name}"] exists; mentioned in feature/seed`,
					implementsSteps: [
						"I exercise the surface as this persona would",
						"I observe the failure as this persona",
					],
				});
				continue;
			}
		}
		// bare script name
		if (scripts[hint]) {
			bindings.push({
				kind: "package-script",
				id: `script:${hint}`,
				scriptName: hint,
				command: `pnpm run ${hint}`,
				confidence: "high",
				reason: `package.json scripts["${hint}"] exists`,
				implementsSteps: ["I exercise the surface as this persona would"],
			});
			continue;
		}
		// shell command with binary that might exist
		const bin = hint.split(/\s+/)[0]!;
		if (bin === "node" || bin === "pnpm" || bin === "git" || bin === "bash") {
			bindings.push({
				kind: "shell-command",
				id: `shell:${hint.slice(0, 40)}`,
				command: hint,
				confidence: "medium",
				reason: "explicit shell command in feature text",
				implementsSteps: ["I exercise the surface as this persona would"],
			});
		}
	}

	// Keyword match against scripts (agent-check, lint, test, doctor, …)
	const ranked = scriptNames
		.map((name) => ({
			name,
			body: scripts[name]!,
			score: scoreScript(name, scripts[name]!, keywords),
		}))
		.filter((x) => x.score >= 4)
		.sort((a, b) => b.score - a.score)
		.slice(0, 5);

	for (const r of ranked) {
		const id = `script:${r.name}`;
		if (bindings.some((b) => b.id === id)) continue;
		bindings.push({
			kind: "package-script",
			id,
			scriptName: r.name,
			command: `pnpm run ${r.name}`,
			confidence: r.score >= 8 ? "high" : "medium",
			reason: `script "${r.name}" matched seed keywords (score ${r.score})`,
			implementsSteps: ["I exercise the surface as this persona would"],
		});
	}

	// Known HoBo agent-check surface
	if (
		/agent.?check|staged check|staged gate/i.test(text) &&
		scripts["agent:check"]
	) {
		const id = "script:agent:check";
		const staged = /\bstaged\b/i.test(text);
		const command = staged
			? "pnpm run agent:check -- --staged"
			: "pnpm run agent:check";
		const existing = bindings.find((b) => b.scriptName === "agent:check");
		if (existing) {
			existing.command = command;
			existing.confidence = "high";
			existing.reason =
				"seed/journey mentions agent check; script agent:check exists";
		} else {
			bindings.unshift({
				kind: "package-script",
				id,
				scriptName: "agent:check",
				command,
				confidence: "high",
				reason: "seed/journey mentions agent check; script agent:check exists",
				implementsSteps: [
					"I exercise the surface as this persona would",
					"I observe the failure as this persona",
				],
			});
		}
	}

	// File existence for docs paths mentioned
	for (const m of text.matchAll(
		/\b((?:docs|site|scripts|packages|src|\.agents|\.optimizexp)\/[\w./-]+)/g,
	)) {
		const rel = m[1]!;
		const abs = path.join(root, rel);
		if (existsSync(abs)) {
			bindings.push({
				kind: "file",
				id: `file:${rel}`,
				path: rel,
				confidence: "medium",
				reason: "path mentioned in feature exists on disk",
				implementsSteps: ["I am on the critical path described by the feature seed"],
			});
		}
	}

	if (bindings.length === 0) {
		notes.push(
			"No high-confidence code bindings found; step implementations will be stubs (pending).",
		);
	} else {
		notes.push(
			`Discovered ${bindings.length} candidate binding(s); high-confidence ones are wired into implementations.ts.`,
		);
	}

	return {
		featureId: input.featureId,
		seed: input.seed,
		scannedAt: new Date().toISOString(),
		bindings,
		packageScripts: scriptNames,
		notes,
	};
}

/** Prefer a single primary command for "exercise the surface". */
export function pickPrimaryCommand(
	report: DiscoveryReport,
): DiscoveredBinding | null {
	const runnable = (b: DiscoveredBinding) =>
		(b.kind === "package-script" || b.kind === "shell-command") && Boolean(b.command);
	const high = report.bindings.filter((b) => b.confidence === "high" && runnable(b));
	// Prefer the most journey-specific known gate when present
	const preferredNames = ["agent:check", "check:relevant:staged", "test:file", "doctor"];
	for (const name of preferredNames) {
		const hit = high.find((b) => b.scriptName === name);
		if (hit) return hit;
	}
	if (high[0]) return high[0]!;
	const med = report.bindings.filter((b) => b.confidence === "medium" && runnable(b));
	return med[0] ?? null;
}

export function fileExistsUnderRoot(rel: string, root = repoRoot()): boolean {
	try {
		const abs = path.join(root, rel);
		return existsSync(abs) && (statSync(abs).isFile() || statSync(abs).isDirectory());
	} catch {
		return false;
	}
}
