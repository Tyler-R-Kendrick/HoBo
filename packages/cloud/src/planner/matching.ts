import type {
	MatchDecided,
	PlanRemediation,
	ResourceIntent,
} from "../plan-types.js";
import type {
	PlannerRegistry,
	ResourceDefinition,
} from "../registry/catalog.js";

// Matching (control-plane.md steps 2-5): resolve a Resource Definition per
// resource via context-matching, negotiate the provider Capability.satisfies,
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
): MatchOutcome {
	const defs = registry.definitions();
	// Context-matching by capability class (the resource's `type` -> port).
	const candidates = defs.filter((def) => def.port === intent.port);

	const accepted: ResourceDefinition[] = [];
	const rejected: string[] = [];
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
				rejected.push(candidate.id);
			}
		} else {
			rejected.push(candidate.id);
		}
	}

	if (accepted.length === 0) {
		// Unsatisfiable: emit machine-readable remediation an agent can act on.
		// Prefer naming a registered provider that *does* advertise the port.
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

	const ranked = [...accepted].sort((a, b) =>
		rankByObjective(a, b, intent.objective),
	);
	const winner = ranked[0] as ResourceDefinition;
	const region = pickRegion(intent, winner);
	const losers = ranked.slice(1).map((d) => d.id);

	const decision: MatchDecided = {
		deploymentId: "",
		resource: intent.name,
		winner: `${winner.providerId}.${winner.port}`,
		providerId: winner.providerId,
		port: winner.port,
		specificity: winner.specificity,
		rejected: [...rejected, ...losers],
		objective: intent.objective,
		rationale:
			intent.objective === "min-cost" || intent.objective === "cost"
				? "min-cost within constraints; stable tiebreak=definition-id"
				: `objective=${intent.objective}; stable tiebreak=definition-id`,
		catalogHash: registry.catalogHash,
	};
	if (region) decision.region = region;

	return { ok: true, decision, region, definition: winner };
}
