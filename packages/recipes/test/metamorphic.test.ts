/**
 * Metamorphic properties.
 *
 * Each case changes something that must not matter — declaration order, key
 * order, object identity, an unrelated catalog row — and asserts the compiled
 * bytes are identical. A digest that moves under any of these is a digest
 * nobody can sign.
 */
import { describe, expect, it } from "vitest";

import {
	buildDeploymentOffer,
	type CompileRecipeInput,
	canonicalOfferBytes,
	compileRecipe,
	findStandardRecipe,
	parseSolutionRecipe,
	type RecipeCompilationAccepted,
	type SolutionRecipe,
	STANDARD_SOLUTION_RECIPES,
} from "../src/index.js";
import {
	CATALOG,
	CATALOG_DIGEST,
	CHEAP_INCOMPATIBLE_CANDIDATE,
	catalogDigestOf,
	compileInputFor,
	EVIDENCE,
	NOW,
	PROFILE_REGISTRY_DIGEST,
	requestForRecipe,
	SIGNER,
} from "./fixtures.js";

function requireRecipe(id: string): SolutionRecipe {
	const recipe = findStandardRecipe(id);
	if (recipe === undefined) throw new Error(`missing fixture recipe ${id}`);
	return recipe;
}

const sqlApi = requireRecipe("recipe.cloudflare-neon.portable-sql-api/v1");

function accepted(input: CompileRecipeInput): RecipeCompilationAccepted {
	const compilation = compileRecipe(input);
	if (!compilation.ok) {
		throw new Error(
			compilation.rejections.map((rejection) => rejection.detail).join(" | "),
		);
	}
	return compilation;
}

function digestsOf(input: CompileRecipeInput): readonly string[] {
	const compilation = accepted(input);
	return [compilation.topologyDigest, compilation.resolutionDigest];
}

/**
 * Rebuild every object with its keys in reverse order.
 *
 * Canonicalization is supposed to make this invisible; the only way to know is
 * to hand the compiler a value whose key order is deliberately wrong.
 */
function reverseKeyOrder(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseKeyOrder);
	if (value !== null && typeof value === "object") {
		const source = value as Record<string, unknown>;
		const rebuilt: Record<string, unknown> = {};
		for (const key of Object.keys(source).reverse()) {
			rebuilt[key] = reverseKeyOrder(source[key]);
		}
		return rebuilt;
	}
	return value;
}

function withReversedKeys<T>(value: T): T {
	// Only ever applied to plain data in these tests.
	return reverseKeyOrder(value) as T;
}

describe("determinism", () => {
	it("produces identical digests when compiled repeatedly", () => {
		const input = compileInputFor(sqlApi);
		expect(digestsOf(input)).toEqual(digestsOf(input));
		expect(digestsOf(compileInputFor(sqlApi))).toEqual(digestsOf(input));
	});

	it("ignores catalog registration order", () => {
		const baseline = digestsOf(compileInputFor(sqlApi));
		const reversed = [...CATALOG].reverse();
		expect(
			digestsOf(
				compileInputFor(sqlApi, {
					catalog: reversed,
					catalogDigest: catalogDigestOf(reversed),
				}),
			),
		).toEqual(baseline);
	});

	it("ignores evidence order", () => {
		const baseline = digestsOf(compileInputFor(sqlApi));
		expect(
			digestsOf(compileInputFor(sqlApi, { evidence: [...EVIDENCE].reverse() })),
		).toEqual(baseline);
	});

	it("ignores the order Yards, placements, and edges were declared in", () => {
		const shuffled = parseSolutionRecipe({
			...sqlApi,
			yards: [...sqlApi.yards].reverse(),
			placements: [...sqlApi.placements].reverse(),
			edges: [...sqlApi.edges].reverse(),
		});
		expect(digestsOf(compileInputFor(shuffled))).toEqual(
			digestsOf(compileInputFor(sqlApi)),
		);
	});

	it("ignores object key order in the recipe, request, and catalog", () => {
		const baseline = digestsOf(compileInputFor(sqlApi));
		const recipe = parseSolutionRecipe(withReversedKeys(sqlApi));
		const catalog = withReversedKeys(CATALOG);
		expect(
			digestsOf(
				compileInputFor(recipe, {
					request: withReversedKeys(requestForRecipe(sqlApi)),
					catalog,
					catalogDigest: catalogDigestOf(catalog),
				}),
			),
		).toEqual(baseline);
	});

	it("ignores object identity: a deep clone compiles to the same bytes", () => {
		const baseline = compileInputFor(sqlApi);
		const cloned: CompileRecipeInput = {
			...baseline,
			recipe: structuredClone(baseline.recipe),
			request: structuredClone(baseline.request),
			catalog: structuredClone(baseline.catalog),
			evidence: structuredClone(baseline.evidence),
			policy: structuredClone(baseline.policy),
		};
		expect(digestsOf(cloned)).toEqual(digestsOf(baseline));
	});

	it("ignores an unrelated catalog addition", () => {
		const baseline = accepted(compileInputFor(sqlApi));
		const widened = [...CATALOG, CHEAP_INCOMPATIBLE_CANDIDATE];
		const after = accepted(
			compileInputFor(sqlApi, {
				catalog: widened,
				catalogDigest: catalogDigestOf(widened),
			}),
		);
		expect(after.topologyDigest).toBe(baseline.topologyDigest);
		// The catalog digest moved; the resolution did not depend on the row.
		expect(after.resolutionDigest).toBe(baseline.resolutionDigest);
		expect(catalogDigestOf(widened)).not.toBe(CATALOG_DIGEST);
	});

	it("emits identical offer bytes for an unchanged compilation", () => {
		const build = (): string => {
			const compilation = accepted(compileInputFor(sqlApi));
			return canonicalOfferBytes(
				buildDeploymentOffer({
					compilation,
					recipe: sqlApi,
					request: requestForRecipe(sqlApi),
					catalogDigest: CATALOG_DIGEST,
					profileRegistryDigest: PROFILE_REGISTRY_DIGEST,
					issuedAtMs: NOW,
					signer: SIGNER,
				}),
			);
		};
		expect(build()).toBe(build());
	});

	it("holds for every first-party recipe at once", () => {
		for (const recipe of STANDARD_SOLUTION_RECIPES) {
			const baseline = digestsOf(compileInputFor(recipe));
			const shuffled = parseSolutionRecipe({
				...recipe,
				yards: [...recipe.yards].reverse(),
				placements: [...recipe.placements].reverse(),
				edges: [...recipe.edges].reverse(),
			});
			const catalog = [...CATALOG].reverse();
			expect(
				digestsOf(
					compileInputFor(shuffled, {
						request: withReversedKeys(requestForRecipe(recipe)),
						catalog,
						catalogDigest: catalogDigestOf(catalog),
						evidence: [...EVIDENCE].reverse(),
					}),
				),
			).toEqual(baseline);
		}
	});
});
