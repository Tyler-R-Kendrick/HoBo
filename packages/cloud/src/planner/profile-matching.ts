/**
 * Profile-aware matching.
 *
 * This is the same Matching step the Planner already runs, widened from
 * port/feature comparison to semantic capability profiles with hard gates and
 * a lexicographic order. It composes with {@link matchResource}: a resource
 * that declares a capability requirement resolves here, and everything else
 * keeps the legacy path untouched.
 *
 * Yard binding rows (ADR-0157) enter as an *additional hard gate* in front of
 * the ADR-0151 gate sequence. They filter definitions and never reorder them:
 * ordering stays hard gates then lexicographic comparison (ADR-0151 decision
 * 11, "never a weighted score"), so a row can remove a candidate but can never
 * promote one, and can never admit a candidate another gate already refused.
 * Rows arrive **structurally** — `@hobo/cloud` must not import `@hobo/yards`,
 * which would invert the dependency direction.
 *
 * Provider coherence is checked here rather than at `yard()` parse time: only
 * the catalog knows which provider publishes a product, and inferring it from
 * an id prefix would make a naming convention load-bearing (forbidden by
 * ADR-0144).
 *
 * HONEST SCOPE: this step resolves the *product*, not the connectivity
 * implementation — that needs the connectivity registry plus the consuming
 * workload's runtime model, neither of which selection holds. A complete
 * `binding.Resolved` fact is therefore emitted only when the applied rows pin
 * exactly one `connectivityId`; otherwise the accepted outcome carries
 * `appliedRows` for the audit trail and the fact is emitted downstream, where
 * connectivity is actually resolved. `binding.Unavailable` has no such
 * dependency and is always emitted on a Yard-scoped refusal.
 */
import { createHash } from "node:crypto";
import {
	BINDING_UNAVAILABLE_REMEDIATION,
	type BindingResolvedEvent,
	type BindingUnavailableCode,
	type BindingUnavailableEvent,
	bindingResolved,
	bindingUnavailable,
	yardBindingRowKey,
} from "@hobo/bindings";
import type { BindleRequirements } from "@hobo/bindles";
import {
	type CapabilityProfileRegistry,
	type CapabilityRequirement,
	isBindleRuntime,
	parseCapabilityRequirement,
	type SelectionCandidate,
	type SelectionRejection,
	selectCapabilityImplementation,
	type TrustPolicy,
	tryParseProfileId,
} from "@hobo/capability-profiles";

import type { PlanRemediation } from "../plan-types.js";
import {
	type ResourceDefinitionVNext,
	semanticsDigestInput,
	toSelectionCandidate,
} from "../registry/resource-definition-vnext.js";

/**
 * Bridge a Bindle's provider-neutral requirement block into a capability
 * requirement.
 *
 * Bindle authors write profile ids in `require`/`prefer`; anything that is not
 * a well-formed profile id (a plain port name like `data`) is left to the
 * legacy port matcher rather than guessed at. Returning `undefined` is how a
 * resource says "I have no profile intent" — it is not an error.
 */
export function capabilityRequirementFromBindleRequirements(
	requirements: BindleRequirements,
): CapabilityRequirement | undefined {
	const required = requirements.require.filter(
		(value) => tryParseProfileId(value) !== undefined,
	);
	if (required.length === 0) return undefined;
	const preferred = requirements.prefer.filter(
		(value) => tryParseProfileId(value) !== undefined,
	);
	const runtimes = requirements.runtimes.filter((value) =>
		isBindleRuntime(value),
	);
	return parseCapabilityRequirement({
		requiredProfiles: required.map((profileId) => ({ profileId })),
		preferredProfiles: preferred.map((profileId) => ({ profileId, weight: 1 })),
		...(runtimes.length > 0 ? { runtime: { allowed: runtimes } } : {}),
	});
}

/**
 * Structural mirror of `YardBinding` (`@hobo/yards`, `hobo.yard-binding/v1`).
 *
 * Declared here, not imported, because `@hobo/yards` sits beside `@hobo/cloud`
 * in the layering: consuming the row set structurally keeps imports flowing
 * inward. A parsed `YardBinding` is assignable to this type as-is.
 */
export type YardBindingRow = {
	readonly contract?: string;
	readonly profile: string;
	readonly productId?: string;
	readonly connectivityId?: string;
	readonly require?: readonly string[];
	readonly properties?: Readonly<Record<string, unknown>>;
};

/** The binding authority for this match: which Yard, and the rows it declares. */
export type YardBindingContext = {
	readonly yardId: string;
	readonly providerId: string;
	readonly bindings: readonly YardBindingRow[];
};

/**
 * Row-caused refusal reasons (ADR-0157). A row that matches nothing is never
 * silently dropped — a silently dropped row is a portability lie. Derived from
 * `@hobo/bindings`' vocabulary rather than restated, so the two cannot drift.
 */
export type YardBindingRejectionCode = Exclude<
	BindingUnavailableCode,
	"NO_COMPATIBLE_BINDING"
>;

/** `SelectionRejection`-shaped so row refusals join the same rejection surface. */
export type YardBindingRejection = {
	readonly definitionId: string;
	readonly code: YardBindingRejectionCode;
	readonly detail: string;
};

export type ProfileMatchRejectionRecord =
	| SelectionRejection
	| YardBindingRejection;

export type ProfileMatchInput = {
	readonly resourceName: string;
	readonly requirement: CapabilityRequirement;
	readonly profiles: CapabilityProfileRegistry;
	readonly definitions: readonly ResourceDefinitionVNext[];
	readonly policy: TrustPolicy;
	/** Canonical evaluation instant. Matching never reads a clock itself. */
	readonly nowMs: number;
	readonly consumableBindingProfiles?: readonly string[];
	/** Yard binding authority. Absent means no rows constrain this match. */
	readonly yard?: YardBindingContext;
};

export type ProfileMatchAccepted = {
	readonly ok: true;
	readonly definition: ResourceDefinitionVNext;
	readonly ranking: readonly string[];
	readonly rejections: readonly ProfileMatchRejectionRecord[];
	readonly catalogHash: string;
	/** True when the top two survivors are separated only by the id tiebreak. */
	readonly tie: boolean;
	/**
	 * Canonical keys of the Yard binding rows that constrained this decision.
	 * Present only when a Yard supplied binding authority (ADR-0033 audit trail).
	 */
	readonly appliedRows?: readonly string[];
	/** Present only when the rows pinned the connectivity implementation too. */
	readonly bindingResolved?: BindingResolvedEvent;
};

export type ProfileMatchRejected = {
	readonly ok: false;
	readonly remediation: PlanRemediation;
	readonly rejections: readonly ProfileMatchRejectionRecord[];
	readonly catalogHash: string;
	/** Present only when a Yard supplied binding authority. */
	readonly bindingUnavailable?: BindingUnavailableEvent;
};

export type ProfileMatchOutcome = ProfileMatchAccepted | ProfileMatchRejected;

/**
 * Digest over every selection-relevant catalog fact, including the profile
 * graph. A conformance result flipping changes this, so the receipt changes.
 */
export function profileCatalogHash(
	definitions: readonly ResourceDefinitionVNext[],
	profiles: CapabilityProfileRegistry,
): string {
	const entries = definitions
		.map(semanticsDigestInput)
		.filter((entry): entry is Record<string, unknown> => entry !== undefined)
		.sort((a, b) => String(a.id).localeCompare(String(b.id)));
	const payload = JSON.stringify({
		profiles: profiles.digest,
		definitions: entries,
	});
	return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

type AttributedRejection = {
	readonly rejection: YardBindingRejection;
	readonly profile: string;
};

type YardBindingGate = {
	/** Rows whose profile this requirement names, sorted by canonical key. */
	readonly applicableRows: readonly YardBindingRow[];
	/** Definition ids the rows admit. Absent when no applicable row pins a product. */
	readonly admitted?: ReadonlySet<string>;
	readonly rejections: readonly AttributedRejection[];
	/** True when a row is unresolvable against this catalog: refuse, do not rank. */
	readonly fatal: boolean;
};

/**
 * Resolve the rows against the catalog.
 *
 * A row is *applicable* when its profile is exactly one this requirement names.
 * Refinement is deliberately not walked here: letting a row for a narrower
 * profile silently constrain a broader requirement would make the row's reach
 * invisible to its author.
 */
function resolveYardBindingGate(
	yard: YardBindingContext,
	requiredProfileIds: readonly string[],
	definitions: readonly ResourceDefinitionVNext[],
): YardBindingGate {
	const wanted = new Set(requiredProfileIds);
	// Codepoint ordering, matching `@hobo/bindings`' canonical row-key order:
	// an audit trail must not depend on the host's collation locale.
	const applicableRows = yard.bindings
		.filter((row) => wanted.has(row.profile))
		.map((row) => [yardBindingRowKey(row), row] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([, row]) => row);

	const byProduct = new Map<string, ResourceDefinitionVNext[]>();
	for (const definition of definitions) {
		const productId = definition.semantics?.productId;
		if (productId === undefined) continue;
		const bucket = byProduct.get(productId);
		if (bucket === undefined) byProduct.set(productId, [definition]);
		else bucket.push(definition);
	}

	const rejections: AttributedRejection[] = [];
	const admitted = new Set<string>();
	let pinsProduct = false;

	for (const row of applicableRows) {
		const productId = row.productId;
		if (productId === undefined || productId.length === 0) continue;
		pinsProduct = true;
		const matches = byProduct.get(productId);
		if (matches === undefined || matches.length === 0) {
			rejections.push({
				profile: row.profile,
				rejection: {
					definitionId: productId,
					code: "YARD_BINDING_PRODUCT_UNKNOWN",
					detail: `yard ${yard.yardId} binds ${row.profile} to product ${productId}, which no registered product declares`,
				},
			});
			continue;
		}
		for (const definition of [...matches].sort((a, b) =>
			a.id.localeCompare(b.id),
		)) {
			if (definition.providerId !== yard.providerId) {
				rejections.push({
					profile: row.profile,
					rejection: {
						definitionId: definition.id,
						code: "YARD_BINDING_PROVIDER_MISMATCH",
						detail: `product ${productId} is published by provider ${definition.providerId}, but yard ${yard.yardId} is on provider ${yard.providerId}`,
					},
				});
				continue;
			}
			admitted.add(definition.id);
		}
	}

	const fatal = rejections.length > 0;
	return {
		applicableRows,
		...(pinsProduct ? { admitted } : {}),
		rejections,
		fatal,
	};
}

/** Distinct connectivity ids the applied rows pin, sorted. */
function pinnedConnectivity(
	rows: readonly YardBindingRow[],
): readonly string[] {
	const ids = new Set<string>();
	for (const row of rows) {
		if (row.connectivityId !== undefined && row.connectivityId.length > 0) {
			ids.add(row.connectivityId);
		}
	}
	return [...ids].sort();
}

function realizationFor(
	definition: ResourceDefinitionVNext,
	requiredProfileIds: readonly string[],
	registry: CapabilityProfileRegistry,
): "native" | "pack" | "bridge" {
	const implementations = [
		...(definition.semantics?.implementsProfiles ?? []),
	].sort((a, b) => a.profileId.localeCompare(b.profileId));
	for (const required of [...requiredProfileIds].sort()) {
		for (const implementation of implementations) {
			if (registry.satisfies(implementation.profileId, required)) {
				return implementation.realization;
			}
		}
	}
	return implementations[0]?.realization ?? "native";
}

/** Most-actionable first: an unresolvable row outranks an over-constrained one. */
const UNAVAILABLE_CODE_PRECEDENCE: readonly (
	| YardBindingRejectionCode
	| "NO_COMPATIBLE_BINDING"
)[] = Object.freeze([
	"YARD_BINDING_PRODUCT_UNKNOWN",
	"YARD_BINDING_PROVIDER_MISMATCH",
	"YARD_BINDING_EXCLUDED_ALL",
	"NO_COMPATIBLE_BINDING",
] as const);

function sortRejections(
	records: readonly ProfileMatchRejectionRecord[],
): readonly ProfileMatchRejectionRecord[] {
	return [...records].sort(
		(a, b) =>
			a.definitionId.localeCompare(b.definitionId) ||
			a.code.localeCompare(b.code),
	);
}

/**
 * Build the `binding.Unavailable` fact for a refusal.
 *
 * The remediation text is `@hobo/bindings`' canonical per-code string rather
 * than a second copy written here: the fail-closed contract says the refusal
 * names what to change, and one authority for that wording keeps the operator
 * reading the same sentence wherever the refusal surfaces. The refusal's
 * resource-specific detail stays on `PlanRemediation`.
 */
function unavailableFact(
	yard: YardBindingContext,
	attributed: readonly AttributedRejection[],
	fallbackProfile: string,
	consideredCount: number,
): BindingUnavailableEvent {
	const ranked = [...attributed].sort(
		(a, b) =>
			UNAVAILABLE_CODE_PRECEDENCE.indexOf(a.rejection.code) -
				UNAVAILABLE_CODE_PRECEDENCE.indexOf(b.rejection.code) ||
			a.profile.localeCompare(b.profile) ||
			a.rejection.definitionId.localeCompare(b.rejection.definitionId),
	);
	const first = ranked[0];
	const code: BindingUnavailableCode =
		first?.rejection.code ?? "NO_COMPATIBLE_BINDING";
	return bindingUnavailable({
		yardId: yard.yardId,
		profile: first?.profile ?? fallbackProfile,
		code,
		remediation: BINDING_UNAVAILABLE_REMEDIATION[code],
		consideredCount,
	});
}

export function matchCapabilityRequirement(
	input: ProfileMatchInput,
): ProfileMatchOutcome {
	const catalogHash = profileCatalogHash(input.definitions, input.profiles);
	const byId = new Map<string, ResourceDefinitionVNext>();
	const candidates: SelectionCandidate[] = [];
	for (const definition of input.definitions) {
		const candidate = toSelectionCandidate(definition);
		// A legacy definition without semantics is not promoted into profile
		// matching; it remains matchable only through its original port path.
		if (candidate === undefined) continue;
		byId.set(definition.id, definition);
		candidates.push(candidate);
	}

	const requiredProfileIds = input.requirement.requiredProfiles.map(
		(constraint) => constraint.profileId,
	);
	const fallbackProfile = requiredProfileIds[0] ?? "";
	const required = input.requirement.requiredProfiles
		.map((constraint) => `${constraint.profileId} ${constraint.versionRange}`)
		.join(", ");
	const consideredCount = candidates.length;
	const yard = input.yard;

	const gate =
		yard !== undefined
			? resolveYardBindingGate(yard, requiredProfileIds, input.definitions)
			: undefined;

	// Fail closed before ranking: a row naming a product this catalog cannot
	// resolve is an authoring defect, and continuing would hide it.
	if (gate?.fatal === true && yard !== undefined) {
		const rejections = sortRejections(
			gate.rejections.map((entry) => entry.rejection),
		);
		const detail = rejections
			.map(
				(rejection) =>
					`${rejection.definitionId}: ${rejection.code} — ${rejection.detail}`,
			)
			.join("; ");
		const remediation = `yard ${yard.yardId} declares binding rows that do not resolve against the registered catalog: ${detail}. Correct the row's productId, or register a product for provider ${yard.providerId} that declares it.`;
		return {
			ok: false,
			rejections,
			catalogHash,
			remediation: {
				resource: input.resourceName,
				code: "capability.yard-binding-unsatisfiable",
				requiredPort: fallbackProfile,
				requiredFeatures: input.requirement.features.map(
					(feature) => feature.key,
				),
				missing: rejections.map((rejection) => rejection.code),
				remediation,
			},
			bindingUnavailable: unavailableFact(
				yard,
				gate.rejections,
				fallbackProfile,
				consideredCount,
			),
		};
	}

	const admitted = gate?.admitted;
	const gated =
		admitted === undefined
			? candidates
			: candidates.filter((candidate) => admitted.has(candidate.definitionId));
	const excluded =
		admitted === undefined
			? []
			: candidates
					.filter((candidate) => !admitted.has(candidate.definitionId))
					.map((candidate) => candidate.definitionId)
					.sort();

	const result = selectCapabilityImplementation({
		requirement: input.requirement,
		registry: input.profiles,
		candidates: gated,
		policy: input.policy,
		nowMs: input.nowMs,
		...(input.consumableBindingProfiles !== undefined
			? { consumableBindingProfiles: input.consumableBindingProfiles }
			: {}),
	});

	if (result.winner === undefined) {
		// Rows removed every survivor: name that as its own reason rather than
		// letting the refusal read as "no product implements this profile".
		const rowProfiles = [
			...new Set(
				(gate?.applicableRows ?? [])
					.filter(
						(row) => row.productId !== undefined && row.productId.length > 0,
					)
					.map((row) => row.profile),
			),
		].sort();
		const exclusions: AttributedRejection[] =
			excluded.length > 0 && yard !== undefined
				? excluded.map((definitionId) => ({
						profile: rowProfiles[0] ?? fallbackProfile,
						rejection: {
							definitionId,
							code: "YARD_BINDING_EXCLUDED_ALL" as const,
							detail: `excluded by yard ${yard.yardId} binding rows for ${rowProfiles.join(", ")}, which admit only ${[...(admitted ?? [])].sort().join(", ") || "no registered product"}`,
						},
					}))
				: [];
		const rejections = sortRejections([
			...result.rejections,
			...exclusions.map((entry) => entry.rejection),
		]);
		const detail =
			rejections.length === 0
				? `no registered product declares a capability profile for resource ${input.resourceName}`
				: rejections
						.map(
							(rejection) =>
								`${rejection.definitionId}: ${rejection.code} — ${rejection.detail}`,
						)
						.join("; ");
		const remediation = `no product satisfies ${required} for resource ${input.resourceName} under the active trust policy: ${detail}`;
		return {
			ok: false,
			rejections,
			catalogHash,
			remediation: {
				resource: input.resourceName,
				code: "capability.profile-unsatisfiable",
				requiredPort: fallbackProfile,
				requiredFeatures: input.requirement.features.map(
					(feature) => feature.key,
				),
				missing: rejections.map((rejection) => rejection.code),
				remediation,
			},
			...(yard !== undefined
				? {
						bindingUnavailable: unavailableFact(
							yard,
							exclusions,
							fallbackProfile,
							consideredCount,
						),
					}
				: {}),
		};
	}

	const winner = byId.get(
		result.winner.definitionId,
	) as ResourceDefinitionVNext;
	const runnerUp = result.ranked[1];
	// A tie means only the stable id tiebreak separated them, which is worth
	// recording: it is the case where a catalog addition can flip the winner.
	const tie =
		runnerUp !== undefined &&
		runnerUp.creatorAuthorityAfterClaim ===
			result.winner.creatorAuthorityAfterClaim &&
		runnerUp.claimAtomicity === result.winner.claimAtomicity &&
		runnerUp.claimActionCount === result.winner.claimActionCount &&
		runnerUp.providerClass === result.winner.providerClass &&
		runnerUp.sponsorExposureMinorUnits ===
			result.winner.sponsorExposureMinorUnits;

	let appliedRows: readonly string[] | undefined;
	let resolved: BindingResolvedEvent | undefined;
	if (gate !== undefined && yard !== undefined) {
		appliedRows = Object.freeze(
			gate.applicableRows.map((row) => yardBindingRowKey(row)).sort(),
		);
		// A `BindingResolution` names the connectivity implementation, so the fact
		// is only constructible here when the rows pinned exactly one. With none
		// pinned (or several admitted) the connectivity step downstream owns it —
		// emitting a fact with a guessed connectivity id would be a false record.
		const connectivity = pinnedConnectivity(gate.applicableRows);
		const connectivityId =
			connectivity.length === 1 ? connectivity[0] : undefined;
		const productId = winner.semantics?.productId;
		if (connectivityId !== undefined && productId !== undefined) {
			resolved = bindingResolved({
				contract: "hobo.binding-resolution/v1",
				yardId: yard.yardId,
				profile: fallbackProfile,
				productId,
				connectivityId,
				realization: realizationFor(winner, requiredProfileIds, input.profiles),
				appliedRows,
				consideredCount,
			});
		}
	}

	return {
		ok: true,
		definition: winner,
		ranking: result.ranked.map((candidate) => candidate.definitionId),
		rejections: result.rejections,
		catalogHash,
		tie,
		...(appliedRows !== undefined ? { appliedRows } : {}),
		...(resolved !== undefined ? { bindingResolved: resolved } : {}),
	};
}
