/**
 * E20: the typed realization output contract (`hobo.realization-result/v1`).
 * Every case is a line in `realization-result.cases.jsonl`.
 *
 * Rejections are returned as data rather than thrown at the case, because the
 * fail-closed rule here has two halves — the right rejection code *and* the
 * secret staying out of the message — and a negated substring check buried in
 * an `assert.throws` predicate cannot be read as a case. `parseRejection`
 * reports `leaks`, so redaction is asserted rather than assumed.
 */

import { describeConcern } from "@hobo/contract-harness";
import {
	fromIacOutputs,
	fromRecipeOutputs,
	isSecretRefString,
	looksLikeSecretKey,
	parseRealizationResult,
	REALIZATION_RESULT_SCHEMA,
	RealizationResultParseError,
} from "../src/ports/realization-result.js";

const withSchema = (body: Record<string, unknown> = {}) => ({
	schema: REALIZATION_RESULT_SCHEMA,
	...body,
});

/** Whatever threw, described as data. */
function rejectionOf(run: () => unknown, secrets: readonly string[]) {
	try {
		run();
		return { threw: false };
	} catch (error) {
		const typed = error instanceof RealizationResultParseError;
		const message = String((error as Error).message);
		return {
			threw: true,
			typed,
			rejection: typed
				? (error as RealizationResultParseError).rejection
				: null,
			received: typed
				? ((error as RealizationResultParseError).received ?? null)
				: null,
			// Empty is the assertion: a rejection must not echo the secret it caught.
			leaks: secrets.filter((secret) => message.includes(secret)),
		};
	}
}

const names = (result: { resources: readonly unknown[] }) =>
	(result.resources as readonly Record<string, string>[]).map((resource) => ({
		name: resource.name,
		resourceClass: resource.resourceClass,
		providerId: resource.providerId,
	}));

describeConcern("realization result", {
	cases: `${import.meta.dirname}/realization-result.cases.jsonl`,
	subject: () => ({
		/** Parse a body that already carries the schema key. */
		parse: (body?: Record<string, unknown>) =>
			parseRealizationResult(withSchema(body)),
		parseRejection: (body: unknown, secrets: readonly string[] = []) =>
			rejectionOf(() => parseRealizationResult(body), secrets),
		/** Parsing its own output must be a fixed point. */
		isRoundTripStable: (body?: Record<string, unknown>) => {
			const once = parseRealizationResult(withSchema(body));
			const twice = parseRealizationResult(JSON.parse(JSON.stringify(once)));
			return JSON.stringify(once) === JSON.stringify(twice);
		},
		looksLikeSecretKey,
		isSecretRefString,
		iacOutputs: (triple: Parameters<typeof fromIacOutputs>[0]) => {
			const parsed = fromIacOutputs(triple);
			return {
				resources: names(parsed),
				values: parsed.values,
				bindingKeys: parsed.bindings.map((binding) => binding.key),
				secrets: parsed.secrets,
			};
		},
		iacRejection: (
			triple: Parameters<typeof fromIacOutputs>[0],
			secrets: readonly string[] = [],
		) => rejectionOf(() => fromIacOutputs(triple), secrets),
		recipeOutputs: (
			result: Parameters<typeof fromRecipeOutputs>[0],
			options?: Parameters<typeof fromRecipeOutputs>[1],
		) => {
			const parsed = fromRecipeOutputs(result, options);
			return { resources: names(parsed), secrets: parsed.secrets };
		},
		recipeRejection: (
			result: Parameters<typeof fromRecipeOutputs>[0],
			secrets: readonly string[] = [],
		) => rejectionOf(() => fromRecipeOutputs(result), secrets),
	}),
});
