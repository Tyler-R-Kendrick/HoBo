#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
	detectWorkspaceCycles,
	parseWorkspaceEdge,
	validateBoundaryImports,
	type WorkspaceEdge,
} from "../packages/conformance/src/boundaries.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repoRoot, "packages");

type BoundaryViolationRecord = {
	rule: string;
	from_path: string;
	to_path: string;
	effect: "deny";
};

type WorkspaceSkeletonValidatedEvent = {
	workspace_rev: string;
	edges: Array<{ from_path: string; to_path: string }>;
	violations: BoundaryViolationRecord[];
};

function workspaceRev(): string {
	try {
		return execSync("git rev-parse HEAD", {
			cwd: repoRoot,
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}

function listPackageJsonFiles(dir: string): string[] {
	const entries: string[] = [];

	for (const name of readdirSync(dir)) {
		if (name === "node_modules") {
			continue;
		}

		const fullPath = join(dir, name);
		const stats = statSync(fullPath);

		if (stats.isDirectory()) {
			entries.push(...listPackageJsonFiles(fullPath));
			continue;
		}

		if (name === "package.json") {
			entries.push(fullPath);
		}
	}

	return entries;
}

function packagePathFromJson(packageJsonPath: string): string {
	return relative(repoRoot, dirname(packageJsonPath)).replaceAll("\\", "/");
}

function hoboNameToPath(
	name: string,
	packageMap: Map<string, string>,
): string | undefined {
	return packageMap.get(name);
}

function collectDeclaredEdges(
	packageJsonPath: string,
	packageMap: Map<string, string>,
): WorkspaceEdge[] {
	const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	};

	const from = packagePathFromJson(packageJsonPath);
	const edges: WorkspaceEdge[] = [];
	const depSections = [
		pkg.dependencies,
		pkg.devDependencies,
		pkg.peerDependencies,
	];

	for (const section of depSections) {
		if (!section) {
			continue;
		}

		for (const [name] of Object.entries(section)) {
			if (!name.startsWith("@hobo/")) {
				continue;
			}

			const to = hoboNameToPath(name, packageMap);
			if (!to) {
				continue;
			}

			edges.push(parseWorkspaceEdge({ from, to }));
		}
	}

	return edges;
}

function collectSourceEdges(
	packageDir: string,
	packageMap: Map<string, string>,
): WorkspaceEdge[] {
	const srcDir = join(packageDir, "src");
	const edges: WorkspaceEdge[] = [];
	const from = relative(repoRoot, packageDir).replaceAll("\\", "/");

	const importPatterns = [
		/from\s+["'](@hobo\/[^"']+)["']/g,
		/import\s+["'](@hobo\/[^"']+)["']/g,
	];

	/**
	 * True when the match started inside a string literal rather than at a real
	 * import statement.
	 *
	 * A remediation message that *quotes* an import — `'import { x } from
	 * "@hobo/adapter-openbao"'` — matches the pattern above exactly as a real
	 * import does, and counting it produces a dependency edge that does not
	 * exist. That was enough to report a cycle between `@hobo/identity` and
	 * `@hobo/adapter-openbao` where neither package imports the other.
	 *
	 * The test is the text on the match's own line, before the match: a real
	 * import statement is preceded there by nothing, by `import { … }`, or by
	 * the `} ` of a multi-line import — never by a quote. A quoted one always
	 * carries the opening quote of the string it lives in.
	 */
	function insideStringLiteral(source: string, index: number): boolean {
		const lineStart = source.lastIndexOf("\n", index) + 1;
		const prefix = source.slice(lineStart, index);
		return /["'`]/u.test(prefix);
	}

	function walk(dir: string): void {
		for (const name of readdirSync(dir)) {
			const fullPath = join(dir, name);
			const stats = statSync(fullPath);

			if (stats.isDirectory()) {
				walk(fullPath);
				continue;
			}

			if (!name.endsWith(".ts")) {
				continue;
			}

			const source = readFileSync(fullPath, "utf8");

			for (const pattern of importPatterns) {
				pattern.lastIndex = 0;
				for (const match of source.matchAll(pattern)) {
					const depName = match[1];
					if (!depName) {
						continue;
					}

					if (insideStringLiteral(source, match.index)) {
						continue;
					}

					const to = hoboNameToPath(depName, packageMap);
					if (!to || to === from) {
						// Self-matches are doc-comment/template-string mentions of a
						// package's own name, not real cross-package imports.
						continue;
					}

					edges.push(parseWorkspaceEdge({ from, to }));
				}
			}
		}
	}

	try {
		walk(srcDir);
	} catch {
		return edges;
	}

	return edges;
}

function classifyViolation(error: string): BoundaryViolationRecord | null {
	const edgeMatch = /: ([^ ]+) -> ([^ ]+)$/.exec(error);
	const from_path = edgeMatch?.[1] ?? "";
	const to_path = edgeMatch?.[2] ?? "";

	if (error.startsWith("core must not import HoBo packages:")) {
		return { rule: "core-imports-hobo", from_path, to_path, effect: "deny" };
	}

	if (error.startsWith("adapters must not import each other:")) {
		return {
			rule: "adapter-imports-adapter",
			from_path,
			to_path,
			effect: "deny",
		};
	}

	if (error.startsWith("adapters may import only core ports:")) {
		return {
			rule: "adapter-imports-non-core",
			from_path,
			to_path,
			effect: "deny",
		};
	}

	if (error.startsWith("dependency points outward:")) {
		return { rule: "outward-dependency", from_path, to_path, effect: "deny" };
	}

	if (error.startsWith("workspace dependency cycle:")) {
		return { rule: "workspace-cycle", from_path, to_path, effect: "deny" };
	}

	if (
		error.startsWith("unknown import source ") ||
		error.startsWith("unknown import target ")
	) {
		const path = error.replace(/^unknown import (source|target) /, "");
		return {
			rule: "unknown-package",
			from_path: path,
			to_path: path,
			effect: "deny",
		};
	}

	return null;
}

function main(): void {
	const packageJsonFiles = listPackageJsonFiles(packagesRoot);
	const packageMap = new Map<string, string>();

	for (const packageJsonPath of packageJsonFiles) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			name?: string;
		};
		if (pkg.name?.startsWith("@hobo/")) {
			packageMap.set(pkg.name, packagePathFromJson(packageJsonPath));
		}
	}

	const edgeMap = new Map<string, WorkspaceEdge>();

	for (const packageJsonPath of packageJsonFiles) {
		const packageDir = dirname(packageJsonPath);

		for (const edge of [
			...collectDeclaredEdges(packageJsonPath, packageMap),
			...collectSourceEdges(packageDir, packageMap),
		]) {
			edgeMap.set(`${edge.from}->${edge.to}`, edge);
		}
	}

	const edges = [...edgeMap.values()];
	const boundaryErrors = validateBoundaryImports(edges).errors;
	const cycleErrors = detectWorkspaceCycles(edges).errors;
	const allErrors = [...boundaryErrors, ...cycleErrors];

	const violations = allErrors
		.map((error) => classifyViolation(error))
		.filter((record): record is BoundaryViolationRecord => record !== null);

	const event: WorkspaceSkeletonValidatedEvent = {
		workspace_rev: workspaceRev(),
		edges: edges.map((edge) => ({ from_path: edge.from, to_path: edge.to })),
		violations,
	};

	console.log(JSON.stringify(event));

	if (allErrors.length > 0) {
		for (const error of allErrors) {
			console.error(error);
		}
		process.exit(1);
	}
}

main();
