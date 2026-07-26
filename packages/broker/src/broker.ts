import type { ConnectorRegistry } from "./connector-registry.js";
import { BROKER_EVENTS, type BrokerEvent, brokerEvent } from "./events.js";
import {
	type BillingPlane,
	createBillingPlane,
	createDeliveryPlane,
	createGatekeeperGatePlane,
	type DeliveryPlane,
	type DeliveryTicket,
	type GatePlane,
	type GatePlaneOptions,
	toPolicyDecisionRequest,
} from "./planes.js";
import type { EffectivePlacementPolicy } from "./policies.js";
import {
	BrokerParseError,
	effectivePlacementPolicy,
	parseBrokerPolicySet,
	parseBrokerRequest,
	policyHashOf,
} from "./policies.js";
import {
	type ResolutionSignature,
	type ResolutionSigningKey,
	signResolution,
} from "./signing.js";
import {
	BROKER_SCHEMA_VERSION,
	type BrokerCatalog,
	type BrokerCatalogDefinition,
	type BrokerRequest,
	type PlacementDecision,
	type PolicyHash,
	type RejectionReason,
	type ResolutionReceipt,
	type ResolutionRejection,
	type ResourceRequirement,
	SCALE_DIRECTIONS,
	type ScaleDirection,
	type ScaleDirective,
} from "./types.js";

// The HoBo Broker actor. It consumes brokering commands (resolve, scale,
// deliver), runs the wrapped enforcement planes in order — connectors,
// gatekeeper (policy + contracts + quota), billing, placement — and emits
// decision facts. It coordinates durable state through those events; it never
// mutates a query read model directly. Read models are folds over the emitted
// facts (see foldBrokerDecisions), with snapshot/restore for the read store.

export interface BrokerResolution {
	outcome: "resolved" | "rejected";
	receipt?: ResolutionReceipt;
	rejection?: ResolutionRejection;
	// Ed25519 detached signature over the receipt/rejection's canonical JSON,
	// present when the broker is configured with a signing key.
	signature?: ResolutionSignature;
	events: BrokerEvent[];
}

export interface HoboBrokerDeps {
	policies: unknown;
	catalog: BrokerCatalog;
	connectors?: ConnectorRegistry;
	gatePlane?: GatePlane;
	gateOptions?: GatePlaneOptions;
	billingPlane?: BillingPlane;
	deliveryPlane?: DeliveryPlane;
	signingKey?: ResolutionSigningKey;
}

export interface HoboBroker {
	brokerId: string;
	policyHash: PolicyHash;
	resolve(input: unknown): Promise<BrokerResolution>;
	scale(input: unknown): { directive: ScaleDirective; events: BrokerEvent[] };
	deliver(receipt: ResolutionReceipt): Promise<{
		ticket: DeliveryTicket;
		events: BrokerEvent[];
	}>;
}

export function createBroker(deps: HoboBrokerDeps): HoboBroker {
	// Parse, don't validate: the policy document crosses the parser boundary
	// once; from here on the broker only ever sees the refined domain types.
	const policies = parseBrokerPolicySet(deps.policies);
	const policyHash = policyHashOf(policies);
	const gatePlane =
		deps.gatePlane ?? createGatekeeperGatePlane(deps.gateOptions ?? {});
	const billingPlane = deps.billingPlane ?? createBillingPlane();
	const deliveryPlane = deps.deliveryPlane ?? createDeliveryPlane();

	function sign(
		resolution: ResolutionReceipt | ResolutionRejection,
		events: BrokerEvent[],
	): ResolutionSignature | undefined {
		if (deps.signingKey === undefined) return undefined;
		const signature = signResolution(resolution, deps.signingKey);
		events.push(
			brokerEvent(BROKER_EVENTS.ResolutionSigned, {
				requestId: resolution.requestId,
				brokerId: policies.brokerId,
				algorithm: signature.algorithm,
				payloadDigest: signature.payloadDigest,
			}),
		);
		return signature;
	}

	function reject(
		request: BrokerRequest,
		reasons: readonly RejectionReason[],
		priorEvents: BrokerEvent[],
	): BrokerResolution {
		const rejection: ResolutionRejection = {
			schemaVersion: BROKER_SCHEMA_VERSION,
			requestId: request.requestId,
			brokerId: policies.brokerId,
			policyHash,
			reasons,
		};
		const events = [
			...priorEvents,
			brokerEvent(BROKER_EVENTS.Rejected, {
				requestId: request.requestId,
				brokerId: policies.brokerId,
				policyHash,
				reasons: reasons.map((reason) => ({ ...reason })),
			}),
		];
		const signature = sign(rejection, events);
		return {
			outcome: "rejected",
			rejection,
			...(signature !== undefined ? { signature } : {}),
			events,
		};
	}

	return {
		brokerId: policies.brokerId,
		policyHash,
		async resolve(input) {
			const request = parseBrokerRequest(input);
			const events: BrokerEvent[] = [
				brokerEvent(BROKER_EVENTS.Requested, {
					requestId: request.requestId,
					brokerId: policies.brokerId,
					bindleId: request.scope.bindleId,
					requirementCount: request.requirements.length,
				}),
			];

			// Plane 0 — connector registry: required connector kinds must be
			// registered and enabled before the broker will act on their behalf.
			if (policies.requiredConnectorKinds.length > 0) {
				const missing = deps.connectors?.missingKinds(
					policies.requiredConnectorKinds,
				) ?? [...policies.requiredConnectorKinds];
				if (missing.length > 0) {
					return reject(
						request,
						missing.map((kind) => ({
							plane: "connectors" as const,
							code: "connector-missing",
							message: `required connector kind ${kind} is not registered and enabled`,
						})),
						events,
					);
				}
			}

			// Placement policy selection: the broker only acts on configured
			// policy — no applicable placement policy means no placement.
			const effective = effectivePlacementPolicy(policies, request.scope);
			if (effective === undefined) {
				return reject(
					request,
					[
						{
							plane: "policy",
							code: "no-placement-policy",
							message: `no placement policy applies to scope bindle=${request.scope.bindleId}`,
						},
					],
					events,
				);
			}

			// Junction-governance lockdown: explicit Camps required.
			if (
				effective.requireExplicitCamps &&
				request.scope.campId === undefined
			) {
				return reject(
					request,
					[
						{
							plane: "policy",
							code: "explicit-camp-required",
							message:
								"placement is locked down to explicit, approved camps; the request names no camp",
						},
					],
					events,
				);
			}

			// Plane 1 — the Gatekeeper composition (policy pack + contract
			// compatibility + obligations + quota), imported and RUN from
			// @hobo/contracts. Its policy.Decided / gatekeeper.Decided facts are
			// appended to this resolution's event list.
			const gate = await gatePlane.evaluate({
				request: toPolicyDecisionRequest(policies.brokerId, request),
				costQuota: {
					quota: policies.billing.quota,
					used: policies.billing.quotaUsed,
					limit: policies.billing.quotaLimit,
				},
			});
			for (const gateEvent of gate.events) {
				events.push({
					type: String(gateEvent.type ?? "gatekeeper.Event"),
					data: gateEvent,
				});
			}
			if (gate.effect === "deny" || gate.effect === "require-approval") {
				const reasons: RejectionReason[] =
					gate.reasons.length > 0
						? gate.reasons
						: [
								{
									plane: "policy",
									code: "approval-required",
									message: "the gate plane requires approval before placement",
								},
							];
				return reject(request, reasons, events);
			}

			// Plane 2 — billing enforcement beyond quota: budget + spend cap.
			const billing = billingPlane.authorize({
				spendEstimateUsd: request.spendEstimateUsd,
				billing: policies.billing,
			});
			if (!billing.ok) {
				return reject(request, billing.reasons, events);
			}

			// Plane 3 — placement: match every requirement against the provider
			// catalog under the effective policy, ranked by its objective.
			const definitions = deps.catalog.definitions();
			const placements: PlacementDecision[] = [];
			const placementReasons: RejectionReason[] = [];
			for (const requirement of request.requirements) {
				const placed = placeRequirement(requirement, definitions, effective);
				if ("reason" in placed) {
					placementReasons.push(placed.reason);
				} else {
					placements.push(placed.placement);
				}
			}
			if (placementReasons.length > 0) {
				return reject(request, placementReasons, events);
			}

			const receipt: ResolutionReceipt = {
				schemaVersion: BROKER_SCHEMA_VERSION,
				requestId: request.requestId,
				brokerId: policies.brokerId,
				catalogHash: deps.catalog.catalogHash,
				policyHash,
				placementPolicyId: effective.id,
				placements,
			};
			events.push(
				brokerEvent(BROKER_EVENTS.Resolved, {
					requestId: request.requestId,
					brokerId: policies.brokerId,
					catalogHash: deps.catalog.catalogHash,
					policyHash,
					placementPolicyId: effective.id,
					placements: placements.map((placement) => ({ ...placement })),
				}),
			);
			const signature = sign(receipt, events);
			return {
				outcome: "resolved",
				receipt,
				...(signature !== undefined ? { signature } : {}),
				events,
			};
		},
		scale(input) {
			const directive = parseScaleDirective(input);
			return {
				directive,
				events: [
					brokerEvent(BROKER_EVENTS.ScaleRequested, {
						brokerId: policies.brokerId,
						resourceId: directive.resourceId,
						direction: directive.direction,
						replicas: directive.replicas,
					}),
				],
			};
		},
		async deliver(receipt) {
			const ticket = await deliveryPlane.submit(receipt, policies.delivery);
			return {
				ticket,
				events: [
					brokerEvent(BROKER_EVENTS.DeliverySubmitted, {
						requestId: receipt.requestId,
						brokerId: policies.brokerId,
						engine: ticket.engine,
						target: ticket.target,
					}),
				],
			};
		},
	};
}

function placeRequirement(
	requirement: ResourceRequirement,
	definitions: readonly BrokerCatalogDefinition[],
	policy: EffectivePlacementPolicy,
): { placement: PlacementDecision } | { reason: RejectionReason } {
	const eligible = definitions.filter((definition) => {
		if (policy.deniedProviders.includes(definition.providerId)) return false;
		if (
			policy.allowedProviders.length > 0 &&
			!policy.allowedProviders.includes(definition.providerId)
		)
			return false;
		const verdict = definition.satisfies({
			port: requirement.port,
			features: [...requirement.features],
		});
		if (verdict.kind !== "full") return false;
		const region = pickRegion(requirement, definition, policy);
		return region !== undefined;
	});

	if (eligible.length === 0) {
		return {
			reason: {
				plane: "placement",
				code: "no-eligible-provider",
				message: `no approved provider satisfies port ${requirement.port} for resource ${requirement.resourceId} under policy ${policy.id}`,
			},
		};
	}

	let winner: BrokerCatalogDefinition;
	if (policy.objective === "pinned") {
		const pinned = eligible.filter(
			(definition) => definition.providerId === policy.pinnedProviderId,
		);
		if (pinned.length === 0) {
			return {
				reason: {
					plane: "placement",
					code: "pinned-provider-unavailable",
					message: `pinned provider ${policy.pinnedProviderId ?? "<unset>"} cannot satisfy port ${requirement.port} for resource ${requirement.resourceId}`,
				},
			};
		}
		winner = rankByCost(pinned)[0] as BrokerCatalogDefinition;
	} else {
		winner = rankByCost(eligible)[0] as BrokerCatalogDefinition;
	}

	const region = pickRegion(requirement, winner, policy) as string;
	return {
		placement: {
			resourceId: requirement.resourceId,
			providerId: winner.providerId,
			definitionId: winner.id,
			region,
			sku: winner.cost.sku,
			unit: winner.cost.unit,
			marginalPrice: winner.cost.marginalPrice,
		},
	};
}

// Min-cost objective (same objective the Yard Planner ranks by): lowest
// marginal price wins; provider id is the deterministic tie-break.
function rankByCost(
	definitions: readonly BrokerCatalogDefinition[],
): BrokerCatalogDefinition[] {
	return [...definitions].sort((a, b) => {
		const priceA = Number.parseFloat(a.cost.marginalPrice);
		const priceB = Number.parseFloat(b.cost.marginalPrice);
		const costA = Number.isNaN(priceA) ? Number.POSITIVE_INFINITY : priceA;
		const costB = Number.isNaN(priceB) ? Number.POSITIVE_INFINITY : priceB;
		if (costA !== costB) return costA - costB;
		return a.providerId.localeCompare(b.providerId);
	});
}

function pickRegion(
	requirement: ResourceRequirement,
	definition: BrokerCatalogDefinition,
	policy: EffectivePlacementPolicy,
): string | undefined {
	const allowed =
		policy.allowedRegions.length > 0
			? definition.regions.filter((region) =>
					policy.allowedRegions.includes(region),
				)
			: [...definition.regions];
	if (requirement.region !== undefined) {
		return allowed.includes(requirement.region)
			? requirement.region
			: undefined;
	}
	return allowed[0];
}

export function parseScaleDirective(input: unknown): ScaleDirective {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new BrokerParseError(
			"invalid-scale-directive",
			"invalid-scale-directive: expected an object",
		);
	}
	const raw = input as Record<string, unknown>;
	const resourceId = raw.resourceId ?? raw.resource_id;
	if (typeof resourceId !== "string" || resourceId.length === 0) {
		throw new BrokerParseError(
			"invalid-scale-directive",
			"invalid-scale-directive: resourceId must be a non-empty string",
		);
	}
	const direction = raw.direction;
	if (
		typeof direction !== "string" ||
		!SCALE_DIRECTIONS.includes(direction as ScaleDirection)
	) {
		throw new BrokerParseError(
			"invalid-scale-direction",
			`invalid-scale-direction: ${String(direction)} is not one of ${SCALE_DIRECTIONS.join("|")}`,
		);
	}
	const replicasRaw = raw.replicas;
	const replicas =
		typeof replicasRaw === "number" &&
		Number.isInteger(replicasRaw) &&
		replicasRaw >= 0
			? replicasRaw
			: direction === "zero"
				? 0
				: undefined;
	if (replicas === undefined) {
		throw new BrokerParseError(
			"invalid-scale-directive",
			"invalid-scale-directive: replicas must be an integer >= 0",
		);
	}
	// Dependent constraint (broker.cue): scale-to-zero means zero replicas.
	if (direction === "zero" && replicas !== 0) {
		throw new BrokerParseError(
			"invalid-scale-directive",
			"invalid-scale-directive: direction 'zero' requires replicas 0",
		);
	}
	return { resourceId, direction: direction as ScaleDirection, replicas };
}

// ---- Broker decision read model ----

export interface BrokerDecisionRow {
	requestId: string;
	outcome: "resolved" | "rejected";
	placementCount: number;
	reasonCodes: string[];
}

// Materialized view over the broker's decision facts: a pure fold, so the
// projection rebuilds from the event store from zero. Snapshot/restore below
// persist the current rows to a read store for cached current reads.
export function foldBrokerDecisions(
	events: Iterable<{ type: string; data?: unknown }>,
): BrokerDecisionRow[] {
	const rows = new Map<string, BrokerDecisionRow>();
	for (const event of events) {
		const data = (event.data ?? {}) as Record<string, unknown>;
		const requestId = data.requestId;
		if (typeof requestId !== "string" || requestId.length === 0) continue;
		if (event.type === BROKER_EVENTS.Resolved) {
			const placements = Array.isArray(data.placements) ? data.placements : [];
			rows.set(requestId, {
				requestId,
				outcome: "resolved",
				placementCount: placements.length,
				reasonCodes: [],
			});
		} else if (event.type === BROKER_EVENTS.Rejected) {
			const reasons = Array.isArray(data.reasons) ? data.reasons : [];
			rows.set(requestId, {
				requestId,
				outcome: "rejected",
				placementCount: 0,
				reasonCodes: reasons
					.map((reason) =>
						typeof (reason as Record<string, unknown>).code === "string"
							? String((reason as Record<string, unknown>).code)
							: "",
					)
					.filter((code) => code.length > 0),
			});
		}
	}
	return [...rows.values()];
}

export function snapshotBrokerDecisions(rows: BrokerDecisionRow[]): string {
	return JSON.stringify({ schemaVersion: BROKER_SCHEMA_VERSION, rows });
}

export function restoreBrokerDecisions(snapshot: string): BrokerDecisionRow[] {
	const parsed = JSON.parse(snapshot) as {
		schemaVersion?: string;
		rows?: BrokerDecisionRow[];
	};
	if (parsed.schemaVersion !== BROKER_SCHEMA_VERSION) {
		throw new BrokerParseError(
			"unsupported-snapshot",
			`unsupported-snapshot: ${String(parsed.schemaVersion)} is not ${BROKER_SCHEMA_VERSION}`,
		);
	}
	return parsed.rows ?? [];
}
