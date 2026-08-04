import type {
	MatchDecided,
	PlanRemediation,
	ResourceIntent,
} from "../plan-types.js";
import type {
	PlannerRegistry,
	ResourceDefinition,
} from "../registry/catalog.js";
import {
	emptyPlacementContext,
	type PlacementContext,
	pickPlacementRegion,
	placementRejection,
	spreadSurvivors,
} from "./placement.js";

// Matching (control-plane.md steps 2-5): resolve a Resource Definition per
// resource via context-matching, negotiate the provider Capability.satisfies,
// apply the E19 placement-constraint vocabulary as deterministic hard filters,
// then rank the survivors by the configured objective with a stable tiebreak.
// Deterministic — no solver, no LLM.

export interface MatchAccepted {
	ok: true;
	decision: MatchDecided;
	region: string;
	definition: ResourceDefinition;
}

export interface MatchRejected {
	ok: false;
	remediation: PlanRemediation;
}

export type MatchOutcome = MatchAccepted | MatchRejected;

function marginal(def: ResourceDefinition): number {
	const value = Number.parseFloat(def.cost.marginalPrice);
	return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

// Objective ranking: default is min-cost within constraints, then a stable
// tiebreak on definition id (control-plane.md step 5).
function rankByObjective(
	a: ResourceDefinition,
	b: ResourceDefinition,
	objective: string,
): number {
	if (a.specificity !== b.specificity) return b.specificity - a.specificity;
	if (a.priority !== b.priority) return b.priority - a.priority;
	if (objective === "min-cost" || objective === "cost") {
		const delta = marginal(a) - marginal(b);
		if (delta !== 0) return delta;
	}
	return a.id.localeCompare(b.id);
}

function pickRegion(intent: ResourceIntent, def: ResourceDefinition): string {
	if (intent.region) return intent.region;
	// Colocation-neutral deterministic choice: the lexicographically smallest
	// advertised region (single-provider plans share a region set).
	const regions = [...def.regions].sort();
	return regions[0] ?? "";
}

export function matchResource(
	intent: ResourceIntent,
	registry: PlannerRegistry,
	placementContext?: PlacementContext,
): MatchOutcome {
	const context = placementContext ?? emptyPlacementContext();
	const defs = registry.definitions();
	// Context-matching by capability class (the resource's `type` -> port).
	const candidates = defs.filter((def) => def.port === intent.port);

	const accepted: ResourceDefinition[] = [];
	const rejectedCandidates: { definitionId: string; reason: string }[] = [];
	let lastMissing: string[] = [];

	for (const candidate of candidates) {
		const verdict = candidate.satisfies({
			port: intent.port,
			features: intent.require,
		});
		if (verdict.kind === "full") {
			accepted.push(candidate);
		} else if (verdict.kind === "partial") {
			lastMissing = verdict.missing;
			if (intent.negotiation === "prefer") {
				// Degrade: accept with an implicit PlanWarning (control-plane.md step 3).
				accepted.push(candidate);
			} else {
				rejectedCandidates.push({
					definitionId: candidate.id,
					reason: `required features not satisfied: ${verdict.missing.join(", ")}`,
				});
			}
		} else {
			rejectedCandidates.push({
				definitionId: candidate.id,
				reason: "capability verdict none",
			});
		}
	}

	if (accepted.length === 0) {
		// Unsatisfiable: emit machine-readable remediation an agent can act on.
		// First preference: a provider that is INSTALLED but not APPROVED and
		// advertises the port — approval, not registration, is what's missing
		// (walkthrough Part 0/2).
		const heldMatch = registry
			.held?.()
			.find((held) => held.ports.includes(intent.port));
		if (heldMatch) {
			return {
				ok: false,
				remediation: {
					resource: intent.name,
					code: "capability.provider-not-approved",
					requiredPort: intent.port,
					requiredFeatures: intent.require,
					missing: [],
					suggestedProvider: heldMatch.providerId,
					remediation: `provider ${heldMatch.providerId} is installed but not approved; approve it (hobo add ${heldMatch.providerId}) so Matching can consider port ${intent.port}`,
				},
			};
		}
		// Otherwise prefer naming a registered provider that *does* advertise the port.
		const suggestion = defs.find(
			(def) =>
				def.port === intent.port &&
				def.satisfies({ port: intent.port, features: intent.require }).kind !==
					"none",
		);
		const suggestedProvider = suggestion?.providerId;
		const remediation: PlanRemediation = {
			resource: intent.name,
			code:
				candidates.length === 0
					? "capability.port-unavailable"
					: "capability.required-not-satisfied",
			requiredPort: intent.port,
			requiredFeatures: intent.require,
			missing: lastMissing,
			remediation: suggestedProvider
				? `lower requirement to prefer, or select provider ${suggestedProvider} which advertises port ${intent.port}`
				: `no registered provider advertises port ${intent.port} for resource ${intent.name}; register a provider that satisfies it or change the resource capability`,
		};
		if (suggestedProvider !== undefined)
			remediation.suggestedProvider = suggestedProvider;
		return { ok: false, remediation };
	}

	// E19: placement criteria act as deterministic hard filters between
	// capability negotiation and objective ranking — the lexicographic
	// `specificity → priority → objective → definition id` ranking (ADR-0033,
	// ADR-0088) is untouched among the survivors.
	const criteria = intent.placement;
	let survivors = accepted;
	if (criteria !== undefined) {
		survivors = [];
		for (const candidate of accepted) {
			const reason = placementRejection(candidate, criteria, context);
			if (reason === undefined) survivors.push(candidate);
			else rejectedCandidates.push({ definitionId: candidate.id, reason });
		}
		const spreadKept = spreadSurvivors(survivors, intent, context);
		if (spreadKept.length !== survivors.length) {
			const keptIds = new Set(spreadKept.map((c) => c.id));
			for (const candidate of survivors) {
				if (!keptIds.has(candidate.id)) {
					rejectedCandidates.push({
						definitionId: candidate.id,
						reason: "placement: spread across yards prefers a less-loaded yard",
					});
				}
			}
		}
		survivors = spreadKept;
		if (survivors.length === 0) {
			return {
				ok: false,
				remediation: {
					resource: intent.name,
					code: "placement.unsatisfiable",
					requiredPort: intent.port,
					requiredFeatures: intent.require,
					missing: rejectedCandidates
						.filter((entry) => entry.reason.startsWith("placement:"))
						.map((entry) => `${entry.definitionId}: ${entry.reason}`),
					remediation: `no candidate for port ${intent.port} satisfies the placement criteria for resource ${intent.name}; relax the selectors/affinity or register a provider in the required region/yard`,
				},
			};
		}
	}

	const ranked = [...survivors].sort((a, b) =>
		rankByObjective(a, b, intent.objective),
	);
	if (criteria?.pickN !== undefined && ranked.length < criteria.pickN.count) {
		return {
			ok: false,
			remediation: {
				resource: intent.name,
				code: "placement.cardinality-unsatisfiable",
				requiredPort: intent.port,
				requiredFeatures: intent.require,
				missing: [],
				remediation: `placement pickN=${criteria.pickN.count} requires at least ${criteria.pickN.count} distinct satisfying candidates for resource ${intent.name}; only ${ranked.length} matched — register more providers advertising port ${intent.port} or lower the cardinality`,
			},
		};
	}
	const winner = ranked[0] as ResourceDefinition;
	const region =
		criteria !== undefined
			? pickPlacementRegion(intent, winner, context)
			: pickRegion(intent, winner);
	const losers = ranked
		.slice(1)
		.map((d) => ({ definitionId: d.id, reason: "outranked" }));
	// Tie attribution (ADR-0088): the winner and runner-up compare equal on
	// every objective dimension and are separated only by the definition-id
	// tiebreak — recorded so a winner flip is attributable to a catalog change.
	const runnerUp = ranked[1];
	const costObjective =
		intent.objective === "min-cost" || intent.objective === "cost";
	const tie =
		runnerUp !== undefined &&
		winner.specificity === runnerUp.specificity &&
		winner.priority === runnerUp.priority &&
		(!costObjective || marginal(winner) === marginal(runnerUp));
	const allRejected = [...rejectedCandidates, ...losers];

	const decision: MatchDecided = {
		deploymentId: "",
		resource: intent.name,
		winner: `${winner.providerId}.${winner.port}`,
		providerId: winner.providerId,
		port: winner.port,
		specificity: winner.specificity,
		rejected: allRejected.map((entry) => entry.definitionId),
		rejectedCandidates: allRejected,
		ranking: ranked.map((d) => ({
			definitionId: d.id,
			providerId: d.providerId,
			specificity: d.specificity,
			priority: d.priority,
		})),
		tie,
		objective: intent.objective,
		rationale:
			intent.objective === "min-cost" || intent.objective === "cost"
				? "min-cost within constraints; stable tiebreak=definition-id"
				: `objective=${intent.objective}; stable tiebreak=definition-id`,
		catalogHash: registry.catalogHash,
		catalogContentHash: registry.catalogHash,
	};
	if (region) decision.region = region;

	return { ok: true, decision, region, definition: winner };
}
