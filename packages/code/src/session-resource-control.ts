/**
 * Dashboard start/stop. Station/Yard/Camp are primitives; children are the
 * managed units. Yard stop takes camps in that yard. Occupancy sidecars
 * (bindle:code in camp:code) start/stop. Bindle HTTP launches `/dev`.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { inspectBindleProject } from "./bindle-inspect.js";
import {
	type DevBrowserSession,
	type DevBrowserSessionOptions,
	startDevBrowserSession,
} from "./dev-browser.js";
import { isStationOccupancyEndpoint } from "./occupancy-endpoints.js";
import { isOccupancyRunProcessLive } from "./occupancy-live.js";
import {
	CODE_BINDLE_ID,
	CODE_CAMP_ID,
	campsInYard,
	recordDevDeployment,
	userCampId,
} from "./session-resources.js";
import { describeAuthedStationSession } from "./station-session.js";
import { resolveRunnableProject } from "./workspace-actions.js";

export type StartDevSession = (
	options: DevBrowserSessionOptions,
) => Promise<DevBrowserSession>;

export interface OccupancyController {
	start(id: string): Promise<void>;
	stop(id: string): Promise<void>;
	isLive(): boolean;
}

export interface SidecarControl {
	start(id: string): Promise<void>;
	stop(id: string): Promise<void>;
}

interface RunRecord {
	readonly pid?: number;
	readonly projectDir: string;
	readonly bindleName: string;
	readonly sessionId?: string;
}

const live = new Map<string, DevBrowserSession>();

function occupancyKey(hoboHome: string, environment: string): string {
	return `${hoboHome}::${environment}`;
}

function runPath(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		environment.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"run.json",
	);
}

function readBindleProjectDir(
	hoboHome: string,
	stationId: string,
	environment: string,
): string | undefined {
	const path = join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		environment.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"bindle.json",
	);
	if (!existsSync(path)) return undefined;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			readonly projectDir?: string;
		};
		return Object.prototype.toString.call(parsed.projectDir) ===
			"[object String]"
			? parsed.projectDir
			: undefined;
	} catch {
		return undefined;
	}
}

export function occupancyRunIsLive(
	hoboHome: string,
	stationId: string,
	environment: string,
): boolean {
	return isOccupancyRunProcessLive(hoboHome, stationId, environment);
}

function readRun(path: string): RunRecord | undefined {
	if (!existsSync(path)) return undefined;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		return JSON.parse(readFileSync(path, "utf8")) as RunRecord;
	} catch {
		return undefined;
	}
}

function writeRun(path: string, record: RunRecord): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function isStationResource(id: string): boolean {
	return id.startsWith("station:");
}

/** Hosting station plus its occupancy camp/bindle. Cannot self-stop. */
export function isHostStationStack(id: string): boolean {
	return isStationResource(id) || id === CODE_CAMP_ID || id === CODE_BINDLE_ID;
}

const HOST_STATION_REFUSED =
	"Stations can't shut themselves down — the hosting Station, camp:code, and bindle:code stay up";

const HOST_STATION_SIDECAR_REFUSED =
	"Stations can't stop their own occupancy sidecars — dashboard, Evidence, OTLP, and the rest stay up with the Station";

export function isOccupancySidecar(id: string): boolean {
	return isStationOccupancyEndpoint(id);
}

export function controlsBindleProcess(id: string): boolean {
	return (
		id.startsWith("bindle:") ||
		id === "web" ||
		id === "api" ||
		id === "debug" ||
		id === "service"
	);
}

export function controlsOccupancyFlow(id: string): boolean {
	return id.startsWith("yard:") && !id.endsWith(":named-endpoints");
}

export function controlsNamedEndpointPlane(id: string): boolean {
	return id.endsWith(":named-endpoints");
}

export function controlsCampPlane(id: string): boolean {
	return /^camp:[^/]+$/.test(id);
}

export function isProcessBackedResource(id: string): boolean {
	return controlsBindleProcess(id);
}

// public-contract: per-resource enable flags under a primitive
export const MANAGED_RESOURCE_STATE_SCHEMA =
	"hobo.code.managed-resource-state/v1" as const;

export function managedResourceStatePath(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		environment.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"resource-state.json",
	);
}

function readDisabled(
	hoboHome: string,
	stationId: string,
	environment: string,
): Set<string> {
	const path = managedResourceStatePath(hoboHome, stationId, environment);
	if (!existsSync(path)) return new Set();
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			readonly disabled?: readonly string[];
		};
		return new Set(parsed.disabled ?? []);
	} catch {
		return new Set();
	}
}

function writeDisabled(
	hoboHome: string,
	stationId: string,
	environment: string,
	disabled: Set<string>,
): void {
	const path = managedResourceStatePath(hoboHome, stationId, environment);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				schema: MANAGED_RESOURCE_STATE_SCHEMA,
				disabled: [...disabled].sort(),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

export function isManagedResourceEnabled(
	hoboHome: string,
	stationId: string,
	environment: string,
	id: string,
): boolean {
	return !readDisabled(hoboHome, stationId, environment).has(id);
}

export function setManagedResourceEnabled(
	hoboHome: string,
	stationId: string,
	environment: string,
	id: string,
	enabled: boolean,
): void {
	const disabled = readDisabled(hoboHome, stationId, environment);
	if (enabled) disabled.delete(id);
	else disabled.add(id);
	writeDisabled(hoboHome, stationId, environment, disabled);
}

export function occupancyCampIsActive(
	hoboHome: string,
	stationId: string,
	environment: string,
	campId: string = CODE_CAMP_ID,
): boolean {
	return isManagedResourceEnabled(hoboHome, stationId, environment, campId);
}

function campIdForResource(id: string): string {
	if (isOccupancySidecar(id) || id === CODE_BINDLE_ID || id === CODE_CAMP_ID) {
		return CODE_CAMP_ID;
	}
	if (id.startsWith("bindle:")) {
		return userCampId(id.slice("bindle:".length));
	}
	if (id.startsWith("camp:")) return id;
	return userCampId(id);
}

function isCodeOccupancyTarget(id: string): boolean {
	return isOccupancySidecar(id);
}

// public-contract: local yard/camp traffic gate for the Aspire board
export const OCCUPANCY_FLOW_SCHEMA = "hobo.code.occupancy-flow/v1" as const;

export function occupancyFlowPath(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		environment.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"flow.json",
	);
}

export function occupancyFlowIsActive(
	hoboHome: string,
	stationId: string,
	environment: string,
): boolean {
	const path = occupancyFlowPath(hoboHome, stationId, environment);
	if (!existsSync(path)) return true;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			readonly active?: boolean;
		};
		return parsed.active !== false;
	} catch {
		return true;
	}
}

export function setOccupancyFlowActive(
	hoboHome: string,
	stationId: string,
	environment: string,
	active: boolean,
): void {
	const path = occupancyFlowPath(hoboHome, stationId, environment);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify({ schema: OCCUPANCY_FLOW_SCHEMA, active }, null, 2)}\n`,
		"utf8",
	);
}

export function persistOccupancyRun(input: {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly environment: string;
	readonly projectDir: string;
	readonly bindleName: string;
	readonly pid?: number;
	readonly sessionId?: string;
}): void {
	writeRun(runPath(input.hoboHome, input.stationId, input.environment), {
		projectDir: input.projectDir,
		bindleName: input.bindleName,
		...(input.pid !== undefined ? { pid: input.pid } : undefined),
		...(input.sessionId !== undefined
			? { sessionId: input.sessionId }
			: undefined),
	});
}

export function createOccupancyController(options: {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly projectRoot?: string;
	readonly startDevSession?: StartDevSession;
	readonly sidecar?: SidecarControl;
}): OccupancyController {
	const env = options.env ?? process.env;
	const startDev = options.startDevSession ?? startDevBrowserSession;

	const view = () =>
		describeAuthedStationSession({
			hoboHome: options.hoboHome,
			env,
			ensureLocalLogin: true,
		});

	const keyOf = (): string => {
		const station = view();
		return occupancyKey(options.hoboHome, station.environment);
	};

	return {
		isLive() {
			return live.has(keyOf());
		},
		async start(id) {
			if (isHostStationStack(id)) {
				throw new Error(HOST_STATION_REFUSED);
			}
			if (isOccupancySidecar(id)) {
				throw new Error(HOST_STATION_SIDECAR_REFUSED);
			}
			const station = view();
			if (!station.loggedIn) {
				throw new Error(station.message);
			}
			if (controlsOccupancyFlow(id)) {
				setOccupancyFlowActive(
					options.hoboHome,
					station.stationId,
					station.environment,
					true,
				);
				const yardId = id.endsWith(":flow") ? id.slice(0, -":flow".length) : id;
				for (const campId of campsInYard(
					options.hoboHome,
					station.stationId,
					station.environment,
					yardId,
				)) {
					setManagedResourceEnabled(
						options.hoboHome,
						station.stationId,
						station.environment,
						campId,
						true,
					);
				}
				if (id.endsWith(":flow")) {
					setManagedResourceEnabled(
						options.hoboHome,
						station.stationId,
						station.environment,
						id,
						true,
					);
				}
				return;
			}
			if (isCodeOccupancyTarget(id)) {
				setManagedResourceEnabled(
					options.hoboHome,
					station.stationId,
					station.environment,
					id,
					true,
				);
				if (id === CODE_CAMP_ID) {
					setManagedResourceEnabled(
						options.hoboHome,
						station.stationId,
						station.environment,
						CODE_CAMP_ID,
						true,
					);
				}
				await options.sidecar?.start(
					id === CODE_CAMP_ID || id === CODE_BINDLE_ID ? "dashboard" : id,
				);
				if (id === CODE_CAMP_ID || id === CODE_BINDLE_ID) {
					await options.sidecar?.start("otlp");
					await options.sidecar?.start("evidence");
					await options.sidecar?.start("rollout");
					await options.sidecar?.start("experiment");
					await options.sidecar?.start("kms");
					await options.sidecar?.start("history");
				}
				return;
			}
			if (controlsNamedEndpointPlane(id) || controlsCampPlane(id)) {
				setManagedResourceEnabled(
					options.hoboHome,
					station.stationId,
					station.environment,
					id,
					true,
				);
				return;
			}
			if (!controlsBindleProcess(id)) {
				setManagedResourceEnabled(
					options.hoboHome,
					station.stationId,
					station.environment,
					id,
					true,
				);
				return;
			}
			if (
				!occupancyFlowIsActive(
					options.hoboHome,
					station.stationId,
					station.environment,
				)
			) {
				throw new Error(
					"Yard flow is halted — start yard:local:flow to resume traffic",
				);
			}
			const campId = campIdForResource(id);
			if (
				!occupancyCampIsActive(
					options.hoboHome,
					station.stationId,
					station.environment,
					campId,
				)
			) {
				throw new Error(
					`Camp is halted — start ${campId} to run Bindle resources`,
				);
			}
			setManagedResourceEnabled(
				options.hoboHome,
				station.stationId,
				station.environment,
				id,
				true,
			);
			const key = occupancyKey(options.hoboHome, station.environment);
			const existing = live.get(key);
			if (existing) return;
			const projectDir = resolveProjectDir(
				options.hoboHome,
				station.stationId,
				station.environment,
				options.projectRoot,
			);
			if (projectDir === undefined) {
				throw new Error(
					'No Bindle to start. Say "create a hello world app" first.',
				);
			}
			const bindleName =
				inspectBindleProject(projectDir)?.name ??
				(id.startsWith("bindle:")
					? id.slice("bindle:".length)
					: (projectDir.split(/[/\\]/u).at(-1) ?? "app"));
			const session = await startDev({
				projectDir,
				hoboHome: options.hoboHome,
				appPort: 0,
				debugPort: 0,
				env: {
					...env,
					HOBO_STATION: station.stationId,
					HOBO_TENANT: station.tenant,
					HOBO_ENV: station.environment,
				},
				stationId: station.stationId,
				tenant: station.tenant,
				environment: station.environment,
			});
			live.set(key, session);
			recordDevDeployment({
				hoboHome: options.hoboHome,
				scope: {
					stationId: station.stationId,
					tenant: station.tenant,
					environment: station.environment,
					...(station.project ? { project: station.project } : undefined),
					...(station.branch ? { branch: station.branch } : undefined),
				},
				bindleName,
				projectDir,
				appUrl: session.appUrl,
				debugUrl: session.debugUrl,
				controlsUrl: session.controlsUrl,
				reportUrl: session.reportUrl,
				...(session.namedUrl !== undefined
					? { namedUrl: session.namedUrl }
					: undefined),
			});
			persistOccupancyRun({
				hoboHome: options.hoboHome,
				stationId: station.stationId,
				environment: station.environment,
				projectDir,
				bindleName,
				...(session.pid !== undefined ? { pid: session.pid } : undefined),
				sessionId: session.sessionId,
			});
		},
		async stop(id) {
			if (isHostStationStack(id)) {
				throw new Error(HOST_STATION_REFUSED);
			}
			if (isOccupancySidecar(id)) {
				throw new Error(HOST_STATION_SIDECAR_REFUSED);
			}
			const station = view();
			if (controlsOccupancyFlow(id)) {
				setOccupancyFlowActive(
					options.hoboHome,
					station.stationId,
					station.environment,
					false,
				);
				const yardId = id.endsWith(":flow") ? id.slice(0, -":flow".length) : id;
				for (const campId of campsInYard(
					options.hoboHome,
					station.stationId,
					station.environment,
					yardId,
				)) {
					if (campId === CODE_CAMP_ID) continue;
					setManagedResourceEnabled(
						options.hoboHome,
						station.stationId,
						station.environment,
						campId,
						false,
					);
				}
				if (id.endsWith(":flow")) {
					setManagedResourceEnabled(
						options.hoboHome,
						station.stationId,
						station.environment,
						id,
						false,
					);
				}
				await stopBindleProcess(
					options.hoboHome,
					station.stationId,
					station.environment,
				);
				return;
			}
			if (isCodeOccupancyTarget(id)) {
				setManagedResourceEnabled(
					options.hoboHome,
					station.stationId,
					station.environment,
					id,
					false,
				);
				if (id === CODE_CAMP_ID || id === CODE_BINDLE_ID) {
					await options.sidecar?.stop("dashboard");
					await options.sidecar?.stop("otlp");
					await options.sidecar?.stop("evidence");
					await options.sidecar?.stop("rollout");
					await options.sidecar?.stop("experiment");
					await options.sidecar?.stop("kms");
					await options.sidecar?.stop("history");
					return;
				}
				await options.sidecar?.stop(id);
				return;
			}
			if (controlsNamedEndpointPlane(id) || controlsCampPlane(id)) {
				setManagedResourceEnabled(
					options.hoboHome,
					station.stationId,
					station.environment,
					id,
					false,
				);
				if (controlsCampPlane(id) && id !== CODE_CAMP_ID) {
					await stopBindleProcess(
						options.hoboHome,
						station.stationId,
						station.environment,
					);
				}
				return;
			}
			setManagedResourceEnabled(
				options.hoboHome,
				station.stationId,
				station.environment,
				id,
				false,
			);
			if (isProcessBackedResource(id)) {
				await stopBindleProcess(
					options.hoboHome,
					station.stationId,
					station.environment,
				);
			}
		},
	};
}

async function stopBindleProcess(
	hoboHome: string,
	stationId: string,
	environment: string,
): Promise<void> {
	const key = occupancyKey(hoboHome, environment);
	const session = live.get(key);
	if (session) {
		await session.close();
		live.delete(key);
	} else {
		const record = readRun(runPath(hoboHome, stationId, environment));
		if (record?.pid !== undefined) {
			try {
				process.kill(record.pid, "SIGTERM");
			} catch {
				// already gone
			}
		}
	}
	const path = runPath(hoboHome, stationId, environment);
	if (existsSync(path)) {
		try {
			unlinkSync(path);
		} catch {
			// best-effort
		}
	}
}

function resolveProjectDir(
	hoboHome: string,
	stationId: string,
	environment: string,
	projectRoot?: string,
): string | undefined {
	const record = readRun(runPath(hoboHome, stationId, environment));
	const bindle = readBindleProjectDir(hoboHome, stationId, environment);
	const preferred = record?.projectDir ?? bindle ?? projectRoot;
	if (preferred && resolveRunnableProject(preferred)) return preferred;
	if (projectRoot) return resolveRunnableProject(projectRoot);
	return resolveRunnableProject(process.cwd(), projectRoot);
}
