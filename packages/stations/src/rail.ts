/**
 * Rails: Station-owned, content-addressed policy profiles (ADR Station occupancy).
 */
import { createHash } from "node:crypto";

import {
	RAIL_SCHEMA_VERSION,
	type Rail,
	type RailActivationStatus,
} from "./types.js";

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalize).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function railContentHash(
	body: Omit<Rail, "contentHash" | "activationStatus" | "publishedAt">,
): `sha256:${string}` {
	const digest = createHash("sha256").update(canonicalize(body)).digest("hex");
	return `sha256:${digest}`;
}

export function createRail(input: {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly stationId: string;
	readonly isBootstrap?: boolean;
	readonly policyPacks?: readonly string[];
	readonly policyEngine?: Rail["policyEngine"];
	readonly placementDefaults?: Rail["placementDefaults"];
	readonly billingPolicy?: Rail["billingPolicy"];
	readonly deliveryPolicy?: Rail["deliveryPolicy"];
	readonly requiredConnectorKinds?: readonly string[];
	readonly catalogSnapshotPin?: string;
	readonly approvedProviders?: readonly string[];
	readonly obligationDefaults?: readonly string[];
	readonly guardrailEnvelope?: Readonly<Record<string, string>>;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly activationStatus?: RailActivationStatus;
	readonly now?: string;
}): Rail {
	if (!input.id || !input.name || !input.version || !input.stationId) {
		throw new TypeError("rail requires id, name, version, stationId");
	}
	const body = {
		schemaVersion: RAIL_SCHEMA_VERSION,
		id: input.id,
		name: input.name,
		version: input.version,
		stationId: input.stationId,
		isBootstrap: input.isBootstrap === true,
		policyPacks: Object.freeze([...(input.policyPacks ?? [])]),
		policyEngine: Object.freeze(input.policyEngine ?? { kind: "ts" as const }),
		placementDefaults: Object.freeze(
			input.placementDefaults ?? {
				objective: "min-cost" as const,
				allowedProviders: Object.freeze(["local"]),
				deniedProviders: Object.freeze([] as string[]),
				allowedRegions: Object.freeze(["local"]),
			},
		),
		billingPolicy: Object.freeze(
			input.billingPolicy ?? {
				quota: "deployments/day",
				quotaUsed: 0,
				quotaLimit: 10_000,
				budgetUsd: 0,
				spendCapUsd: 0,
			},
		),
		deliveryPolicy: Object.freeze(
			input.deliveryPolicy ?? {
				engine: "in-proc" as const,
				syncMode: "auto" as const,
				prune: false,
			},
		),
		requiredConnectorKinds: Object.freeze([
			...(input.requiredConnectorKinds ?? []),
		]),
		approvedProviders: Object.freeze([
			...(input.approvedProviders ?? ["local"]),
		]),
		obligationDefaults: Object.freeze([...(input.obligationDefaults ?? [])]),
		guardrailEnvelope: Object.freeze({ ...(input.guardrailEnvelope ?? {}) }),
		metadata: Object.freeze({ ...(input.metadata ?? {}) }),
		...(input.catalogSnapshotPin !== undefined
			? { catalogSnapshotPin: input.catalogSnapshotPin }
			: {}),
	};
	const contentHash = railContentHash(body);
	return Object.freeze({
		...body,
		contentHash,
		activationStatus: input.activationStatus ?? "draft",
		publishedAt: input.now ?? new Date().toISOString(),
	});
}

/**
 * Sealed bootstrap Rail: local catalog only, hard least-privilege.
 * Production posture should detect if left active (doctor + policy).
 */
export function createBootstrapRail(stationId: string, now?: string): Rail {
	return createRail({
		id: "rail-bootstrap",
		name: "bootstrap",
		version: "0.1.0",
		stationId,
		isBootstrap: true,
		activationStatus: "active",
		policyPacks: Object.freeze([
			"hobo.bootstrap.least-privilege/v1",
			// Soft floor always available; Station may also pin env isolation pack.
			"hobo.env-network-isolation/v1",
		]),
		policyEngine: { kind: "ts" },
		placementDefaults: {
			objective: "pinned",
			allowedProviders: Object.freeze(["local"]),
			deniedProviders: Object.freeze([] as string[]),
			allowedRegions: Object.freeze(["local"]),
		},
		approvedProviders: Object.freeze(["local"]),
		requiredConnectorKinds: Object.freeze([] as string[]),
		catalogSnapshotPin: "local-host",
		metadata: Object.freeze({
			role: "bootstrap",
			description: "Sealed least-privilege local bootstrap Rail",
		}),
		...(now !== undefined ? { now } : {}),
	});
}

/** Import former hobo.broker.json policy document as a Rail body under a Station. */
export function railFromBrokerConfig(
	stationId: string,
	brokerConfig: Readonly<Record<string, unknown>>,
	options?: {
		readonly id?: string;
		readonly name?: string;
		readonly now?: string;
	},
): Rail {
	const brokerId =
		typeof brokerConfig.brokerId === "string"
			? brokerConfig.brokerId
			: "imported";
	const billing = (brokerConfig.billing ?? {}) as Record<string, unknown>;
	const delivery = (brokerConfig.delivery ?? {}) as Record<string, unknown>;
	return createRail({
		id: options?.id ?? `rail-from-broker-${brokerId}`,
		name: options?.name ?? `imported-${brokerId}`,
		version: "1.0.0",
		stationId,
		policyPacks: Object.freeze([`imported-broker:${brokerId}`]),
		policyEngine: { kind: "ts" },
		placementDefaults: {
			objective: "min-cost",
			allowedProviders: Object.freeze(["local"]),
			deniedProviders: Object.freeze([] as string[]),
			allowedRegions: Object.freeze(["local"]),
		},
		billingPolicy: {
			quota:
				typeof billing.quota === "string" ? billing.quota : "deployments/day",
			quotaUsed: typeof billing.quotaUsed === "number" ? billing.quotaUsed : 0,
			quotaLimit:
				typeof billing.quotaLimit === "number" ? billing.quotaLimit : 10_000,
			budgetUsd: typeof billing.budgetUsd === "number" ? billing.budgetUsd : 0,
			spendCapUsd:
				typeof billing.spendCapUsd === "number" ? billing.spendCapUsd : 0,
		},
		deliveryPolicy: {
			engine: delivery.engine === "argo" ? "argo" : "in-proc",
			syncMode: delivery.syncMode === "manual" ? "manual" : "auto",
			prune: delivery.prune === true,
		},
		metadata: Object.freeze({ importedFrom: "hobo.broker.json" }),
		activationStatus: "approved",
		...(options?.now !== undefined ? { now: options.now } : {}),
	});
}
