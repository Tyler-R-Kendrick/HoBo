import { randomUUID } from "node:crypto";

import type { BrokerCatalog, PlacementDecision } from "../types.js";
import { defaultYardGenerationConnectors } from "./connectors.js";
import {
	createDefaultEventStoreFoldResolvers,
	createEventStoreFoldResolverRegistry,
	type ProviderNativeSignal,
	type YardEventStoreFoldResolver,
} from "./event-store-resolvers.js";
import { YARD_EVENTS, type YardEvent, yardEvent } from "./events.js";
import {
	emptyYardEventStoreState,
	foldYardEventStore,
	inventorySnapshotFromFold,
	type YardEventStoreState,
} from "./folds.js";
import {
	createYardGenerationSaga,
	DEFAULT_YARD_GENERATION_POLICY,
	planYardGeneration,
	type YardGenerationConnector,
} from "./generation.js";
import { createYardRuntimeCatalog, localYardInstance } from "./inventory.js";
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
	type ContentHash,
	contentHashOf,
	emptyYardShape,
	parseYardShape,
	YARD_PLACEMENT_RECEIPT_SCHEMA,
	type YardGenerationPolicy,
	type YardPlacementReceipt,
	type YardPlacementRequest,
} from "./types.js";

export interface YardFirstPlacementDeps {
	readonly brokerId: string;
	readonly catalog: BrokerCatalog;
	readonly ownerTenantId?: string;
	readonly runtimeCatalog?: ReturnType<typeof createYardRuntimeCatalog>;
	readonly generationPolicy?: YardGenerationPolicy;
	readonly connectors?: ReadonlyMap<string, YardGenerationConnector>;
	/** Seed a ready local yard when inventory is empty (zero-config path). */
	readonly seedLocalYard?: boolean;
	/** Provider event-store fold resolvers (default: local+azure+aws+gcp). */
	readonly foldResolvers?: readonly YardEventStoreFoldResolver[];
	/** Prior event log for crash-resume / replay. */
	readonly priorEvents?: readonly YardEvent[];
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
	/** Durable yard.* facts emitted for this request (append-only). */
	readonly events: readonly YardEvent[];
	/** Fold projection after applying prior + new events. */
	readonly foldState: YardEventStoreState;
}

/**
 * Canonical production path: Yard match → optional generation → Camp →
 * resolvers → residual resource placement under selected Yard provider only.
 *
 * All decisions append yard.* facts; inventory/generation state is the pure
 * fold of those facts (via the provider event-store fold resolver).
 */
export async function resolveBindleDeployment(
	request: BindleDeploymentRequest,
	deps: YardFirstPlacementDeps,
): Promise<YardFirstPlacementResult> {
	const emitted: YardEvent[] = [];
	let foldState = emptyYardEventStoreState(deps.brokerId);
	// Replay prior events for crash-resume.
	for (const prior of deps.priorEvents ?? []) {
		foldState = foldYardEventStore(foldState, prior);
	}

	const foldRegistry = createEventStoreFoldResolverRegistry(
		deps.foldResolvers ?? createDefaultEventStoreFoldResolvers(),
	);

	const append = (event: YardEvent): void => {
		emitted.push(event);
		foldState = foldYardEventStore(foldState, {
			...event,
			seq: (event.seq ?? foldState.seq) + 1,
		});
	};

	const appendProviderSignals = (
		providerId: string,
		signals: readonly { kind: string; payload: Record<string, unknown> }[],
	): void => {
		const resolver =
			foldRegistry.get(providerId) ??
			foldRegistry.get("local") ??
			createDefaultEventStoreFoldResolvers()[0]!;
		for (const signal of signals) {
			const native: ProviderNativeSignal = {
				providerId,
				kind: signal.kind,
				payload: signal.payload as ProviderNativeSignal["payload"],
			};
			for (const event of resolver.normalize(native)) {
				append(event);
			}
		}
	};

	if (request.schemaVersion !== BINDLE_DEPLOYMENT_REQUEST_SCHEMA) {
		return rejectResult(
			foldState,
			emitted,
			"contracts",
			"schema-mismatch",
			"invalid deployment request schema",
		);
	}

	const ownerTenantId = request.ownerTenantId || deps.ownerTenantId || "local";
	const runtimeCatalog = deps.runtimeCatalog ?? createYardRuntimeCatalog();

	append(
		yardEvent(YARD_EVENTS.PlacementRequested, {
			requestId: request.requestId,
			bindleName: request.bindleName,
			ownerTenantId,
			selectionMode: request.yard.selectionMode,
			requestedYardId: request.yard.requestedYardId,
			requestedShape: request.yard.requestedShape,
		}),
	);

	// Zero-config: seed a ready local yard via facts when inventory empty.
	if (
		deps.seedLocalYard !== false &&
		Object.keys(foldState.yards).length === 0
	) {
		const providerId = request.yard.requestedShape.providerId ?? "local";
		const yard = localYardInstance({
			yardId: request.yard.requestedYardId ?? `yard:local-${providerId}`,
			ownerTenantId,
			providerId,
			componentHosts: ["local", "wasm", "oci"],
		});
		append(yardEvent(YARD_EVENTS.Registered, { yard }));
		append(
			yardEvent(YARD_EVENTS.Ready, {
				yardId: yard.yardId,
			}),
		);
	}

	const snapshot = inventorySnapshotFromFold(foldState);
	const match = matchYard(request.yard, snapshot, {
		ownerTenantId,
		objective: request.objective,
		bindleRuntimes: request.bindleRequirements.runtimes,
		contributingPolicyIds: ["yard-match"],
	});

	append(
		yardEvent(YARD_EVENTS.MatchDecided, {
			requestId: request.requestId,
			match,
		}),
	);

	let selectedYardId = match.winnerYardId;
	let generationAttemptId: string | undefined;
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
			append(
				yardEvent(YARD_EVENTS.PlacementRejected, {
					requestId: request.requestId,
					code: "yard-generation-denied",
					reasonCodes: ["yard-generation-denied"],
					message: genDecision.reason,
				}),
			);
			return rejectResult(
				foldState,
				emitted,
				"policy",
				"yard-generation-denied",
				genDecision.reason,
			);
		}

		append(
			yardEvent(YARD_EVENTS.GenerationRequested, {
				attemptId: genDecision.plan.attemptId,
				idempotencyKey: genDecision.plan.idempotencyKey,
				providerId: genDecision.plan.providerId,
				runtimeId: genDecision.plan.runtimeId,
				expectedYardId: genDecision.plan.expectedYardId,
			}),
		);
		append(
			yardEvent(YARD_EVENTS.GenerationReserved, {
				attemptId: genDecision.plan.attemptId,
				idempotencyKey: genDecision.plan.idempotencyKey,
				providerId: genDecision.plan.providerId,
				runtimeId: genDecision.plan.runtimeId,
				expectedYardId: genDecision.plan.expectedYardId,
			}),
		);

		const connectors = deps.connectors ?? defaultYardGenerationConnectors();
		const saga = createYardGenerationSaga({ connectors });
		append(
			yardEvent(YARD_EVENTS.GenerationStarted, {
				attemptId: genDecision.plan.attemptId,
				idempotencyKey: genDecision.plan.idempotencyKey,
				providerId: genDecision.plan.providerId,
				runtimeId: genDecision.plan.runtimeId,
				expectedYardId: genDecision.plan.expectedYardId,
			}),
		);

		const genResult = await saga.run(genDecision.plan);
		generationAttemptId = genDecision.plan.attemptId;

		// Feed connector progress signals through the provider fold resolver.
		const connector = connectors.get(genDecision.plan.generatorConnectorId) as
			| (YardGenerationConnector & {
					signalsFor?: (
						id: string,
					) => readonly { kind: string; payload: Record<string, unknown> }[];
			  })
			| undefined;
		if (connector?.signalsFor) {
			appendProviderSignals(
				genDecision.plan.providerId,
				connector.signalsFor(genDecision.plan.attemptId),
			);
		}

		if (genResult.status === "failed" || !genResult.yardId) {
			append(
				yardEvent(YARD_EVENTS.GenerationFailed, {
					attemptId: genDecision.plan.attemptId,
					idempotencyKey: genDecision.plan.idempotencyKey,
					providerId: genDecision.plan.providerId,
					failure: genResult.failure ?? {
						code: "yard-generation-failed",
						message: "yard generation failed",
						retryable: false,
					},
				}),
			);
			append(
				yardEvent(YARD_EVENTS.PlacementRejected, {
					requestId: request.requestId,
					code: genResult.failure?.code ?? "yard-generation-failed",
					reasonCodes: [genResult.failure?.code ?? "yard-generation-failed"],
				}),
			);
			return rejectResult(
				foldState,
				emitted,
				"placement",
				genResult.failure?.code ?? "yard-generation-failed",
				genResult.failure?.message ?? "yard generation failed",
			);
		}

		// If connector did not emit ready via signals, complete attestation path.
		if (
			!foldState.yards[genResult.yardId]?.status ||
			foldState.yards[genResult.yardId]?.status !== "ready"
		) {
			const providerId = genDecision.plan.providerId;
			append(
				yardEvent(YARD_EVENTS.Registered, {
					yard: localYardInstance({
						yardId: genResult.yardId,
						ownerTenantId,
						providerId,
						runtimeId: genDecision.plan.runtimeId,
					}),
				}),
			);
			append(
				yardEvent(YARD_EVENTS.AttestationStarted, {
					yardId: genResult.yardId,
				}),
			);
			append(yardEvent(YARD_EVENTS.Attested, { yardId: genResult.yardId }));
			append(
				yardEvent(YARD_EVENTS.Ready, {
					yardId: genResult.yardId,
					attemptId: genDecision.plan.attemptId,
				}),
			);
		}

		const rematch = matchYard(
			request.yard,
			inventorySnapshotFromFold(foldState),
			{
				ownerTenantId,
				objective: request.objective,
				bindleRuntimes: request.bindleRequirements.runtimes,
			},
		);
		append(
			yardEvent(YARD_EVENTS.MatchDecided, {
				requestId: request.requestId,
				match: rematch,
				phase: "post-generation",
			}),
		);
		if (rematch.outcome !== "existing-yard" || !rematch.winnerYardId) {
			append(
				yardEvent(YARD_EVENTS.PlacementRejected, {
					requestId: request.requestId,
					code: "yard-rematch-failed",
					reasonCodes: ["yard-rematch-failed"],
				}),
			);
			return rejectResult(
				foldState,
				emitted,
				"placement",
				"yard-rematch-failed",
				"generated yard did not become selectable",
			);
		}
		selectedYardId = rematch.winnerYardId;
	}

	if (match.outcome === "rejected" && !selectedYardId) {
		append(
			yardEvent(YARD_EVENTS.PlacementRejected, {
				requestId: request.requestId,
				code: "yard-match-rejected",
				reasonCodes: ["yard-match-rejected"],
				message: match.rationale,
			}),
		);
		return rejectResult(
			foldState,
			emitted,
			"placement",
			"yard-match-rejected",
			match.rationale,
		);
	}
	if (!selectedYardId) {
		append(
			yardEvent(YARD_EVENTS.PlacementRejected, {
				requestId: request.requestId,
				code: "no-yard-selected",
				reasonCodes: ["no-yard-selected"],
			}),
		);
		return rejectResult(
			foldState,
			emitted,
			"placement",
			"no-yard-selected",
			"no yard selected",
		);
	}

	const workingSnapshot = inventorySnapshotFromFold(foldState);
	const yard = workingSnapshot.yards.find((y) => y.yardId === selectedYardId);
	if (yard?.status !== "ready") {
		append(
			yardEvent(YARD_EVENTS.PlacementRejected, {
				requestId: request.requestId,
				code: "yard-not-ready",
				reasonCodes: ["yard-not-ready"],
			}),
		);
		return rejectResult(
			foldState,
			emitted,
			"placement",
			"yard-not-ready",
			`yard ${selectedYardId} is not ready`,
		);
	}

	// Camp placement inside selected yard.
	const campId = selectOrGenerateCamp(request, yard.yardId);

	// Resolvers constrained to yard provider (includes event-store slot).
	const { pins } = composeResolverPins({
		providerId: yard.providerId,
		yardDefaults: EMPTY_RESOLVER_CONFIG,
		campConfig: EMPTY_RESOLVER_CONFIG,
		providerDefaults: defaultProviderResolvers(yard.providerId),
	});

	// Residual resources: all under selected yard provider only (no cross-yard split).
	const placements = placeResourcesUnderYard(
		request,
		yard.providerId,
		deps.catalog,
	);
	if ("error" in placements) {
		append(
			yardEvent(YARD_EVENTS.PlacementRejected, {
				requestId: request.requestId,
				code: placements.code,
				reasonCodes: [placements.code],
				message: placements.error,
			}),
		);
		return rejectResult(
			foldState,
			emitted,
			"placement",
			placements.code,
			placements.error,
		);
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
		requestedShapeHash: contentHashOf(
			request.yard.requestedShape,
		) as ContentHash,
		inventoryHash: workingSnapshot.contentHash,
		runtimeCatalogHash: runtimeSnapshot.contentHash,
		selectedYardId: yard.yardId,
		selectedProviderId: yard.providerId,
		selectedCampId: campId,
		...(generationAttemptId !== undefined ? { generationAttemptId } : {}),
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
			`${yard.providerId}.yard.event-store/v1`,
		]),
		resolverPins: pins,
	};

	const receipt: YardPlacementReceipt = Object.freeze({
		...receiptBody,
		contentHash: contentHashOf(receiptBody) as ContentHash,
	});

	append(
		yardEvent(YARD_EVENTS.PlacementResolved, {
			requestId: request.requestId,
			selectedYardId: yard.yardId,
			selectedProviderId: yard.providerId,
			selectedCampId: campId,
			...(generationAttemptId !== undefined ? { generationAttemptId } : {}),
			receiptHash: receipt.contentHash,
			receipt,
		}),
	);

	return {
		outcome: "resolved",
		receipt,
		placements: placements.decisions,
		...(generationAttemptId !== undefined ? { generationAttemptId } : {}),
		events: Object.freeze([...emitted]),
		foldState,
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
			yardRaw.bindleRequirementsHash ??
				contentHashOf(raw.bindleRequirements ?? {}),
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
						...(typeof (raw.camp as Record<string, unknown>).campId === "string"
							? {
									campId: (raw.camp as Record<string, unknown>)
										.campId as string,
								}
							: {}),
						shape: Object.freeze({
							require: list(
								(
									(raw.camp as Record<string, unknown>).shape as Record<
										string,
										unknown
									>
								)?.require,
							),
							prefer: list(
								(
									(raw.camp as Record<string, unknown>).shape as Record<
										string,
										unknown
									>
								)?.prefer,
							),
							labels: stringMap(
								(
									(raw.camp as Record<string, unknown>).shape as Record<
										string,
										unknown
									>
								)?.labels,
							),
							runtimeRequirements: list(
								(
									(raw.camp as Record<string, unknown>).shape as Record<
										string,
										unknown
									>
								)?.runtimeRequirements,
							),
						}),
					}),
				}
			: {}),
		objective: typeof raw.objective === "string" ? raw.objective : "min-cost",
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
	const isLocal =
		!options.providerId ||
		options.providerId === "local" ||
		options.providerId === "@hobo/provider-local-host";
	const shape = parseYardShape({
		...(options.providerId ? { providerId: options.providerId } : {}),
		// Local zero-config hosts only; cloud yards declare their own substrate.
		...(isLocal
			? { componentHosts: ["local", "wasm", "oci"] }
			: { componentHosts: [] }),
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

function rejectResult(
	foldState: YardEventStoreState,
	emitted: readonly YardEvent[],
	plane: string,
	code: string,
	message: string,
): YardFirstPlacementResult {
	return {
		outcome: "rejected",
		placements: Object.freeze([]),
		reasons: Object.freeze([{ plane, code, message }]),
		events: Object.freeze([...emitted]),
		foldState,
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
