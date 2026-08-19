/**
 * Station auth for hobo-code (app-building agent), Copilot-CLI-like flow.
 *
 * - Local Station: auto-resolve / init, no browser dance.
 * - Remote: tenant + domain required; device-code style login.
 *
 * Not a control-plane management CLI — only binds the coding agent to a Station.
 */
import { createHash, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { first } from "@hobo/core/total-access";
import {
	createStationClient,
	initStation,
	listStationIds,
} from "@hobo/stations";

// public-contract: active coding-agent station session
export const CODE_AUTH_SESSION_SCHEMA = "hobo.code.auth.session/v1" as const;

export type CodeAuthMode = "local" | "remote";

export type CodeAuthSession = {
	readonly schema: typeof CODE_AUTH_SESSION_SCHEMA;
	readonly stationId: string;
	readonly tenant: string;
	/** Remote station host/domain (e.g. stations.example.com). Absent for local. */
	readonly domain?: string;
	readonly mode: CodeAuthMode;
	readonly displayName: string;
	readonly loggedInAt: string;
	/** Opaque session token ref (never a live secret material in agent context). */
	readonly sessionRef: string;
};

export type AuthLoginInput = {
	readonly hoboHome: string;
	readonly tenant?: string;
	readonly domain?: string;
	readonly stationId?: string;
	/** Prefer auto-init of local station when none exists (default true). */
	readonly autoInitLocal?: boolean;
	/**
	 * Complete remote device-code without interactive wait (tests / CI).
	 * Production remote login returns pending until confirmRemoteLogin.
	 */
	readonly completeRemoteImmediately?: boolean;
};

export type AuthLoginResult =
	| {
			readonly ok: true;
			readonly status: "logged-in";
			readonly session: CodeAuthSession;
			readonly message: string;
	  }
	| {
			readonly ok: true;
			readonly status: "device-code-pending";
			readonly userCode: string;
			readonly verificationUrl: string;
			readonly expiresAt: string;
			readonly message: string;
			readonly pendingPath: string;
	  }
	| {
			readonly ok: false;
			readonly status: "failed";
			readonly code: string;
			readonly message: string;
			readonly remediation: readonly string[];
	  };

function sessionsDir(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "auth");
}

export function authSessionPath(hoboHome: string): string {
	return join(sessionsDir(hoboHome), "session.json");
}

function pendingPath(hoboHome: string): string {
	return join(sessionsDir(hoboHome), "pending-device.json");
}

function nowIso(): string {
	return new Date().toISOString();
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function sessionRefFor(stationId: string, tenant: string): string {
	const digest = createHash("sha256")
		.update(`${stationId}\0${tenant}\0${randomBytes(8).toString("hex")}`)
		.digest("hex")
		.slice(0, 16);
	return `sess_${digest}`;
}

function tryLocalStation(
	hoboHome: string,
	stationId: string,
): { stationId: string; railHash?: string } | null {
	try {
		const client = createStationClient({ hoboHome, stationId });
		const pins = client.pins();
		return { stationId: pins.stationId, railHash: pins.railHash };
	} catch {
		return null;
	}
}

/**
 * Resolve which Station to use for login.
 * Local-first: existing local stations, else station:local.
 */
export function resolveStationTarget(input: {
	readonly hoboHome: string;
	readonly stationId?: string;
	readonly tenant?: string;
	readonly domain?: string;
}):
	| { mode: "local"; stationId: string; tenant: string }
	| { mode: "remote"; stationId: string; tenant: string; domain: string }
	| { mode: "error"; message: string; remediation: readonly string[] } {
	const tenant = (input.tenant ?? "local").trim() || "local";
	const domain = input.domain?.trim();

	if (domain && domain.length > 0) {
		if (!input.tenant || input.tenant === "local") {
			return {
				mode: "error",
				message: "remote login requires --tenant <id> with --domain <host>",
				remediation: [
					"hobo-code auth login --tenant <tenant> --domain stations.example.com",
					"hobo-code auth login   # local station (auto)",
				],
			};
		}
		const stationId =
			input.stationId ??
			`station:${input.tenant}@${domain.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
		return { mode: "remote", stationId, tenant: input.tenant, domain };
	}

	// Local path
	const ids = listStationIds(input.hoboHome);
	if (input.stationId) {
		return { mode: "local", stationId: input.stationId, tenant };
	}
	if (ids.includes("station:local")) {
		return { mode: "local", stationId: "station:local", tenant };
	}
	if (ids.length === 1) {
		return { mode: "local", stationId: first(ids), tenant };
	}
	if (ids.length > 1) {
		// Prefer station:local name fragment, else first
		const preferred =
			ids.find((id) => id.endsWith(":local") || id.includes("local")) ??
			first(ids);
		return { mode: "local", stationId: preferred, tenant };
	}
	return { mode: "local", stationId: "station:local", tenant };
}

export function readAuthSession(hoboHome: string): CodeAuthSession | null {
	const raw = readJson<CodeAuthSession>(authSessionPath(hoboHome));
	if (!raw || raw.schema !== CODE_AUTH_SESSION_SCHEMA) return null;
	return raw;
}

export function clearAuthSession(hoboHome: string): boolean {
	const path = authSessionPath(hoboHome);
	if (!existsSync(path)) return false;
	unlinkSync(path);
	return true;
}

function writeSession(hoboHome: string, session: CodeAuthSession): void {
	writeJson(authSessionPath(hoboHome), session);
}

/**
 * Login into a Station for the coding agent (Copilot-CLI-like).
 */
export function authLogin(input: AuthLoginInput): AuthLoginResult {
	const target = resolveStationTarget({
		hoboHome: input.hoboHome,
		...(input.stationId !== undefined ? { stationId: input.stationId } : {}),
		...(input.tenant !== undefined ? { tenant: input.tenant } : {}),
		...(input.domain !== undefined ? { domain: input.domain } : {}),
	});

	if (target.mode === "error") {
		return {
			ok: false,
			status: "failed",
			code: "HOBO_CODE_AUTH_USAGE",
			message: target.message,
			remediation: target.remediation,
		};
	}

	if (target.mode === "local") {
		let bound = tryLocalStation(input.hoboHome, target.stationId);
		if (!bound && input.autoInitLocal !== false) {
			const name = target.stationId.replace(/^station:/, "") || "local";
			const id = target.stationId.startsWith("station:")
				? target.stationId
				: `station:${name}`;
			initStation({
				hoboHome: input.hoboHome,
				name,
				id,
				tenant: target.tenant,
			});
			bound = tryLocalStation(input.hoboHome, id);
		}
		if (!bound) {
			return {
				ok: false,
				status: "failed",
				code: "HOBO_CODE_AUTH_NO_STATION",
				message: `no local station at ${target.stationId}`,
				remediation: [
					"hobo-code auth login",
					"hobo station init   # ops setup if needed",
				],
			};
		}
		const session: CodeAuthSession = {
			schema: CODE_AUTH_SESSION_SCHEMA,
			stationId: bound.stationId,
			tenant: target.tenant,
			mode: "local",
			displayName: bound.stationId.replace(/^station:/, ""),
			loggedInAt: nowIso(),
			sessionRef: sessionRefFor(bound.stationId, target.tenant),
		};
		writeSession(input.hoboHome, session);
		return {
			ok: true,
			status: "logged-in",
			session,
			message: `Logged in to local station ${session.stationId} as tenant ${session.tenant}`,
		};
	}

	// Remote: device-code style (Copilot / gh auth login --web analogue)
	const userCode = randomBytes(3).toString("hex").toUpperCase();
	const formatted = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
	const verificationUrl = `https://${target.domain}/device`;
	const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
	const pending = {
		schema: "hobo.code.auth.pending/v1",
		userCode: formatted,
		verificationUrl,
		stationId: target.stationId,
		tenant: target.tenant,
		domain: target.domain,
		expiresAt,
		createdAt: nowIso(),
	};
	writeJson(pendingPath(input.hoboHome), pending);

	if (input.completeRemoteImmediately) {
		return confirmRemoteLogin({
			hoboHome: input.hoboHome,
			userCode: formatted,
		});
	}

	return {
		ok: true,
		status: "device-code-pending",
		userCode: formatted,
		verificationUrl,
		expiresAt,
		pendingPath: pendingPath(input.hoboHome),
		message: [
			"Authenticate remote station (device code)",
			"",
			`  First copy your one-time code: ${formatted}`,
			`  Then open: ${verificationUrl}`,
			"",
			"After authorizing in the browser, run:",
			`  hobo-code auth login --complete ${formatted}`,
		].join("\n"),
	};
}

/**
 * Complete a pending remote device-code login (after browser authorize).
 */
export function confirmRemoteLogin(input: {
	readonly hoboHome: string;
	readonly userCode: string;
}): AuthLoginResult {
	const pending = readJson<{
		userCode: string;
		stationId: string;
		tenant: string;
		domain: string;
		expiresAt: string;
	}>(pendingPath(input.hoboHome));
	if (!pending) {
		return {
			ok: false,
			status: "failed",
			code: "HOBO_CODE_AUTH_NO_PENDING",
			message: "no pending device-code login",
			remediation: [
				"hobo-code auth login --tenant <t> --domain stations.example.com",
			],
		};
	}
	const normalized = input.userCode.trim().toUpperCase().replace(/\s+/g, "");
	const expected = pending.userCode.toUpperCase().replace(/\s+/g, "");
	if (normalized !== expected) {
		return {
			ok: false,
			status: "failed",
			code: "HOBO_CODE_AUTH_CODE_MISMATCH",
			message: "device code does not match pending login",
			remediation: ["check the code from the prior auth login output"],
		};
	}
	if (Date.parse(pending.expiresAt) < Date.now()) {
		return {
			ok: false,
			status: "failed",
			code: "HOBO_CODE_AUTH_EXPIRED",
			message: "device code expired — start login again",
			remediation: [
				`hobo-code auth login --tenant ${pending.tenant} --domain ${pending.domain}`,
			],
		};
	}

	const session: CodeAuthSession = {
		schema: CODE_AUTH_SESSION_SCHEMA,
		stationId: pending.stationId,
		tenant: pending.tenant,
		domain: pending.domain,
		mode: "remote",
		displayName: `${pending.tenant}@${pending.domain}`,
		loggedInAt: nowIso(),
		sessionRef: sessionRefFor(pending.stationId, pending.tenant),
	};
	writeSession(input.hoboHome, session);
	try {
		unlinkSync(pendingPath(input.hoboHome));
	} catch {
		/* ignore */
	}
	return {
		ok: true,
		status: "logged-in",
		session,
		message: `Logged in to station ${session.stationId} (${session.displayName})`,
	};
}

export function authStatus(hoboHome: string): {
	readonly loggedIn: boolean;
	readonly session: CodeAuthSession | null;
	readonly message: string;
} {
	const session = readAuthSession(hoboHome);
	if (!session) {
		return {
			loggedIn: false,
			session: null,
			message: "Not logged in — run: hobo-code auth login",
		};
	}
	return {
		loggedIn: true,
		session,
		message:
			session.mode === "local"
				? `Logged in · local · ${session.stationId} · tenant ${session.tenant}`
				: `Logged in · remote · ${session.displayName} · ${session.stationId}`,
	};
}

/** Station id for coding session: auth session first, else local default. */
export function resolveAuthenticatedStationId(
	hoboHome: string,
): string | undefined {
	return readAuthSession(hoboHome)?.stationId;
}
