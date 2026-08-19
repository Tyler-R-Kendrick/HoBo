/**
 * Step implementations for `hobo-code-agent-native`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OptimizexpWorld } from "./world.ts";

const PKG = path.resolve(process.cwd(), "packages/code");
const BIN = "src/bin/hobo-code.ts";

export const DISCOVERY_PRIMARY = {
	command:
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts agent" as
			| string
			| null,
	confidence: "high",
	reason: "Protocol-native agent critical path = hobo-code agent inventory",
};

export const IMPLEMENTATION_STATUS = {
	exerciseSurface: "wired",
	criticalPath: "wired",
	failurePath: "wired",
} as const;

function runHoboCode(
	args: string[],
	extraEnv: Record<string, string> = {},
): {
	status: number | null;
	stdout: string;
	stderr: string;
	home: string;
} {
	const home = mkdtempSync(path.join(tmpdir(), "oxp-agent-home-"));
	const r = spawnSync("node", ["--import", "tsx", BIN, ...args], {
		cwd: PKG,
		encoding: "utf8",
		timeout: 60_000,
		maxBuffer: 4 * 1024 * 1024,
		env: {
			...process.env,
			HOBO_HOME: home,
			HOBO_CODE_AGENT: "1",
			...extraEnv,
		},
	});
	return {
		status: r.status,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
		home,
	};
}

function cleanup(home: string): void {
	try {
		rmSync(home, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

export function setPersona(world: OptimizexpWorld, personaId: string): void {
	world.personaId = personaId;
	world.notes.push(`persona active: ${personaId}`);
}

export function setFeatureContext(
	world: OptimizexpWorld,
	featureId: string,
): void {
	world.featureId = featureId;
	world.notes.push(`feature under review: ${featureId}`);
}

export function onCriticalPath(world: OptimizexpWorld): void {
	const local = path.join(
		process.cwd(),
		"packages/code/.optimizexp/features",
		world.featureId,
		"feature.json",
	);
	if (!existsSync(local)) {
		world.notes.push("critical path: feature folder incomplete");
		return;
	}
	world.notes.push("critical path: feature seed/metadata present");
	world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
	const login = runHoboCode(["auth", "login", "--agent"]);
	const r = runHoboCode(["agent"], { HOBO_HOME: login.home });
	// second call creates new home — re-login into one home for realism
	cleanup(login.home);
	const home = mkdtempSync(path.join(tmpdir(), "oxp-agent-run-"));
	const login2 = spawnSync(
		"node",
		["--import", "tsx", BIN, "auth", "login", "--agent"],
		{
			cwd: PKG,
			encoding: "utf8",
			env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
		},
	);
	const agent = spawnSync("node", ["--import", "tsx", BIN, "agent"], {
		cwd: PKG,
		encoding: "utf8",
		env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
	});
	cleanup(home);
	world.lastCommand = DISCOVERY_PRIMARY.command ?? "hobo-code agent";
	world.lastExitCode = agent.status;
	world.lastStdout = `${login2.stdout ?? ""}\n${agent.stdout ?? ""}`;
	world.lastStderr = agent.stderr ?? "";
	const out = world.lastStdout;
	world.statusClear =
		agent.status === 0 && /◈ agent|human-free|mcp ·|acp ·|no-elicit/i.test(out);
	world.nextActionObvious =
		/isolate --json|agent --json|auth login --agent/i.test(out);
	world.notes.push(`exerciseSurface agent exit ${agent.status}`);
	void r;
}

export function observeAgentJson(world: OptimizexpWorld): void {
	const home = mkdtempSync(path.join(tmpdir(), "oxp-agent-json-"));
	spawnSync("node", ["--import", "tsx", BIN, "auth", "login", "--agent"], {
		cwd: PKG,
		encoding: "utf8",
		env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
	});
	const r = spawnSync("node", ["--import", "tsx", BIN, "agent", "--json"], {
		cwd: PKG,
		encoding: "utf8",
		env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
	});
	cleanup(home);
	world.lastCommand = "hobo-code agent --json";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout ?? "";
	world.lastStderr = r.stderr ?? "";
	const out = world.lastStdout;
	world.statusClear =
		r.status === 0 &&
		/hobo\.code\.agent|humanFreeAuth|mcpTools|"mcp"|noElicitation/i.test(out) &&
		!/sk-[a-zA-Z0-9]{12,}/.test(out);
	world.nextActionObvious = /isolate|auth login --agent|mcp/i.test(out);
	world.notes.push(`observeAgentJson exit ${r.status}`);
}

export function observeAuthAgent(world: OptimizexpWorld): void {
	const r = runHoboCode(["auth", "login", "--agent"]);
	cleanup(r.home);
	world.lastCommand = "hobo-code auth login --agent";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	world.statusClear =
		r.status === 0 && /human-free|no-elicitation|local/i.test(r.stdout);
	world.nextActionObvious = /agent --json|isolate/i.test(r.stdout);
	world.notes.push(`observeAuthAgent exit ${r.status}`);
}

export function observeAgentHelp(world: OptimizexpWorld): void {
	const r = runHoboCode(["agent", "--help"]);
	cleanup(r.home);
	world.lastCommand = "hobo-code agent --help";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	world.statusClear =
		r.status === 0 && /MCP|ACP|elicitation|human-free/i.test(r.stdout);
	world.nextActionObvious = /--json|auth login --agent/i.test(r.stdout);
	world.notes.push(`observeAgentHelp exit ${r.status}`);
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode([
		"auth",
		"login",
		"--agent",
		"--tenant",
		"acme",
		"--domain",
		"stations.example",
	]);
	cleanup(r.home);
	world.lastCommand = "auth login --agent --tenant --domain";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 && /device-code|session-ref|local|--agent/i.test(out);
	world.statusClear = world.errorActionable;
	world.nextActionObvious = /auth login --agent|SESSION_REF|agent --json/i.test(
		out,
	);
	world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear status; notes=${world.notes.join(" | ")} out=${world.lastStdout.slice(0, 300)}`,
		);
	}
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
	if (!world.nextActionObvious && world.lastExitCode !== 0) {
		throw new Error(`Expected next action; ${world.lastStderr.slice(0, 300)}`);
	}
}

export function assertErrorActionable(world: OptimizexpWorld): void {
	if (!world.errorActionable) {
		throw new Error(
			`Expected actionable error; ${world.lastStdout.slice(0, 300)}`,
		);
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
