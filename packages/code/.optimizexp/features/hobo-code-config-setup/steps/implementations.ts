/**
 * Step implementations for `hobo-code-config-setup`.
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
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts config" as
			| string
			| null,
	confidence: "high",
	reason: "Multi-persona setup critique critical path = hobo-code config",
};

export const IMPLEMENTATION_STATUS = {
	exerciseSurface: "wired",
	criticalPath: "wired",
	failurePath: "wired",
} as const;

function runHoboCode(args: string[]): {
	status: number | null;
	stdout: string;
	stderr: string;
} {
	const home = mkdtempSync(path.join(tmpdir(), "oxp-cfg-home-"));
	const r = spawnSync("node", ["--import", "tsx", BIN, ...args], {
		cwd: PKG,
		encoding: "utf8",
		timeout: 60_000,
		maxBuffer: 4 * 1024 * 1024,
		env: {
			...process.env,
			HOBO_HOME: home,
			// Soft-path defaults so gaps stay informative without leaking secrets
			HOBO_CODE_MONETIZATION: process.env.HOBO_CODE_MONETIZATION ?? "0",
		},
	});
	try {
		rmSync(home, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
	return {
		status: r.status,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
	};
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
	const root = path.join(
		process.cwd(),
		".optimizexp/features",
		world.featureId,
		"feature.json",
	);
	if (!existsSync(local) && !existsSync(root)) {
		world.notes.push("critical path: feature folder incomplete");
		return;
	}
	world.notes.push("critical path: feature seed/metadata present");
	world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
	const command = DISCOVERY_PRIMARY.command;
	if (!command) {
		world.notes.push("exerciseSurface: STUB — no discovered command");
		world.lastExitCode = null;
		world.statusClear = false;
		world.nextActionObvious = false;
		return;
	}
	world.lastCommand = command;
	const r = runHoboCode(["config"]);
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.notes.push(
		`exerciseSurface: ran config → exit ${r.status} (${DISCOVERY_PRIMARY.confidence})`,
	);
	world.statusClear =
		/◈ config|setup ·|cost-budget|editor-vim|gaps ·/i.test(out) &&
		r.status === 0;
	world.nextActionObvious =
		/filter ·|full ·|--stack|config --json|gaps ·/i.test(out);
	world.errorActionable = false;
}

export function observeConfigJson(world: OptimizexpWorld): void {
	const r = runHoboCode(["config", "--json"]);
	world.lastCommand = "hobo-code config --json";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = r.stdout;
	world.statusClear =
		r.status === 0 &&
		/hobo\.code\.config|missingCritical|setupChecklist|"knobs"/i.test(out) &&
		!/sk-[a-zA-Z0-9]{10,}/.test(out);
	world.nextActionObvious = /--stack|cost-budget|editor-vim/i.test(out);
	world.notes.push(`observeConfigJson: exit ${r.status}`);
}

export function observeStackFilter(
	world: OptimizexpWorld,
	stack = "cost-budget",
): void {
	const r = runHoboCode(["config", "--stack", stack]);
	world.lastCommand = `hobo-code config --stack ${stack}`;
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = r.stdout;
	world.statusClear =
		r.status === 0 &&
		out.includes(stack) &&
		/◈ config|setup ·|gaps ·/i.test(out);
	world.nextActionObvious = /filter ·|full ·/i.test(out);
	world.notes.push(`observeStackFilter(${stack}): exit ${r.status}`);
}

export function observeConfigHelp(world: OptimizexpWorld): void {
	const r = runHoboCode(["config", "--help"]);
	world.lastCommand = "hobo-code config --help";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = r.stdout;
	world.statusClear =
		r.status === 0 && /stack|setup|env|flags|cost-budget|editor-vim/i.test(out);
	world.nextActionObvious = /--stack|--json/i.test(out);
	world.notes.push(`observeConfigHelp: exit ${r.status}`);
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode(["config", "--stack", "not-a-real-stack"]);
	world.lastCommand = "hobo-code config --stack not-a-real-stack";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 && /unknown stack|cost-budget|editor-vim|--help/i.test(out);
	world.statusClear = world.errorActionable;
	world.nextActionObvious = /config --help|config --json/i.test(out);
	world.notes.push(`observeFailure: exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear status from surface; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 200)}`,
		);
	}
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
	if (!world.nextActionObvious && world.lastExitCode !== 0) {
		throw new Error(
			`Expected obvious next action on failure; stderr=${world.lastStderr.slice(0, 300)}`,
		);
	}
}

export function assertErrorActionable(world: OptimizexpWorld): void {
	if (!world.errorActionable) {
		throw new Error(
			`Expected actionable error; out=${world.lastStdout.slice(0, 300)}`,
		);
	}
}

export function assertNoSecretLeak(world: OptimizexpWorld): void {
	const blob = `${world.lastStdout}\n${world.lastStderr}`;
	if (/sk-[a-zA-Z0-9]{12,}|-----BEGIN/.test(blob)) {
		throw new Error("Config output leaked a secret-looking value");
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
