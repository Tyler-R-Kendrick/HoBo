/**
 * Local Station store + client used by Broker (Conductor) and CLI.
 * Durable state lives under HOBO_HOME/stations/<id>/; Conductor holds no long-lived secrets.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	readdirSync,
} from "node:fs";
import { join } from "node:path";

import { railFromBrokerConfig } from "./rail.js";
import {
	StationService,
	foldStationEvents,
	type StationState,
} from "./station-service.js";
import type { StationEvent } from "./events.js";
import type { Rail, StationIsolation, StationOccupancy } from "./types.js";

export type StationClient = Readonly<{
	stationId: string;
	dataDir: string;
	load: () => StationState | null;
	occupancy: () => StationOccupancy | null;
	activeRail: () => Rail | null;
	/** Pins for receipts. */
	pins: () => {
		stationId: string;
		railHash?: `sha256:${string}`;
		bootstrapActive: boolean;
	};
}>;

export function stationRoot(hoboHome: string, stationId: string): string {
	const safe = stationId.replace(/[^a-zA-Z0-9._:-]/g, "_");
	return join(hoboHome, "stations", safe);
}

export function stationEventsPath(hoboHome: string, stationId: string): string {
	return join(stationRoot(hoboHome, stationId), "events.jsonl");
}

export function loadStationEvents(
	hoboHome: string,
	stationId: string,
): StationEvent[] {
	const path = stationEventsPath(hoboHome, stationId);
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as StationEvent);
}

export function persistStationEvents(
	hoboHome: string,
	stationId: string,
	events: readonly StationEvent[],
): void {
	const root = stationRoot(hoboHome, stationId);
	mkdirSync(root, { recursive: true });
	writeFileSync(
		stationEventsPath(hoboHome, stationId),
		`${events.map((e) => JSON.stringify(e)).join("\n")}\n`,
		"utf8",
	);
}

export function createStationClient(input: {
	readonly hoboHome: string;
	readonly stationId: string;
}): StationClient {
	const { hoboHome, stationId } = input;
	return {
		stationId,
		dataDir: stationRoot(hoboHome, stationId),
		load() {
			const events = loadStationEvents(hoboHome, stationId);
			return foldStationEvents(events);
		},
		occupancy() {
			return this.load()?.occupancy ?? null;
		},
		activeRail() {
			const state = this.load();
			const hash = state?.occupancy.activeRailHash;
			if (!hash || !state) return null;
			return state.rails[hash] ?? null;
		},
		pins() {
			const occ = this.occupancy();
			return {
				stationId,
				...(occ?.activeRailHash !== undefined
					? { railHash: occ.activeRailHash }
					: {}),
				bootstrapActive: occ?.bootstrapActive === true,
			};
		},
	};
}

export type InitStationResult = Readonly<{
	stationId: string;
	dataDir: string;
	occupancy: StationOccupancy;
	bootstrap: Rail;
	created: boolean;
	importedBrokerConfig: boolean;
}>;

/**
 * Create Station under HOBO_HOME. Fail-closed re-init returns existing (idempotent).
 * Soft auto-init is NOT done here — CLI must call this explicitly (or log loudly).
 */
export function initStation(input: {
	readonly hoboHome: string;
	readonly id?: string;
	readonly name?: string;
	readonly tenant?: string;
	readonly residency?: string;
	readonly airgap?: boolean;
	readonly trustDomain?: string;
	/** Import existing hobo.broker.json as an approved Rail when present. */
	readonly importBrokerConfigPath?: string;
}): InitStationResult {
	const name = input.name ?? "local";
	const stationId = input.id ?? `station:${name}`;
	const existing = loadStationEvents(input.hoboHome, stationId);
	if (existing.length > 0) {
		const state = foldStationEvents(existing);
		if (!state) {
			throw new Error("corrupt station event log");
		}
		const bootstrap =
			state.rails[state.occupancy.bootstrapRailHash ?? ""] ??
			Object.values(state.rails)[0];
		if (!bootstrap) {
			throw new Error("station missing bootstrap rail");
		}
		return {
			stationId,
			dataDir: stationRoot(input.hoboHome, stationId),
			occupancy: state.occupancy,
			bootstrap,
			created: false,
			importedBrokerConfig: false,
		};
	}

	const isolation: StationIsolation = Object.freeze({
		tenant: input.tenant ?? name,
		residency: input.residency ?? "local",
		airgap: input.airgap === true,
		trustDomain: input.trustDomain ?? `${name}.hobo.local`,
	});
	const dataDir = stationRoot(input.hoboHome, stationId);
	const svc = new StationService({ stationId });
	const { occupancy, bootstrap } = svc.create({
		name,
		isolation,
		dataDir,
	});

	let importedBrokerConfig = false;
	if (
		input.importBrokerConfigPath &&
		existsSync(input.importBrokerConfigPath)
	) {
		const raw = JSON.parse(
			readFileSync(input.importBrokerConfigPath, "utf8"),
		) as Record<string, unknown>;
		const imported = railFromBrokerConfig(stationId, raw);
		const published = svc.publishRail({
			id: imported.id,
			name: imported.name,
			version: imported.version,
			stationId,
			policyPacks: imported.policyPacks,
			policyEngine: imported.policyEngine,
			placementDefaults: imported.placementDefaults,
			billingPolicy: imported.billingPolicy,
			deliveryPolicy: imported.deliveryPolicy,
			metadata: imported.metadata,
			activationStatus: "approved",
		});
		// Leave bootstrap active until operator activates imported rail.
		void published;
		importedBrokerConfig = true;
	}

	persistStationEvents(input.hoboHome, stationId, svc.events);
	return {
		stationId,
		dataDir,
		occupancy: svc.snapshot()!.occupancy,
		bootstrap,
		created: true,
		importedBrokerConfig,
	};
}

/** List station ids under HOBO_HOME/stations. */
export function listStationIds(hoboHome: string): readonly string[] {
	const root = join(hoboHome, "stations");
	if (!existsSync(root)) return [];
	return Object.freeze(
		readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)
			.sort(),
	);
}

/**
 * Resolve Station context: flags → env → profile → fail with remediation.
 * Soft auto-init is opt-in via allowSoftAutoInit (local-dev only).
 */
export function resolveStationContext(input: {
	readonly hoboHome: string;
	readonly stationFlag?: string;
	readonly stationEnv?: string;
	readonly profileStationId?: string;
	readonly allowSoftAutoInit?: boolean;
	readonly log?: (line: string) => void;
}): {
	stationId: string;
	client: StationClient;
	softAutoInit: boolean;
} {
	const candidates = [
		input.stationFlag,
		input.stationEnv,
		input.profileStationId,
	].filter((v): v is string => typeof v === "string" && v.length > 0);

	for (const id of candidates) {
		const events = loadStationEvents(input.hoboHome, id);
		if (events.length > 0) {
			return {
				stationId: id,
				client: createStationClient({ hoboHome: input.hoboHome, stationId: id }),
				softAutoInit: false,
			};
		}
	}

	// Implicit local station under HOBO_HOME if exactly one exists.
	const ids = listStationIds(input.hoboHome);
	if (ids.length === 1) {
		const stationId = ids[0]!;
		// directory name may be escaped; load via listing events path
		const dir = join(input.hoboHome, "stations", stationId);
		const eventsPath = join(dir, "events.jsonl");
		if (existsSync(eventsPath)) {
			const events = JSON.parse(
				`[${readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).join(",")}]`,
			) as StationEvent[];
			const realId = events[0]?.stationId ?? stationId;
			return {
				stationId: realId,
				client: createStationClient({
					hoboHome: input.hoboHome,
					stationId: realId,
				}),
				softAutoInit: false,
			};
		}
	}

	if (input.allowSoftAutoInit) {
		input.log?.(
			"hobo station: soft auto-init (local-dev) — creating default Station; doctor will flag bootstrap Rail",
		);
		const result = initStation({ hoboHome: input.hoboHome, name: "local" });
		return {
			stationId: result.stationId,
			client: createStationClient({
				hoboHome: input.hoboHome,
				stationId: result.stationId,
			}),
			softAutoInit: true,
		};
	}

	throw Object.assign(
		new Error(
			"no Station context: run `hobo station init` (or pass --station / HOBO_STATION / profile.defaultStation)",
		),
		{ code: "station-missing", remediation: "hobo station init" },
	);
}

/**
 * Cross-Station Connection use fails closed without explicit federation grant.
 */
export function assertConnectionStationAccess(input: {
	readonly connectionStationId: string;
	readonly requestStationId: string;
	readonly federationGrant?: boolean;
}): void {
	if (input.connectionStationId === input.requestStationId) return;
	if (input.federationGrant === true) return;
	throw Object.assign(
		new Error(
			`cross-Station Connection use denied (${input.connectionStationId} → ${input.requestStationId}); federation grant required`,
		),
		{ code: "connection-cross-station-denied" },
	);
}
