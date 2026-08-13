import { createStationClient } from "@hobo/stations";

import { authLogin, type CodeAuthMode, readAuthSession } from "./auth.js";

export type StationSessionMode = CodeAuthMode | "none";

export interface AuthedStationView {
	readonly loggedIn: boolean;
	readonly stationId: string;
	readonly displayName: string;
	readonly tenant: string;
	readonly mode: StationSessionMode;
	readonly environment: string;
	readonly project?: string;
	readonly branch?: string;
	readonly railHash?: string;
	readonly occupancyStatus?: string;
	readonly message: string;
}

export interface DescribeAuthedStationOptions {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	/** Write a local session when none exists (interactive /dev). */
	readonly ensureLocalLogin?: boolean;
}

function occupancyFor(
	hoboHome: string,
	stationId: string,
): {
	readonly tenant?: string;
	readonly isolationClass?: string;
	readonly status?: string;
	readonly railHash?: string;
} | null {
	try {
		const occupancy = createStationClient({ hoboHome, stationId }).occupancy();
		return {
			tenant: occupancy.isolation.tenant,
			...(occupancy.isolation.isolationClass !== undefined
				? { isolationClass: occupancy.isolation.isolationClass }
				: {}),
			status: occupancy.status,
			...(occupancy.activeRailHash !== undefined
				? { railHash: occupancy.activeRailHash }
				: {}),
		};
	} catch {
		return null;
	}
}

function environmentOf(
	env: NodeJS.ProcessEnv,
	isolationClass: string | undefined,
	mode: StationSessionMode,
): string {
	const fromEnv = env.HOBO_ENV?.trim();
	if (fromEnv) return fromEnv;
	if (isolationClass) return isolationClass;
	if (mode === "local") return "local-dev";
	return "unknown";
}

/** Snapshot of the coding-agent Station login plus occupancy environment. */
export function describeAuthedStationSession(
	options: DescribeAuthedStationOptions,
): AuthedStationView {
	const env = options.env ?? process.env;
	let session = readAuthSession(options.hoboHome);
	if (!session && options.ensureLocalLogin === true) {
		const login = authLogin({
			hoboHome: options.hoboHome,
			...(typeof env.HOBO_TENANT === "string" && env.HOBO_TENANT.trim() !== ""
				? { tenant: env.HOBO_TENANT }
				: {}),
			autoInitLocal: true,
		});
		if (login.ok && login.status === "logged-in") session = login.session;
	}

	const project = env.HOBO_PROJECT?.trim();
	const branch = (env.HOBO_BRANCH ?? env.GIT_BRANCH)?.trim();

	if (!session) {
		return {
			loggedIn: false,
			stationId: "",
			displayName: "",
			tenant: env.HOBO_TENANT?.trim() || "local",
			mode: "none",
			environment: environmentOf(env, undefined, "none"),
			...(project ? { project } : {}),
			...(branch ? { branch } : {}),
			message: "Not logged in — run: hobo-code auth login",
		};
	}

	const occupancy = occupancyFor(options.hoboHome, session.stationId);
	const environment = environmentOf(
		env,
		occupancy?.isolationClass,
		session.mode,
	);
	return {
		loggedIn: true,
		stationId: session.stationId,
		displayName: session.displayName,
		tenant: occupancy?.tenant ?? session.tenant,
		mode: session.mode,
		environment,
		...(project ? { project } : {}),
		...(branch ? { branch } : {}),
		...(occupancy?.railHash !== undefined
			? { railHash: occupancy.railHash }
			: {}),
		...(occupancy?.status !== undefined
			? { occupancyStatus: occupancy.status }
			: {}),
		message:
			session.mode === "local"
				? `Logged in · local · ${session.stationId} · env ${environment}`
				: `Logged in · remote · ${session.displayName} · ${session.stationId} · env ${environment}`,
	};
}

/** Compact strap chips: station id/name plus the occupancy environment. */
export function formatStationStrap(view: AuthedStationView): readonly string[] {
	if (!view.loggedIn) return ["auth:out"];
	return [`${view.displayName}@${view.environment}`];
}

/** Tab-status block with the logged-in Station and its environment. */
export function formatStationStatusBlock(view: AuthedStationView): string {
	if (!view.loggedIn) {
		return ["Station  (not logged in)", `  next     ${view.message}`].join(
			"\n",
		);
	}
	return [
		`Station  ${view.displayName}`,
		`  id       ${view.stationId}`,
		`  name     ${view.displayName}`,
		`  tenant   ${view.tenant}`,
		`  mode     ${view.mode}`,
		`  env      ${view.environment}`,
		...(view.project ? [`  project  ${view.project}`] : []),
		...(view.branch ? [`  branch   ${view.branch}`] : []),
		...(view.occupancyStatus ? [`  occupancy ${view.occupancyStatus}`] : []),
		...(view.railHash ? [`  rail     ${view.railHash}`] : []),
	].join("\n");
}

/** Env passed to `hobo dev` so the Yard binds the authed Station. */
export function stationDevEnv(
	view: AuthedStationView,
): Readonly<Record<string, string>> {
	if (!view.loggedIn || view.stationId.length === 0) return {};
	return {
		HOBO_STATION: view.stationId,
		HOBO_TENANT: view.tenant,
		HOBO_ENV: view.environment,
		...(view.project ? { HOBO_PROJECT: view.project } : {}),
		...(view.branch ? { HOBO_BRANCH: view.branch } : {}),
	};
}
