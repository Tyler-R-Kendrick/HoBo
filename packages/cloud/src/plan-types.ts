import { createHash } from "node:crypto";

// Parse, don't validate: the types below are the parsed derived domain types the
// Planner works with. Their protobuf wire forms live in data-models/cloud.proto
// and their CUE constraints in data-models/cloud.cue; these narrow those wire
// shapes with unions and required fields. Constructors here are the only way to
// build a plan value, so downstream code never re-validates a raw record.

// The plan schema discriminant, re-exported from the package that owns the
// plan shape. It is hashed into every plan digest, so two declarations of it
// would be two ways to change what the repo content-addresses; unlike the plan
// *types* below, a bare string constant re-exports without friction, so there
// is no reason for this one to be declared twice.
//
// `pnpm run standards:check` had never flagged the local declaration this
// replaces, because the check runs over added and modified files only. The
// constant has been exported without a `// public-contract:` marker since it
// was written; touching this file is what surfaced it.
import { DEPLOYMENT_PLAN_SCHEMA } from "@hobo/manifest-plan";
import { isJsonObject, type JsonObject, type JsonValue } from "./json.js";

// ── The declaration manifest, re-exported from its owner ────────────────────
//
// `ResourceIntent` and the placement vocabulary were declared here. They are
// now `@hobo/manifest-declaration`'s, and re-exported so every consumer keeps
// its import path. The types re-exported are the **authoring** ones: mutable,
// unbranded, field-for-field what this file declared, because the Planner and
// `src/intent.ts` build intents with object literals and assign `intent.region`
// after construction — neither a brand nor a `readonly` admits that.
// `ParsedResourceIntent` is the branded refinement, obtainable only from
// `parseResourceIntent`; it is exported alongside rather than instead.
export {
	type Negotiation,
	type ParsedPlacementAffinityRule,
	type ParsedPlacementCriteria,
	type ParsedPlacementPickN,
	type ParsedPlacementPropertySelector,
	type ParsedPlacementSpread,
	type ParsedResourceIntent,
	type PlacementAffinityMode,
	type PlacementAffinityRule,
	type PlacementCriteria,
	type PlacementPickN,
	type PlacementPropertySelector,
	type PlacementScope,
	type PlacementSelectorOp,
	type PlacementSpread,
	parseResourceIntent,
	type ResourceIntent,
	ResourceIntentError,
	toResourceIntent,
} from "@hobo/manifest-declaration";
export { DEPLOYMENT_PLAN_SCHEMA };

// domain-view: capability-negotiation verdict; wire form is CapabilityVerdict in data-models/cloud.proto.
export type CapabilityVerdict =
	| { kind: "full" }
	| { kind: "partial"; missing: string[] }
	| { kind: "none" };

// ── Why the plan manifest is NOT re-exported here ───────────────────────────
//
// `ResourcePlan` and `DeploymentPlan` also live in `@hobo/manifest-plan`, and
// the intent was to re-export them the same way the declaration shapes above
// are. Measured, they cannot be — not because of the brand, which is
// mechanically removable, but because of one field:
//
//   1. `@hobo/manifest-plan` exports only the branded, deeply-readonly parsed
//      types. Re-exporting them directly fails 8 places in `src/` alone: the
//      three object literals that build plans (`planner/plan.ts` twice,
//      `cd/fixtures.ts`) and `plan.ts`'s `node.region = outcome.region`.
//   2. Stripping the brand and the readonly modifiers with a mapped type
//      leaves exactly one error, and it is a genuine divergence rather than a
//      typing artifact: `@hobo/manifest-plan` narrows `realizationParameters`
//      to `Record<string, PlanParameterValue>` (JSON values only, because a
//      `Date`, a function or an `undefined` canonicalizes to something other
//      than itself and would move the plan digest), while this package types
//      it `JsonObject` all the way back through
//      `planner/profile-matching.ts` to `@hobo/yards`' `BindingRow.properties`.
//      `@hobo/yards`' own authoring surface (`yard.ts`) already says
//      `Record<string, JsonValue>`; `binding.ts` is the outlier.
//
// Closing (2) is a three-file narrowing in `packages/cloud/src/planner/` and
// `packages/yards/src/binding.ts` — outside the file ownership of the swarm
// that wrote this note, so it is recorded rather than taken. Until it lands the
// two declarations are kept in parity by
// `packages/manifest-round-trip/test/upstream-parity.test.ts`, which reads both
// files and fails on any field, optionality or value-type drift.

// domain-view: resolved plan node; wire form is ResourcePlan in data-models/cloud.proto.
export interface ResourcePlan {
	name: string;
	port: string;
	provider: string;
	deps: string[];
	strategy?: string;
	region?: string;
	deploymentId?: string;
	/**
	 * The provider offering this node resolves to, when the plan was built with
	 * Yard binding authority (ADR-0157). This is what a deployment driver keys
	 * on to find the resolver that can allocate the resource: without it a
	 * driver would have to re-derive the product from the port, which is the
	 * naming-convention inference ADR-0144 forbids.
	 *
	 * Absent on the legacy port-only planning path, where no Yard supplied a
	 * catalog to select from. Absent means "not decided here", never "any
	 * product will do" — a driver that cannot find a product must fail closed.
	 */
	productId?: string;
	/**
	 * Yard-scoped, provider-native realization parameters merged from the
	 * applied Yard binding rows — the *configuration* half of a Yard binding
	 * (ADR-0157). The row selects which product realizes the profile; these
	 * parameterize how it is realized in this Yard (replica counts, resource
	 * limits, service class).
	 *
	 * Provider-native by construction, therefore a non-portable surface: the
	 * rows responsible are named in `nonPortableRows` so the PortabilityReport
	 * can attribute the loss rather than merely report that something was lost.
	 * Never carries credential material — the parse boundary refuses
	 * credential-shaped keys before a row ever reaches a plan.
	 */
	realizationParameters?: Readonly<JsonObject>;
	/** Canonical keys of the applied rows that contributed realization parameters. */
	nonPortableRows?: readonly string[];
}

// domain-view: content-addressed plan DAG; wire form is DeploymentPlan in data-models/cloud.proto.
export interface DeploymentPlan {
	schema: typeof DEPLOYMENT_PLAN_SCHEMA;
	resources: ResourcePlan[];
	dependencyOrder: string[];
	objective: string;
}

// domain-view: ranked candidate inside match.Decided; wire form is RankedCandidate in data-models/cloud.proto.
export interface RankedCandidate {
	definitionId: string;
	providerId: string;
	specificity: number;
	priority: number;
}

// domain-view: structured rejection inside match.Decided; wire form is RejectedCandidate in data-models/cloud.proto.
export interface RejectedCandidate {
	definitionId: string;
	reason: string;
}

// Canonical shape per control-plane-event-schema-contract (ADR-0033/ADR-0088):
// full ranking, structured rejections with reasons, an explicit tie flag, and
// the catalog content-hash. `rejected`/`catalogHash` remain populated as
// deprecated aliases for one release.
// domain-view: match.Decided body; wire form is MatchDecided in data-models/cloud.proto.
export interface MatchDecided {
	deploymentId: string;
	resource: string;
	winner: string;
	providerId: string;
	port: string;
	specificity: number;
	/** @deprecated flat ids; read `rejectedCandidates` (reasons included). */
	rejected: string[];
	rejectedCandidates: RejectedCandidate[];
	/** Full ranking, winner first (ADR-0088 attribution). */
	ranking: RankedCandidate[];
	/** True when the winner beat the runner-up only on the definition-id tiebreak. */
	tie: boolean;
	objective: string;
	region?: string;
	rationale: string;
	/** @deprecated alias of `catalogContentHash`. */
	catalogHash: string;
	catalogContentHash: string;
	/**
	 * The provider offering the winner realizes, when Yard binding authority
	 * constrained the decision (ADR-0157). Recorded on the decision so the
	 * audit trail names *what was chosen to be built*, not only which
	 * definition won — a definition id is not a product.
	 */
	productId?: string;
	/** Canonical keys of the Yard binding rows that constrained this decision. */
	appliedRows?: readonly string[];
	/** Provider-native realization parameters merged from the applied rows. */
	realizationParameters?: Readonly<JsonObject>;
	/** Applied rows that contributed realization parameters (portability attribution). */
	nonPortableRows?: readonly string[];
}

// domain-view: rejection remediation; wire form is PlanRemediation in data-models/cloud.proto.
export interface PlanRemediation {
	resource: string;
	code: string;
	requiredPort: string;
	requiredFeatures: string[];
	missing: string[];
	suggestedProvider?: string;
	remediation: string;
}

export type PlanHash = `sha256:${string}`;

// `unknown` in: this is the pre-serialization pass for `JSON.stringify`, so it
// walks whatever it is handed and never reads a typed field. Requiring
// `JsonValue` only forced `canonicalPlanJson` to launder a `DeploymentPlan`
// that was about to be stringified anyway.
function sortKeys(value: unknown): JsonValue {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && isJsonObject(value)) {
		return Object.fromEntries(
			// SAFETY: `Object.keys(value as JsonObject)` is required at this I/O or test boundary.
			Object.keys(value as JsonObject)
				.sort()
				// SAFETY: `.map((key) => [key, sortKeys((value as JsonObject)[key])]),` is required at this I/O or test boundary.
				.map((key) => [key, sortKeys((value as JsonObject)[key])]),
		);
	}
	// SAFETY: everything that is not an array or object here is a JSON scalar by
	// the time a plan reaches serialization; the walk above has handled the two
	// container cases.
	return value as JsonValue;
}

// Canonical, key-sorted serialization — the byte-stable form a plan is
// content-addressed by (control-plane.md: "The plan is content-addressed and
// stored via deployment.Planned").
export function canonicalPlanJson(plan: DeploymentPlan): string {
	return JSON.stringify(sortKeys(plan));
}

export function hashDeploymentPlan(plan: DeploymentPlan): PlanHash {
	const digest = createHash("sha256")
		.update(canonicalPlanJson(plan))
		.digest("hex");
	return `sha256:${digest}`;
}
