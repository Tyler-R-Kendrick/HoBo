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
	type AuthedStationView,
	describeAuthedStationSession,
} from "./station-session.js";

// public-contract: last-seen snapshot schema for the session resource board
export const SESSION_RESOURCES_SCHEMA =
	"hobo.code.session-resources/v1" as const;

export type ResourceKind = "station" | "junction" | "yard" | "camp" | "bindle";

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
	yard: "no yard history — run hobo-code dev or hobo up",
	camp: "no camp history — run hobo-code dev or hobo up",
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

function sessionSnapshotPath(
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
		"endpoints.json",
	);
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
	const preferred =
		record.mode === "local" ? record.backendUrl : record.preferredUrl;
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
	const peers: TopologyNode[] = [];
	const kept: TopologyNode[] = [];
	for (const row of mergeNodes([...snapshotNodes, ...injected])) {
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

	const liveKeys = new Set(
		(options.liveEndpoints ?? []).map((row) => row.resourceName),
	);
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
	for (const record of options.liveEndpoints ?? []) {
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

	return {
		ok: true,
		code: "HOBO_OK",
		message: `${view.displayName}@${view.environment}`,
		schema: SESSION_RESOURCES_SCHEMA,
		scope,
		station,
		peers,
		junctions: byKind("junction"),
		yards: byKind("yard"),
		camps: byKind("camp"),
		bindles: byKind("bindle"),
		endpoints: endpointRows,
		missing,
	};
}

function formatNode(row: TopologyNode): string {
	return ` ${row.kind.padEnd(9)} ${row.id}  ${row.environment}  ${row.status}  ${row.fidelity}`;
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
		missing: inventory.missing.filter((row) => row.kind === kind),
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
	if (inventory.station) lines.push(formatNode(inventory.station));
	for (const row of inventory.peers) lines.push(formatNode(row));
	for (const row of inventory.junctions) lines.push(formatNode(row));
	for (const row of inventory.yards) lines.push(formatNode(row));
	for (const row of inventory.camps) lines.push(formatNode(row));
	for (const row of inventory.bindles) lines.push(formatNode(row));
	if (inventory.missing.length > 0) {
		lines.push(" missing");
		for (const row of inventory.missing) {
			lines.push(`  ${row.kind.padEnd(9)} ${row.reason}`);
		}
	}
	if (inventory.endpoints.length > 0) {
		lines.push(" endpoints");
		for (const row of inventory.endpoints) {
			const resolved =
				row.resolvedAddresses.length > 0
					? row.resolvedAddresses.join(",")
					: "unresolved";
			const reason = row.unresolvedReason ? `  ${row.unresolvedReason}` : "";
			lines.push(
				`  ${row.resourceName}  ${row.preferredUrl || row.namedUrl || row.backendUrl}  ${resolved}  ${row.fidelity}  ${row.freshness}${reason}`,
			);
		}
	}
	return lines.join("\n");
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
}): void {
	const namedHost = hostnameOf(input.namedUrl);
	const named = input.namedUrl;
	const endpoints: EndpointRecord[] = [
		{
			resourceName: "web",
			kind: "http",
			backendUrl: input.appUrl,
			...(named ? { namedUrl: named } : {}),
			...(namedHost ? { hostname: namedHost } : {}),
			mode: "local",
			preferredUrl: input.appUrl,
			fidelity: "simulated",
		},
		{
			resourceName: "debug",
			kind: "http",
			backendUrl: input.debugUrl,
			mode: "local",
			preferredUrl: input.debugUrl,
			fidelity: "simulated",
		},
		{
			resourceName: "controls",
			kind: "http",
			backendUrl: input.controlsUrl,
			mode: "local",
			preferredUrl: input.controlsUrl,
			fidelity: "simulated",
		},
		{
			resourceName: "report",
			kind: "http",
			backendUrl: input.reportUrl,
			mode: "local",
			preferredUrl: input.reportUrl,
			fidelity: "simulated",
		},
	];
	recordSessionResources({
		hoboHome: input.hoboHome,
		scope: input.scope,
		nodes: [
			{
				kind: "yard",
				id: "yard:local",
				name: "local",
				environment: input.scope.environment,
				status: "serving",
				fidelity: "simulated",
				scopeLabel: "local",
			},
			{
				kind: "camp",
				id: "camp:local",
				name: "local",
				environment: input.scope.environment,
				parentId: "yard:local",
				status: "serving",
				fidelity: "simulated",
				scopeLabel: "local",
			},
			{
				kind: "bindle",
				id: `bindle:${input.bindleName}`,
				name: input.bindleName,
				environment: input.scope.environment,
				parentId: "camp:local",
				status: "serving",
				fidelity: "simulated",
				scopeLabel: "local",
			},
		],
		endpoints,
	});
}
