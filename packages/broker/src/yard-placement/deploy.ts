import { randomUUID } from "node:crypto";

import type { BrokerCatalog, PlacementDecision } from "../types.js";
import {
	createYardGenerationSaga,
	DEFAULT_YARD_GENERATION_POLICY,
	planYardGeneration,
	type YardGenerationConnector,
} from "./generation.js";
import {
	createYardInventory,
	createYardRuntimeCatalog,
	localYardInstance,
} from "./inventory.js";
import { matchYard } from "./matching.js";
import {
	buildExecutionUnits,
	composeResolverPins,
	defaultProviderResolvers,
	EMPTY_RESOLVER_CONFIG,
} from "./resolvers.js";
import {
	BINDLE_DEPLOYMENT_REQUEST_SCHEMA,
	type BindleDeploymentRequest,
	contentHashOf,
	type ContentHash,
	emptyYardShape,
	parseYardShape,
	type YardGenerationPolicy,
	type YardInventorySnapshot,
	type YardPlacementReceipt,
	type YardPlacementRequest,
	type YardRuntimeCatalogSnapshot,
	YARD_PLACEMENT_RECEIPT_SCHEMA,
} from "./types.js";

export interface YardFirstPlacementDeps {
	readonly brokerId: string;
	readonly catalog: BrokerCatalog;
	readonly ownerTenantId?: string;
	readonly inventory?: ReturnType<typeof createYardInventory>;
	readonly runtimeCatalog?: ReturnType<typeof createYardRuntimeCatalog>;
	readonly generationPolicy?: YardGenerationPolicy;
	readonly connectors?: ReadonlyMap<string, YardGenerationConnector>;
	/** Seed a ready local yard when inventory is empty (zero-config path). */
	readonly seedLocalYard?: boolean;
}

export interface YardFirstPlacementResult {
	readonly outcome: "resolved" | "rejected";
	readonly receipt?: YardPlacementReceipt;
	readonly placements: readonly PlacementDecision[];
	readonly reasons?: readonly {
		readonly plane: string;
		readonly code: string;
		readonly message: string;
	}[];
	readonly generationAttemptId?: string;
}

/**
 * Canonical production path: Yard match → optional generation → Camp →
 * resolvers → residual resource placement under selected Yard provider only.
 */
export async function resolveBindleDeployment(
	request: BindleDeploymentRequest,
	deps: YardFirstPlacementDeps,
): Promise<YardFirstPlacementResult> {
	if (request.schemaVersion !== BINDLE_DEPLOYMENT_REQUEST_SCHEMA) {
		return reject("contracts", "schema-mismatch", "invalid deployment request schema");
	}

	const ownerTenantId = request.ownerTenantId || deps.ownerTenantId || "local";
	const inventory =
		deps.inventory ?? createYardInventory(deps.brokerId);
	const runtimeCatalog = deps.runtimeCatalog ?? createYardRuntimeCatalog();

	// Zero-config: ensure a ready local yard exists for local provider shapes.
	if (deps.seedLocalYard !== false && inventory.snapshot().yards.length === 0) {
		const providerId =
			request.yard.requestedShape.providerId ?? "local";
		inventory.apply({
			type: "yard.Registered",
			yard: localYardInstance({
				yardId: request.yard.requestedYardId ?? `yard:local-${providerId}`,
				ownerTenantId,
				providerId,
				componentHosts: ["local", "wasm", "oci"],
			}),
		});
	}

	const snapshot = inventory.snapshot();
	const match = matchYard(request.yard, snapshot, {
		ownerTenantId,
		objective: request.objective,
		bindleRuntimes: request.bindleRequirements.runtimes,
		contributingPolicyIds: ["yard-match"],
	});

	let selectedYardId = match.winnerYardId;
	let generationAttemptId: string | undefined;
	let workingSnapshot: YardInventorySnapshot = snapshot;
	const runtimeSnapshot = runtimeCatalog.snapshot();

	if (match.outcome === "generation-required") {
		const genDecision = planYardGeneration({
			ownerTenantId,
			requestedShape: request.yard.requestedShape,
			runtimeCatalog: runtimeSnapshot,
			policy: deps.generationPolicy ?? DEFAULT_YARD_GENERATION_POLICY,
			allowGenerationRequested: request.yard.allowGenerationRequested,
			attemptId: `gen-${request.requestId}`,
		});
		if (!genDecision.allowed) {
			return reject(
				"policy",
				"yard-generation-denied",
				genDecision.reason,
			);
		}
		const saga = createYardGenerationSaga({
			connectors: deps.connectors ?? new Map(),
		});
		const genResult = await saga.run(genDecision.plan);
		generationAttemptId = genDecision.plan.attemptId;
		if (genResult.status === "failed" || !genResult.yardId) {
			return reject(
				"placement",
				genResult.failure?.code ?? "yard-generation-failed",
				genResult.failure?.message ?? "yard generation failed",
			);
		}
		// Register generated yard as ready only after attestation path.
		if (genResult.status !== "ready" && genResult.status !== "registered") {
			return reject(
				"placement",
				"yard-not-ready",
				`generated yard status ${genResult.status}; not ready for placement`,
			);
		}
		const providerId = genDecision.plan.providerId;
		inventory.apply({
			type: "yard.Registered",
			yard: localYardInstance({
				yardId: genResult.yardId,
				ownerTenantId,
				providerId,
				runtimeId: genDecision.plan.runtimeId,
			}),
		});
		// Attest → ready
		inventory.apply({
			type: "yard.StatusChanged",
			yardId: genResult.yardId,
			status: "ready",
			observedAt: new Date().toISOString(),
		});
		workingSnapshot = inventory.snapshot();
		const rematch = matchYard(request.yard, workingSnapshot, {
			ownerTenantId,
			objective: request.objective,
			bindleRuntimes: request.bindleRequirements.runtimes,
		});
		if (rematch.outcome !== "existing-yard" || !rematch.winnerYardId) {
			return reject(
				"placement",
				"yard-rematch-failed",
				"generated yard did not become selectable",
			);
		}
		selectedYardId = rematch.winnerYardId;
	}

	if (match.outcome === "rejected" && !selectedYardId) {
		return reject("placement", "yard-match-rejected", match.rationale);
	}
	if (!selectedYardId) {
		return reject("placement", "no-yard-selected", "no yard selected");
	}

	const yard =
		workingSnapshot.yards.find((y) => y.yardId === selectedYardId) ??
		inventory.get(selectedYardId);
	if (!yard || yard.status !== "ready") {
		return reject(
			"placement",
			"yard-not-ready",
			`yard ${selectedYardId} is not ready`,
		);
	}

	// Camp placement inside selected yard.
	const campId = selectOrGenerateCamp(request, yard.yardId);

	// Resolvers constrained to yard provider.
	const { pins } = composeResolverPins({
		providerId: yard.providerId,
		yardDefaults: EMPTY_RESOLVER_CONFIG,
		campConfig: EMPTY_RESOLVER_CONFIG,
		providerDefaults: defaultProviderResolvers(yard.providerId),
	});

	// Residual resources: all under selected yard provider only (no cross-yard split).
	const placements = placeResourcesUnderYard(request, yard.providerId, deps.catalog);
	if ("error" in placements) {
		return reject("placement", placements.code, placements.error);
	}

	const residualDefinitionIds = placements.decisions.map((p) => p.definitionId);
	const executionUnits = buildExecutionUnits({
		yardId: yard.yardId,
		providerId: yard.providerId,
		campId,
		bindleName: request.bindleName,
		resourceIds: request.resources.map((r) => r.resourceId),
		residualDefinitionIds,
	});

	const receiptBody = {
		schemaVersion: YARD_PLACEMENT_RECEIPT_SCHEMA,
		requestId: request.requestId,
		brokerId: deps.brokerId,
		selectionMode: request.yard.selectionMode,
		requestedShapeHash: contentHashOf(request.yard.requestedShape) as ContentHash,
		inventoryHash: workingSnapshot.contentHash,
		runtimeCatalogHash: runtimeSnapshot.contentHash,
		selectedYardId: yard.yardId,
		selectedProviderId: yard.providerId,
		selectedCampId: campId,
		...(generationAttemptId !== undefined
			? { generationAttemptId }
			: {}),
		match: {
			...match,
			...(selectedYardId !== match.winnerYardId
				? { winnerYardId: selectedYardId, outcome: "existing-yard" as const }
				: {}),
		},
		executionUnits,
		contributingPolicyIds: Object.freeze([
			...match.contributingPolicyIds,
			deps.generationPolicy?.id ?? DEFAULT_YARD_GENERATION_POLICY.id,
		]),
		resolverPins: pins,
	};

	const receipt: YardPlacementReceipt = Object.freeze({
		...receiptBody,
		contentHash: contentHashOf(receiptBody) as ContentHash,
	});

	return {
		outcome: "resolved",
		receipt,
		placements: placements.decisions,
		...(generationAttemptId !== undefined ? { generationAttemptId } : {}),
	};
}

export function parseBindleDeploymentRequest(
	input: unknown,
): BindleDeploymentRequest {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new TypeError("bindle deployment request must be an object");
	}
	const raw = input as Record<string, unknown>;
	if (raw.schemaVersion !== BINDLE_DEPLOYMENT_REQUEST_SCHEMA) {
		throw new TypeError(
			`schemaVersion must be ${BINDLE_DEPLOYMENT_REQUEST_SCHEMA}`,
		);
	}
	if (typeof raw.requestId !== "string" || !raw.requestId) {
		throw new TypeError("requestId required");
	}
	if (typeof raw.bindleName !== "string" || !raw.bindleName) {
		throw new TypeError("bindleName required");
	}
	// Reject bindle-level provider selection if smuggled in.
	if ("provider" in raw || "providerId" in raw) {
		throw Object.assign(
			new Error(
				"bindle-provider-selection-forbidden: provider belongs on Yard placement request",
			),
			{ code: "bindle-provider-selection-forbidden" },
		);
	}

	const yardRaw = raw.yard as Record<string, unknown>;
	if (!yardRaw || typeof yardRaw !== "object") {
		throw new TypeError("yard placement request required");
	}
	const yard: YardPlacementRequest = Object.freeze({
		requestId:
			typeof yardRaw.requestId === "string"
				? yardRaw.requestId
				: `yard-req-${raw.requestId}`,
		selectionMode: parseSelectionMode(yardRaw.selectionMode),
		...(typeof yardRaw.requestedYardId === "string"
			? { requestedYardId: yardRaw.requestedYardId }
			: {}),
		requestedShape: parseYardShape(yardRaw.requestedShape ?? emptyYardShape()),
		bindleManifestHash: asHash(yardRaw.bindleManifestHash ?? raw.manifestHash),
		bindleRequirementsHash: asHash(
			yardRaw.bindleRequirementsHash ?? contentHashOf(raw.bindleRequirements ?? {}),
		),
		allowGenerationRequested: yardRaw.allowGenerationRequested === true,
	});

	const reqs = (raw.bindleRequirements ?? {}) as Record<string, unknown>;
	const resources = Array.isArray(raw.resources)
		? raw.resources.map((r) => {
				const row = r as Record<string, unknown>;
				return Object.freeze({
					resourceId: String(row.resourceId),
					port: String(row.port),
					features: Object.freeze(
						Array.isArray(row.features)
							? row.features.map(String)
							: ([] as string[]),
					),
					...(typeof row.region === "string" ? { region: row.region } : {}),
				});
			})
		: [];

	return Object.freeze({
		schemaVersion: BINDLE_DEPLOYMENT_REQUEST_SCHEMA,
		requestId: raw.requestId,
		bindleName: raw.bindleName,
		manifestHash: asHash(raw.manifestHash),
		bindleRequirements: Object.freeze({
			require: list(reqs.require),
			prefer: list(reqs.prefer),
			runtimes: list(reqs.runtimes),
			labels: stringMap(reqs.labels),
		}),
		yard,
		...(raw.camp && typeof raw.camp === "object"
			? {
					camp: Object.freeze({
						selectionMode: parseSelectionMode(
							(raw.camp as Record<string, unknown>).selectionMode ??
								"compatible",
						),
						...(typeof (raw.camp as Record<string, unknown>).campId ===
						"string"
							? {
									campId: (raw.camp as Record<string, unknown>)
										.campId as string,
								}
							: {}),
						shape: Object.freeze({
							require: list(
								((raw.camp as Record<string, unknown>).shape as Record<
									string,
									unknown
								>)?.require,
							),
							prefer: list(
								((raw.camp as Record<string, unknown>).shape as Record<
									string,
									unknown
								>)?.prefer,
							),
							labels: stringMap(
								((raw.camp as Record<string, unknown>).shape as Record<
									string,
									unknown
								>)?.labels,
							),
							runtimeRequirements: list(
								((raw.camp as Record<string, unknown>).shape as Record<
									string,
									unknown
								>)?.runtimeRequirements,
							),
						}),
					}),
				}
			: {}),
		objective:
			typeof raw.objective === "string" ? raw.objective : "min-cost",
		spendEstimateUsd:
			typeof raw.spendEstimateUsd === "number" ? raw.spendEstimateUsd : 0,
		ownerTenantId:
			typeof raw.ownerTenantId === "string" ? raw.ownerTenantId : "local",
		resources: Object.freeze(resources),
	});
}

export function buildDeploymentRequestFromParts(options: {
	readonly bindleName: string;
	readonly manifestHash?: ContentHash;
	readonly requirements?: BindleDeploymentRequest["bindleRequirements"];
	readonly yardId?: string;
	readonly providerId?: string;
	readonly selectionMode?: YardPlacementRequest["selectionMode"];
	readonly allowGeneration?: boolean;
	readonly resources: BindleDeploymentRequest["resources"];
	readonly ownerTenantId?: string;
	readonly objective?: string;
}): BindleDeploymentRequest {
	const requestId = `req-${randomUUID()}`;
	const requirements = options.requirements ?? {
		require: [],
		prefer: [],
		runtimes: [],
		labels: {},
	};
	const shape = parseYardShape({
		...(options.providerId ? { providerId: options.providerId } : {}),
		componentHosts: ["local", "wasm", "oci"],
	});
	const mode =
		options.selectionMode ??
		(options.yardId ? "exact" : "compatible-or-generate");
	return parseBindleDeploymentRequest({
		schemaVersion: BINDLE_DEPLOYMENT_REQUEST_SCHEMA,
		requestId,
		bindleName: options.bindleName,
		manifestHash: options.manifestHash ?? contentHashOf(options.bindleName),
		bindleRequirements: requirements,
		yard: {
			requestId: `yard-${requestId}`,
			selectionMode: mode,
			...(options.yardId ? { requestedYardId: options.yardId } : {}),
			requestedShape: shape,
			bindleManifestHash:
				options.manifestHash ?? contentHashOf(options.bindleName),
			bindleRequirementsHash: contentHashOf(requirements),
			allowGenerationRequested: options.allowGeneration === true,
		},
		objective: options.objective ?? "min-cost",
		spendEstimateUsd: 0,
		ownerTenantId: options.ownerTenantId ?? "local",
		resources: options.resources,
	});
}

function selectOrGenerateCamp(
	request: BindleDeploymentRequest,
	yardId: string,
): string {
	if (request.camp?.campId) {
		return request.camp.campId.includes("/")
			? request.camp.campId
			: `${yardId}/${request.camp.campId}`;
	}
	const env = request.camp?.shape.envType ?? "dev";
	return `${yardId}/camp:${env}`;
}

function placeResourcesUnderYard(
	request: BindleDeploymentRequest,
	providerId: string,
	catalog: BrokerCatalog,
):
	| { readonly decisions: readonly PlacementDecision[] }
	| { readonly error: string; readonly code: string } {
	const defs = catalog
		.definitions()
		.filter((d) => d.providerId === providerId || d.providerId === "*");
	const decisions: PlacementDecision[] = [];

	for (const req of request.resources) {
		const candidates = defs.filter((d) => {
			const sat = d.satisfies({
				port: req.port,
				features: [...req.features],
			});
			return sat.kind === "full" || sat.kind === "partial";
		});
		if (candidates.length === 0) {
			// Wildcard fallback on same provider
			const any = defs.find((d) => d.port === "*");
			if (!any) {
				return {
					error: `no catalog definition for ${req.resourceId} under yard provider ${providerId}`,
					code: "no-definition-in-yard-provider",
				};
			}
			candidates.push(any);
		}
		// Deterministic pick: lowest marginal price then id.
		candidates.sort((a, b) => {
			const pa = Number(a.cost.marginalPrice);
			const pb = Number(b.cost.marginalPrice);
			if (pa !== pb) return pa - pb;
			return a.id < b.id ? -1 : 1;
		});
		const winner = candidates[0]!;
		// Enforce no silent cross-provider placement.
		if (winner.providerId !== providerId && winner.providerId !== "*") {
			return {
				error: `candidate ${winner.id} provider ${winner.providerId} != yard ${providerId}`,
				code: "cross-yard-split-forbidden",
			};
		}
		decisions.push({
			resourceId: req.resourceId,
			providerId,
			definitionId: winner.id,
			region: req.region ?? winner.regions[0] ?? "local",
			sku: winner.cost.sku,
			unit: winner.cost.unit,
			marginalPrice: winner.cost.marginalPrice,
		});
	}
	return { decisions: Object.freeze(decisions) };
}

function reject(
	plane: string,
	code: string,
	message: string,
): YardFirstPlacementResult {
	return {
		outcome: "rejected",
		placements: Object.freeze([]),
		reasons: Object.freeze([{ plane, code, message }]),
	};
}

function parseSelectionMode(
	value: unknown,
): YardPlacementRequest["selectionMode"] {
	if (
		value === "exact" ||
		value === "compatible" ||
		value === "compatible-or-generate"
	) {
		return value;
	}
	return "compatible";
}

function asHash(value: unknown): ContentHash {
	if (typeof value === "string" && value.startsWith("sha256:")) {
		return value as ContentHash;
	}
	return contentHashOf(value ?? null);
}

function list(value: unknown): readonly string[] {
	if (!Array.isArray(value)) return Object.freeze([]);
	return Object.freeze(
		[
			...new Set(
				value.filter((v): v is string => typeof v === "string" && v.length > 0),
			),
		].sort(),
	);
}

function stringMap(value: unknown): Readonly<Record<string, string>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return Object.freeze({});
	}
	const out: Record<string, string> = {};
	for (const k of Object.keys(value as object).sort()) {
		const v = (value as Record<string, unknown>)[k];
		if (typeof v === "string") out[k] = v;
	}
	return Object.freeze(out);
}
