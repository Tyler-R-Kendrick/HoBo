import type { BudgetPolicy } from "./policy-planner.js";

export const STATION_REGISTRY_KEY = "hobo-examples-stations";

export interface DeployedStation {
	readonly id: string;
	readonly targetId: string;
	readonly yardId: string;
	readonly providerId: string;
	readonly policy: BudgetPolicy;
	readonly label: string;
	readonly createdAt: string;
	/** Remote anonymous station endpoint (operator bootstrap). Absent for local. */
	readonly endpointUrl?: string;
	/** Cloudflare Temporary Accounts claim URL (~60m). */
	readonly claimUrl?: string;
	/** ISO expiry for temporary stations. */
	readonly expiresAt?: string;
}

export interface StationRegistry {
	readonly homeStationId: string;
	readonly stations: readonly DeployedStation[];
}

export function emptyStationRegistry(homeStationId: string): StationRegistry {
	return { homeStationId, stations: [] };
}

export function loadStationRegistry(
	storage: Pick<Storage, "getItem"> | null | undefined,
	homeStationId: string,
): StationRegistry {
	if (!storage) return emptyStationRegistry(homeStationId);
	const raw = storage.getItem(STATION_REGISTRY_KEY);
	if (!raw) return emptyStationRegistry(homeStationId);
	try {
		return parseStationRegistry(JSON.parse(raw) as unknown, homeStationId);
	} catch {
		return emptyStationRegistry(homeStationId);
	}
}

export function saveStationRegistry(
	storage: Pick<Storage, "setItem"> | null | undefined,
	registry: StationRegistry,
): void {
	if (!storage) return;
	storage.setItem(STATION_REGISTRY_KEY, JSON.stringify(registry));
}

export function parseStationRegistry(
	value: unknown,
	fallbackHomeStationId: string,
): StationRegistry {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return emptyStationRegistry(fallbackHomeStationId);
	}
	const input = value as Record<string, unknown>;
	const homeStationId =
		typeof input.homeStationId === "string" && input.homeStationId.length > 0
			? input.homeStationId
			: fallbackHomeStationId;
	if (!Array.isArray(input.stations)) {
		return emptyStationRegistry(homeStationId);
	}
	const stations: DeployedStation[] = [];
	for (const entry of input.stations) {
		const station = parseStation(entry);
		if (station) stations.push(station);
	}
	return { homeStationId, stations };
}

function parseStation(value: unknown): DeployedStation | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	const policy = parsePolicy(input.policy);
	if (!policy) return null;
	if (
		typeof input.id !== "string" ||
		typeof input.targetId !== "string" ||
		typeof input.yardId !== "string" ||
		typeof input.providerId !== "string" ||
		typeof input.label !== "string" ||
		typeof input.createdAt !== "string"
	) {
		return null;
	}
	return {
		id: input.id,
		targetId: input.targetId,
		yardId: input.yardId,
		providerId: input.providerId,
		policy,
		label: input.label,
		createdAt: input.createdAt,
		...(typeof input.endpointUrl === "string" && input.endpointUrl.length > 0
			? { endpointUrl: input.endpointUrl }
			: {}),
		...(typeof input.claimUrl === "string" && input.claimUrl.length > 0
			? { claimUrl: input.claimUrl }
			: {}),
		...(typeof input.expiresAt === "string" && input.expiresAt.length > 0
			? { expiresAt: input.expiresAt }
			: {}),
	};
}

function parsePolicy(value: unknown): BudgetPolicy | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	if (
		typeof input.preferLocal !== "boolean" ||
		typeof input.routing !== "string" ||
		typeof input.redundancy !== "string" ||
		typeof input.maxReplicas !== "number" ||
		typeof input.maxConcurrent !== "number" ||
		typeof input.monthlySpendCapUsd !== "number" ||
		!Array.isArray(input.resourcePool)
	) {
		return null;
	}
	return {
		preferLocal: input.preferLocal,
		routing: input.routing as BudgetPolicy["routing"],
		redundancy: input.redundancy as BudgetPolicy["redundancy"],
		maxReplicas: input.maxReplicas,
		maxConcurrent: input.maxConcurrent,
		monthlySpendCapUsd: input.monthlySpendCapUsd,
		resourcePool: input.resourcePool as BudgetPolicy["resourcePool"],
	};
}
