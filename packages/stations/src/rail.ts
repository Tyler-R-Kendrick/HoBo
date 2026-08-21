/**
 * Rails: Station-owned, content-addressed policy profiles (ADR Station occupancy).
 */

import { createHash } from "node:crypto";
import {
	cloneAsJson,
	isJsonNumber,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
} from "./json.js";

import {
	RAIL_SCHEMA_VERSION,
	type Rail,
	type RailActivationStatus,
} from "./types.js";

function canonicalize<T>(value: T): string {
	return canonicalizeJson(cloneAsJson(value));
}

function canonicalizeJson(value: JsonValue): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalizeJson).join(",")}]`;
	}
	if (value === null || !isJsonObject(value)) {
		return JSON.stringify(value);
	}
	const keys = Object.keys(value).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(value[k] ?? null)}`).join(",")}}`;
}

function stringList(value: JsonValue | undefined): string[] | undefined {
	if (value === undefined || !Array.isArray(value)) return undefined;
	const out: string[] = [];
	for (const item of value) {
		if (isJsonString(item)) out.push(item);
	}
	return out;
}

function stringBag(
	value: JsonValue | undefined,
): Record<string, string> | undefined {
	if (!isJsonObject(value)) return undefined;
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (isJsonString(item)) out[key] = item;
	}
	return out;
}

export function parseRail<T>(value: T): Rail {
	const json = cloneAsJson(value);
	if (!isJsonObject(json)) {
		throw new TypeError("rail must be an object");
	}
	const status = json.activationStatus;
	const policyPacks = stringList(json.policyPacks);
	const requiredConnectorKinds = stringList(json.requiredConnectorKinds);
	const approvedProviders = stringList(json.approvedProviders);
	const obligationDefaults = stringList(json.obligationDefaults);
	const guardrailEnvelope = stringBag(json.guardrailEnvelope);
	const metadata = stringBag(json.metadata);
	const catalogSnapshotPin = isJsonString(json.catalogSnapshotPin)
		? json.catalogSnapshotPin
		: undefined;
	const activationStatus =
		status === "draft" ||
		status === "approved" ||
		status === "active" ||
		status === "retired"
			? status
			: undefined;
	const now = isJsonString(json.publishedAt) ? json.publishedAt : undefined;
	const rail = createRail({
		id: isJsonString(json.id) ? json.id : "",
		name: isJsonString(json.name) ? json.name : "",
		version: isJsonString(json.version) ? json.version : "",
		stationId: isJsonString(json.stationId) ? json.stationId : "",
		isBootstrap: json.isBootstrap === true,
		...(policyPacks !== undefined ? { policyPacks } : undefined),
		...(requiredConnectorKinds !== undefined
			? { requiredConnectorKinds }
			: undefined),
		...(approvedProviders !== undefined ? { approvedProviders } : undefined),
		...(obligationDefaults !== undefined ? { obligationDefaults } : undefined),
		...(guardrailEnvelope !== undefined ? { guardrailEnvelope } : undefined),
		...(metadata !== undefined ? { metadata } : undefined),
		...(catalogSnapshotPin !== undefined ? { catalogSnapshotPin } : undefined),
		...(activationStatus !== undefined ? { activationStatus } : undefined),
		...(now !== undefined ? { now } : undefined),
	});
	const hash = json.contentHash;
	if (isJsonString(hash) && hash.startsWith("sha256:")) {
		// SAFETY: persisted rails carry a content-addressed sha256 hash.
		const contentHash = hash as `sha256:${string}`;
		return Object.freeze({ ...rail, contentHash });
	}
	return rail;
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
				// SAFETY: assertion required at this I/O or test boundary.
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
		guardrailEnvelope: Object.freeze({ ...input.guardrailEnvelope }),
		metadata: Object.freeze({ ...input.metadata }),
		...(input.catalogSnapshotPin !== undefined
			? { catalogSnapshotPin: input.catalogSnapshotPin }
			: undefined),
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
			// SAFETY: assertion required at this I/O or test boundary.
			deniedProviders: Object.freeze([] as string[]),
			allowedRegions: Object.freeze(["local"]),
		},
		approvedProviders: Object.freeze(["local"]),
		// SAFETY: assertion required at this I/O or test boundary.
		requiredConnectorKinds: Object.freeze([] as string[]),
		catalogSnapshotPin: "local-host",
		metadata: Object.freeze({
			role: "bootstrap",
			description: "Sealed least-privilege local bootstrap Rail",
		}),
		...(now !== undefined ? { now } : undefined),
	});
}

/** Import former hobo.broker.json policy document as a Rail body under a Station. */
export function railFromBrokerConfig(
	stationId: string,
	brokerConfig: JsonObject,
	options?: {
		readonly id?: string;
		readonly name?: string;
		readonly now?: string;
	},
): Rail {
	const brokerId = isJsonString(brokerConfig.brokerId)
		? brokerConfig.brokerId
		: "imported";
	// SAFETY: assertion required at this I/O or test boundary.
	const billing = (brokerConfig.billing ?? {}) as JsonObject;
	// SAFETY: assertion required at this I/O or test boundary.
	const delivery = (brokerConfig.delivery ?? {}) as JsonObject;
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
			// SAFETY: assertion required at this I/O or test boundary.
			deniedProviders: Object.freeze([] as string[]),
			allowedRegions: Object.freeze(["local"]),
		},
		billingPolicy: {
			quota: isJsonString(billing.quota) ? billing.quota : "deployments/day",
			quotaUsed: isJsonNumber(billing.quotaUsed) ? billing.quotaUsed : 0,
			quotaLimit: isJsonNumber(billing.quotaLimit)
				? billing.quotaLimit
				: 10_000,
			budgetUsd: isJsonNumber(billing.budgetUsd) ? billing.budgetUsd : 0,
			spendCapUsd: isJsonNumber(billing.spendCapUsd) ? billing.spendCapUsd : 0,
		},
		deliveryPolicy: {
			engine: delivery.engine === "argo" ? "argo" : "in-proc",
			syncMode: delivery.syncMode === "manual" ? "manual" : "auto",
			prune: delivery.prune === true,
		},
		metadata: Object.freeze({ importedFrom: "hobo.broker.json" }),
		activationStatus: "approved",
		...(options?.now !== undefined ? { now: options.now } : undefined),
	});
}
