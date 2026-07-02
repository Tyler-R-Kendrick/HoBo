import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	canonicalWorkspaceEdges,
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
