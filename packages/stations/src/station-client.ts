/**
 * Local Station store + client used by Broker (Conductor) and CLI.
 * Durable state lives under HOBO_HOME/stations/<id>/; Conductor holds no long-lived secrets.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { first, must } from "@hobo/core/total-access";
import type { StationEvent } from "./events.js";
import { railFromBrokerConfig } from "./rail.js";
import {
	foldStationEvents,
	StationService,
	type StationState,
} from "./station-service.js";
import type { Rail, StationIsolation, StationOccupancy } from "./types.js";

export type StationPins = Readonly<{
	stationId: string;
	railHash: `sha256:${string}`;
	bootstrapActive: boolean;
}>;

export type StationClient = Readonly<{
	stationId: string;
	dataDir: string;
	load: () => StationState;
	occupancy: () => StationOccupancy;
	activeRail: () => Rail;
	/** Pins for receipts — always complete (stationId + active railHash). */
	pins: () => StationPins;
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

function requireState(hoboHome: string, stationId: string): StationState {
	const events = loadStationEvents(hoboHome, stationId);
	const state = foldStationEvents(events);
	if (!state) {
		throw Object.assign(
			new Error(`station ${stationId} not found — run hobo station init`),
			{ code: "station-missing", remediation: "hobo station init" },
		);
	}
	return state;
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
			return requireState(hoboHome, stationId);
		},
		occupancy() {
			return this.load().occupancy;
		},
		activeRail() {
			const state = this.load();
			const hash = state.occupancy.activeRailHash;
			if (!hash) {
				throw Object.assign(
					new Error(
						`station ${stationId} has no active Rail — activate a Rail`,
					),
					{
						code: "rail-inactive",
						remediation: "hobo station rails activate <hash>",
					},
				);
			}
			const rail = state.rails[hash];
			if (!rail) {
				throw Object.assign(
					new Error(`active Rail ${hash} missing from Station catalog`),
					{ code: "rail-not-found" },
				);
			}
			return rail;
		},
		pins() {
			const rail = this.activeRail();
			return Object.freeze({
				stationId,
				railHash: rail.contentHash,
				bootstrapActive: rail.isBootstrap,
			});
		},
	};
}

export type InitStationResult = Readonly<{
	stationId: string;
	dataDir: string;
	occupancy: StationOccupancy;
	bootstrap: Rail;
	created: boolean;
	/** Non-bootstrap Rail activated from an imported policy document, if any. */
	activatedRailHash?: `sha256:${string}`;
}>;

/**
 * Create Station under HOBO_HOME. Idempotent: re-init returns existing Station.
 * No silent auto-create elsewhere — callers must invoke init explicitly.
 */
export function initStation(input: {
	readonly hoboHome: string;
	readonly id?: string;
	readonly name?: string;
	readonly tenant?: string;
	readonly residency?: string;
	readonly airgap?: boolean;
	readonly trustDomain?: string;
	/**
	 * Optional policy document (e.g. project hobo.broker.json) published and
	 * activated as the Station's non-bootstrap Rail at init time.
	 */
	readonly importRailDocPath?: string;
}): InitStationResult {
	const name = input.name ?? "local";
	const stationId = input.id ?? `station:${name}`;
	const existing = loadStationEvents(input.hoboHome, stationId);
	if (existing.length > 0) {
		const state = foldStationEvents(existing);
		if (!state) {
			throw new Error("corrupt station event log");
		}
		const bootstrapHash = state.occupancy.bootstrapRailHash;
		const bootstrap =
			(bootstrapHash ? state.rails[bootstrapHash] : undefined) ??
			Object.values(state.rails).find((r) => r.isBootstrap);
		if (!bootstrap) {
			throw new Error("station missing bootstrap rail");
		}
		return {
			stationId,
			dataDir: stationRoot(input.hoboHome, stationId),
			occupancy: state.occupancy,
			bootstrap,
			created: false,
			...(state.occupancy.activeRailHash !== undefined &&
			state.occupancy.activeRailHash !== bootstrap.contentHash
				? { activatedRailHash: state.occupancy.activeRailHash }
				: {}),
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
	const { bootstrap } = svc.create({
		name,
		isolation,
		dataDir,
	});

	let activatedRailHash: `sha256:${string}` | undefined;
	const railDocPath = input.importRailDocPath;
	if (railDocPath && existsSync(railDocPath)) {
		const raw = JSON.parse(readFileSync(railDocPath, "utf8")) as Record<
			string,
			unknown
		>;
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
		svc.approveRail(published.contentHash);
		svc.activateRail(published.contentHash);
		activatedRailHash = published.contentHash;
	}

	persistStationEvents(input.hoboHome, stationId, svc.events);
	const snap = must(svc.snapshot());
	return {
		stationId,
		dataDir,
		occupancy: snap.occupancy,
		bootstrap,
		created: true,
		...(activatedRailHash !== undefined ? { activatedRailHash } : {}),
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
 * Resolve Station context: flags → env → profile → single local Station → fail.
 * Never auto-creates durable Station state.
 */
export function resolveStationContext(input: {
	readonly hoboHome: string;
	readonly stationFlag?: string;
	readonly stationEnv?: string;
	readonly profileStationId?: string;
}): {
	stationId: string;
	client: StationClient;
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
				client: createStationClient({
					hoboHome: input.hoboHome,
					stationId: id,
				}),
			};
		}
	}

	const ids = listStationIds(input.hoboHome);
	if (ids.length === 1) {
		const dirName = first(ids);
		const eventsPath = join(
			input.hoboHome,
			"stations",
			dirName,
			"events.jsonl",
		);
		if (existsSync(eventsPath)) {
			const events = loadStationEvents(
				input.hoboHome,
				// Prefer id from first event when directory is escaped.
				(
					JSON.parse(
						first(
							readFileSync(eventsPath, "utf8").split("\n").filter(Boolean),
							"readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean)",
						),
					) as StationEvent
				).stationId ?? dirName,
			);
			if (events.length > 0) {
				const realId = first(events).stationId;
				return {
					stationId: realId,
					client: createStationClient({
						hoboHome: input.hoboHome,
						stationId: realId,
					}),
				};
			}
		}
	}

	throw Object.assign(
		new Error(
			"no Station context: run `hobo station init` (or pass --station / HOBO_STATION / profile.defaultStation)",
		),
		{ code: "station-missing", remediation: "hobo station init" },
	);
}

/**
 * Cross-Station Connection use fails closed without an explicit federation grant.
 */
export function assertConnectionStationAccess(input: {
	readonly connectionStationId: string;
	readonly requestStationId: string;
	readonly federationGrant: boolean;
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
