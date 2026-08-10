/**
 * Profile-aware matching.
 *
 * This is the same Matching step the Planner already runs, widened from
 * port/feature comparison to semantic capability profiles with hard gates and
 * a lexicographic order. It composes with {@link matchResource}: a resource
 * that declares a capability requirement resolves here, and everything else
 * keeps the legacy path untouched.
 */
import { createHash } from "node:crypto";

import {
	type CapabilityProfileRegistry,
	type CapabilityRequirement,
	type SelectionCandidate,
	type SelectionRejection,
	type TrustPolicy,
	isBindleRuntime,
	parseCapabilityRequirement,
	selectCapabilityImplementation,
	tryParseProfileId,
} from "@hobo/capability-profiles";
import type { BindleRequirements } from "@hobo/bindles";

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
	const runtimes = requirements.runtimes.filter((value) => isBindleRuntime(value));
	return parseCapabilityRequirement({
		requiredProfiles: required.map((profileId) => ({ profileId })),
		preferredProfiles: preferred.map((profileId) => ({ profileId, weight: 1 })),
		...(runtimes.length > 0 ? { runtime: { allowed: runtimes } } : {}),
	});
}

export type ProfileMatchInput = {
	readonly resourceName: string;
	readonly requirement: CapabilityRequirement;
	readonly profiles: CapabilityProfileRegistry;
	readonly definitions: readonly ResourceDefinitionVNext[];
	readonly policy: TrustPolicy;
	/** Canonical evaluation instant. Matching never reads a clock itself. */
	readonly nowMs: number;
	readonly consumableBindingProfiles?: readonly string[];
};

export type ProfileMatchAccepted = {
	readonly ok: true;
	readonly definition: ResourceDefinitionVNext;
	readonly ranking: readonly string[];
	readonly rejections: readonly SelectionRejection[];
	readonly catalogHash: string;
	/** True when the top two survivors are separated only by the id tiebreak. */
	readonly tie: boolean;
};

export type ProfileMatchRejected = {
	readonly ok: false;
	readonly remediation: PlanRemediation;
	readonly rejections: readonly SelectionRejection[];
	readonly catalogHash: string;
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
	const payload = JSON.stringify({ profiles: profiles.digest, definitions: entries });
	return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
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

	const result = selectCapabilityImplementation({
		requirement: input.requirement,
		registry: input.profiles,
		candidates,
		policy: input.policy,
		nowMs: input.nowMs,
		...(input.consumableBindingProfiles !== undefined
			? { consumableBindingProfiles: input.consumableBindingProfiles }
			: {}),
	});

	if (result.winner === undefined) {
		const required = input.requirement.requiredProfiles
			.map((constraint) => `${constraint.profileId} ${constraint.versionRange}`)
			.join(", ");
		const detail =
			result.rejections.length === 0
				? `no registered product declares a capability profile for resource ${input.resourceName}`
				: result.rejections
						.map((rejection) => `${rejection.definitionId}: ${rejection.code} — ${rejection.detail}`)
						.join("; ");
		return {
			ok: false,
			rejections: result.rejections,
			catalogHash,
			remediation: {
				resource: input.resourceName,
				code: "capability.profile-unsatisfiable",
				requiredPort: input.requirement.requiredProfiles[0]?.profileId ?? "",
				requiredFeatures: input.requirement.features.map((feature) => feature.key),
				missing: result.rejections.map((rejection) => rejection.code),
				remediation: `no product satisfies ${required} for resource ${input.resourceName} under the active trust policy: ${detail}`,
			},
		};
	}

	const winner = byId.get(result.winner.definitionId) as ResourceDefinitionVNext;
	const runnerUp = result.ranked[1];
	// A tie means only the stable id tiebreak separated them, which is worth
	// recording: it is the case where a catalog addition can flip the winner.
	const tie =
		runnerUp !== undefined &&
		runnerUp.creatorAuthorityAfterClaim === result.winner.creatorAuthorityAfterClaim &&
		runnerUp.claimAtomicity === result.winner.claimAtomicity &&
		runnerUp.claimActionCount === result.winner.claimActionCount &&
		runnerUp.providerClass === result.winner.providerClass &&
		runnerUp.sponsorExposureMinorUnits === result.winner.sponsorExposureMinorUnits;

	return {
		ok: true,
		definition: winner,
		ranking: result.ranked.map((candidate) => candidate.definitionId),
		rejections: result.rejections,
		catalogHash,
		tie,
	};
}
