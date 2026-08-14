/**
 * Session-scoped resource inventory for hobo-code.
 *
 * Occupancy (logged-in Station × env) is the scope. Topology stays
 * Bindle ⊂ Camp ⊂ Yard ⊂ Junction; Station is the header, never a parent.
 * Addresses come from recorded facts, then confirmation — never invention.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isHoboHierarchicalName } from "@hobo/core";

import {
	type InspectedBindle,
	inspectBindleProject,
	type LocalBindleCapability,
	localBindleCapabilities,
} from "./bindle-inspect.js";
import { type CampEvalSidecar, EVAL_SIDECAR_NAME } from "./eval-sidecar.js";
import { assembleCampEvalSidecar } from "./eval-sidecar-server.js";
import {
	OCCUPANCY_NAMED_APP,
	occupancyNamedOrigin,
	isStationOccupancyEndpoint,
	occupancySidecarEndpoints,
	preferNamedEndpoint,
	retargetUrl,
} from "./occupancy-endpoints.js";
import {
	type AuthedStationView,
	describeAuthedStationSession,
} from "./station-session.js";

// public-contract: last-seen snapshot schema for the session resource board
export const SESSION_RESOURCES_SCHEMA =
	"hobo.code.session-resources/v1" as const;

/** Occupancy camp for the hobo-code bindle (dashboard / Evidence / OTLP). */
export const CODE_CAMP_ID = `camp:${OCCUPANCY_NAMED_APP}` as const;
/** Occupancy bindle living in the local yard's code camp. */
export const CODE_BINDLE_ID = `bindle:${OCCUPANCY_NAMED_APP}` as const;

export function userCampId(bindleName: string): string {
	return bindleName === OCCUPANCY_NAMED_APP
		? CODE_CAMP_ID
		: `camp:${bindleName}`;
}

export type ResourceKind = "station" | "junction" | "yard" | "camp" | "bindle";

export type PrimitiveKind = "station" | "yard" | "camp";

export type ManagedResourceKind =
	| "sidecar"
	| "rail"
	| "flow"
	| "named-endpoint"
	| "bindle"
	| "bindle-resource";

export interface OccupancyManagedResource {
	readonly id: string;
	readonly name: string;
	readonly kind: ManagedResourceKind;
	readonly ownerKind: PrimitiveKind;
	readonly ownerId: string;
	readonly controllable: boolean;
}

export type ResourceStatus =
	| "declared"
	| "serving"
	| "last-seen"
	| "unresolved";

export type ResourceFidelity =
	| "real"
	| "simulated"
	| "mocked"
	| "camp-only"
	| "unresolved";

export type ScopeLabel = "local" | "hybrid" | "camp-deferred";

export type EndpointMode = "local" | "overlay";

export interface SessionScope {
	readonly stationId: string;
	readonly tenant: string;
	readonly environment: string;
	readonly project?: string;
	readonly branch?: string;
	readonly railHash?: string;
	readonly occupancyStatus?: string;
}

export interface TopologyNode {
	readonly kind: ResourceKind;
	readonly id: string;
	readonly name: string;
	readonly environment: string;
	readonly status: ResourceStatus;
	readonly fidelity: ResourceFidelity;
	readonly scopeLabel: ScopeLabel;
	readonly parentId?: string;
}

export interface EndpointRecord {
	readonly resourceName: string;
	readonly kind: string;
	readonly backendUrl: string;
	readonly namedUrl?: string;
	readonly hostname?: string;
	readonly mode: EndpointMode;
	readonly preferredUrl: string;
	readonly fidelity: ResourceFidelity;
}

export interface EndpointRow extends EndpointRecord {
	readonly status: ResourceStatus;
	readonly freshness: string;
	readonly resolvedAddresses: readonly string[];
	readonly listenPort?: number;
	readonly unresolvedReason?: string;
}

export interface MissingLayer {
	readonly kind: ResourceKind;
	readonly reason: string;
}

export interface OccupancyCampConfig {
	readonly name: string;
	readonly envType: string;
	readonly require: readonly string[];
	readonly labels: Readonly<Record<string, string>>;
	readonly runtimeRequirements: readonly string[];
}

export interface OccupancyBindleManifest {
	readonly name: string;
	readonly resources: readonly {
		readonly kind: string;
		readonly name: string;
		readonly dependsOn: readonly string[];
		readonly allow: readonly string[];
	}[];
	readonly envKeys: readonly string[];
	readonly requirements: readonly string[];
	readonly projectDir?: string;
}

export interface SessionResourceInventory {
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly schema: typeof SESSION_RESOURCES_SCHEMA;
	readonly scope: SessionScope;
	readonly station?: TopologyNode;
	readonly peers: readonly TopologyNode[];
	readonly junctions: readonly TopologyNode[];
	readonly yards: readonly TopologyNode[];
	readonly camps: readonly TopologyNode[];
	readonly bindles: readonly TopologyNode[];
	readonly endpoints: readonly EndpointRow[];
	readonly missing: readonly MissingLayer[];
	readonly capabilities: readonly LocalBindleCapability[];
	readonly managed: readonly OccupancyManagedResource[];
	readonly camp?: OccupancyCampConfig;
	readonly bindleManifest?: OccupancyBindleManifest;
	readonly evals?: CampEvalSidecar;
}

export interface RecordSessionResourcesInput {
	readonly hoboHome: string;
	readonly scope: SessionScope;
	readonly nodes: readonly TopologyNode[];
	readonly endpoints: readonly EndpointRecord[];
	readonly recordedAt?: string;
}

export interface AssembleSessionResourcesOptions {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly ensureLocalLogin?: boolean;
	readonly topology?: readonly TopologyNode[];
	readonly liveEndpoints?: readonly EndpointRecord[];
	readonly grantedStationIds?: readonly string[];
	readonly projectDir?: string;
	readonly lookupHost?: (hostname: string) => readonly string[];
	readonly now?: string;
}

const TOPOLOGY_KINDS: readonly ResourceKind[] = [
	"station",
	"junction",
	"yard",
	"camp",
	"bindle",
];

const REMEDIATION: Record<ResourceKind, string> = {
	station: "no occupied Station — run: hobo-code auth login",
	junction: "no junction in this occupancy — none federated",
	yard: "no yard history — local Station should auto-seed yard:local",
	camp: "no camp history — run hobo-code dev so the Bindle can fulfill a Camp",
	bindle: "no bindle in this occupancy — run hobo-code dev",
};

const USERINFO_SECRET = /:\/\/[^/@\s]+:[^/@\s]+@/u;
const BARE_SECRET_WORD =
	/(^|[^a-z0-9])(password|passwd|secret|apikey|api[_-]?key|credential|hunter2)([^a-z0-9]|$)/iu;

const REMOTE_BACKEND_HINTS = [
	".ts.net",
	"tailscale",
	"netbird",
	"prod.",
	"production.",
	".amazonaws.com",
	".azure.com",
	".googleapis.com",
] as const;

function safeLabel(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function sessionDir(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		safeLabel(stationId),
		safeLabel(environment),
	);
}

function sessionSnapshotPath(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(sessionDir(hoboHome, stationId, environment), "endpoints.json");
}

function emptyScope(view: AuthedStationView): SessionScope {
	return {
		stationId: view.stationId,
		tenant: view.tenant,
		environment: view.environment,
		...(view.project ? { project: view.project } : {}),
		...(view.branch ? { branch: view.branch } : {}),
		...(view.railHash ? { railHash: view.railHash } : {}),
		...(view.occupancyStatus ? { occupancyStatus: view.occupancyStatus } : {}),
	};
}

export function looksLikeSecretMaterial(value: string): boolean {
	if (USERINFO_SECRET.test(value)) return true;
	try {
		const parsed = new URL(value);
		if (parsed.password.length > 0) return true;
		return false;
	} catch {
		return BARE_SECRET_WORD.test(value);
	}
}

function assertNoSecrets(value: string, field: string): void {
	if (looksLikeSecretMaterial(value)) {
		throw new Error(
			`refusing to record ${field}: looks like a secret or credential`,
		);
	}
}

export function assertLocalBackend(
	backendUrl: string,
	environment: string,
	mode: EndpointMode,
): { ok: true } | { ok: false; code: string; reason: string } {
	if (mode !== "local") return { ok: true };
	void environment;
	const url = backendUrl.toLowerCase();
	for (const hint of REMOTE_BACKEND_HINTS) {
		if (url.includes(hint)) {
			return {
				ok: false,
				code: "local-airgap-remote-backend",
				reason: `local mode refused remote-looking backend (${hint})`,
			};
		}
	}
	try {
		const parsed = new URL(backendUrl);
		const host = parsed.hostname.toLowerCase();
		const local =
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "::1" ||
			host === "[::1]" ||
			host === "0.0.0.0" ||
			host.endsWith(".hobo.localhost") ||
			host.endsWith(".localhost");
		if (!local) {
			return {
				ok: false,
				code: "local-airgap-non-loopback",
				reason: `local mode backend host ${parsed.hostname} is not loopback`,
			};
		}
	} catch {
		// non-URL backends are allowed when they carry no host
	}
	return { ok: true };
}

export function listenPortOf(url: string): number | undefined {
	try {
		const parsed = new URL(url);
		if (parsed.port) return Number(parsed.port);
		if (parsed.protocol === "https:") return 443;
		if (parsed.protocol === "http:") return 80;
	} catch {
		return undefined;
	}
	return undefined;
}

function hostnameOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		const host = new URL(url).hostname;
		return host.length > 0 ? host : undefined;
	} catch {
		return undefined;
	}
}

function isLoopbackHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host === "0.0.0.0" ||
		host.endsWith(".localhost")
	);
}

export function defaultLookupHost(hostname: string): readonly string[] {
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":")) {
		return [hostname.replace(/^\[|\]$/g, "")];
	}
	if (isLoopbackHost(hostname)) return ["127.0.0.1"];
	return [];
}

function resolveAddresses(
	hosts: readonly (string | undefined)[],
	lookupHost: (hostname: string) => readonly string[],
): readonly string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const host of hosts) {
		if (!host) continue;
		for (const address of lookupHost(host)) {
			if (seen.has(address)) continue;
			seen.add(address);
			out.push(address);
		}
	}
	return out;
}

interface SnapshotFile {
	readonly schema: typeof SESSION_RESOURCES_SCHEMA;
	readonly recordedAt: string;
	readonly scope: SessionScope;
	readonly nodes: readonly TopologyNode[];
	readonly endpoints: readonly EndpointRecord[];
}

function parseSnapshot(raw: unknown): SnapshotFile | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Partial<SnapshotFile>;
	if (value.schema !== SESSION_RESOURCES_SCHEMA) return null;
	if (typeof value.recordedAt !== "string") return null;
	if (!value.scope || typeof value.scope !== "object") return null;
	if (!Array.isArray(value.nodes) || !Array.isArray(value.endpoints)) {
		return null;
	}
	return value as SnapshotFile;
}

function loadSnapshot(
	hoboHome: string,
	stationId: string,
	environment: string,
): SnapshotFile | null {
	const path = sessionSnapshotPath(hoboHome, stationId, environment);
	if (!existsSync(path)) return null;
	try {
		return parseSnapshot(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return null;
	}
}

/** Camps whose parent is this yard. Occupancy `camp:code` is always in the local yard. */
export function campsInYard(
	hoboHome: string,
	stationId: string,
	environment: string,
	yardId: string,
): readonly string[] {
	const ids = new Set<string>();
	if (yardId === "yard:local") ids.add(CODE_CAMP_ID);
	const snapshot = loadSnapshot(hoboHome, stationId, environment);
	for (const node of snapshot?.nodes ?? []) {
		if (node.kind !== "camp") continue;
		if (node.parentId === yardId || (node.parentId === undefined && yardId === "yard:local")) {
			ids.add(node.id);
		}
	}
	return [...ids];
}

export function recordSessionResources(
	input: RecordSessionResourcesInput,
): void {
	for (const node of input.nodes) {
		assertNoSecrets(node.id, "node.id");
		assertNoSecrets(node.name, "node.name");
	}
	for (const endpoint of input.endpoints) {
		assertNoSecrets(endpoint.backendUrl, "endpoint.backendUrl");
		assertNoSecrets(endpoint.preferredUrl, "endpoint.preferredUrl");
		if (endpoint.namedUrl)
			assertNoSecrets(endpoint.namedUrl, "endpoint.namedUrl");
		if (endpoint.hostname) {
			if (
				!isHoboHierarchicalName(endpoint.hostname) &&
				!isLoopbackHost(endpoint.hostname)
			) {
				assertNoSecrets(endpoint.hostname, "endpoint.hostname");
			}
			if (endpoint.hostname.endsWith(".hobo")) {
				throw new Error("refusing bare .hobo hostname");
			}
		}
	}
	const recordedAt = input.recordedAt ?? new Date().toISOString();
	const snapshot: SnapshotFile = {
		schema: SESSION_RESOURCES_SCHEMA,
		recordedAt,
		scope: input.scope,
		nodes: input.nodes,
		endpoints: input.endpoints,
	};
	const path = sessionSnapshotPath(
		input.hoboHome,
		input.scope.stationId,
		input.scope.environment,
	);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function readJsonFile<T>(path: string): T | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return undefined;
	}
}

function writeJsonFile(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sidecarSnapshotPath(hoboHome: string, stationId: string): string {
	return join(
		hoboHome,
		"stations",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"sidecars.json",
	);
}

function loadSidecarSnapshot(
	hoboHome: string,
	stationId: string,
): {
	readonly dashboardUrl?: string;
	readonly evidenceUrl?: string;
	readonly evidenceReportUrl?: string;
	readonly evidenceControlsUrl?: string;
	readonly otlpHttpUrl?: string;
	readonly evalsUrl?: string;
	readonly rolloutUrl?: string;
	readonly experimentUrl?: string;
	readonly kmsUrl?: string;
	readonly historyUrl?: string;
} {
	const path = sidecarSnapshotPath(hoboHome, stationId);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<
			string,
			unknown
		>;
		if (parsed.schema !== "hobo.code.station-sidecars/v1") return {};
		const text = (key: string): string | undefined =>
			typeof parsed[key] === "string" && parsed[key].length > 0
				? (parsed[key] as string)
				: undefined;
		const dashboardUrl = text("dashboardUrl");
		const evidenceUrl = text("evidenceUrl");
		const evidenceReportUrl = text("evidenceReportUrl");
		const evidenceControlsUrl = text("evidenceControlsUrl");
		const otlpHttpUrl = text("otlpHttpUrl");
		const evalsUrl = text("evalsUrl");
		const rolloutUrl = text("rolloutUrl");
		const experimentUrl = text("experimentUrl");
		const kmsUrl = text("kmsUrl");
		const historyUrl = text("historyUrl");
		return {
			...(dashboardUrl !== undefined ? { dashboardUrl } : {}),
			...(evidenceUrl !== undefined ? { evidenceUrl } : {}),
			...(evidenceReportUrl !== undefined ? { evidenceReportUrl } : {}),
			...(evidenceControlsUrl !== undefined ? { evidenceControlsUrl } : {}),
			...(otlpHttpUrl !== undefined ? { otlpHttpUrl } : {}),
			...(evalsUrl !== undefined ? { evalsUrl } : {}),
			...(rolloutUrl !== undefined ? { rolloutUrl } : {}),
			...(experimentUrl !== undefined ? { experimentUrl } : {}),
			...(kmsUrl !== undefined ? { kmsUrl } : {}),
			...(historyUrl !== undefined ? { historyUrl } : {}),
		};
	} catch {
		return {};
	}
}

function mergeEndpointRecords(
	rows: readonly EndpointRecord[],
): EndpointRecord[] {
	const byName = new Map<string, EndpointRecord>();
	for (const row of rows) byName.set(row.resourceName, row);
	return [...byName.values()];
}

function localYardNode(environment: string): TopologyNode {
	return {
		kind: "yard",
		id: "yard:local",
		name: "local",
		environment,
		status: "serving",
		fidelity: "simulated",
		scopeLabel: "local",
	};
}

function occupancyCampNode(environment: string): TopologyNode {
	return {
		kind: "camp",
		id: CODE_CAMP_ID,
		name: OCCUPANCY_NAMED_APP,
		environment,
		parentId: "yard:local",
		status: "serving",
		fidelity: "simulated",
		scopeLabel: "local",
	};
}

function occupancyBindleNode(environment: string): TopologyNode {
	return {
		kind: "bindle",
		id: CODE_BINDLE_ID,
		name: OCCUPANCY_NAMED_APP,
		environment,
		parentId: CODE_CAMP_ID,
		status: "serving",
		fidelity: "simulated",
		scopeLabel: "local",
	};
}

function userCampNode(
	bindleName: string,
	environment: string,
	status: ResourceStatus = "declared",
): TopologyNode {
	return {
		kind: "camp",
		id: userCampId(bindleName),
		name: bindleName,
		environment,
		parentId: "yard:local",
		status,
		fidelity: "simulated",
		scopeLabel: "local",
	};
}

function localOccupancySeed(
	view: AuthedStationView,
	projectDir: string | undefined,
	existingIds: ReadonlySet<string>,
): {
	readonly nodes: readonly TopologyNode[];
	readonly camp?: OccupancyCampConfig;
	readonly bindleManifest?: OccupancyBindleManifest;
} {
	if (view.mode !== "local") {
		return { nodes: [] };
	}
	const nodes: TopologyNode[] = [];
	const hasYard = [...existingIds].some((id) => id.startsWith("yard:"));
	if (!hasYard) {
		nodes.push(localYardNode(view.environment));
	}
	const localYard = existingIds.has("yard:local") || !hasYard;
	if (localYard && !existingIds.has(CODE_CAMP_ID)) {
		nodes.push(occupancyCampNode(view.environment));
	}
	if (localYard && !existingIds.has(CODE_BINDLE_ID)) {
		nodes.push(occupancyBindleNode(view.environment));
	}
	const inspected =
		projectDir !== undefined ? inspectBindleProject(projectDir) : undefined;
	if (!inspected) {
		return { nodes };
	}
	const campId = existingIds.has("camp:local")
		? "camp:local"
		: userCampId(inspected.name);
	if (!existingIds.has(campId)) {
		nodes.push(userCampNode(inspected.name, view.environment));
	}
	const bindleId = `bindle:${inspected.name}`;
	if (!existingIds.has(bindleId)) {
		nodes.push({
			kind: "bindle",
			id: bindleId,
			name: inspected.name,
			environment: view.environment,
			parentId: campId,
			status: "declared",
			fidelity: "simulated",
			scopeLabel: "local",
		});
	}
	return {
		nodes,
		camp: campConfigFor(inspected, view.environment),
		bindleManifest: bindleManifestFor(inspected, projectDir),
	};
}

function campConfigFor(
	inspected: InspectedBindle,
	environment: string,
): OccupancyCampConfig {
	return {
		name: inspected.name,
		envType:
			environment === "local-dev" || environment === "local"
				? "development"
				: environment,
		require: inspected.requirements,
		labels: { bindle: inspected.name },
		runtimeRequirements: ["local"],
	};
}

function bindleManifestFor(
	inspected: InspectedBindle,
	projectDir?: string,
): OccupancyBindleManifest {
	return {
		name: inspected.name,
		resources: inspected.resources.map((row) => ({
			kind: row.kind,
			name: row.name,
			dependsOn: row.dependsOn,
			allow: row.allow,
		})),
		envKeys: inspected.envKeys,
		requirements: inspected.requirements,
		...(projectDir !== undefined ? { projectDir } : {}),
	};
}

function occupiedStation(view: AuthedStationView): TopologyNode {
	return {
		kind: "station",
		id: view.stationId,
		name: view.displayName || view.stationId,
		environment: view.environment,
		status: view.occupancyStatus === "open" ? "serving" : "declared",
		fidelity: view.mode === "local" ? "simulated" : "real",
		scopeLabel: view.mode === "local" ? "local" : "hybrid",
	};
}

function inScope(
	environment: string,
	rowEnvironment: string | undefined,
): boolean {
	if (!rowEnvironment || rowEnvironment.length === 0) return true;
	return rowEnvironment === environment;
}

function mergeNodes(rows: readonly TopologyNode[]): TopologyNode[] {
	const byId = new Map<string, TopologyNode>();
	for (const row of rows) byId.set(row.id, row);
	return [...byId.values()];
}

function toEndpointRow(
	record: EndpointRecord,
	options: {
		readonly environment: string;
		readonly freshness: string;
		readonly lookupHost: (hostname: string) => readonly string[];
	},
): EndpointRow {
	const airgap = assertLocalBackend(
		record.backendUrl,
		options.environment,
		record.mode,
	);
	if (!airgap.ok) {
		const namedHost = record.hostname ?? hostnameOf(record.namedUrl);
		const namedAddresses = namedHost
			? resolveAddresses([namedHost], options.lookupHost)
			: [];
		return {
			...record,
			preferredUrl: record.namedUrl ?? "",
			status: "unresolved",
			fidelity: "unresolved",
			freshness: options.freshness,
			resolvedAddresses: namedAddresses,
			unresolvedReason: airgap.reason,
		};
	}
	const hostname = record.hostname ?? hostnameOf(record.namedUrl);
	if (hostname?.endsWith(".hobo") && !hostname.includes(".hobo.")) {
		return {
			...record,
			status: "unresolved",
			fidelity: "unresolved",
			freshness: options.freshness,
			resolvedAddresses: [],
			unresolvedReason: "bare .hobo hostname refused",
		};
	}
	const backendHost = hostnameOf(record.backendUrl);
	const resolved = resolveAddresses(
		[backendHost, hostname],
		options.lookupHost,
	);
	const listenPort = listenPortOf(record.backendUrl);
	const namedPreferred =
		record.namedUrl ??
		preferNamedEndpoint(record.backendUrl, record.resourceName, {
			environment: options.environment,
		});
	const preferred =
		record.mode === "local"
			? namedPreferred
			: (record.namedUrl ?? record.preferredUrl);
	return {
		...record,
		preferredUrl: preferred,
		status: options.freshness.startsWith("last-seen:")
			? "last-seen"
			: "serving",
		freshness: options.freshness,
		resolvedAddresses: resolved,
		...(listenPort !== undefined ? { listenPort } : {}),
		...(resolved.length === 0
			? { unresolvedReason: "nxdomain", status: "unresolved" as const }
			: {}),
	};
}

export function assembleSessionResources(
	options: AssembleSessionResourcesOptions,
): SessionResourceInventory {
	const env = options.env ?? process.env;
	const view = describeAuthedStationSession({
		hoboHome: options.hoboHome,
		env,
		...(options.ensureLocalLogin !== undefined
			? { ensureLocalLogin: options.ensureLocalLogin }
			: {}),
	});
	const scope = emptyScope(view);
	const lookupHost = options.lookupHost ?? defaultLookupHost;
	const granted = new Set(options.grantedStationIds ?? []);

	if (!view.loggedIn) {
		return {
			ok: false,
			code: "HOBO_AUTH_REQUIRED",
			message: view.message,
			schema: SESSION_RESOURCES_SCHEMA,
			scope,
			peers: [],
			junctions: [],
			yards: [],
			camps: [],
			bindles: [],
			endpoints: [],
			capabilities: [],
			managed: [],
			missing: TOPOLOGY_KINDS.map((kind) => ({
				kind,
				reason: REMEDIATION[kind],
			})),
		};
	}

	const snapshot = loadSnapshot(
		options.hoboHome,
		view.stationId,
		view.environment,
	);
	const snapshotNodes = (snapshot?.nodes ?? []).filter((row) =>
		inScope(view.environment, row.environment),
	);
	const injected = (options.topology ?? []).filter((row) =>
		inScope(view.environment, row.environment),
	);

	const station = occupiedStation(view);
	const existing = mergeNodes([...snapshotNodes, ...injected]);
	const seeded = localOccupancySeed(
		view,
		options.projectDir,
		new Set(existing.map((row) => row.id)),
	);
	const peers: TopologyNode[] = [];
	const kept: TopologyNode[] = [];
	for (const row of mergeNodes([...seeded.nodes, ...existing])) {
		if (row.kind === "station") {
			if (row.id === view.stationId) continue;
			if (!granted.has(row.id)) continue;
			peers.push(row);
			continue;
		}
		kept.push(row);
	}

	const nodes = mergeNodes([station, ...peers, ...kept]);
	const byKind = (kind: ResourceKind): TopologyNode[] =>
		nodes.filter((row) => row.kind === kind);

	const occupancyLive = mergeEndpointRecords([
		...occupancySidecarEndpoints(
			loadSidecarSnapshot(options.hoboHome, view.stationId),
		),
		...(options.liveEndpoints ?? []),
	]);
	const liveKeys = new Set(occupancyLive.map((row) => row.resourceName));
	if (liveKeys.has("evidence")) liveKeys.add("report");
	if (liveKeys.has("controls")) liveKeys.add("controls");
	const endpointRows: EndpointRow[] = [];
	for (const record of snapshot?.endpoints ?? []) {
		if (liveKeys.has(record.resourceName)) continue;
		endpointRows.push(
			toEndpointRow(record, {
				environment: view.environment,
				freshness: `last-seen:${snapshot?.recordedAt ?? "unknown"}`,
				lookupHost,
			}),
		);
	}
	for (const record of occupancyLive) {
		endpointRows.push(
			toEndpointRow(record, {
				environment: view.environment,
				freshness: "live",
				lookupHost,
			}),
		);
	}

	const present = new Set(nodes.map((row) => row.kind));
	const missing: MissingLayer[] = TOPOLOGY_KINDS.filter(
		(kind) => kind !== "station" && !present.has(kind),
	).map((kind) => ({ kind, reason: REMEDIATION[kind] }));

	const camp =
		readJsonFile<OccupancyCampConfig>(
			join(
				sessionDir(options.hoboHome, view.stationId, view.environment),
				"camp.json",
			),
		) ?? seeded.camp;
	const bindleManifest =
		readJsonFile<OccupancyBindleManifest>(
			join(
				sessionDir(options.hoboHome, view.stationId, view.environment),
				"bindle.json",
			),
		) ?? seeded.bindleManifest;

	const yards = byKind("yard");
	const camps = byKind("camp");
	const bindles = byKind("bindle");
	const appCampId =
		bindles.find((row) => row.id !== CODE_BINDLE_ID)?.parentId ??
		camps.find((row) => row.id !== CODE_CAMP_ID)?.id;
	const evals = assembleCampEvalSidecar(
		appCampId ?? CODE_CAMP_ID,
		options.projectDir,
	);
	return {
		ok: true,
		code: "HOBO_OK",
		message: `${view.displayName}@${view.environment}`,
		schema: SESSION_RESOURCES_SCHEMA,
		scope,
		station,
		peers,
		junctions: byKind("junction"),
		yards,
		camps,
		bindles,
		endpoints: endpointRows,
		missing,
		capabilities: view.mode === "local" ? localBindleCapabilities() : [],
		managed: projectManagedResources({
			station,
			yards,
			camps,
			bindles,
			endpoints: endpointRows,
			...(bindleManifest !== undefined ? { bindleManifest } : {}),
			...(view.railHash !== undefined ? { railHash: view.railHash } : {}),
			evals,
		}),
		...(camp ? { camp } : {}),
		...(bindleManifest ? { bindleManifest } : {}),
		evals,
	};
}

const STATION_SIDECARS = new Set([
	"dashboard",
	"evidence",
	"controls",
	"otlp",
	"rollout",
	"experiment",
	"kms",
	"history",
]);

function projectManagedResources(input: {
	readonly station?: TopologyNode;
	readonly yards: readonly TopologyNode[];
	readonly camps: readonly TopologyNode[];
	readonly bindles: readonly TopologyNode[];
	readonly endpoints: readonly EndpointRow[];
	readonly bindleManifest?: OccupancyBindleManifest;
	readonly railHash?: string;
	readonly evals?: CampEvalSidecar;
}): OccupancyManagedResource[] {
	const rows: OccupancyManagedResource[] = [];
	if (input.station && input.railHash) {
		rows.push({
			id: `rail:${input.railHash}`,
			name: "rail",
			kind: "rail",
			ownerKind: "station",
			ownerId: input.station.id,
			controllable: false,
		});
	}
	const sidecarOwner = input.camps.some((row) => row.id === CODE_CAMP_ID)
		? CODE_CAMP_ID
		: input.station?.id;
	if (sidecarOwner) {
		for (const endpoint of input.endpoints) {
			if (!STATION_SIDECARS.has(endpoint.resourceName)) continue;
			rows.push({
				id: endpoint.resourceName,
				name: endpoint.resourceName,
				kind: "sidecar",
				ownerKind: sidecarOwner === CODE_CAMP_ID ? "camp" : "station",
				ownerId: sidecarOwner,
				controllable: true,
			});
		}
	}
	for (const yard of input.yards) {
		rows.push({
			id: `${yard.id}:flow`,
			name: "flow",
			kind: "flow",
			ownerKind: "yard",
			ownerId: yard.id,
			controllable: true,
		});
		rows.push({
			id: `${yard.id}:named-endpoints`,
			name: "named-endpoints",
			kind: "named-endpoint",
			ownerKind: "yard",
			ownerId: yard.id,
			controllable: true,
		});
	}
	const codeCamp = input.camps.find((row) => row.id === CODE_CAMP_ID);
	if (codeCamp) {
		const seenSidecars = new Set(rows.map((row) => row.id));
		for (const name of STATION_SIDECARS) {
			if (seenSidecars.has(name)) continue;
			rows.push({
				id: name,
				name,
				kind: "sidecar",
				ownerKind: "camp",
				ownerId: CODE_CAMP_ID,
				controllable: true,
			});
		}
	}
	for (const bindle of input.bindles) {
		const ownerId = bindle.parentId ?? input.camps[0]?.id;
		if (!ownerId) continue;
		rows.push({
			id: bindle.id,
			name: bindle.name,
			kind: "bindle",
			ownerKind: "camp",
			ownerId,
			controllable: bindle.id !== CODE_BINDLE_ID,
		});
	}
	const seen = new Set(rows.map((row) => row.id));
	const userBindle = input.bindles.find((row) => row.id !== CODE_BINDLE_ID);
	const userCampIdForResources =
		userBindle?.parentId ??
		input.camps.find((row) => row.id !== CODE_CAMP_ID)?.id;
	if (userCampIdForResources) {
		for (const resource of input.bindleManifest?.resources ?? []) {
			if (seen.has(resource.name)) continue;
			seen.add(resource.name);
			rows.push({
				id: resource.name,
				name: resource.name,
				kind: "bindle-resource",
				ownerKind: "camp",
				ownerId: userCampIdForResources,
				controllable: true,
			});
		}
	}
	if (input.evals && !seen.has(EVAL_SIDECAR_NAME)) {
		rows.push({
			id: EVAL_SIDECAR_NAME,
			name: EVAL_SIDECAR_NAME,
			kind: "sidecar",
			ownerKind: "camp",
			ownerId: input.evals.campId,
			controllable: true,
		});
	}
	return rows;
}

function formatNode(row: TopologyNode): string {
	return ` ${row.kind.padEnd(9)} ${row.id}  ${row.environment}  ${row.status}  ${row.fidelity}`;
}

function formatManaged(row: OccupancyManagedResource): string {
	return `   ${row.kind.padEnd(16)} ${row.id}${row.controllable ? "" : "  occupancy"}`;
}

export function filterSessionResources(
	inventory: SessionResourceInventory,
	kind: ResourceKind,
): SessionResourceInventory {
	return {
		ok: inventory.ok,
		code: inventory.code,
		message: inventory.message,
		schema: inventory.schema,
		scope: inventory.scope,
		...(kind === "station" && inventory.station
			? { station: inventory.station }
			: {}),
		peers: kind === "station" ? inventory.peers : [],
		junctions: kind === "junction" ? inventory.junctions : [],
		yards: kind === "yard" ? inventory.yards : [],
		camps: kind === "camp" ? inventory.camps : [],
		bindles: kind === "bindle" ? inventory.bindles : [],
		endpoints: kind === "bindle" ? inventory.endpoints : [],
		capabilities: inventory.capabilities,
		managed: inventory.managed.filter((row) => row.ownerKind === kind),
		missing: inventory.missing.filter((row) => row.kind === kind),
		...(inventory.camp ? { camp: inventory.camp } : {}),
		...(inventory.bindleManifest
			? { bindleManifest: inventory.bindleManifest }
			: {}),
		...(inventory.evals ? { evals: inventory.evals } : {}),
	};
}

export function formatSessionResources(
	inventory: SessionResourceInventory,
): string {
	if (!inventory.ok) {
		return ["resources  auth:out", ` next     ${inventory.message}`].join("\n");
	}
	const lines = [
		`resources  ${inventory.message}`,
		` env       ${inventory.scope.environment}`,
		` tenant    ${inventory.scope.tenant}`,
	];
	if (inventory.station) {
		lines.push(formatNode(inventory.station));
		for (const child of inventory.managed.filter(
			(row) => row.ownerId === inventory.station?.id,
		)) {
			lines.push(formatManaged(child));
		}
		const stationEndpoints = inventory.endpoints.filter((row) =>
			isStationOccupancyEndpoint(row.resourceName),
		);
		if (stationEndpoints.length > 0) {
			lines.push("   endpoints");
			for (const row of stationEndpoints) {
				lines.push(
					`     ${row.resourceName}  ${row.preferredUrl || row.namedUrl || preferNamedEndpoint(row.backendUrl, row.resourceName)}`,
				);
			}
		}
		if (inventory.capabilities.length > 0) {
			lines.push("   capabilities");
			for (const row of inventory.capabilities) {
				lines.push(
					`     ${row.kind.padEnd(16)} ${row.available ? "available" : "unavailable"}`,
				);
			}
		}
	}
	if (inventory.camp) {
		lines.push(
			` camp      ${inventory.camp.name}  require:${inventory.camp.require.join(",") || "—"}`,
		);
	}
	for (const row of inventory.peers) lines.push(formatNode(row));
	for (const row of inventory.junctions) lines.push(formatNode(row));
	const yardIds = new Set(inventory.yards.map((row) => row.id));
	const campIds = new Set(inventory.camps.map((row) => row.id));
	const nestedBindles = new Set<string>();
	const formatOwned = (ownerId: string, depth: number): void => {
		const pad = "  ".repeat(depth);
		for (const child of inventory.managed.filter(
			(item) =>
				item.ownerId === ownerId &&
				item.kind !== "bindle" &&
				!isStationOccupancyEndpoint(item.id),
		)) {
			lines.push(`${pad}${formatManaged(child).trimStart()}`);
		}
	};
	for (const yard of inventory.yards) {
		lines.push(formatNode(yard));
		formatOwned(yard.id, 1);
		for (const camp of inventory.camps.filter(
			(row) => row.parentId === yard.id,
		)) {
			lines.push(`   ${formatNode(camp).trimStart()}`);
			formatOwned(camp.id, 2);
			for (const bindle of inventory.bindles.filter(
				(row) => row.parentId === camp.id,
			)) {
				nestedBindles.add(bindle.id);
				lines.push(`     ${formatNode(bindle).trimStart()}`);
				formatOwned(bindle.id, 3);
			}
		}
	}
	for (const camp of inventory.camps.filter(
		(row) => !row.parentId || !yardIds.has(row.parentId),
	)) {
		lines.push(formatNode(camp));
		formatOwned(camp.id, 1);
		for (const bindle of inventory.bindles.filter(
			(row) => row.parentId === camp.id,
		)) {
			nestedBindles.add(bindle.id);
			lines.push(`   ${formatNode(bindle).trimStart()}`);
		}
	}
	for (const bindle of inventory.bindles) {
		if (nestedBindles.has(bindle.id)) continue;
		if (bindle.parentId && campIds.has(bindle.parentId)) continue;
		lines.push(formatNode(bindle));
	}
	if (inventory.missing.length > 0) {
		lines.push(" missing");
		for (const row of inventory.missing) {
			lines.push(`  ${row.kind.padEnd(9)} ${row.reason}`);
		}
	}
	const bindleEndpoints = inventory.endpoints.filter(
		(row) => !isStationOccupancyEndpoint(row.resourceName),
	);
	if (bindleEndpoints.length > 0) {
		lines.push(" bindle endpoints");
		for (const row of bindleEndpoints) {
			const reason = row.unresolvedReason ? `  ${row.unresolvedReason}` : "";
			lines.push(
				`  ${row.resourceName}  ${row.preferredUrl || row.namedUrl || preferNamedEndpoint(row.backendUrl, row.resourceName)}  ${row.freshness}${reason}`,
			);
		}
	}
	return lines.join("\n");
}

function retargetOrName(
	source: string,
	namedOrigin: string,
	resource: string,
	scope: { readonly environment?: string; readonly app?: string },
): string {
	try {
		return retargetUrl(source, namedOrigin);
	} catch {
		return preferNamedEndpoint(source, resource, scope);
	}
}

/** Persist the /dev serve graph so the board survives a shell restart. */
export function recordDevDeployment(input: {
	readonly hoboHome: string;
	readonly scope: SessionScope;
	readonly bindleName: string;
	readonly appUrl: string;
	readonly debugUrl: string;
	readonly controlsUrl: string;
	readonly reportUrl: string;
	readonly namedUrl?: string;
	readonly projectDir?: string;
}): void {
	const scope = { environment: input.scope.environment };
	const inspected =
		input.projectDir !== undefined
			? inspectBindleProject(input.projectDir, input.bindleName)
			: undefined;
	const bindleName = inspected?.name ?? input.bindleName;
	const named =
		input.namedUrl ??
		preferNamedEndpoint(input.appUrl, "web", {
			...scope,
			app: bindleName,
		});
	const namedDebug = retargetOrName(input.debugUrl, named, "web", {
		...scope,
		app: bindleName,
	});
	const namedControls = preferNamedEndpoint(
		input.controlsUrl,
		"evidence",
		scope,
	);
	const namedReport = preferNamedEndpoint(input.reportUrl, "evidence", scope);
	const hostname = hostnameOf(named);
	const endpoints: EndpointRecord[] = [
		{
			resourceName: "web",
			kind: "http",
			backendUrl: input.appUrl,
			namedUrl: named,
			...(hostname !== undefined ? { hostname } : {}),
			mode: "local",
			preferredUrl: named,
			fidelity: "real",
		},
		{
			resourceName: "debug",
			kind: "http",
			backendUrl: input.debugUrl,
			namedUrl: namedDebug,
			mode: "local",
			preferredUrl: namedDebug,
			fidelity: "real",
		},
		{
			resourceName: "controls",
			kind: "http",
			backendUrl: input.controlsUrl,
			namedUrl: namedControls,
			mode: "local",
			preferredUrl: namedControls,
			fidelity: "real",
		},
		{
			resourceName: "report",
			kind: "http",
			backendUrl: input.reportUrl,
			namedUrl: namedReport,
			mode: "local",
			preferredUrl: namedReport,
			fidelity: "real",
		},
		...bindleResourceEndpoints(inspected, {
			appUrl: input.appUrl,
			namedUrl: named,
			environment: input.scope.environment,
			bindleName,
		}).filter(
			(row) =>
				!["web", "debug", "controls", "report"].includes(row.resourceName),
		),
	];
	const camp = inspected
		? campConfigFor(inspected, input.scope.environment)
		: {
				name: bindleName,
				envType: "development",
				require: ["managed-http-runtime"],
				labels: { bindle: bindleName },
				runtimeRequirements: ["local"],
			};
	const bindleManifest = inspected
		? bindleManifestFor(inspected, input.projectDir)
		: {
				name: bindleName,
				resources: [{ kind: "web", name: "web", dependsOn: [], allow: [] }],
				envKeys: [],
				requirements: ["managed-http-runtime"],
				...(input.projectDir !== undefined
					? { projectDir: input.projectDir }
					: {}),
			};
	const dir = sessionDir(
		input.hoboHome,
		input.scope.stationId,
		input.scope.environment,
	);
	writeJsonFile(join(dir, "camp.json"), camp);
	writeJsonFile(join(dir, "bindle.json"), bindleManifest);
	const appCampId = userCampId(bindleName);
	recordSessionResources({
		hoboHome: input.hoboHome,
		scope: input.scope,
		nodes: [
			localYardNode(input.scope.environment),
			occupancyCampNode(input.scope.environment),
			occupancyBindleNode(input.scope.environment),
			userCampNode(bindleName, input.scope.environment, "serving"),
			{
				kind: "bindle",
				id: `bindle:${bindleName}`,
				name: bindleName,
				environment: input.scope.environment,
				parentId: appCampId,
				status: "serving",
				fidelity: "simulated",
				scopeLabel: "local",
			},
		],
		endpoints,
	});
}

const HTTP_KINDS = new Set(["api", "web", "service", "websocket", "ui"]);

function bindleResourceEndpoints(
	inspected: InspectedBindle | undefined,
	options: {
		readonly appUrl: string;
		readonly namedUrl: string;
		readonly environment: string;
		readonly bindleName: string;
	},
): EndpointRecord[] {
	if (!inspected) {
		return [
			{
				resourceName: "api",
				kind: "http",
				backendUrl: options.appUrl,
				namedUrl: preferNamedEndpoint(options.appUrl, "api", {
					environment: options.environment,
					app: options.bindleName,
				}),
				mode: "local",
				preferredUrl: preferNamedEndpoint(options.appUrl, "api", {
					environment: options.environment,
					app: options.bindleName,
				}),
				fidelity: "real",
			},
		];
	}
	return inspected.resources.map((resource) => {
		const http = HTTP_KINDS.has(resource.kind);
		const named = http
			? preferNamedEndpoint(options.appUrl, resource.name, {
					environment: options.environment,
					app: options.bindleName,
				})
			: occupancyNamedOrigin(resource.kind, 0, {
					environment: options.environment,
					app: options.bindleName,
				});
		return {
			resourceName: resource.name,
			kind: http ? "http" : resource.kind,
			backendUrl: http ? options.appUrl : named,
			namedUrl: named,
			mode: "local" as const,
			preferredUrl: named,
			fidelity: "real" as const,
		};
	});
}
