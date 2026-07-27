/**
 * Embedded broker-runtime for an installed local Yard.
 *
 * The Yard install always has a broker: it resolves which Yards/Camps can host
 * a Bindle, prefers isolated-wasm (Wasmtime sandboxes) when available, creates
 * a Camp when none is named, and hard-fails when the Bindle pins a provider via
 * `.with({ provider })` that is not in the broker's junction catalog.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import type { BindleDefinition } from "@hobo/bindles";
import {
	type BrokerCatalog,
	type BrokerCatalogDefinition,
	type BrokerPolicySet,
	type BrokerResolution,
	createBroker,
	type HoboBroker,
	LOCAL_HOST_PROVIDER_ID,
	LOCAL_HOST_REGION,
} from "@hobo/broker";

import {
	type ComponentHostKind,
	DEFAULT_COMPONENT_HOST,
	defaultHoboHome,
	loadBareMetalYardConfig,
	type BareMetalYardConfig,
	openBareMetalYard,
	yardConfigPath,
} from "./bare-metal-yard.js";
import { ensureIsolatedWasmToolchain } from "./wasm-sandbox.js";

export const EMBEDDED_BROKER_SCHEMA = "hobo.broker-runtime/v1" as const;
export const WASM_SANDBOX_PROVIDER_ID = "@hobo/provider-wasm-sandbox" as const;
export const LOCAL_PROCESS_PROVIDER_ID = LOCAL_HOST_PROVIDER_ID;

export interface EmbeddedBrokerState {
	readonly schemaVersion: typeof EMBEDDED_BROKER_SCHEMA;
	readonly brokerId: string;
	readonly preferredComponentHost: ComponentHostKind;
	readonly catalogHash: string;
	readonly updatedAt: string;
}

export interface PlacementResult {
	readonly outcome: "resolved" | "rejected";
	readonly brokerId: string;
	readonly campId: string;
	readonly yardName: string;
	readonly componentHost: ComponentHostKind;
	readonly providerId: string;
	readonly resolution: BrokerResolution;
	readonly explicitProviders: readonly string[];
	readonly message: string;
	readonly remediation?: readonly string[];
}

function brokerStatePath(hoboHome: string): string {
	return join(hoboHome, "broker-runtime.json");
}

function portForResourceKind(kind: string): string {
	if (kind === "web") return "hobo:web-app";
	if (kind === "api" || kind === "service") return "hobo:http-service";
	if (kind === "kv") return "hobo:key-value";
	if (kind === "bucket") return "hobo:object-store";
	if (kind === "queue") return "hobo:message-queue";
	if (kind === "data") return "hobo:event-store";
	return `hobo:${kind}`;
}

/**
 * Providers explicitly pinned by `.with({ provider })` on the Bindle.
 * Any such pin is a hard requirement for the broker junction catalog.
 * Env injections (`.with(env({...}))` / `option: "env"`) are not pins.
 */
export function collectExplicitProviderPins(
	definition: BindleDefinition,
): readonly string[] {
	const pins = new Set<string>();
	for (const record of Object.values(definition.resources)) {
		for (const annotation of record.annotations) {
			if (annotation.option === "env") continue;
			if (
				typeof annotation.provider === "string" &&
				annotation.provider.length > 0
			) {
				pins.add(annotation.provider);
			}
		}
	}
	return Object.freeze([...pins].sort());
}

function definitionEntry(options: {
	readonly id: string;
	readonly providerId: string;
	readonly port: string;
	readonly features?: readonly string[];
	readonly marginalPrice: string;
}): BrokerCatalogDefinition {
	return {
		id: options.id,
		providerId: options.providerId,
		port: options.port,
		features: [...(options.features ?? [])],
		regions: [LOCAL_HOST_REGION],
		cost: {
			sku: options.providerId,
			unit: "hour",
			marginalPrice: options.marginalPrice,
		},
		satisfies: (req) =>
			req.port === options.port || options.port === "*"
				? { kind: "full" }
				: { kind: "none" },
	};
}

/**
 * Catalog of yards available to the embedded broker.
 * Isolated-wasm (sandbox) is cheaper so min-cost prefers it when present.
 */
export function createYardBrokerCatalog(options: {
	readonly includeWasmSandbox: boolean;
}): BrokerCatalog {
	const definitions: BrokerCatalogDefinition[] = [
		definitionEntry({
			id: `${LOCAL_PROCESS_PROVIDER_ID}:http`,
			providerId: LOCAL_PROCESS_PROVIDER_ID,
			port: "hobo:http-service",
			marginalPrice: "0.02",
		}),
		definitionEntry({
			id: `${LOCAL_PROCESS_PROVIDER_ID}:web`,
			providerId: LOCAL_PROCESS_PROVIDER_ID,
			port: "hobo:web-app",
			marginalPrice: "0.02",
		}),
		definitionEntry({
			id: `${LOCAL_PROCESS_PROVIDER_ID}:*`,
			providerId: LOCAL_PROCESS_PROVIDER_ID,
			port: "*",
			marginalPrice: "0.02",
		}),
	];
	if (options.includeWasmSandbox) {
		definitions.push(
			definitionEntry({
				id: `${WASM_SANDBOX_PROVIDER_ID}:http`,
				providerId: WASM_SANDBOX_PROVIDER_ID,
				port: "hobo:http-service",
				features: ["wasm-sandbox"],
				// Prefer sandboxes under min-cost.
				marginalPrice: "0.00",
			}),
			definitionEntry({
				id: `${WASM_SANDBOX_PROVIDER_ID}:web`,
				providerId: WASM_SANDBOX_PROVIDER_ID,
				port: "hobo:web-app",
				features: ["wasm-sandbox"],
				marginalPrice: "0.00",
			}),
			definitionEntry({
				id: `${WASM_SANDBOX_PROVIDER_ID}:*`,
				providerId: WASM_SANDBOX_PROVIDER_ID,
				port: "*",
				features: ["wasm-sandbox"],
				marginalPrice: "0.00",
			}),
		);
	}
	const catalogHash = `sha256:yard-broker:${options.includeWasmSandbox ? "wasm" : "local"}`;
	return {
		catalogHash,
		definitions: () => definitions.map((d) => ({ ...d })),
	};
}

export function defaultEmbeddedPolicySet(
	brokerId: string,
	options: { readonly preferWasmSandbox: boolean } = {
		preferWasmSandbox: true,
	},
): BrokerPolicySet {
	return {
		schemaVersion: "hobo.broker/v1",
		brokerId,
		placementPolicies: [
			{
				id: "pp-embedded-default",
				scopeKind: "bindle",
				objective: "min-cost",
				// Empty allow-list = all catalog providers eligible.
				// Explicit bindle pins are enforced separately (hard fail).
				allowedProviders: [],
				deniedProviders: options.preferWasmSandbox
					? []
					: [WASM_SANDBOX_PROVIDER_ID],
				allowedRegions: [],
				requireExplicitCamps: false,
			},
		],
		billing: {
			quota: "deployments/day",
			quotaUsed: 0,
			quotaLimit: 10_000,
			budgetUsd: 0,
			spendCapUsd: 0,
		},
		delivery: { engine: "in-proc", syncMode: "auto", prune: false },
		requiredConnectorKinds: [],
	};
}

export function loadEmbeddedBrokerState(
	hoboHome: string = defaultHoboHome(),
): EmbeddedBrokerState | null {
	const path = brokerStatePath(hoboHome);
	if (!existsSync(path)) return null;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as EmbeddedBrokerState;
		if (raw.schemaVersion !== EMBEDDED_BROKER_SCHEMA) return null;
		return raw;
	} catch {
		return null;
	}
}

export function saveEmbeddedBrokerState(
	state: EmbeddedBrokerState,
	hoboHome: string = defaultHoboHome(),
): string {
	mkdirSync(hoboHome, { recursive: true });
	const path = brokerStatePath(hoboHome);
	writeFileSync(path, `${JSON.stringify(state, null, "\t")}\n`, "utf8");
	return path;
}

export async function ensureEmbeddedBroker(options: {
	readonly hoboHome?: string;
	readonly preferWasmSandbox?: boolean;
	readonly emitProgress?: (message: string) => void;
} = {}): Promise<{
	readonly state: EmbeddedBrokerState;
	readonly broker: HoboBroker;
	readonly catalog: BrokerCatalog;
	readonly wasmAvailable: boolean;
}> {
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	const emit = options.emitProgress ?? (() => {});
	let wasmAvailable = false;
	try {
		await ensureIsolatedWasmToolchain({
			hoboHome,
			download: options.preferWasmSandbox !== false,
			emitProgress: emit,
		});
		wasmAvailable = true;
	} catch {
		wasmAvailable = false;
		emit(
			"hobo broker-runtime: isolated-wasm toolchain unavailable; local process yard remains eligible",
		);
	}

	const preferWasm =
		options.preferWasmSandbox !== false && wasmAvailable;
	const existing = loadEmbeddedBrokerState(hoboHome);
	const brokerId =
		existing?.brokerId ?? `broker:local/${hostname()}`;
	const catalog = createYardBrokerCatalog({
		includeWasmSandbox: preferWasm,
	});
	const policies = defaultEmbeddedPolicySet(brokerId, {
		preferWasmSandbox: preferWasm,
	});
	const broker = createBroker({ policies, catalog });
	const state: EmbeddedBrokerState = {
		schemaVersion: EMBEDDED_BROKER_SCHEMA,
		brokerId,
		preferredComponentHost: preferWasm ? "isolated-wasm" : "local",
		catalogHash: catalog.catalogHash,
		updatedAt: new Date().toISOString(),
	};
	saveEmbeddedBrokerState(state, hoboHome);
	emit(
		`hobo broker-runtime: ready ${brokerId} (prefer ${state.preferredComponentHost})`,
	);
	return { state, broker, catalog, wasmAvailable: preferWasm };
}

function componentHostForProvider(
	providerId: string,
	fallback: ComponentHostKind,
): ComponentHostKind {
	if (providerId === WASM_SANDBOX_PROVIDER_ID) return "isolated-wasm";
	if (providerId === LOCAL_PROCESS_PROVIDER_ID) return "local";
	return fallback;
}

/**
 * Resolve deployment placement through the embedded broker.
 * Creates a Camp id when the request does not name one.
 * Hard-fails when the Bindle pins providers missing from the catalog.
 */
export async function resolveBindlePlacement(options: {
	readonly definition: BindleDefinition;
	readonly hoboHome?: string;
	readonly yard?: BareMetalYardConfig | null;
	readonly campId?: string;
	readonly emitProgress?: (message: string) => void;
}): Promise<PlacementResult> {
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	const emit = options.emitProgress ?? (() => {});
	const yardConfig =
		options.yard ?? loadBareMetalYardConfig(hoboHome) ?? null;

	const { state, broker, catalog } = await ensureEmbeddedBroker({
		hoboHome,
		emitProgress: emit,
	});

	const explicitProviders = collectExplicitProviderPins(options.definition);
	if (explicitProviders.length > 0) {
		const available = new Set(
			catalog.definitions().map((d) => d.providerId),
		);
		const missing = explicitProviders.filter((p) => !available.has(p));
		if (missing.length > 0) {
			const message = `bindle pins provider(s) via .with({ provider }) that are not available on this broker junction: ${missing.join(", ")}`;
			return {
				outcome: "rejected",
				brokerId: state.brokerId,
				campId: options.campId ?? "unplaced",
				yardName: yardConfig?.name ?? "local",
				componentHost: state.preferredComponentHost,
				providerId: "none",
				resolution: {
					outcome: "rejected",
					rejection: {
						schemaVersion: "hobo.broker/v1",
						requestId: "pin-check",
						brokerId: state.brokerId,
						policyHash: broker.policyHash,
						reasons: missing.map((provider) => ({
							plane: "placement" as const,
							code: "pinned-provider-unavailable",
							message: `provider ${provider} is not registered on the broker junction`,
						})),
					},
					events: [],
				},
				explicitProviders,
				message,
				remediation: [
					"Remove the .with({ provider }) pin to let the broker choose (default: wasm-sandbox when available).",
					"Or register/approve the pinned provider on this broker junction, then retry.",
					`Broker state: ${brokerStatePath(hoboHome)}`,
				],
			};
		}
	}

	const yardName = yardConfig?.name ?? "local";
	// Auto-create camp when none is named (broker requireExplicitCamps=false).
	const campId = options.campId ?? `camp:dev-${yardName}`;
	const requirements = Object.values(options.definition.resources).map(
		(resource) => ({
			resourceId: resource.name,
			port: portForResourceKind(resource.kind),
			features: [] as string[],
		}),
	);

	const request = {
		schemaVersion: "hobo.broker/v1" as const,
		requestId: `req-${randomUUID()}`,
		scope: {
			bindleId: `bindle:${options.definition.name}`,
			campId,
			yardId: `yard:${yardName}`,
		},
		requirements,
		spendEstimateUsd: 0,
	};

	emit(`hobo broker-runtime: resolving placement for ${request.scope.bindleId}`);
	const resolution = await broker.resolve(request);
	if (resolution.outcome === "rejected" || !resolution.receipt) {
		const reasons =
			resolution.rejection?.reasons.map((r) => r.message).join("; ") ??
			"placement rejected";
		return {
			outcome: "rejected",
			brokerId: state.brokerId,
			campId,
			yardName,
			componentHost: state.preferredComponentHost,
			providerId: "none",
			resolution,
			explicitProviders,
			message: `broker rejected placement: ${reasons}`,
			remediation: [
				"Run `hobo yard ensure` so isolated-wasm tooling is available when preferred.",
				"Inspect broker policies under ~/.hobo/broker-runtime.json.",
			],
		};
	}

	// Prefer wasm-sandbox placement among decided providers.
	const providerIds = resolution.receipt.placements.map((p) => p.providerId);
	const providerId = providerIds.includes(WASM_SANDBOX_PROVIDER_ID)
		? WASM_SANDBOX_PROVIDER_ID
		: (providerIds[0] ?? LOCAL_PROCESS_PROVIDER_ID);
	const componentHost = componentHostForProvider(
		providerId,
		state.preferredComponentHost,
	);

	// Ensure yard + camp topology exists on disk (auto-create).
	openBareMetalYard({
		hoboHome,
		// open auto-inits when missing
	});

	return {
		outcome: "resolved",
		brokerId: state.brokerId,
		campId,
		yardName,
		componentHost,
		providerId,
		resolution,
		explicitProviders,
		message: `broker placed ${options.definition.name} on ${providerId} (componentHost=${componentHost}, camp=${campId})`,
	};
}

export function describeBrokerRuntime(hoboHome: string = defaultHoboHome()): {
	readonly yardConfigPath: string;
	readonly brokerStatePath: string;
	readonly yard: BareMetalYardConfig | null;
	readonly broker: EmbeddedBrokerState | null;
} {
	return {
		yardConfigPath: yardConfigPath(hoboHome),
		brokerStatePath: brokerStatePath(hoboHome),
		yard: loadBareMetalYardConfig(hoboHome),
		broker: loadEmbeddedBrokerState(hoboHome),
	};
}

export function defaultComponentHostFromBroker(
	hoboHome: string = defaultHoboHome(),
): ComponentHostKind {
	return (
		loadEmbeddedBrokerState(hoboHome)?.preferredComponentHost ??
		DEFAULT_COMPONENT_HOST
	);
}
