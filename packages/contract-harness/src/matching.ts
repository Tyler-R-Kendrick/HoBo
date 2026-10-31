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
 * and `matchResponseBody` compares an answer with the example under those
 * rules; `verifyPact(pact, provider, { responseMatchingRules })` uses it for
 * every interaction that declares any. The consumer side needs nothing: the
 * mock answers the example.
 *
 * Semantics are the Pact Specification v3's
 * (https://github.com/pact-foundation/pact-specification/tree/version-3,
 * "Matchers"):
 *
 * - Rules cascade: "a rule can be specified on a value and will apply to all
 *   children of that value". The rule for a value is the most specific one
 *   whose path is the value's own or an ancestor's ("Matcher selection
 *   algorithm": with only names and indices, the longest matching path has
 *   the largest weighting).
 * - `type`: "equal if they are the same type". On an object every key of the
 *   example must be present, and each is compared by type in turn (extra keys
 *   are allowed, as v2 "Response body" allows them); on an array each
 *   element is compared with the example's element at the same index while
 *   the example has one and with its first past that, as pact-reference does
 *   (v2's own example holds a `min: 5` list to its one example element), and
 *   `min` / `max` bound "the length of the actual value" ("MinType",
 *   "MaxType").
 * - `regex`: a full match, as Pact-JVM's and pact-reference's are, against
 *   "the string representation of a value" (a string, number or boolean). A
 *   regex rule is refused when read unless the example's value is a string.
 * - `equality`, the default, compares by value and resets a cascading rule on
 *   a child ("Add an equality matcher").
 * - `combine` is `AND` (the default: every matcher) or `OR` (at least one)
 *   ("Allow arrays of matchers to be defined against a matcher path").
 *
 * Anything else is refused when the rules are read, never ignored: another
 * matcher (`include`, `integer`, `datetime`, ...), a key a matcher or a rule
 * does not have, a path with `*` or bracketed names, a path the example does
 * not have, and an example that does not satisfy its own rules. A value with
 * no rule is compared as `verifyPact` compares any body: by value, arrays by
 * the example's elements.
 *
 * Paths are `$` followed by `.name` and `[index]` steps.
 * Records: `data-models/contract-harness.proto` `ResponseMatcher` and
 * `ResponseMatchingRule`, constrained by `contract-harness.cue`.
 */
import type { PactRequest } from "./pact.js";

/** A JSON value as `JSON.parse` returns it. */
export type PactJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly PactJsonValue[]
	| { readonly [key: string]: PactJsonValue };

type JsonRecord = { readonly [key: string]: PactJsonValue };

type Matcher =
	| { readonly match: "regex"; readonly regex: RegExp; readonly source: string }
	| { readonly match: "type"; readonly min?: number; readonly max?: number }
	| { readonly match: "equality" };

// public-contract: how a rule's matchers combine (Pact v3 `combine`).
export type MatcherCombination = "AND" | "OR";

type Step = string | number;

// domain-view: one rule, parsed (path steps, compiled RegExps, bounds); data-models/contract-harness.proto ResponseMatchingRule is its wire form.
export interface ResponseMatchingRule {
	readonly path: string;
	readonly steps: readonly Step[];
	readonly matchers: readonly Matcher[];
	readonly combine: MatcherCombination;
}

// domain-view: the parsed response rules of one interaction, in the pact's order.
export interface InteractionMatchingRules {
	readonly request: PactRequest;
	readonly example: PactJsonValue | undefined;
	readonly rules: readonly ResponseMatchingRule[];
}

export class MatchingRuleError extends Error {
	readonly code = "MATCHING_RULE_INVALID";

	constructor(message: string) {
		super(`MATCHING_RULE_INVALID: ${message}`);
		this.name = "MatchingRuleError";
	}
}

const tagOf = Object.prototype.toString;

function isRecord(value: PactJsonValue | undefined): value is JsonRecord {
	return tagOf.call(value) === "[object Object]";
}

function isText(value: PactJsonValue | undefined): value is string {
	return tagOf.call(value) === "[object String]";
}

function isList(
	value: PactJsonValue | undefined,
): value is readonly PactJsonValue[] {
	return Array.isArray(value);
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
export function parseMatchingPath(path: string): readonly Step[] {
	if (!path.startsWith("$")) {
		throw new MatchingRuleError(
			`path ${JSON.stringify(path)} must start with $`,
		);
	}
	const steps: Step[] = [];
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

/** The keys each matcher may carry; any other is refused. */
const MATCHER_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	["regex", new Set(["match", "regex"])],
	["type", new Set(["match", "min", "max"])],
	["equality", new Set(["match"])],
]);
const RULE_KEYS: ReadonlySet<string> = new Set(["matchers", "combine"]);

function refuseUnknownKeys(
	value: JsonRecord,
	allowed: ReadonlySet<string>,
	where: string,
	what: string,
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new MatchingRuleError(
				`${where} has key ${JSON.stringify(key)}; ${what} has only ${[...allowed].join(", ")}`,
			);
		}
	}
}

function bound(
	value: PactJsonValue | undefined,
	name: "min" | "max",
	where: string,
): number | undefined {
	if (value === undefined) return undefined;
	if (
		tagOf.call(value) !== "[object Number]" ||
		!Number.isSafeInteger(value) ||
		Number(value) < 0
	) {
		throw new MatchingRuleError(
			`${where} ${name} must be a non-negative integer, got ${JSON.stringify(value)}`,
		);
	}
	return Number(value);
}

function parseMatcher(value: PactJsonValue, where: string): Matcher {
	if (!isRecord(value) || !isText(value.match)) {
		throw new MatchingRuleError(`${where} must be an object with a match`);
	}
	const keys = MATCHER_KEYS.get(value.match);
	if (keys === undefined) {
		throw new MatchingRuleError(
			`${where} uses matcher ${JSON.stringify(value.match)}; only regex, type and equality are understood`,
		);
	}
	refuseUnknownKeys(value, keys, where, `a ${value.match} matcher`);
	switch (value.match) {
		case "regex": {
			const source = value.regex;
			if (!isText(source) || source === "") {
				throw new MatchingRuleError(`${where} names regex without a pattern`);
			}
			try {
				// A full match, as Pact-JVM's (`Matcher.matches()`) and
				// pact-reference's regex matchers are: the pattern must cover the
				// whole value, not some part of it.
				return {
					match: "regex",
					regex: new RegExp(`^(?:${source})$`, "u"),
					source,
				};
			} catch {
				throw new MatchingRuleError(
					`${where} regex ${JSON.stringify(source)} does not compile`,
				);
			}
		}
		case "type": {
			const min = bound(value.min, "min", where);
			const max = bound(value.max, "max", where);
			if (min !== undefined && max !== undefined && max < min) {
				throw new MatchingRuleError(`${where} max ${max} is below min ${min}`);
			}
			return {
				match: "type",
				...(min === undefined ? undefined : { min }),
				...(max === undefined ? undefined : { max }),
			};
		}
		default:
			return { match: "equality" };
	}
}

function parseCombine(
	value: PactJsonValue | undefined,
	where: string,
): MatcherCombination {
	if (value === undefined || value === "AND") return "AND";
	if (value === "OR") return "OR";
	throw new MatchingRuleError(
		`${where}.combine must be AND or OR, got ${JSON.stringify(value)}`,
	);
}

function at(
	value: PactJsonValue | undefined,
	steps: readonly Step[],
): PactJsonValue | undefined {
	let current = value;
	for (const step of steps) {
		current = isList(current)
			? current[Number(step)]
			: isRecord(current)
				? current[String(step)]
				: undefined;
		if (current === undefined) return undefined;
	}
	return current;
}

function parseRules(
	value: PactJsonValue | undefined,
	example: PactJsonValue | undefined,
	where: string,
): readonly ResponseMatchingRule[] {
	if (value === undefined) return [];
	if (!isRecord(value)) {
		throw new MatchingRuleError(`${where} must be an object`);
	}
	for (const key of Object.keys(value)) {
		if (key !== "body") {
			throw new MatchingRuleError(
				`${where}.${key}: only body rules are understood on a response`,
			);
		}
	}
	const body = value.body;
	if (body === undefined) return [];
	if (!isRecord(body)) {
		throw new MatchingRuleError(`${where}.body must be an object`);
	}
	const rules = Object.entries(body).map(([path, rule]) => {
		const here = `${where}.body[${JSON.stringify(path)}]`;
		if (!isRecord(rule)) {
			throw new MatchingRuleError(
				`${here} must carry a non-empty matchers list`,
			);
		}
		refuseUnknownKeys(rule, RULE_KEYS, here, "a rule");
		const { matchers } = rule;
		if (!isList(matchers) || matchers.length === 0) {
			throw new MatchingRuleError(
				`${here} must carry a non-empty matchers list`,
			);
		}
		const steps = parseMatchingPath(path);
		const value = at(example, steps);
		if (value === undefined) {
			throw new MatchingRuleError(
				`${here} names no field of the example response body`,
			);
		}
		const parsed = matchers.map((matcher, index) =>
			parseMatcher(matcher, `${here}.matchers[${index}]`),
		);
		if (parsed.some((matcher) => matcher.match === "regex") && !isText(value)) {
			throw new MatchingRuleError(
				`${here}: a regex applies to a string, and the example's ${path} is ${kindOf(value)}`,
			);
		}
		return Object.freeze({
			path,
			steps,
			matchers: Object.freeze(parsed),
			combine: parseCombine(rule.combine, here),
		});
	});
	const own = matchResponseBody(rules, example, example);
	if (own !== undefined) {
		throw new MatchingRuleError(
			`${where}: the example does not satisfy its own rules: ${own}`,
		);
	}
	return Object.freeze(rules);
}

/**
 * The response rules of every interaction in a raw pact document, in its
 * order. Refuses a rule it does not implement.
 */
export function parseResponseMatchingRules(
	document: PactJsonValue,
): readonly InteractionMatchingRules[] {
	if (!isRecord(document) || !isList(document.interactions)) {
		throw new MatchingRuleError("document must be a pact with interactions");
	}
	return Object.freeze(
		document.interactions.map((interaction, index) => {
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
				rules: parseRules(response.matchingRules, response.body, where),
			});
		}),
	);
}

// ---------------------------------------------------------------------------
// Matching

function pathText(steps: readonly Step[]): string {
	return `$${steps.map((step) => (tagOf.call(step) === "[object Number]" ? `[${step}]` : `.${step}`)).join("")}`;
}

function kindOf(value: PactJsonValue | undefined): string {
	if (value === undefined) return "missing";
	if (value === null) return "null";
	if (isList(value)) return "an array";
	if (isRecord(value)) return "an object";
	if (isText(value)) return "a string";
	return tagOf.call(value) === "[object Number]" ? "a number" : "a boolean";
}

/** The most specific rule whose path is `steps` or one of its ancestors. */
function ruleFor(
	rules: readonly ResponseMatchingRule[],
	steps: readonly Step[],
): ResponseMatchingRule | undefined {
	let chosen: ResponseMatchingRule | undefined;
	for (const rule of rules) {
		if (rule.steps.length > steps.length) continue;
		if (!rule.steps.every((step, index) => step === steps[index])) continue;
		if (chosen === undefined || rule.steps.length > chosen.steps.length) {
			chosen = rule;
		}
	}
	return chosen;
}

/** `$.x` and its value, as one comparison sees them. */
interface Node {
	readonly steps: readonly Step[];
	readonly actual: PactJsonValue | undefined;
	readonly example: PactJsonValue | undefined;
}

function child(
	node: Node,
	step: Step,
	example: PactJsonValue | undefined,
): Node {
	const actual = node.actual;
	return {
		steps: [...node.steps, step],
		actual: isList(actual)
			? actual[Number(step)]
			: isRecord(actual)
				? actual[String(step)]
				: undefined,
		example,
	};
}

/** Every key of the example, each compared in turn: an object's part of any comparison. */
function compareRecord(
	rules: readonly ResponseMatchingRule[],
	node: Node,
	example: JsonRecord,
): string | undefined {
	for (const [key, value] of Object.entries(example)) {
		const reason = compare(rules, child(node, key, value));
		if (reason !== undefined) return reason;
	}
	return undefined;
}

/** By value: what `verifyPact` does for a body with no rules. */
function byValue(
	rules: readonly ResponseMatchingRule[],
	node: Node,
): string | undefined {
	const { actual, example } = node;
	const where = pathText(node.steps);
	if (actual === undefined) return `body field ${where} is missing`;
	if (isRecord(example)) {
		return isRecord(actual)
			? compareRecord(rules, node, example)
			: `body field ${where} does not match`;
	}
	if (isList(example)) {
		if (!isList(actual) || actual.length < example.length) {
			return `body field ${where} does not match`;
		}
		for (const [index, value] of example.entries()) {
			const reason = compare(rules, child(node, index, value));
			if (reason !== undefined) return reason;
		}
		return undefined;
	}
	return actual === example ? undefined : `body field ${where} does not match`;
}

function byType(
	rules: readonly ResponseMatchingRule[],
	node: Node,
	matcher: Extract<Matcher, { readonly match: "type" }>,
	rule: ResponseMatchingRule,
): string | undefined {
	const { actual, example } = node;
	const where = pathText(node.steps);
	const because = `(type rule at ${rule.path})`;
	if (actual === undefined) return `body field ${where} is missing`;
	if (kindOf(actual) !== kindOf(example)) {
		return `body field ${where} is ${kindOf(actual)}, not ${kindOf(example)} like the example ${because}`;
	}
	if (isRecord(example) && isRecord(actual)) {
		return compareRecord(rules, node, example);
	}
	if (isList(example) && isList(actual)) {
		const count = `${actual.length} element${actual.length === 1 ? "" : "s"}`;
		if (matcher.min !== undefined && actual.length < matcher.min) {
			return `body field ${where} has ${count}, fewer than min ${matcher.min} ${because}`;
		}
		if (matcher.max !== undefined && actual.length > matcher.max) {
			return `body field ${where} has ${count}, more than max ${matcher.max} ${because}`;
		}
		// pact-reference: an element is compared with the example's at the
		// same index while the example has one, and past it with the first.
		const [first] = example;
		if (first === undefined) return undefined;
		for (const index of actual.keys()) {
			const reason = compare(
				rules,
				child(node, index, index < example.length ? example[index] : first),
			);
			if (reason !== undefined) return reason;
		}
	}
	return undefined;
}

function byRegex(
	node: Node,
	matcher: Extract<Matcher, { readonly match: "regex" }>,
): string | undefined {
	const { actual } = node;
	const where = pathText(node.steps);
	if (actual === undefined) return `body field ${where} is missing`;
	const text =
		isText(actual) ||
		tagOf.call(actual) === "[object Number]" ||
		tagOf.call(actual) === "[object Boolean]"
			? String(actual)
			: undefined;
	return text !== undefined && matcher.regex.test(text)
		? undefined
		: `body field ${where} does not match regex ${matcher.source}`;
}

function byMatcher(
	rules: readonly ResponseMatchingRule[],
	node: Node,
	matcher: Matcher,
	rule: ResponseMatchingRule,
): string | undefined {
	switch (matcher.match) {
		case "regex":
			return byRegex(node, matcher);
		case "type":
			return byType(rules, node, matcher, rule);
		case "equality":
			return byValue(rules, node);
	}
}

function compare(
	rules: readonly ResponseMatchingRule[],
	node: Node,
): string | undefined {
	const rule = ruleFor(rules, node.steps);
	if (rule === undefined) return byValue(rules, node);
	const reasons = rule.matchers.map((matcher) =>
		byMatcher(rules, node, matcher, rule),
	);
	if (rule.combine === "AND") {
		return reasons.find((reason) => reason !== undefined);
	}
	if (reasons.some((reason) => reason === undefined)) return undefined;
	const where = `body field ${pathText(node.steps)} `;
	return `${where}matches none of the rule at ${rule.path}: ${reasons
		.map((reason) =>
			reason?.startsWith(where) ? reason.slice(where.length) : reason,
		)
		.join("; ")}`;
}

/**
 * The first way `actual` fails the example under `rules`, as a reason a
 * verification report can carry, or `undefined` when it matches.
 */
export function matchResponseBody(
	rules: readonly ResponseMatchingRule[],
	example: PactJsonValue | undefined,
	actual: PactJsonValue | undefined,
): string | undefined {
	return compare(rules, { steps: [], actual, example });
}
