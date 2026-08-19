/**
 * The plan manifest: the resolved DAG the Planner emits and the control plane
 * content-addresses.
 *
 * Parse, don't validate. The types below are the parsed derived domain types a
 * consumer works with; their protobuf wire forms live in
 * `data-models/resource_plan.proto` and their CUE constraints in
 * `data-models/resource_plan.cue`. `parseResourcePlan` and
 * `parseDeploymentPlan` are the only way to obtain a value of these types —
 * they are branded, so a raw record cannot be cast into one by accident and no
 * downstream code has to re-validate.
 *
 * ### Why this package owns the canonical form
 *
 * A `DeploymentPlan` is content-addressed: `hashDeploymentPlan` is compared
 * across packages, and `packages/cloud/test/planner.test.ts` pins the digest of
 * `test/fixtures/golden-plan.json` as a committed constant. So the
 * canonicalization is not an implementation detail of a serializer, it is part
 * of the contract, and it is reproduced here byte-for-byte rather than
 * borrowed:
 *
 * `@hobo/core` exports a `sortKeys` that looks interchangeable with the one
 * `@hobo/cloud` keeps private, but it is not. Core sorts with
 * `String.prototype.localeCompare` (ICU collation); cloud sorts with the
 * default comparator (UTF-16 code unit order). They disagree whenever two keys
 * differ only in case or in where an underscore falls — `{Tier, tier}` sorts
 * `["Tier","tier"]` under cloud and `["tier","Tier"]` under core. Plan digests
 * would be stable for the fixed field names and silently fork on
 * `realizationParameters`, whose keys are author-supplied. This module
 * therefore carries cloud's comparator, and `test/canonical-form.test.ts` pins
 * the divergence so a future "just reuse the shared helper" cannot land
 * quietly.
 *
 * ### Where this sits in the event architecture
 *
 * A `DeploymentPlan` is not itself a command or an event: the `deploy` command
 * produces it, the `deployment.Planned` event carries it together with its
 * hash, and the deployment saga actor replays that event from the event store
 * to rebuild its state. The deployment-view projection materializes the plan
 * into a read store as a materialized view keyed by deployment id, and an
 * actor snapshot records the plan hash rather than the plan, which is what
 * makes the hash worth being exact about.
 */

import { createHash } from "node:crypto";

// The schema discriminant of a DeploymentPlan record. It is hashed as part of
// the plan, so a consumer pins this exact string rather than deriving it.
// public-contract: plan schema discriminant, hashed into every plan digest.
export const DEPLOYMENT_PLAN_SCHEMA = "hobo.deployment-plan/v1" as const;

/**
 * An arbitrary JSON value, matching `google.protobuf.Value`.
 *
 * `undefined` is deliberately absent: it is not a JSON value, `JSON.stringify`
 * silently drops object properties holding it, and a silent drop changes the
 * plan digest. `parseResourcePlan` refuses it rather than normalizing it.
 */
export type PlanParameterValue =
	| null
	| boolean
	| number
	| string
	| readonly PlanParameterValue[]
	| { readonly [key: string]: PlanParameterValue };

declare const resourcePlanBrand: unique symbol;

// domain-view: parsed plan node; wire form is ResourcePlan in data-models/resource_plan.proto.
export type ResourcePlan = {
	readonly name: string;
	readonly port: string;
	readonly provider: string;
	readonly deps: readonly string[];
	readonly strategy?: string;
	readonly region?: string;
	readonly deploymentId?: string;
	readonly productId?: string;
	readonly realizationParameters?: Readonly<Record<string, PlanParameterValue>>;
	readonly nonPortableRows?: readonly string[];
	readonly [resourcePlanBrand]: "ResourcePlan";
};

declare const deploymentPlanBrand: unique symbol;

// domain-view: parsed content-addressed plan DAG; wire form is DeploymentPlan in data-models/resource_plan.proto.
export type DeploymentPlan = {
	readonly schema: typeof DEPLOYMENT_PLAN_SCHEMA;
	readonly resources: readonly ResourcePlan[];
	readonly dependencyOrder: readonly string[];
	readonly objective: string;
	readonly [deploymentPlanBrand]: "DeploymentPlan";
};

export type PlanHash = `sha256:${string}`;

export class ResourcePlanError extends Error {
	readonly code = "INVALID_RESOURCE_PLAN" as const;
	/** Dotted path of the offending field, e.g. `resources[2].productId`. */
	readonly path: string;

	constructor(path: string, detail: string) {
		super(`invalid resource plan at ${path}: ${detail}`);
		this.name = "ResourcePlanError";
		this.path = path;
	}
}

export class DeploymentPlanError extends Error {
	readonly code = "INVALID_DEPLOYMENT_PLAN" as const;
	readonly path: string;

	constructor(path: string, detail: string) {
		super(`invalid deployment plan at ${path}: ${detail}`);
		this.name = "DeploymentPlanError";
		this.path = path;
	}
}

/**
 * Property keys that read as a secret value rather than a locator.
 *
 * Character-for-character `CREDENTIAL_KEY_PATTERN` in
 * `packages/yards/src/canonical.ts`. That boundary already refuses these when a
 * Yard binding row is authored; refusing them again here is not redundancy but
 * the second half of the same law — a plan assembled by any route other than
 * the planner would otherwise carry credential material into a record that gets
 * hashed, logged and projected.
 */
const CREDENTIAL_KEY_PATTERN =
	/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i;

const RESOURCE_PLAN_KEYS = [
	"name",
	"port",
	"provider",
	"deps",
	"strategy",
	"region",
	"deploymentId",
	"productId",
	"realizationParameters",
	"nonPortableRows",
] as const;

const DEPLOYMENT_PLAN_KEYS = [
	"schema",
	"resources",
	"dependencyOrder",
	"objective",
] as const;

type Fail = (path: string, detail: string) => never;

function record(
	value: unknown,
	path: string,
	fail: Fail,
): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail(path, `expected an object, received ${describe(value)}`);
	}
	return value as Record<string, unknown>;
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	if (value === undefined) return "undefined";
	return `${typeof value} ${JSON.stringify(value)}`;
}

function rejectUnknownKeys(
	source: Record<string, unknown>,
	allowed: readonly string[],
	path: string,
	fail: Fail,
): void {
	for (const key of Object.keys(source)) {
		if (!allowed.includes(key)) {
			fail(
				`${path}.${key}`,
				`unknown field; a field this schema does not carry would be dropped from the canonical form and change the plan digest`,
			);
		}
	}
}

function requiredString(
	source: Record<string, unknown>,
	key: string,
	path: string,
	fail: Fail,
	{ allowEmpty = false }: { allowEmpty?: boolean } = {},
): string {
	const value = source[key];
	if (typeof value !== "string") {
		fail(`${path}.${key}`, `expected a string, received ${describe(value)}`);
	}
	if (!allowEmpty && value.length === 0) {
		fail(`${path}.${key}`, "expected a non-empty string");
	}
	return value;
}

/**
 * Read an optional field under `exactOptionalPropertyTypes`.
 *
 * Absent and present-but-`undefined` are different inputs and this boundary
 * keeps them different: an absent key yields `undefined` and the caller omits
 * the property entirely, while a key that is present holding `undefined` (or
 * `null`) is refused. Normalizing the second into the first is the conflation
 * the flag exists to prevent, and it is not cosmetic here — `JSON.stringify`
 * drops a property whose value is `undefined`, so accepting it would let a
 * caller believe it set a field that never reached the digest.
 */
function optionalString(
	source: Record<string, unknown>,
	key: string,
	path: string,
	fail: Fail,
	{ allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | undefined {
	if (!Object.hasOwn(source, key)) return undefined;
	const value = source[key];
	if (value === undefined || value === null) {
		fail(
			`${path}.${key}`,
			`optional field is present holding ${value === null ? "null" : "undefined"}; an optional field must be absent, not empty-valued`,
		);
	}
	return requiredString(source, key, path, fail, { allowEmpty });
}

function stringArray(
	value: unknown,
	path: string,
	fail: Fail,
	{ allowEmptyEntries }: { allowEmptyEntries: boolean },
): readonly string[] {
	if (!Array.isArray(value)) {
		fail(path, `expected an array of strings, received ${describe(value)}`);
	}
	return Object.freeze(
		value.map((entry, index) => {
			if (typeof entry !== "string") {
				fail(
					`${path}[${index}]`,
					`expected a string, received ${describe(entry)}`,
				);
			}
			if (!allowEmptyEntries && entry.length === 0) {
				fail(`${path}[${index}]`, "expected a non-empty string");
			}
			return entry;
		}),
	);
}

function parameterValue(
	value: unknown,
	path: string,
	fail: Fail,
): PlanParameterValue {
	if (value === null) return null;
	switch (typeof value) {
		case "boolean":
		case "string":
			return value;
		case "number":
			// NaN and ±Infinity are not JSON. `JSON.stringify` turns each into
			// `null`, so admitting one would mean the parsed value and the value
			// that gets hashed disagree — a silent digest mutation.
			if (!Number.isFinite(value)) {
				fail(
					path,
					`expected a finite number, received ${value}; it is not representable in JSON and would canonicalize to null`,
				);
			}
			return value;
		default:
			break;
	}
	if (Array.isArray(value)) {
		return Object.freeze(
			value.map((entry, index) =>
				parameterValue(entry, `${path}[${index}]`, fail),
			),
		);
	}
	if (typeof value === "object") {
		// Plain objects only. A Date, a Map, or any class instance is `typeof
		// "object"` with no own enumerable keys, so walking it as a record would
		// quietly produce `{}` — while `JSON.stringify` would produce something
		// else entirely (a Date serializes to a string through `toJSON`). The
		// parsed value and the value that gets hashed would then disagree, which
		// is the one thing this boundary exists to prevent.
		const prototype = Object.getPrototypeOf(value) as unknown;
		if (prototype !== Object.prototype && prototype !== null) {
			fail(
				path,
				`expected a plain JSON object, received an instance of ${(value as object).constructor?.name ?? "an exotic object"}; it has no faithful canonical form`,
			);
		}
		const source = value as Record<string, unknown>;
		const out: Record<string, PlanParameterValue> = {};
		for (const key of Object.keys(source)) {
			if (!Object.hasOwn(source, key)) continue;
			out[key] = parameterValue(source[key], `${path}.${key}`, fail);
		}
		return Object.freeze(out);
	}
	fail(
		path,
		`expected a JSON value, received ${describe(value)}; realization parameters are serialized into the plan digest, so a non-JSON value has no canonical form`,
	);
}

function realizationParameters(
	value: unknown,
	path: string,
	fail: Fail,
): Readonly<Record<string, PlanParameterValue>> {
	const source = record(value, path, fail);
	const out: Record<string, PlanParameterValue> = {};
	for (const key of Object.keys(source)) {
		if (CREDENTIAL_KEY_PATTERN.test(key)) {
			fail(
				`${path}.${key}`,
				"realization parameters carry locators, never credential values; reference the secret by locator instead",
			);
		}
		const entry = source[key];
		if (entry === undefined) {
			fail(
				`${path}.${key}`,
				"realization parameter is present holding undefined; JSON.stringify drops it, so it would never reach the plan digest",
			);
		}
		out[key] = parameterValue(entry, `${path}.${key}`, fail);
	}
	return Object.freeze(out);
}

/**
 * Parse-don't-validate boundary for one plan node.
 *
 * @param input a raw record, typically straight from JSON.
 * @param path dotted path used in error messages when the node is nested
 *   inside a plan.
 * @throws {ResourcePlanError} naming the exact offending field.
 */
export function parseResourcePlan(
	input: unknown,
	path = "resource",
): ResourcePlan {
	const fail: Fail = (at, detail) => {
		throw new ResourcePlanError(at, detail);
	};
	const source = record(input, path, fail);
	rejectUnknownKeys(source, RESOURCE_PLAN_KEYS, path, fail);

	const name = requiredString(source, "name", path, fail);
	const port = requiredString(source, "port", path, fail);
	const provider = requiredString(source, "provider", path, fail);
	if (!Object.hasOwn(source, "deps")) {
		fail(
			`${path}.deps`,
			"required field is absent; a node with no dependencies carries an empty array, because absent and empty hash differently",
		);
	}
	const deps = stringArray(source.deps, `${path}.deps`, fail, {
		// Matches hobo.cloud.v1's `deps: [...string]`. An empty dep id names
		// nothing and is almost certainly an authoring defect, but refusing it
		// here would be this package tightening the plan contract on its own;
		// see the README.
		allowEmptyEntries: true,
	});

	// `strategy`, `region` and `deploymentId` admit "" to match the CUE
	// constraint they were decomposed from. `productId` does not.
	const strategy = optionalString(source, "strategy", path, fail, {
		allowEmpty: true,
	});
	const region = optionalString(source, "region", path, fail, {
		allowEmpty: true,
	});
	const deploymentId = optionalString(source, "deploymentId", path, fail, {
		allowEmpty: true,
	});
	const productId = optionalString(source, "productId", path, fail);

	let parameters: Readonly<Record<string, PlanParameterValue>> | undefined;
	if (Object.hasOwn(source, "realizationParameters")) {
		const raw = source.realizationParameters;
		if (raw === undefined || raw === null) {
			fail(
				`${path}.realizationParameters`,
				`optional field is present holding ${raw === null ? "null" : "undefined"}; an optional field must be absent, not empty-valued`,
			);
		}
		parameters = realizationParameters(
			raw,
			`${path}.realizationParameters`,
			fail,
		);
	}

	let rows: readonly string[] | undefined;
	if (Object.hasOwn(source, "nonPortableRows")) {
		const raw = source.nonPortableRows;
		if (raw === undefined || raw === null) {
			fail(
				`${path}.nonPortableRows`,
				`optional field is present holding ${raw === null ? "null" : "undefined"}; an optional field must be absent, not empty-valued`,
			);
		}
		rows = stringArray(raw, `${path}.nonPortableRows`, fail, {
			allowEmptyEntries: false,
		});
	}

	// Spread-if-present, never `key: undefined`: under
	// exactOptionalPropertyTypes the two are different values, and the second
	// one disappears from the canonical JSON without disappearing from
	// `Object.keys`.
	return Object.freeze({
		name,
		port,
		provider,
		deps,
		...(strategy !== undefined ? { strategy } : {}),
		...(region !== undefined ? { region } : {}),
		...(deploymentId !== undefined ? { deploymentId } : {}),
		...(productId !== undefined ? { productId } : {}),
		...(parameters !== undefined ? { realizationParameters: parameters } : {}),
		...(rows !== undefined ? { nonPortableRows: rows } : {}),
	}) as ResourcePlan;
}

/**
 * Parse-don't-validate boundary for a whole plan DAG.
 *
 * What this refuses is structural: shape, presence, unknown fields, duplicate
 * resource names. What it deliberately does **not** refuse is a
 * `dependencyOrder` that is not a topological order, or a `deps` entry naming a
 * resource outside the plan. Both are admitted by the producing planner today
 * (`packages/cloud/src/planner/plan.ts` skips unknown deps outright and appends
 * the members of a dependency cycle alphabetically rather than rejecting), so
 * refusing them here would reject plans the system currently emits. See the
 * README.
 *
 * @throws {DeploymentPlanError} for plan-level faults.
 * @throws {ResourcePlanError} for a fault inside one node.
 */
export function parseDeploymentPlan(input: unknown): DeploymentPlan {
	const path = "plan";
	const fail: Fail = (at, detail) => {
		throw new DeploymentPlanError(at, detail);
	};
	const source = record(input, path, fail);
	rejectUnknownKeys(source, DEPLOYMENT_PLAN_KEYS, path, fail);

	const schema = requiredString(source, "schema", path, fail);
	if (schema !== DEPLOYMENT_PLAN_SCHEMA) {
		fail(
			`${path}.schema`,
			`expected ${JSON.stringify(DEPLOYMENT_PLAN_SCHEMA)}, received ${JSON.stringify(schema)}`,
		);
	}

	if (!Array.isArray(source.resources)) {
		fail(
			`${path}.resources`,
			`expected an array, received ${describe(source.resources)}`,
		);
	}
	const resources = Object.freeze(
		source.resources.map((entry, index) =>
			parseResourcePlan(entry, `${path}.resources[${index}]`),
		),
	);

	const seen = new Set<string>();
	for (const [index, resource] of resources.entries()) {
		if (seen.has(resource.name)) {
			fail(
				`${path}.resources[${index}].name`,
				`duplicate resource name ${JSON.stringify(resource.name)}; deps and dependencyOrder address nodes by name, so a duplicate makes both ambiguous`,
			);
		}
		seen.add(resource.name);
	}

	if (!Object.hasOwn(source, "dependencyOrder")) {
		fail(`${path}.dependencyOrder`, "required field is absent");
	}
	const dependencyOrder = stringArray(
		source.dependencyOrder,
		`${path}.dependencyOrder`,
		fail,
		{ allowEmptyEntries: false },
	);

	const objective = requiredString(source, "objective", path, fail);

	return Object.freeze({
		schema: DEPLOYMENT_PLAN_SCHEMA,
		resources,
		dependencyOrder,
		objective,
	}) as DeploymentPlan;
}

/**
 * Key-sorted at every depth, arrays left in their given order.
 *
 * The comparator is `Array.prototype.sort`'s default — UTF-16 code unit order —
 * and **not** `localeCompare`. This is load-bearing: `@hobo/core`'s exported
 * `sortKeys` uses `localeCompare`, the two disagree on keys differing only by
 * case or underscore placement, and `realizationParameters` keys are
 * author-supplied. Swapping the comparator changes plan digests that are
 * already committed as constants elsewhere in the repo.
 */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
		);
	}
	return value;
}

/**
 * The byte-stable form a plan is content-addressed by.
 *
 * No indentation and no trailing newline — both are part of the digest.
 */
export function canonicalPlanJson(plan: DeploymentPlan): string {
	return JSON.stringify(sortKeys(plan));
}

/** SHA-256 over {@link canonicalPlanJson}. */
export function hashDeploymentPlan(plan: DeploymentPlan): PlanHash {
	const digest = createHash("sha256")
		.update(canonicalPlanJson(plan))
		.digest("hex");
	return `sha256:${digest}`;
}
