import type { ResidencyGateVerdict } from "@hobo/contracts";

// Rubric + promotion-gate engine (docs/plans/0017 F25, design PLAN-23).
// Rubrics are schema-versioned records; scoring is a deterministic pure
// function producing a frozen report that mirrors the @hobo/conformance
// suite/report vocabulary (schema id, ok, failures with machine-readable
// codes); the promotion verdict is shaped as a Gatekeeper precomputed
// dimension ({ok, reasons}) so callers hand it to Gatekeeper composition as
// the evals dimension. Parse, don't validate: raw definitions and
// observations lower onto parsed derived types or throw typed errors — no
// unchecked shapes escape this boundary. Evaluators are ports; this package
// hosts no models.

// public-contract: rubric record schema id promotion tooling pins.
export const EVALS_RUBRIC_SCHEMA = "hobo.evals.rubric/v1";
// public-contract: rubric report schema id scored-run evidence pins.
export const EVALS_RUBRIC_REPORT_SCHEMA = "hobo.evals.rubric-report/v1";
// public-contract: promotion verdict schema id the Gatekeeper evals dimension pins.
export const EVALS_PROMOTION_VERDICT_SCHEMA = "hobo.evals.promotion-verdict/v1";

export type ScoringKind = "boolean" | "scale" | "golden-match";

export type EvalsFailureCode =
	| "criterion.below-threshold"
	| "criterion.required-failed"
	| "rubric.total-below-threshold";

/** Typed parse failure raised at the rubric authoring boundary. */
export class RubricParseError extends TypeError {
	constructor(message: string) {
		super(message);
		this.name = "RubricParseError";
	}
}

/** Typed parse failure raised at the observation ingestion boundary. */
export class ObservationParseError extends TypeError {
	constructor(message: string) {
		super(message);
		this.name = "ObservationParseError";
	}
}

/** Typed parse failure raised at the promotion-gate boundary. */
export class PromotionGateParseError extends TypeError {
	constructor(message: string) {
		super(message);
		this.name = "PromotionGateParseError";
	}
}

export interface RubricCriterionDefinition {
	id: string;
	description?: string;
	/** Relative weight in the weighted total; finite and > 0. */
	weight: number;
	kind: ScoringKind;
	/** Scale criteria only: score floor in [0,1]; boolean/golden-match imply 1. */
	passThreshold?: number;
	/** Golden-match criteria only: the blessed expected value (JSON data). */
	expected?: unknown;
	/** Hard gate: a failing required criterion fails the rubric outright. */
	required?: boolean;
}

export interface RubricDefinition {
	id: string;
	/** Weighted-total floor in [0,1] the rubric as a whole must reach. */
	passThreshold: number;
	criteria: RubricCriterionDefinition[];
}

// domain-view: parse-produced criterion (unknown golden payload, literal kind union); wire form is RubricCriterion in data-models/evals.proto.
export interface RubricCriterion {
	readonly id: string;
	readonly description: string;
	readonly weight: number;
	readonly kind: ScoringKind;
	readonly passThreshold: number;
	readonly expected?: unknown;
	readonly required: boolean;
}

// domain-view: parse-produced rubric record; wire form is Rubric in data-models/evals.proto.
export interface Rubric {
	readonly schema: typeof EVALS_RUBRIC_SCHEMA;
	readonly id: string;
	readonly passThreshold: number;
	readonly criteria: readonly RubricCriterion[];
}

/** One raw observation per criterion; scoreRubric parses it by criterion kind. */
export interface RubricObservationInput {
	criterionId: string;
	/** Boolean criteria. */
	passed?: boolean;
	/** Scale criteria: score in [0,1]. */
	score?: number;
	/** Golden-match criteria: the actual value to compare canonically. */
	actual?: unknown;
}

// domain-view: first-divergence record over unknown values; wire form is ValueDiff (JSON-encoded sides) in data-models/evals.proto.
export interface ValueDiff {
	readonly path: string;
	readonly expected: unknown;
	readonly actual: unknown;
}

// domain-view: scored criterion with literal kind union and optional structured diff; wire form is CriterionScore in data-models/evals.proto.
export interface CriterionScore {
	readonly criterionId: string;
	readonly kind: ScoringKind;
	readonly weight: number;
	readonly passThreshold: number;
	readonly score: number;
	readonly passed: boolean;
	readonly diff?: ValueDiff;
}

// domain-view: machine-readable failure with literal code union; wire form is EvalsFailure in data-models/evals.proto.
export interface EvalsFailure {
	readonly code: EvalsFailureCode;
	readonly criterionId?: string;
	readonly message: string;
}

// domain-view: frozen scored-run report (literal schema type); wire form is RubricReport in data-models/evals.proto.
export interface RubricReport {
	readonly schema: typeof EVALS_RUBRIC_REPORT_SCHEMA;
	readonly ok: boolean;
	readonly rubricId: string;
	readonly passThreshold: number;
	readonly weightedTotal: number;
	readonly scores: readonly CriterionScore[];
	readonly failures: readonly EvalsFailure[];
}

// domain-view: machine-readable gate reason; wire form is GateReason in data-models/evals.proto.
export interface GateReason {
	readonly code: string;
	readonly message: string;
}

// domain-view: Gatekeeper-dimension-shaped verdict ({ok, reasons}); wire form is PromotionGateVerdict in data-models/evals.proto.
export interface PromotionGateVerdict {
	readonly ok: boolean;
	readonly reasons: ReadonlyArray<GateReason>;
}

export interface PromotionGateThresholds {
	/** Extra weighted-total floor in [0,1] beyond the rubric's own passThreshold. */
	minWeightedTotal?: number;
	/** Require report.ok itself (default true). */
	requireRubricPass?: boolean;
}

/**
 * Parse a raw rubric definition into the schema-versioned, deeply frozen
 * rubric record. Parse, don't validate: every constraint (non-empty ids,
 * positive finite weights, [0,1] thresholds, kind-specific fields,
 * duplicate-free criteria) is enforced here so scoring never re-checks.
 */
export function defineRubric(definition: RubricDefinition): Rubric {
	if (!definition || typeof definition !== "object") {
		throw new RubricParseError("rubric definition is required");
	}
	if (typeof definition.id !== "string" || definition.id.length === 0) {
		throw new RubricParseError("rubric id must be a non-empty string");
	}
	const passThreshold = parseUnitInterval(
		definition.passThreshold,
		`rubric "${definition.id}" passThreshold`,
		RubricParseError,
	);
	if (!Array.isArray(definition.criteria) || definition.criteria.length === 0) {
		throw new RubricParseError(
			`rubric "${definition.id}" must declare at least one criterion`,
		);
	}

	const seen = new Set<string>();
	const criteria = definition.criteria.map((criterion) => {
		const parsed = parseCriterion(definition.id, criterion);
		if (seen.has(parsed.id)) {
			throw new RubricParseError(
				`rubric "${definition.id}" declares criterion "${parsed.id}" twice`,
			);
		}
		seen.add(parsed.id);
		return parsed;
	});

	return deepFreeze({
		schema: EVALS_RUBRIC_SCHEMA,
		id: definition.id,
		passThreshold,
		criteria,
	});
}

function parseCriterion(
	rubricId: string,
	criterion: RubricCriterionDefinition,
): RubricCriterion {
	if (!criterion || typeof criterion !== "object") {
		throw new RubricParseError(`rubric "${rubricId}" criterion is required`);
	}
	if (typeof criterion.id !== "string" || criterion.id.length === 0) {
		throw new RubricParseError(
			`rubric "${rubricId}" criterion id must be a non-empty string`,
		);
	}
	const label = `rubric "${rubricId}" criterion "${criterion.id}"`;
	if (!Number.isFinite(criterion.weight) || criterion.weight <= 0) {
		throw new RubricParseError(`${label} weight must be a finite number > 0`);
	}
	if (
		criterion.kind !== "boolean" &&
		criterion.kind !== "scale" &&
		criterion.kind !== "golden-match"
	) {
		throw new RubricParseError(
			`${label} kind must be boolean, scale, or golden-match`,
		);
	}
	let passThreshold = 1;
	if (criterion.kind === "scale") {
		passThreshold = parseUnitInterval(
			criterion.passThreshold,
			`${label} passThreshold`,
			RubricParseError,
		);
	} else if (criterion.passThreshold !== undefined) {
		throw new RubricParseError(
			`${label} passThreshold is only meaningful for scale criteria`,
		);
	}
	let expected: { expected: unknown } | undefined;
	if (criterion.kind === "golden-match") {
		if (criterion.expected === undefined) {
			throw new RubricParseError(
				`${label} must bless an expected value for golden-match scoring`,
			);
		}
		try {
			expected = { expected: structuredClone(criterion.expected) };
		} catch {
			throw new RubricParseError(
				`${label} expected value must be structured-cloneable data`,
			);
		}
	} else if (criterion.expected !== undefined) {
		throw new RubricParseError(
			`${label} expected is only meaningful for golden-match criteria`,
		);
	}
	return {
		id: criterion.id,
		description: criterion.description ?? "",
		weight: criterion.weight,
		kind: criterion.kind,
		passThreshold,
		required: criterion.required === true,
		...(expected ?? {}),
	};
}

/**
 * Deterministically score a rubric against one observation per criterion,
 * producing the frozen scored-run report. Observations parse by criterion
 * kind (boolean/scale/golden-match) or throw ObservationParseError; the
 * report carries per-criterion scores, the weighted total, and
 * machine-readable failures — same shape discipline as the conformance
 * PortSuiteReport.
 */
export function scoreRubric(
	rubric: Rubric,
	observations: readonly RubricObservationInput[],
): RubricReport {
	if (!rubric || rubric.schema !== EVALS_RUBRIC_SCHEMA) {
		throw new RubricParseError(
			"rubric must be the parsed record defineRubric produces",
		);
	}
	if (!Array.isArray(observations)) {
		throw new ObservationParseError("observations must be an array");
	}

	const byCriterion = new Map<string, RubricObservationInput>();
	const known = new Set(rubric.criteria.map((criterion) => criterion.id));
	for (const observation of observations) {
		if (
			!observation ||
			typeof observation !== "object" ||
			typeof observation.criterionId !== "string"
		) {
			throw new ObservationParseError(
				"every observation must name a criterionId",
			);
		}
		if (!known.has(observation.criterionId)) {
			throw new ObservationParseError(
				`observation names unknown criterion "${observation.criterionId}"`,
			);
		}
		if (byCriterion.has(observation.criterionId)) {
			throw new ObservationParseError(
				`criterion "${observation.criterionId}" is observed twice`,
			);
		}
		byCriterion.set(observation.criterionId, observation);
	}

	const scores = rubric.criteria.map((criterion) => {
		const observation = byCriterion.get(criterion.id);
		if (!observation) {
			throw new ObservationParseError(
				`criterion "${criterion.id}" has no observation`,
			);
		}
		return scoreCriterion(criterion, observation);
	});

	const totalWeight = rubric.criteria.reduce(
		(sum, criterion) => sum + criterion.weight,
		0,
	);
	const weightedTotal =
		scores.reduce((sum, entry) => sum + entry.weight * entry.score, 0) /
		totalWeight;

	const failures: EvalsFailure[] = [];
	for (const [index, entry] of scores.entries()) {
		if (entry.passed) continue;
		const required = rubric.criteria[index]?.required === true;
		failures.push({
			code: required
				? "criterion.required-failed"
				: "criterion.below-threshold",
			criterionId: entry.criterionId,
			message: required
				? `required criterion "${entry.criterionId}" failed (score ${entry.score})`
				: `criterion "${entry.criterionId}" scored ${entry.score}, below its pass threshold ${entry.passThreshold}`,
		});
	}
	const totalOk = weightedTotal >= rubric.passThreshold;
	if (!totalOk) {
		failures.push({
			code: "rubric.total-below-threshold",
			message: `weighted total ${weightedTotal} is below the rubric pass threshold ${rubric.passThreshold}`,
		});
	}
	const requiredOk = failures.every(
		(failure) => failure.code !== "criterion.required-failed",
	);

	return deepFreeze({
		schema: EVALS_RUBRIC_REPORT_SCHEMA,
		ok: totalOk && requiredOk,
		rubricId: rubric.id,
		passThreshold: rubric.passThreshold,
		weightedTotal,
		scores,
		failures,
	});
}

function scoreCriterion(
	criterion: RubricCriterion,
	observation: RubricObservationInput,
): CriterionScore {
	const base = {
		criterionId: criterion.id,
		kind: criterion.kind,
		weight: criterion.weight,
		passThreshold: criterion.passThreshold,
	};
	if (criterion.kind === "boolean") {
		if (typeof observation.passed !== "boolean") {
			throw new ObservationParseError(
				`boolean criterion "${criterion.id}" needs a boolean \`passed\` observation`,
			);
		}
		return {
			...base,
			score: observation.passed ? 1 : 0,
			passed: observation.passed,
		};
	}
	if (criterion.kind === "scale") {
		const score = observation.score;
		if (typeof score !== "number" || !Number.isFinite(score)) {
			throw new ObservationParseError(
				`scale criterion "${criterion.id}" needs a finite \`score\` observation`,
			);
		}
		if (score < 0 || score > 1) {
			throw new ObservationParseError(
				`scale criterion "${criterion.id}" score ${score} is outside [0,1]`,
			);
		}
		return { ...base, score, passed: score >= criterion.passThreshold };
	}
	if (!Object.hasOwn(observation, "actual")) {
		throw new ObservationParseError(
			`golden-match criterion "${criterion.id}" needs an \`actual\` observation`,
		);
	}
	const match = matchGolden(criterion.expected, observation.actual);
	return {
		...base,
		score: match.equal ? 1 : 0,
		passed: match.equal,
		...(match.diff ? { diff: match.diff } : {}),
	};
}

/**
 * Golden-match scoring primitive: compare an expected/actual pair by
 * canonical JSON (object key order is irrelevant); on mismatch, report the
 * first diverging path — the same first-diff vocabulary the conformance
 * golden checks use.
 */
export function matchGolden(
	expected: unknown,
	actual: unknown,
): { equal: boolean; diff?: ValueDiff } {
	if (canonicalJson(expected) === canonicalJson(actual)) {
		return { equal: true };
	}
	const diff = firstDiff(expected, actual);
	return { equal: false, ...(diff ? { diff } : {}) };
}

/** Canonical JSON encoding: recursively key-sorted, so comparison is order-independent. */
export function canonicalJson(value: unknown): string {
	const text = JSON.stringify(sortKeysDeep(value));
	return text === undefined ? "undefined" : text;
}

/**
 * Evaluate the promotion gate over a scored-run report, producing the
 * verdict Gatekeeper composes as its evals dimension: structurally the same
 * {ok, reasons: [{code, message}]} shape as the contracts package's
 * precomputed ResidencyGateVerdict / CanMigrateGateVerdict dimensions.
 */
export function evaluatePromotionGate(input: {
	rubricReport: RubricReport;
	thresholds?: PromotionGateThresholds;
}): PromotionGateVerdict {
	if (!input || typeof input !== "object") {
		throw new PromotionGateParseError("promotion gate input is required");
	}
	const report = input.rubricReport;
	if (!report || report.schema !== EVALS_RUBRIC_REPORT_SCHEMA) {
		throw new PromotionGateParseError(
			"rubricReport must be the frozen report scoreRubric produces",
		);
	}
	const thresholds = input.thresholds ?? {};
	if (typeof thresholds !== "object") {
		throw new PromotionGateParseError("thresholds must be an object");
	}
	let minWeightedTotal: number | undefined;
	if (thresholds.minWeightedTotal !== undefined) {
		minWeightedTotal = parseUnitInterval(
			thresholds.minWeightedTotal,
			"thresholds.minWeightedTotal",
			PromotionGateParseError,
		);
	}
	const requireRubricPass = thresholds.requireRubricPass !== false;

	const reasons: GateReason[] = [];
	if (requireRubricPass && !report.ok) {
		reasons.push({
			code: "evals.rubric-failed",
			message: `rubric "${report.rubricId}" report is not ok (weighted total ${report.weightedTotal}, pass threshold ${report.passThreshold})`,
		});
		for (const failure of report.failures) {
			reasons.push({
				code: `evals.${failure.code}`,
				message: failure.message,
			});
		}
	}
	if (
		minWeightedTotal !== undefined &&
		report.weightedTotal < minWeightedTotal
	) {
		reasons.push({
			code: "evals.total-below-threshold",
			message: `weighted total ${report.weightedTotal} is below the promotion floor ${minWeightedTotal}`,
		});
	}

	return deepFreeze({ ok: reasons.length === 0, reasons });
}

/**
 * Compile-time proof (and zero-cost upcast) that the evals verdict slots
 * into Gatekeeper's precomputed-dimension shape: assignability to the
 * contracts package's ResidencyGateVerdict is checked by tsc, so a caller
 * can hand the verdict straight to Gatekeeper composition.
 */
export function asGateDimension(
	verdict: PromotionGateVerdict,
): ResidencyGateVerdict {
	return verdict;
}

function parseUnitInterval(
	value: unknown,
	label: string,
	ErrorClass: new (message: string) => TypeError,
): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > 1
	) {
		throw new ErrorClass(`${label} must be a finite number in [0,1]`);
	}
	return value;
}

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeysDeep);
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			sorted[key] = sortKeysDeep(record[key]);
		}
		return sorted;
	}
	return value;
}

function firstDiff(
	expected: unknown,
	actual: unknown,
	path = "$",
): ValueDiff | null {
	if (Object.is(expected, actual)) {
		return null;
	}
	if (
		typeof expected !== typeof actual ||
		expected === null ||
		actual === null
	) {
		return { path, expected, actual };
	}
	if (Array.isArray(expected) || Array.isArray(actual)) {
		if (!Array.isArray(expected) || !Array.isArray(actual)) {
			return { path, expected, actual };
		}
		const length = Math.max(expected.length, actual.length);
		for (let index = 0; index < length; index += 1) {
			if (index >= expected.length || index >= actual.length) {
				return {
					path: `${path}[${index}]`,
					expected: expected[index],
					actual: actual[index],
				};
			}
			const diff = firstDiff(
				expected[index],
				actual[index],
				`${path}[${index}]`,
			);
			if (diff) {
				return diff;
			}
		}
		return null;
	}
	if (typeof expected === "object") {
		const keys = new Set([
			...Object.keys(expected as object),
			...Object.keys(actual as object),
		]);
		for (const key of keys) {
			const diff = firstDiff(
				(expected as Record<string, unknown>)[key],
				(actual as Record<string, unknown>)[key],
				joinPath(path, key),
			);
			if (diff) {
				return diff;
			}
		}
		return null;
	}
	return { path, expected, actual };
}

function joinPath(path: string, key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key)
		? `${path}.${key}`
		: `${path}[${JSON.stringify(key)}]`;
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const entry of Object.values(value)) {
			deepFreeze(entry);
		}
	}
	return value;
}
