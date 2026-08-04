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

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const AUTH = "https://fnf-device-auth.higgsfield.ai";
const MCP_URL = "https://mcp.higgsfield.ai/mcp";
const STORE = join(homedir(), ".higgsfield", "token.json");
const CLAUDE_CFG = join(homedir(), ".claude.json");
/** Refresh this far before expiry rather than after a 401. */
const SKEW_S = 300;

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
	console.log(`refresh token: ${cur.refresh_token ? "present" : "MISSING"}`);
	console.log(`store: ${STORE}`);
    return left > SKEW_S ? 0 : 2;
}

/** The one to call from automation: refresh only when it is actually needed. */
async function ensure() {
	const cur = readStore();
	const left = (cur?.access_expires_at ?? 0) - Math.floor(Date.now() / 1000);
	if (cur && left > SKEW_S) {
		console.log(`token valid for ${left}s — nothing to do`);
		return 0;
	}
	if (!cur?.refresh_token) {
		console.error("no usable token — run: login");
		return 1;
	}
	return refresh();
}

const cmd = process.argv[2] ?? "ensure";
const run = { login, refresh, ensure, status: async () => status() }[cmd];
if (!run) {
	console.error("usage: hf-auth.mjs [login|refresh|ensure|status]");
	process.exit(64);
}
process.exit(await run());
