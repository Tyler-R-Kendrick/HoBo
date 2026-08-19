/**
 * Where a shape moved, the package it left must re-export it. Where it could
 * not move, the two declarations must still agree — and the exact way they do
 * *not* agree has to be pinned, or a real divergence hides inside a general
 * "these are close enough".
 *
 * Three shapes, three different states, all read off the real files:
 *
 * - `CapabilityRequirement` / `SelectionCandidate` — moved, re-exported,
 *   verified by identity in `single-owner.test.ts`.
 * - `ResourceIntent` — moved, and `packages/cloud/src/plan-types.ts` re-exports
 *   it. Nothing left to drift.
 * - `ResourcePlan` / `DeploymentPlan` — moved into `@hobo/manifest-plan`, and
 *   the re-export is **blocked**. This suite is what keeps the two copies
 *   honest until it is not, and names the blocker precisely enough that the day
 *   it is removed, this suite says so.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	type DeclaredField,
	declaredFields,
	fieldNames,
} from "./declared-fields.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string): string =>
	readFileSync(`${REPO_ROOT}${relative}`, "utf8");

const PLAN_TYPES = read("packages/cloud/src/plan-types.ts");
const MANIFEST_PLAN = read("packages/manifest-plan/src/index.ts");

/** The phantom brand key has no counterpart upstream and no wire form. */
const withoutBrand = (
	fields: readonly DeclaredField[],
): readonly DeclaredField[] =>
	fields.filter((field) => !field.name.startsWith("["));

describe("ResourceIntent moved and is re-exported", () => {
	it("plan-types.ts no longer declares it and names its owner", () => {
		expect(() => declaredFields(PLAN_TYPES, "ResourceIntent")).toThrow(
			/no exported declaration named ResourceIntent/u,
		);
		expect(PLAN_TYPES).toContain('} from "@hobo/manifest-declaration";');
		// The placement vocabulary moved with it; a partial move would leave
		// `PlacementCriteria` declared here and referring to a type that is not.
		for (const name of [
			"PlacementCriteria",
			"PlacementPropertySelector",
			"PlacementAffinityRule",
			"PlacementSpread",
			"PlacementPickN",
		]) {
			expect(() => declaredFields(PLAN_TYPES, name)).toThrow(
				DeclarationNotFoundMessage(name),
			);
			expect(PLAN_TYPES).toContain(`type ${name},`);
		}
	});

	it("the authoring type it re-exports is the unbranded one", () => {
		// `@hobo/cloud` builds intents with object literals and assigns
		// `intent.region` after construction. Re-exporting `ParsedResourceIntent`
		// under the name `ResourceIntent` would compile here and break there, so
		// the two names are pinned as distinct re-exports.
		expect(PLAN_TYPES).toMatch(/^\ttype ResourceIntent,$/mu);
		expect(PLAN_TYPES).toMatch(/^\ttype ParsedResourceIntent,$/mu);
	});
});

function DeclarationNotFoundMessage(name: string): RegExp {
	return new RegExp(`no exported declaration named ${name}`, "u");
}

describe("ResourcePlan and DeploymentPlan are still declared twice", () => {
	it.each([
		"ResourcePlan",
		"DeploymentPlan",
	])("%s has the same fields and optionality in both files", (name) => {
		const upstream = withoutBrand(declaredFields(PLAN_TYPES, name));
		const owner = withoutBrand(declaredFields(MANIFEST_PLAN, name));
		// Non-trivial on both sides, or the comparison below proves nothing.
		expect(upstream.length).toBeGreaterThan(3);
		expect(fieldNames(owner)).toEqual(fieldNames(upstream));
		expect(owner.map((f) => f.optional)).toEqual(
			upstream.map((f) => f.optional),
		);
	});

	it("differs in exactly the four declared types recorded here, and no others", () => {
		// Every difference is either a `readonly` the owner adds — harmless,
		// removable by a mapped type — or the one that is not. Listing them
		// exhaustively is what makes a *fifth* difference appearing a failure
		// rather than something a reviewer has to notice.
		const differences: string[] = [];
		for (const name of ["ResourcePlan", "DeploymentPlan"]) {
			const upstream = withoutBrand(declaredFields(PLAN_TYPES, name));
			const owner = withoutBrand(declaredFields(MANIFEST_PLAN, name));
			for (const [index, field] of owner.entries()) {
				const theirs = upstream[index] as DeclaredField;
				if (field.type !== theirs.type) {
					differences.push(
						`${name}.${field.name}: ${theirs.type} -> ${field.type}`,
					);
				}
			}
		}
		expect(differences).toEqual([
			"ResourcePlan.deps: string[] -> readonly string[]",
			"ResourcePlan.realizationParameters: Readonly<Record<string, unknown>> -> Readonly<Record<string, PlanParameterValue>>",
			"DeploymentPlan.resources: ResourcePlan[] -> readonly ResourcePlan[]",
			"DeploymentPlan.dependencyOrder: string[] -> readonly string[]",
		]);
	});

	it("the one difference that blocks the re-export is still upstream, and this is where to look when it is not", () => {
		// Three of the four differences above are `readonly`, which a mapped type
		// removes. The fourth is a real narrowing: the owner admits only JSON
		// values, because a `Date`, a function or an `undefined` canonicalizes to
		// something other than itself and would move the plan digest.
		//
		// It cannot be closed inside `plan-types.ts`. The `unknown` is carried all
		// the way back through the planner to `@hobo/yards`' binding row, whose
		// sibling authoring surface in `yard.ts` already says `JsonValue` — so
		// `binding.ts` is the outlier, not the standard.
		//
		// When someone narrows it, this test fails. That is the intent: the
		// failure message is the instruction to re-export the plan shapes and
		// delete the second declaration.
		const binding = read("packages/yards/src/binding.ts");
		const yard = read("packages/yards/src/yard.ts");
		expect(binding).toContain(
			"readonly properties?: Readonly<Record<string, unknown>>;",
		);
		expect(yard).toContain(
			"readonly properties: Readonly<Record<string, JsonValue>>;",
		);
		expect(read("packages/cloud/src/planner/profile-matching.ts")).toContain(
			"readonly realizationParameters?: Readonly<Record<string, unknown>>;",
		);
	});
});
