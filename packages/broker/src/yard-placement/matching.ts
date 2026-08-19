import {
	evaluateResidency,
	parseDataClassification,
	parseJurisdictionId,
} from "@hobo/core";
import { first } from "@hobo/core/total-access";
import {
	type ContentHash,
	contentHashOf,
	type YardCandidateDecision,
	type YardInstanceRegistration,
	type YardInventorySnapshot,
	type YardMatchDecision,
	type YardMatchSpecificity,
	type YardPlacementRequest,
	type YardSelectionMode,
	type YardShape,
} from "./types.js";

/**
 * Deterministic Yard matching: hard filters then lexicographic specificity,
 * then objective/stable-id tiebreak. Never uses registration order.
 */
export function matchYard(
	request: YardPlacementRequest,
	inventory: YardInventorySnapshot,
	options: {
		readonly ownerTenantId: string;
		readonly objective?: string;
		readonly contributingPolicyIds?: readonly string[];
		readonly bindleRuntimes?: readonly string[];
	},
): YardMatchDecision {
	const shapeHash = contentHashOf(request.requestedShape) as ContentHash;
	const candidates: YardCandidateDecision[] = inventory.yards
		.map((yard) =>
			evaluateCandidate(yard, request, {
				ownerTenantId: options.ownerTenantId,
				bindleRuntimes: options.bindleRuntimes ?? [],
			}),
		)
		.sort((a, b) => compareCandidates(a, b, options.objective ?? "min-cost"));

	const compatible = candidates.filter((c) => c.compatible);
	const mode: YardSelectionMode = request.selectionMode;

	if (mode === "exact") {
		const id = request.requestedYardId;
		if (!id) {
			return decision(request, shapeHash, inventory, candidates, options, {
				outcome: "rejected",
				rationale: "exact mode requires requestedYardId",
			});
		}
		const hit = compatible.find((c) => c.yardId === id);
		if (hit) {
			return decision(request, shapeHash, inventory, candidates, options, {
				outcome: "existing-yard",
				winnerYardId: hit.yardId,
				rationale: `exact yard ${hit.yardId}`,
			});
		}
		// Exact missing: generation only when allowGenerationRequested and policy later allows.
		if (request.allowGenerationRequested) {
			return decision(request, shapeHash, inventory, candidates, options, {
				outcome: "generation-required",
				rationale: `exact yard ${id} missing; generation requested`,
			});
		}
		return decision(request, shapeHash, inventory, candidates, options, {
			outcome: "rejected",
			rationale: `exact yard ${id} not ready in inventory`,
		});
	}

	if (compatible.length > 0) {
		const winner = first(compatible);
		return decision(request, shapeHash, inventory, candidates, options, {
			outcome: "existing-yard",
			winnerYardId: winner.yardId,
			rationale: `compatible yard ${winner.yardId}`,
		});
	}

	if (mode === "compatible-or-generate" && request.allowGenerationRequested) {
		return decision(request, shapeHash, inventory, candidates, options, {
			outcome: "generation-required",
			rationale: "no compatible ready yard; generation requested",
		});
	}

	return decision(request, shapeHash, inventory, candidates, options, {
		outcome: "rejected",
		rationale: "no compatible ready yard in inventory snapshot",
	});
}

function evaluateCandidate(
	yard: YardInstanceRegistration,
	request: YardPlacementRequest,
	ctx: {
		readonly ownerTenantId: string;
		readonly bindleRuntimes: readonly string[];
	},
): YardCandidateDecision {
	const hardFailures: string[] = [];
	const shape = request.requestedShape;

	if (yard.ownerTenantId !== ctx.ownerTenantId) {
		hardFailures.push("owner-tenant-mismatch");
	}
	if (yard.status !== "ready") {
		hardFailures.push(`status-${yard.status}`);
	}
	if (request.selectionMode === "exact") {
		if (request.requestedYardId && yard.yardId !== request.requestedYardId) {
			hardFailures.push("exact-id-mismatch");
		}
	}
	if (shape.providerId && yard.providerId !== shape.providerId) {
		hardFailures.push("provider-mismatch");
	}
	if (shape.runtimeId && yard.runtimeId !== shape.runtimeId) {
		hardFailures.push("runtime-mismatch");
	}
	for (const region of shape.regions) {
		if (
			yard.shape.regions.length > 0 &&
			!yard.shape.regions.includes(region) &&
			!yard.capabilities.includes(`region:${region}`)
		) {
			hardFailures.push(`region-missing:${region}`);
		}
	}
	for (const req of shape.require) {
		if (!yard.capabilities.includes(req) && !yard.shape.require.includes(req)) {
			hardFailures.push(`capability-missing:${req}`);
		}
	}
	for (const iso of shape.isolation) {
		if (
			!yard.shape.isolation.includes(iso) &&
			!yard.capabilities.includes(iso)
		) {
			hardFailures.push(`isolation-missing:${iso}`);
		}
	}
	for (const net of shape.network) {
		if (!yard.shape.network.includes(net) && !yard.capabilities.includes(net)) {
			hardFailures.push(`network-missing:${net}`);
		}
	}
	for (const entry of shape.residency) {
		const failure = residencyFailure(entry, yard);
		if (failure !== undefined) {
			hardFailures.push(failure);
		}
	}
	for (const host of shape.componentHosts) {
		if (
			!yard.shape.componentHosts.includes(host) &&
			!yard.capabilities.includes(`host:${host}`)
		) {
			hardFailures.push(`component-host-missing:${host}`);
		}
	}
	for (const runtime of ctx.bindleRuntimes) {
		if (
			!yard.capabilities.includes(`runtime:${runtime}`) &&
			!yard.shape.componentHosts.includes(runtime) &&
			!yard.capabilities.includes(runtime)
		) {
			// Soft for empty local yards that accept any; hard if yard declares hosts.
			if (yard.shape.componentHosts.length > 0) {
				hardFailures.push(`bindle-runtime-missing:${runtime}`);
			}
		}
	}
	for (const [key, value] of Object.entries(shape.properties)) {
		const actual = yard.shape.properties[key];
		if (actual !== undefined && actual !== value) {
			hardFailures.push(`property-mismatch:${key}`);
		}
	}

	const specificity: YardMatchSpecificity = {
		exactId:
			request.requestedYardId && yard.yardId === request.requestedYardId
				? 1
				: 0,
		provider: shape.providerId && yard.providerId === shape.providerId ? 1 : 0,
		runtime: shape.runtimeId && yard.runtimeId === shape.runtimeId ? 1 : 0,
		exactLabels: countExactLabels(shape.labels, yard.labels),
		exactProperties: countExactProperties(
			shape.properties,
			yard.shape.properties,
		),
		hardCapabilities: shape.require.filter(
			(r) => yard.capabilities.includes(r) || yard.shape.require.includes(r),
		).length,
	};

	return Object.freeze({
		yardId: yard.yardId,
		compatible: hardFailures.length === 0,
		hardFailures: Object.freeze(hardFailures),
		specificity: Object.freeze(specificity),
		rankInputs: Object.freeze({
			registrationSeq: yard.registrationSeq,
			capacityTotal: Object.values(yard.capacity.classes).reduce(
				(a, b) => a + b,
				0,
			),
		}),
	});
}

/**
 * Residency hard filter (ADR-0146). A requested entry is either a bare
 * jurisdiction id ("eu") or "classification:jurisdiction" ("pii:eu"). It is
 * satisfied when the yard explicitly guarantees the entry in its own
 * shape.residency, or when EVERY region the yard declares maps inside the
 * entry's jurisdiction via the fail-closed core evaluator. A yard with no
 * declared regions cannot attest geography, so any residency request fails.
 */
function residencyFailure(
	entry: string,
	yard: YardInstanceRegistration,
): string | undefined {
	if (yard.shape.residency.includes(entry)) return undefined;
	const separator = entry.indexOf(":");
	const jurisdictionRaw = separator === -1 ? entry : entry.slice(separator + 1);
	try {
		if (separator !== -1) {
			parseDataClassification(entry.slice(0, separator));
		}
		const jurisdiction = parseJurisdictionId(jurisdictionRaw);
		if (yard.shape.regions.length === 0) {
			return `residency-unattested:${entry}`;
		}
		for (const region of yard.shape.regions) {
			const evaluation = evaluateResidency({
				constraint: {
					classifications: [],
					allowedJurisdictions: [jurisdiction],
				},
				region,
			});
			if (!evaluation.ok) {
				return `residency-conflict:${entry}:${evaluation.region}`;
			}
		}
		return undefined;
	} catch {
		return `residency-invalid:${entry}`;
	}
}

function compareCandidates(
	a: YardCandidateDecision,
	b: YardCandidateDecision,
	objective: string,
): number {
	if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
	const sa = a.specificity;
	const sb = b.specificity;
	// Lexicographic specificity (higher better).
	const keys: (keyof YardMatchSpecificity)[] = [
		"exactId",
		"provider",
		"runtime",
		"exactLabels",
		"exactProperties",
		"hardCapabilities",
	];
	for (const key of keys) {
		if (sa[key] !== sb[key]) return (sb[key] as number) - (sa[key] as number);
	}
	// Objective: prefer higher capacity for min-cost reuse; stable yard id tiebreak.
	if (objective === "min-cost") {
		const ca = Number(a.rankInputs.capacityTotal ?? 0);
		const cb = Number(b.rankInputs.capacityTotal ?? 0);
		if (ca !== cb) return cb - ca;
	}
	return a.yardId < b.yardId ? -1 : a.yardId > b.yardId ? 1 : 0;
}

function countExactLabels(
	requested: Readonly<Record<string, string>>,
	actual: Readonly<Record<string, string>>,
): number {
	let n = 0;
	for (const [k, v] of Object.entries(requested)) {
		if (actual[k] === v) n += 1;
	}
	return n;
}

function countExactProperties(
	requested: Readonly<Record<string, unknown>>,
	actual: Readonly<Record<string, unknown>>,
): number {
	let n = 0;
	for (const [k, v] of Object.entries(requested)) {
		if (actual[k] === v) n += 1;
	}
	return n;
}

function decision(
	request: YardPlacementRequest,
	shapeHash: ContentHash,
	inventory: YardInventorySnapshot,
	candidates: readonly YardCandidateDecision[],
	options: { readonly contributingPolicyIds?: readonly string[] },
	result: {
		outcome: YardMatchDecision["outcome"];
		winnerYardId?: string;
		rationale: string;
	},
): YardMatchDecision {
	return Object.freeze({
		...(request.requestedYardId !== undefined
			? { requestedYardId: request.requestedYardId }
			: {}),
		selectionMode: request.selectionMode,
		requestedShapeHash: shapeHash,
		inventoryHash: inventory.contentHash,
		...(result.winnerYardId !== undefined
			? { winnerYardId: result.winnerYardId }
			: {}),
		candidates: Object.freeze(candidates),
		contributingPolicyIds: Object.freeze([
			...(options.contributingPolicyIds ?? []),
		]),
		outcome: result.outcome,
		rationale: result.rationale,
	});
}

/** Shape compatibility is directional: requested ⊆ yard guarantees. */
export function shapeSubsetCompatible(
	requested: YardShape,
	actual: YardShape,
	capabilities: readonly string[],
): boolean {
	if (requested.providerId && actual.providerId !== requested.providerId) {
		return false;
	}
	for (const req of requested.require) {
		if (!actual.require.includes(req) && !capabilities.includes(req)) {
			return false;
		}
	}
	return true;
}
