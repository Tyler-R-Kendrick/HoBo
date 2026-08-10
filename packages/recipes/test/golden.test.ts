/**
 * Golden resolved topologies and offers.
 *
 * One pair of files per shipped recipe. They exist so a change in the compiler,
 * the profile registry, or a recipe's data shows up as a reviewable diff rather
 * than as a silently different deployment. Regenerate deliberately with
 * `HOBO_UPDATE_GOLDEN=1`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	buildDeploymentOffer,
	compileRecipe,
	type DeploymentOffer,
	type SolutionRecipe,
	STANDARD_SOLUTION_RECIPES,
} from "../src/index.js";
import {
	CATALOG_DIGEST,
	compileInputFor,
	NOW,
	PROFILE_REGISTRY_DIGEST,
	requestForRecipe,
	SIGNER,
} from "./fixtures.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");
const UPDATE = process.env.HOBO_UPDATE_GOLDEN === "1";

function fileNameFor(
	recipe: SolutionRecipe,
	kind: "topology" | "offer",
): string {
	return `${recipe.id.replace(/[^a-z0-9]+/gu, "-")}.${kind}.json`;
}

function readOrWrite(name: string, actual: unknown): unknown {
	const path = join(GOLDEN_DIR, name);
	const serialized = `${JSON.stringify(actual, null, "\t")}\n`;
	if (UPDATE) {
		mkdirSync(GOLDEN_DIR, { recursive: true });
		writeFileSync(path, serialized, "utf8");
		return actual;
	}
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolutionOf(recipe: SolutionRecipe): {
	readonly golden: unknown;
	readonly actual: unknown;
	readonly offer: DeploymentOffer;
} {
	const compilation = compileRecipe(compileInputFor(recipe));
	if (!compilation.ok) {
		throw new Error(
			`${recipe.id} did not compile: ${compilation.rejections
				.map((rejection) => `${rejection.code} ${rejection.detail}`)
				.join(" | ")}`,
		);
	}
	const actual = {
		recipeId: compilation.recipeId,
		topologyDigest: compilation.topologyDigest,
		resolutionDigest: compilation.resolutionDigest,
		topology: compilation.topology,
		claims: compilation.claims,
		guestLeases: compilation.guestLeases,
		portability: compilation.portability,
		widenings: compilation.widenings,
		trustEvidenceRefs: compilation.trustEvidenceRefs,
		conformanceEvidenceRefs: compilation.conformanceEvidenceRefs,
		sponsoredCostMinorUnits: compilation.sponsoredCostMinorUnits,
	};
	const offer = buildDeploymentOffer({
		compilation,
		recipe,
		request: requestForRecipe(recipe),
		catalogDigest: CATALOG_DIGEST,
		profileRegistryDigest: PROFILE_REGISTRY_DIGEST,
		issuedAtMs: NOW,
		signer: SIGNER,
	});
	return {
		golden: readOrWrite(fileNameFor(recipe, "topology"), actual),
		actual,
		offer,
	};
}

describe("golden resolutions", () => {
	for (const recipe of STANDARD_SOLUTION_RECIPES) {
		it(`${recipe.id} resolves to its recorded topology and offer`, () => {
			const { golden, actual, offer } = resolutionOf(recipe);
			expect(JSON.parse(JSON.stringify(actual)) as unknown).toEqual(golden);

			const goldenOffer = readOrWrite(fileNameFor(recipe, "offer"), offer);
			expect(JSON.parse(JSON.stringify(offer)) as unknown).toEqual(goldenOffer);
		});
	}

	it("was not run in update mode", () => {
		// A golden suite that silently rewrites itself asserts nothing.
		expect(UPDATE).toBe(false);
	});
});
