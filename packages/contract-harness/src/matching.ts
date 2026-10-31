/**
 * Pact v3 response matching rules, applied on the provider side.
 *
 * `verifyPact` compares the fields a pact declares by value. A provider that
 * generates identifiers (`prj_8b87…`, `dpl_d9f6…`) can never answer a pinned
 * example, so a pact against one either leaves the identifier out, and with
 * it the consumer's dependence on it, or declares its shape. This module reads
 * the shape from the standard v3 location,
 *
 *   "response": { "body": { "id": "prj_8b8788b1b182" },
 *                 "matchingRules": { "body": { "$.id": {
 *                   "matchers": [{ "match": "regex", "regex": "^prj_[0-9a-f]+$" }] } } } }
 *
 * and `withResponseMatchingRules` wraps a `ProviderStub` so that a real
 * answer whose value at `$.id` matches the rule is reported to `verifyPact`
 * with the pact's example in its place. A value that does not match is left
 * as it is, so `verifyPact` still reports it. Only `regex`, `type` and
 * `equality` (the default) are understood; any other matcher is refused when
 * the rules are read, never ignored. The consumer side needs nothing: the
 * mock answers the example.
 *
 * Paths are `$` followed by `.name` and `[index]` steps.
 */
import type { PactRequest, PactResponse } from "./pact.js";
import { isRecursiveSubset } from "./subset.js";
import type { ProviderStub } from "./verify.js";

/** A JSON value as `JSON.parse` returns it. */
export type PactJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly PactJsonValue[]
	| { readonly [key: string]: PactJsonValue };

type Matcher =
	| { readonly match: "regex"; readonly regex: RegExp }
	| { readonly match: "type" }
	| { readonly match: "equality" };

// domain-view: one rule, parsed (path steps and a compiled RegExp); data-models/contract-harness.proto ResponseMatchingRule is its wire form.
export interface ResponseMatchingRule {
	readonly path: string;
	readonly steps: readonly (string | number)[];
	readonly matchers: readonly Matcher[];
}

interface InteractionRules {
	readonly request: PactRequest;
	readonly example: PactResponse["body"];
	readonly rules: readonly ResponseMatchingRule[];
}

export class MatchingRuleError extends Error {
	constructor(message: string) {
		super(`MATCHING_RULE_INVALID: ${message}`);
		this.name = "MatchingRuleError";
	}
}

const tagOf = Object.prototype.toString;

function isRecord(
	value: PactJsonValue | undefined,
): value is { readonly [key: string]: PactJsonValue } {
	return tagOf.call(value) === "[object Object]";
}

function isText(value: PactJsonValue | undefined): value is string {
	return tagOf.call(value) === "[object String]";
}

const METHODS: ReadonlySet<string> = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
]);

function isMethod(value: string): value is PactRequest["method"] {
	return METHODS.has(value);
}

const STEP = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]/guy;

/** `$.a[0].b` -> ["a", 0, "b"]; anything else is refused. */
export function parseMatchingPath(path: string): readonly (string | number)[] {
	if (!path.startsWith("$")) {
		throw new MatchingRuleError(
			`path ${JSON.stringify(path)} must start with $`,
		);
	}
	const steps: (string | number)[] = [];
	STEP.lastIndex = 1;
	while (STEP.lastIndex < path.length) {
		const at = STEP.lastIndex;
		const step = STEP.exec(path);
		if (step === null || step.index !== at) {
			throw new MatchingRuleError(
				`path ${JSON.stringify(path)} is not $ followed by .name and [index] steps`,
			);
		}
		steps.push(step[1] ?? Number(step[2]));
	}
	return Object.freeze(steps);
}

function parseMatcher(value: PactJsonValue, where: string): Matcher {
	if (!isRecord(value) || !isText(value.match)) {
		throw new MatchingRuleError(`${where} must be an object with a match`);
	}
	switch (value.match) {
		case "regex": {
			const source = value.regex;
			if (!isText(source)) {
				throw new MatchingRuleError(`${where} names regex without a pattern`);
			}
			try {
				return { match: "regex", regex: new RegExp(source, "u") };
			} catch {
				throw new MatchingRuleError(
					`${where} regex ${JSON.stringify(source)} does not compile`,
				);
			}
		}
		case "type":
			return { match: "type" };
		case "equality":
			return { match: "equality" };
		default:
			throw new MatchingRuleError(
				`${where} uses matcher ${JSON.stringify(value.match)}; only regex, type and equality are understood`,
			);
	}
}

function parseRules(
	value: PactJsonValue | undefined,
	where: string,
): readonly ResponseMatchingRule[] {
	if (value === undefined) return [];
	if (!isRecord(value))
		throw new MatchingRuleError(`${where} must be an object`);
	const body = value.body;
	for (const key of Object.keys(value)) {
		if (key !== "body") {
			throw new MatchingRuleError(
				`${where}.${key}: only body rules are understood on a response`,
			);
		}
	}
	if (body === undefined) return [];
	if (!isRecord(body))
		throw new MatchingRuleError(`${where}.body must be an object`);
	return Object.entries(body).map(([path, rule]) => {
		const at = `${where}.body[${JSON.stringify(path)}]`;
		if (
			!isRecord(rule) ||
			!Array.isArray(rule.matchers) ||
			rule.matchers.length === 0
		) {
			throw new MatchingRuleError(`${at} must carry a non-empty matchers list`);
		}
		return Object.freeze({
			path,
			steps: parseMatchingPath(path),
			matchers: Object.freeze(
				rule.matchers.map((matcher, index) =>
					parseMatcher(matcher, `${at}.matchers[${index}]`),
				),
			),
		});
	});
}

function at(
	value: PactJsonValue | undefined,
	steps: readonly (string | number)[],
): PactJsonValue | undefined {
	let current = value;
	for (const step of steps) {
		if (current === undefined || current === null) return undefined;
		current = Array.isArray(current)
			? current[Number(step)]
			: isRecord(current)
				? current[String(step)]
				: undefined;
	}
	return current;
}

/** A copy of `value` with `replacement` at `steps`; the path must exist. */
function replaced(
	value: PactJsonValue,
	steps: readonly (string | number)[],
	replacement: PactJsonValue,
): PactJsonValue {
	const [step, ...rest] = steps;
	if (step === undefined) return replacement;
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			index === step ? replaced(item, rest, replacement) : item,
		);
	}
	if (isRecord(value)) {
		return {
			...value,
			[step]: replaced(value[String(step)] ?? null, rest, replacement),
		};
	}
	return value;
}

function kindOf(value: PactJsonValue | undefined): string {
	return Array.isArray(value) ? "array" : tagOf.call(value);
}

function satisfies(
	matcher: Matcher,
	actual: PactJsonValue | undefined,
	example: PactJsonValue | undefined,
): boolean {
	switch (matcher.match) {
		case "regex":
			return isText(actual) && matcher.regex.test(actual);
		case "type":
			return actual !== undefined && kindOf(actual) === kindOf(example);
		case "equality":
			return false;
	}
}

/**
 * The response rules of every interaction in a raw pact document, keyed by
 * its request. Refuses a rule it does not understand.
 */
export function parseResponseMatchingRules(
	document: PactJsonValue,
): readonly InteractionRules[] {
	if (!isRecord(document) || !Array.isArray(document.interactions)) {
		throw new MatchingRuleError("document must be a pact with interactions");
	}
	return document.interactions.map((interaction, index) => {
		const where = `interactions[${index}].response.matchingRules`;
		if (
			!isRecord(interaction) ||
			!isRecord(interaction.request) ||
			!isRecord(interaction.response)
		) {
			throw new MatchingRuleError(
				`interactions[${index}] must carry a request and a response`,
			);
		}
		const { request, response } = interaction;
		const { method, path } = request;
		if (!isText(method) || !isMethod(method) || !isText(path)) {
			throw new MatchingRuleError(
				`interactions[${index}].request needs a method and a path`,
			);
		}
		return Object.freeze({
			request: {
				method,
				path,
				...(request.body === undefined ? undefined : { body: request.body }),
			},
			example: response.body,
			rules: parseRules(response.matchingRules, where),
		});
	});
}

function sameRequest(expected: PactRequest, actual: PactRequest): boolean {
	return (
		expected.method === actual.method &&
		expected.path === actual.path &&
		(expected.body === undefined ||
			isRecursiveSubset(expected.body, actual.body))
	);
}

/**
 * A stub whose answers carry the pact's example wherever the real value
 * satisfies the interaction's rule, and the real value everywhere else.
 */
export function withResponseMatchingRules(
	stub: ProviderStub,
	rules: readonly InteractionRules[],
): ProviderStub {
	return {
		name: stub.name,
		async handle(request: PactRequest): Promise<PactResponse> {
			const answer = await stub.handle(request);
			const interaction = rules.find((candidate) =>
				sameRequest(candidate.request, request),
			);
			if (interaction === undefined || interaction.rules.length === 0) {
				return answer;
			}
			// SAFETY: a provider answer body is parsed JSON (or text), which is a PactJsonValue.
			let body = answer.body as PactJsonValue;
			for (const rule of interaction.rules) {
				// SAFETY: the example is the pact's response body, parsed JSON.
				const example = at(interaction.example as PactJsonValue, rule.steps);
				const actual = at(body, rule.steps);
				if (
					example !== undefined &&
					rule.matchers.every((matcher) => satisfies(matcher, actual, example))
				) {
					body = replaced(body, rule.steps, example);
				}
			}
			return { ...answer, body };
		},
	};
}
