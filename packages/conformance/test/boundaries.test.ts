import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	canonicalWorkspaceEdges,
	classifyPackage,
	detectWorkspaceCycles,
	parseWorkspaceEdge,
	validateBoundaryImports,
} from "../src/boundaries.js";

describe("validateBoundaryImports", () => {
	it("accepts the canonical production workspace edge set", () => {
		const edges = canonicalWorkspaceEdges.map((edge) =>
			parseWorkspaceEdge(edge),
		);
		const result = validateBoundaryImports(edges);

		expect(result.errors).toEqual([]);
	});

	it("denies cross-adapter imports", () => {
		const edges = canonicalWorkspaceEdges.map((edge) =>
			parseWorkspaceEdge(edge),
		);
		const result = validateBoundaryImports(edges, [
			parseWorkspaceEdge({
				from: "packages/providers/provider-aws",
				to: "packages/providers/provider-azure",
			}),
		]);

		expect(result.errors.join("\n")).toMatch(
			/adapters must not import each other/,
		);
	});
});

describe("detectWorkspaceCycles", () => {
	it("rejects cli/runtime circular dependencies", () => {
		const result = detectWorkspaceCycles([
			parseWorkspaceEdge({ from: "packages/cli", to: "packages/runtime" }),
			parseWorkspaceEdge({ from: "packages/runtime", to: "packages/cli" }),
		]);

		expect(result.errors).toEqual([
			"workspace dependency cycle: packages/cli -> packages/runtime -> packages/cli",
		]);
	});
});

describe("workspace-skeleton-boundary pact", () => {
	const pactPath = join(
		dirname(fileURLToPath(import.meta.url)),
		"../contracts/pacts/workspace-skeleton-boundary.pact.json",
	);
	const pact = JSON.parse(readFileSync(pactPath, "utf8")) as {
		consumer: { name: string };
		provider: { name: string };
		interactions: Array<{
			response: { body: { boundaryViolation: { effect: string } } };
		}>;
		metadata: { pactSpecification: { version: string } };
	};

	it("pins consumer and provider names", () => {
		expect(pact.consumer.name).toBe("FoundationsReferenceApp");
		expect(pact.provider.name).toBe("WorkspaceSkeletonBoundary");
		expect(pact.metadata.pactSpecification.version).toBe("3.0.0");
	});

	it("promises deny effect for boundary violations", () => {
		const interaction = pact.interactions[0];
		expect(interaction?.response.body.boundaryViolation.effect).toBe("deny");
	});

	it("enforces deny behavior for adapter cross-import fixture", () => {
		const result = validateBoundaryImports(
			[],
			[
				parseWorkspaceEdge({
					from: "packages/providers/provider-aws",
					to: "packages/providers/provider-azure",
				}),
			],
		);

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors.join("\n")).toMatch(
			/adapters must not import each other/,
		);
	});
});

/**
 * Regression cover for a gate that was enforcing nothing.
 *
 * `parseWorkspaceEdge` *throws* on a workspace path it cannot classify. That is
 * a defensible parse-don't-validate contract, but it meant a single stray
 * `package.json` anywhere under `packages/` aborted the whole run — and an
 * aborted gate is indistinguishable from a clean one in a pipeline that only
 * checks the exit code of the surrounding script. On trunk, fifteen real
 * packages plus eight nested non-packages were unclassified, so the boundary
 * gate had never actually enforced a rule.
 */
describe("every workspace package is classifiable", () => {
	it("classifies each pnpm workspace package under packages/", async () => {
		const { readFileSync, readdirSync, statSync } = await import("node:fs");
		const { join } = await import("node:path");
		const root = new URL("../../..", import.meta.url).pathname;

		const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
		const globs = yaml
			.split("\n")
			.slice(yaml.split("\n").findIndex((l) => /^packages:/u.test(l)) + 1)
			.reduce<string[]>((acc, line) => {
				if (/^\S/u.test(line)) return acc;
				const m = /^\s+-\s+"?([^"\s]+)"?\s*$/u.exec(line);
				if (m?.[1]?.startsWith("packages/")) acc.push(m[1]);
				return acc;
			}, []);

		const unclassified: string[] = [];
		for (const glob of globs) {
			const base = join(root, glob.replace(/\/\*$/u, ""));
			let names: string[] = [];
			try {
				names = glob.endsWith("/*") ? readdirSync(base) : [""];
			} catch {
				continue;
			}
			for (const name of names) {
				const dir = name ? join(base, name) : base;
				try {
					if (!statSync(join(dir, "package.json")).isFile()) continue;
				} catch {
					continue;
				}
				const rel = dir.slice(root.length).replace(/^\/+/u, "");
				if (classifyPackage(rel).kind === "unknown") unclassified.push(rel);
			}
		}

		// Naming them is the point: a bare count tells whoever added a package
		// nothing about which one, and this failing is the moment they find out.
		expect(unclassified).toEqual([]);
	});

	it("still refuses a path it genuinely cannot place", () => {
		// The throw is load-bearing — it must not be softened into a default
		// layer, or an unplaced package would silently get whatever layer the
		// default happened to be and import anything below it.
		expect(() =>
			parseWorkspaceEdge({
				from: "packages/not-a-real-package",
				to: "packages/core",
			}),
		).toThrow(/unknown import source/u);
	});
});
