#!/usr/bin/env node
/**
 * Higgsfield MCP auth — device flow, refresh, and Claude Code wiring.
 *
 * Why this exists: Higgsfield offers two OAuth flows, selected by client
 * capability. Claude Code advertises itself as redirect-capable (`claude-code`
 * is in their `potential_clients`), so it picks authorization_code_pkce, which
 * needs `localhost:<port>` pre-registered with their Clerk tenant. It is not —
 * so the handshake fails with "redirect_uri does not match any of the OAuth
 * 2.0 Client's pre-registered redirect urls", from both the Clerk URL and
 * Higgsfield's own proxy.
 *
 * Their `device_code` flow exists for exactly this ("client cannot receive
 * authorization-code redirects"). Its endpoints are not published under any
 * standard `.well-known` path — they are only in the service's OpenAPI spec.
 * This drives that flow and installs the result as a plain Bearer header, which
 * sidesteps the broken handshake entirely.
 */

import { spawn } from "node:child_process";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const AUTH = "https://fnf-device-auth.higgsfield.ai";
const MCP_URL = "https://mcp.higgsfield.ai/mcp";
const DIR = join(homedir(), ".higgsfield");
const STORE = join(DIR, "token.json");
const LOCK = join(DIR, "daemon.lock");
const LOG = join(DIR, "daemon.log");
const CLAUDE_CFG = join(homedir(), ".claude.json");
/** Refresh this far before expiry rather than after a 401. */
const SKEW_S = 300;
/** Never sleep longer than this, so a suspended laptop wakes to a fresh check. */
const MAX_SLEEP_MS = 15 * 60 * 1000;

const post = async (path, body) => {
	const res = await fetch(`${AUTH}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
	}
	if (!res.ok && !json.access_token) {
		throw new Error(`${path} failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
	}
	return json;
};

function readStore() {
	try {
		return JSON.parse(readFileSync(STORE, "utf8"));
	} catch {
		return null;
	}
}

/**
 * Persist atomically, 0600.
 *
 * Atomic because the refresh token **rotates on every refresh**: a torn write
 * loses the only credential that can mint the next one, and the fix is a full
 * re-login. Rename is the cheapest way to make that impossible.
 */
function writeStore(tok) {
	mkdirSync(dirname(STORE), { recursive: true, mode: 0o700 });
	const saved = {
		...tok,
		obtained_at: Math.floor(Date.now() / 1000),
		access_expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600),
	};
	const tmp = `${STORE}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
	renameSync(tmp, STORE);
	chmodSync(STORE, 0o600);
	return saved;
}

/** Install the bearer header into Claude Code's user-scope config. */
function wireClaude(accessToken) {
	const cfg = JSON.parse(readFileSync(CLAUDE_CFG, "utf8"));
	cfg.mcpServers ??= {};
	cfg.mcpServers.higgsfield = {
		type: "http",
		url: MCP_URL,
		headers: { Authorization: `Bearer ${accessToken}` },
	};
	const tmp = `${CLAUDE_CFG}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
	renameSync(tmp, CLAUDE_CFG);
}

async function verify(accessToken) {
	const res = await fetch(MCP_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "hf-auth", version: "1" },
			},
		}),
	});
	return res.status;
}

async function login() {
	const start = await post("/authorize", {});
	console.log("\nOpen this and approve:\n");
	console.log(`  ${start.verification_uri}\n`);
	console.log(`Expires in ${Math.floor(start.expires_in / 60)} minutes. Waiting…`);
	const deadline = Date.now() + start.expires_in * 1000;
	const interval = (start.interval ?? 3) * 1000;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, interval));
		try {
			const tok = await post("/token", { device_code: start.device_code });
			if (tok.access_token) {
				const saved = writeStore(tok);
				wireClaude(tok.access_token);
				const status = await verify(tok.access_token);
				console.log(`\nAuthorized. MCP initialize -> HTTP ${status}`);
				console.log(`Token stored ${STORE} (0600), expires in ${saved.expires_in}s.`);
				console.log("Restart Claude Code to load the tools.");
				return 0;
			}
		} catch {
			/* still pending — the endpoint 4xxs until approval */
		}
	}
	console.error("Timed out waiting for approval.");
	return 1;
}

async function refresh() {
	const cur = readStore();
	if (!cur?.refresh_token) {
		console.error("No stored refresh token. Run: login");
		return 1;
	}
	// A dead refresh token 401s rather than returning a body, so this has to
	// catch, not inspect. It surfaced by crashing with a stack trace the first
	// time — the actionable line never printed, which is the opposite of what
	// this script is for.
	let tok;
	try {
		tok = await post("/refresh", { refresh_token: cur.refresh_token });
	} catch (err) {
		const msg = String(err?.message ?? err);
		if (msg.includes("invalid_refresh_token") || msg.includes("(401)")) {
			console.error(
				"Refresh rejected: the stored refresh token is no longer valid.\n" +
					"These rotate on every use, so this happens if one was consumed\n" +
					"outside this script (a stray curl) or it simply expired.\n\n" +
					"Fix: node .claude/skills/higgsfield-auth/scripts/hf-auth.mjs login",
			);
			return 1;
		}
		console.error(`Refresh failed: ${msg}`);
		return 1;
	}
	if (!tok.access_token) {
		console.error("Refresh returned no access token. Run: login");
		return 1;
	}
	// The response carries a NEW refresh_token and the old one stops working.
	// Persisting before wiring means a crash costs a rerun, not a re-login.
	const saved = writeStore(tok);
	wireClaude(tok.access_token);
	const status = await verify(tok.access_token);
	console.log(`Refreshed. MCP initialize -> HTTP ${status}, valid ${saved.expires_in}s.`);
	return status === 200 ? 0 : 1;
}

function status() {
	const cur = readStore();
	if (!cur) {
		console.log("no token stored — run: login");
		return 1;
	}
	const left = (cur.access_expires_at ?? 0) - Math.floor(Date.now() / 1000);
	console.log(`access token: ${left > 0 ? `valid ${left}s` : `EXPIRED ${-left}s ago`}`);
	const rleft = (cur.obtained_at ?? 0) + (cur.refresh_expires_in ?? 0) - Math.floor(Date.now() / 1000);
	console.log(
		`refresh token: ${cur.refresh_token ? `present, valid ${Math.floor(rleft / 3600)}h` : "MISSING"}`,
	);
	const holder = lockHolder();
	console.log(`daemon: ${holder !== null ? `running (pid ${holder})` : "not running"}`);
	console.log(`store: ${STORE}`);
	return left > SKEW_S ? 0 : 2;
}

/** The one to call from automation: refresh only when it is actually needed. */
async function ensure() {
	const cur = readStore();
	const left = (cur?.access_expires_at ?? 0) - Math.floor(Date.now() / 1000);
	if (!cur?.refresh_token) {
		console.error("no usable token — run: login");
		return 1;
	}
	// Refresh first if it is due, so the caller proceeds with a live token…
	let code = 0;
	if (left <= SKEW_S) {
		code = await refresh();
		if (code !== 0) return code;
	} else {
		console.log(`token valid for ${left}s`);
	}
	// …then make sure something keeps it that way without being asked again.
	if (lockHolder() === null) daemonStart();
	return code;
}

function log(line) {
	try {
		mkdirSync(DIR, { recursive: true, mode: 0o700 });
		appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
	} catch {
		/* logging must never take the daemon down */
	}
}

/** Is the process holding the lock still alive? */
function lockHolder() {
	if (!existsSync(LOCK)) return null;
	const pid = Number.parseInt(readFileSync(LOCK, "utf8").trim(), 10);
	if (!Number.isInteger(pid) || pid <= 0) return null;
	try {
		process.kill(pid, 0);
		return pid;
	} catch (err) {
		// EPERM means it exists under another user — still alive.
		return err?.code === "EPERM" ? pid : null;
	}
}

/**
 * Claim single-instance, atomically.
 *
 * This is the whole reason the daemon needs a lock. Refresh tokens rotate, so
 * two loops would each consume the other's newly-minted token and the second
 * refresh of the pair would 401 — breaking the chain and forcing an
 * interactive login. One writer, always.
 */
function claimLock() {
	mkdirSync(DIR, { recursive: true, mode: 0o700 });
	const holder = lockHolder();
	if (holder !== null) return holder === process.pid ? true : false;
	try {
		writeFileSync(LOCK, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
		return true;
	} catch {
		// Lost a race, or a stale file we could not replace — take it over only
		// when nobody holds it.
		if (lockHolder() !== null) return false;
		rmSync(LOCK, { force: true });
		try {
			writeFileSync(LOCK, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
			return true;
		} catch {
			return false;
		}
	}
}

const releaseLock = () => {
	try {
		if (lockHolder() === process.pid) rmSync(LOCK, { force: true });
	} catch {
		/* going away anyway */
	}
};

/** The loop: sleep until shortly before expiry, refresh, repeat. */
async function daemonLoop() {
	if (!claimLock()) {
		log(`another daemon holds the lock (pid ${lockHolder()}) — exiting`);
		return 0;
	}
	for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
		process.once(sig, () => {
			log(`received ${sig} — releasing lock`);
			releaseLock();
			process.exit(0);
		});
	}
	process.once("exit", releaseLock);
	log(`daemon started (pid ${process.pid})`);

	for (;;) {
		const cur = readStore();
		if (!cur?.refresh_token) {
			log("no refresh token — login required; daemon exiting");
			return 1;
		}
		const left = (cur.access_expires_at ?? 0) - Math.floor(Date.now() / 1000);
		if (left > SKEW_S) {
			// Cap the sleep: a laptop suspended across the wake time would
			// otherwise oversleep straight past expiry.
			const wait = Math.min((left - SKEW_S) * 1000, MAX_SLEEP_MS);
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		try {
			const tok = await post("/refresh", { refresh_token: cur.refresh_token });
			if (!tok.access_token) throw new Error("no access_token in response");
			const saved = writeStore(tok);
			wireClaude(tok.access_token);
			const status = await verify(tok.access_token);
			log(`refreshed — initialize HTTP ${status}, valid ${saved.expires_in}s`);
			if (status !== 200) log(`WARNING: token refreshed but MCP returned ${status}`);
		} catch (err) {
			const msg = String(err?.message ?? err);
			log(`refresh failed: ${msg}`);
			if (msg.includes("invalid_refresh_token") || msg.includes("(401)")) {
				log("refresh token is dead — run `login`; daemon exiting");
				return 1;
			}
			// Transient (network, 5xx): back off and try again rather than dying.
			await new Promise((r) => setTimeout(r, 60_000));
		}
	}
}

/** Spawn the loop detached so it outlives this process and the shell. */
function daemonStart() {
	const holder = lockHolder();
	if (holder !== null) {
		console.log(`daemon already running (pid ${holder})`);
		return 0;
	}
	if (!readStore()?.refresh_token) {
		console.error("no refresh token — run `login` first");
		return 1;
	}
	const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "daemon-run"], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	console.log(`daemon started (pid ${child.pid}) — log: ${LOG}`);
	return 0;
}

function daemonStop() {
	const holder = lockHolder();
	if (holder === null) {
		console.log("no daemon running");
		rmSync(LOCK, { force: true });
		return 0;
	}
	try {
		process.kill(holder, "SIGTERM");
		console.log(`stopped daemon (pid ${holder})`);
	} catch (err) {
		console.error(`could not stop pid ${holder}: ${err?.message ?? err}`);
		return 1;
	}
	return 0;
}

const cmd = process.argv[2] ?? "ensure";
const run = {
	login,
	refresh,
	ensure,
	status: async () => status(),
	start: async () => daemonStart(),
	stop: async () => daemonStop(),
	"daemon-run": daemonLoop,
}[cmd];
if (!run) {
	console.error("usage: hf-auth.mjs [login|refresh|ensure|status|start|stop]");
	process.exit(64);
}
process.exit(await run());
