/**
 * Agent-native surface: human-free auth, unattended/no-elicitation contract,
 * self-improve / durable lessons, and protocol inventory (MCP, ACP, stdio).
 *
 * SOTA anchors (see persona research snapshot):
 * - MCP Authorization 2025-11-25 (OAuth 2.1 + PKCE for HTTP; stdio = env creds)
 * - ACP (JSON-RPC 2.0 over stdio; editor spawns agent)
 * - RFC 8628 / CIBA as human bootstrap residual, not agent steady-state
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { authSessionPath, type CodeAuthSession } from "./auth.js";
import { createHarnessCore } from "./harness.js";
import { inspectHarnessSurface } from "./harness-surface.js";

// public-contract: agent-native readiness inventory
export const CODE_AGENT_SCHEMA = "hobo.code.agent/v1" as const;

export type ProtocolStatus = "wired" | "partial" | "residual" | "env-only";

export type AgentAuthModeCard = {
	readonly id: string;
	readonly status: ProtocolStatus;
	readonly humanInLoop: boolean;
	readonly summary: string;
	readonly try: string;
	readonly standards: readonly string[];
};

export type AgentProtocolCard = {
	readonly id: string;
	readonly status: ProtocolStatus;
	readonly role: string;
	readonly transport: string;
	readonly try: string;
	readonly standards: readonly string[];
	readonly details?: readonly string[];
};

export type AgentSurfaceStatus = {
	readonly schema: typeof CODE_AGENT_SCHEMA;
	readonly agentMode: boolean;
	readonly humanFreeAuth: {
		readonly ready: boolean;
		readonly mode: string | null;
		readonly sessionPresent: boolean;
		readonly sessionRefPresent: boolean;
		readonly modes: readonly AgentAuthModeCard[];
	};
	readonly unattended: {
		readonly noElicitation: boolean;
		readonly jsonFirst: boolean;
		readonly safeIterate: readonly string[];
		readonly contract: readonly string[];
	};
	readonly selfImprove: {
		readonly loop: readonly string[];
		readonly durableLearning: string;
		readonly lessonsPathHint: string;
		readonly narrative: string;
	};
	readonly protocols: readonly AgentProtocolCard[];
	readonly mcpTools: readonly string[];
	readonly setupChecklist: readonly string[];
	readonly residual: readonly string[];
	readonly legend: string;
	readonly notes: readonly string[];
};

export type InspectAgentSurfaceInput = {
	readonly hoboHome: string;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
};

function envTruthy(env: NodeJS.ProcessEnv, name: string): boolean {
	const v = env[name];
	return v === "1" || v === "true" || v === "yes";
}

function sessionRefPresent(env: NodeJS.ProcessEnv, hoboHome: string): boolean {
	if (
		env.HOBO_CODE_SESSION_REF &&
		String(env.HOBO_CODE_SESSION_REF).length > 0
	) {
		return true;
	}
	if (
		env.HOBO_CODE_AGENT_TOKEN &&
		String(env.HOBO_CODE_AGENT_TOKEN).length > 0
	) {
		return true;
	}
	const p = authSessionPath(hoboHome);
	if (!existsSync(p)) return false;
	try {
		const s = JSON.parse(readFileSync(p, "utf8")) as Partial<CodeAuthSession>;
		return Boolean(s.sessionRef && s.stationId);
	} catch {
		return false;
	}
}

function readSession(hoboHome: string): CodeAuthSession | null {
	const p = authSessionPath(hoboHome);
	if (!existsSync(p)) return null;
	try {
		return JSON.parse(readFileSync(p, "utf8")) as CodeAuthSession;
	} catch {
		return null;
	}
}

/**
 * Inventory agent-native readiness for unattended coding agents.
 */
export function inspectAgentSurface(
	input: InspectAgentSurfaceInput,
): AgentSurfaceStatus {
	const env = input.env ?? process.env;
	const hoboHome = input.hoboHome;
	const cwd = input.cwd ?? process.cwd();
	const agentMode =
		envTruthy(env, "HOBO_CODE_AGENT") ||
		envTruthy(env, "HOBO_CODE_NO_ELICITATION") ||
		envTruthy(env, "CI");
	const session = readSession(hoboHome);
	const sessRef = sessionRefPresent(env, hoboHome);
	// eli5: local auto-resolve is ready when we are on a local session, or when
	// there is no session yet and `auth login --agent` can still create one.
	const localReady = session?.mode === "local" || session === null;

	const authModes: AgentAuthModeCard[] = [
		{
			id: "local-station-auto",
			status: localReady ? "wired" : "env-only",
			humanInLoop: false,
			summary:
				"Local Station auto-resolve / init — no browser (preferred agent steady-state).",
			try: "hobo-code auth login --agent",
			standards: ["HoBo Station local", "stdio MCP env credentials pattern"],
		},
		{
			id: "session-ref-env",
			status: sessRef ? "wired" : "env-only",
			humanInLoop: false,
			summary:
				"Pre-bound HOBO_CODE_SESSION_REF / durable session.json (values never printed).",
			try: "export HOBO_CODE_SESSION_REF=…  # or prior auth login",
			standards: [
				"MCP stdio credential-from-env",
				"session-ref least privilege",
			],
		},
		{
			id: "workload-client-credentials",
			status: "partial",
			humanInLoop: false,
			summary:
				"Agent-on-own-behalf OAuth client_credentials / workload identity (draft MCP ext-auth).",
			try: "hobo-code agent --json  # see residual; prefer local/session-ref today",
			standards: [
				"OAuth 2.1 client_credentials (draft)",
				"MCP ext-auth client credentials",
			],
		},
		{
			id: "device-code-human-bootstrap",
			status: "wired",
			humanInLoop: true,
			summary:
				"Remote tenant+domain device-code (RFC 8628-shaped) — human bootstrap residual, not agent steady-state.",
			try: "hobo-code auth login --tenant … --domain …",
			standards: ["RFC 8628 device authorization", "GHCP-like device code"],
		},
		{
			id: "ciba-headless-user",
			status: "residual",
			humanInLoop: true,
			summary:
				"CIBA backchannel user consent for headless clients (MCP non-interactive proposal).",
			try: "residual L — use session-ref or local Station",
			standards: ["OpenID CIBA Core", "MCP discussion non-interactive OAuth"],
		},
	];

	const humanFreeReady =
		Boolean(session?.mode === "local") || sessRef || (agentMode && !session); // agent path will auto local-login

	const worldRoot = join(hoboHome, "worlds");
	const harness = createHarnessCore({ worldRoot, projectRoot: cwd });
	const mcp = harness.exposeMcp();
	const harnessStatus = inspectHarnessSurface({ cwd, hoboHome });

	const protocols: AgentProtocolCard[] = [
		{
			id: "mcp",
			status: "wired",
			role: "agent ↔ tools/resources (Model Context Protocol)",
			transport: "stdio (local) · HTTP+OAuth2.1 remote residual",
			try: "hobo-code agent --json · tools[] · project .mcp.json",
			standards: [
				"MCP 2025-11-25",
				"OAuth 2.1 + PKCE (HTTP)",
				"RFC 9728 PRM",
				"stdio env credentials",
			],
			details: [...mcp.tools],
		},
		{
			id: "acp",
			status: "partial",
			role: "editor ↔ agent (Agent Client Protocol)",
			transport: "JSON-RPC 2.0 over stdio (editor spawns agent)",
			try: "hobo-code edit --bridge acp · hobo-code agent --json",
			standards: [
				"ACP (Zed/JetBrains)",
				"JSON-RPC 2.0 stdio",
				"agentclientprotocol.com",
			],
			details: [
				"Spawn contract: editor host runs hobo-code as ACP agent subprocess",
				"Partial host — prefer stdio-jsonrpc / tmux-send until full ACP methods land",
			],
		},
		{
			id: "stdio-jsonrpc",
			status: "wired",
			role: "CLI/plugin JSON bridge (open/status/edit)",
			transport: "stdio JSON lines",
			try: "hobo-code edit --bridge stdio-jsonrpc --json",
			standards: ["JSON-RPC-shaped lines", "hobo-code.nvim bridge"],
		},
		{
			id: "cli-json",
			status: "wired",
			role: "Unattended CLI contract for every verb",
			transport: "argv + --json stdout",
			try: "hobo-code <verb> --json",
			standards: ["exit codes", "HOBO_CODE_* codes", "remediation[]"],
		},
		{
			id: "a2a",
			status: "residual",
			role: "Agent-to-agent orchestration (Google A2A-class)",
			transport: "HTTP/gRPC residual",
			try: "residual L — use Eve subagents + MCP tools inside hobo-code",
			standards: ["A2A (industry)", "Eve filesystem subagents"],
		},
	];

	return {
		schema: CODE_AGENT_SCHEMA,
		agentMode,
		humanFreeAuth: {
			ready: humanFreeReady,
			mode:
				session?.mode ??
				(sessRef ? "session-ref" : agentMode ? "local-auto-pending" : null),
			sessionPresent: Boolean(session),
			sessionRefPresent: sessRef,
			modes: authModes,
		},
		unattended: {
			noElicitation: true,
			jsonFirst: true,
			safeIterate: [
				"hobo-code isolate --json",
				"hobo-code dispatch|scaffold … --json",
				"hobo-code session --json  # handback / persistence",
				"hobo-code promote --run <id> --json  # gated",
			],
			contract: [
				"No TTY prompts when HOBO_CODE_AGENT=1 or --json paths",
				"Missing args → non-zero + remediation[] (never elicit)",
				"Side effects prefer isolate; promote is sole merge gate",
				"Secrets: presence-only in models/config/agent output",
			],
		},
		selfImprove: {
			loop: harnessStatus.selfImprove.loop,
			durableLearning: `$HOBO_HOME/durable/code/ + session-end handback`,
			lessonsPathHint: join(hoboHome, "durable", "code"),
			narrative: harnessStatus.selfImprove.narrative,
		},
		protocols,
		mcpTools: [...mcp.tools],
		setupChecklist: [
			"export HOBO_HOME=$HOME/.hobo",
			"export HOBO_CODE_AGENT=1          # no-elicitation contract",
			"hobo-code auth login --agent     # human-free local Station",
			"hobo-code agent --json           # this inventory",
			"hobo-code isolate --json         # safe iterate",
			"hobo-code harness --json         # self-improve + brains",
			"wire .mcp.json / ACP host as needed",
		],
		residual: [
			"Full ACP method surface (session/update/permissions) — partial today",
			"Live OAuth client_credentials against remote Station AS",
			"CIBA headless user consent",
			"A2A multi-agent mesh product",
		],
		// Was "agent · auth · protocols · unattended", which read as four
		// subcommands that do not exist. These are the sections below.
		legend: "sections: auth, protocols, unattended, learn",
		notes: [
			"MCP: tools/resources for agents; ACP: editor spawns agent over stdio.",
			"HTTP MCP OAuth 2.1 is for user-delegated clients; agent steady-state prefers local/session-ref.",
			"Device-code remains available for humans bootstrapping remote Stations.",
			"Self-improve is isolate→evidence→promote→durable — pair with optimizexp/skillopt offline.",
		],
	};
}

/** Human panel for hobo-code agent. */
export function agentHumanSummary(status: AgentSurfaceStatus): string {
	const auth = status.humanFreeAuth;
	const mcpN = status.mcpTools.length;
	const acp = status.protocols.find((p) => p.id === "acp");
	const mcp = status.protocols.find((p) => p.id === "mcp");
	return [
		`agent · mode ${status.agentMode ? "on" : "off"} · ${status.legend}`,
		`auth · human-free ${auth.ready ? "●" : "○"} · ${auth.mode ?? "none"} · session ${auth.sessionPresent ? "●" : "○"}`,
		`unattended · no-elicit ${status.unattended.noElicitation ? "●" : "○"} · json-first ${status.unattended.jsonFirst ? "●" : "○"}`,
		`safe · isolate→work→promote · handback durable`,
		`learn · ${status.selfImprove.loop.slice(0, 3).join(" → ")}…`,
		`mcp · ${mcp?.status ?? "?"} · ${mcpN} tools · acp · ${acp?.status ?? "?"}`,
		`try · hobo-code auth login --agent · isolate --json · agent --json`,
		`full · hobo-code agent --json`,
	].join("\n");
}
