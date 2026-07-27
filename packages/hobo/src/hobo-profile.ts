/**
 * Persisted HOBO_HOME profile: default Station occupancy + broker association + login.
 * Local `hobo up` never requires this file; remote authenticated paths prefer it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PrincipalKind, PrincipalRef } from "@hobo/core";

// public-contract: profile document schema under HOBO_HOME.
export const HOBO_PROFILE_SCHEMA = "hobo.profile/v1" as const;

export interface HoboProfileSession {
	readonly principal: PrincipalRef;
	readonly tenant: string;
	readonly token: string;
	readonly issuedAt: string;
	/** Optional DPoP / sender-constrained proof material id (never the raw key). */
	readonly proofKeyId?: string;
	readonly brokerUri?: string;
}

export interface HoboProfileDefaultStation {
	readonly id: string;
	readonly dataDir?: string;
	readonly discoveryUri?: string;
}

export interface HoboProfile {
	readonly schemaVersion: typeof HOBO_PROFILE_SCHEMA;
	readonly defaultBrokerUri?: string;
	/** Station occupancy context (main setup path). */
	readonly defaultStation?: HoboProfileDefaultStation;
	readonly activeRail?: string;
	readonly session?: HoboProfileSession;
	readonly updatedAt: string;
}

export function profilePath(hoboHome: string): string {
	return join(hoboHome, "profile.json");
}

export function loadHoboProfile(hoboHome: string): HoboProfile | null {
	const path = profilePath(hoboHome);
	if (!existsSync(path)) return null;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return parseHoboProfile(raw);
	} catch {
		return null;
	}
}

export function saveHoboProfile(
	hoboHome: string,
	profile: HoboProfile,
): string {
	mkdirSync(hoboHome, { recursive: true });
	const path = profilePath(hoboHome);
	writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
	return path;
}

export function upsertLoginProfile(input: {
	readonly hoboHome: string;
	readonly principal: PrincipalRef;
	readonly tenant: string;
	readonly token: string;
	readonly brokerUri?: string;
	readonly proofKeyId?: string;
	readonly stationId?: string;
}): HoboProfile {
	const existing = loadHoboProfile(input.hoboHome);
	const session: HoboProfileSession = {
		principal: input.principal,
		tenant: input.tenant,
		token: input.token,
		issuedAt: new Date().toISOString(),
		...(input.proofKeyId !== undefined
			? { proofKeyId: input.proofKeyId }
			: {}),
		...(input.brokerUri !== undefined
			? { brokerUri: input.brokerUri }
			: existing?.session?.brokerUri !== undefined
				? { brokerUri: existing.session.brokerUri }
				: {}),
	};
	const profile: HoboProfile = {
		schemaVersion: HOBO_PROFILE_SCHEMA,
		updatedAt: new Date().toISOString(),
		session,
		...(input.brokerUri !== undefined
			? { defaultBrokerUri: input.brokerUri }
			: existing?.defaultBrokerUri !== undefined
				? { defaultBrokerUri: existing.defaultBrokerUri }
				: session.brokerUri !== undefined
					? { defaultBrokerUri: session.brokerUri }
					: {}),
		...(input.stationId !== undefined
			? { defaultStation: { id: input.stationId } }
			: existing?.defaultStation !== undefined
				? { defaultStation: existing.defaultStation }
				: {}),
		...(existing?.activeRail !== undefined
			? { activeRail: existing.activeRail }
			: {}),
	};
	saveHoboProfile(input.hoboHome, profile);
	return profile;
}

export function setDefaultStation(
	hoboHome: string,
	station: HoboProfileDefaultStation,
	activeRail?: string,
): HoboProfile {
	const existing = loadHoboProfile(hoboHome);
	const profile: HoboProfile = {
		schemaVersion: HOBO_PROFILE_SCHEMA,
		updatedAt: new Date().toISOString(),
		defaultStation: station,
		...(activeRail !== undefined
			? { activeRail }
			: existing?.activeRail !== undefined
				? { activeRail: existing.activeRail }
				: {}),
		...(existing?.defaultBrokerUri !== undefined
			? { defaultBrokerUri: existing.defaultBrokerUri }
			: {}),
		...(existing?.session !== undefined ? { session: existing.session } : {}),
	};
	saveHoboProfile(hoboHome, profile);
	return profile;
}

export function parseHoboProfile(raw: unknown): HoboProfile {
	if (raw === null || typeof raw !== "object") {
		throw new TypeError("hobo profile must be an object");
	}
	const obj = raw as Record<string, unknown>;
	if (obj.schemaVersion !== HOBO_PROFILE_SCHEMA) {
		throw new TypeError(
			`hobo profile schemaVersion must be ${HOBO_PROFILE_SCHEMA}`,
		);
	}
	if (typeof obj.updatedAt !== "string" || obj.updatedAt.length === 0) {
		throw new TypeError("hobo profile.updatedAt must be a non-empty string");
	}
	const profile: HoboProfile = {
		schemaVersion: HOBO_PROFILE_SCHEMA,
		updatedAt: obj.updatedAt,
		...(typeof obj.defaultBrokerUri === "string" &&
		obj.defaultBrokerUri.length > 0
			? { defaultBrokerUri: obj.defaultBrokerUri }
			: {}),
		...(typeof obj.activeRail === "string" && obj.activeRail.length > 0
			? { activeRail: obj.activeRail }
			: {}),
	};
	if (obj.defaultStation !== undefined && obj.defaultStation !== null) {
		const ds = obj.defaultStation as Record<string, unknown>;
		if (typeof ds.id !== "string" || ds.id.length === 0) {
			throw new TypeError("hobo profile.defaultStation.id required");
		}
		Object.assign(profile, {
			defaultStation: Object.freeze({
				id: ds.id,
				...(typeof ds.dataDir === "string" ? { dataDir: ds.dataDir } : {}),
				...(typeof ds.discoveryUri === "string"
					? { discoveryUri: ds.discoveryUri }
					: {}),
			}),
		});
	}
	if (obj.session !== undefined && obj.session !== null) {
		const s = obj.session as Record<string, unknown>;
		const principal = parsePrincipal(s.principal);
		if (typeof s.tenant !== "string" || s.tenant.length === 0) {
			throw new TypeError("hobo profile.session.tenant required");
		}
		if (typeof s.token !== "string" || s.token.length === 0) {
			throw new TypeError("hobo profile.session.token required");
		}
		if (typeof s.issuedAt !== "string" || s.issuedAt.length === 0) {
			throw new TypeError("hobo profile.session.issuedAt required");
		}
		return {
			...profile,
			session: {
				principal,
				tenant: s.tenant,
				token: s.token,
				issuedAt: s.issuedAt,
				...(typeof s.proofKeyId === "string"
					? { proofKeyId: s.proofKeyId }
					: {}),
				...(typeof s.brokerUri === "string" ? { brokerUri: s.brokerUri } : {}),
			},
		};
	}
	return profile;
}

function parsePrincipal(raw: unknown): PrincipalRef {
	if (raw === null || typeof raw !== "object") {
		throw new TypeError("principal must be an object");
	}
	const obj = raw as Record<string, unknown>;
	const kinds: PrincipalKind[] = ["user", "agent", "service", "system"];
	if (
		typeof obj.kind !== "string" ||
		!(kinds as string[]).includes(obj.kind)
	) {
		throw new TypeError("principal.kind invalid");
	}
	if (typeof obj.id !== "string" || obj.id.length === 0) {
		throw new TypeError("principal.id required");
	}
	return {
		kind: obj.kind as PrincipalKind,
		id: obj.id,
		...(obj.delegatedBy !== undefined
			? { delegatedBy: parsePrincipal(obj.delegatedBy) }
			: {}),
	};
}
