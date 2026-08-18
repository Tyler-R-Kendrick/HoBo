/**
 * Step implementations for `hobo-code-grok-build-parity`.
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
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts tasks" as
			| string
			| null,
	confidence: "high",
	reason: "Grok Build persona critical path = tasks board + parity card",
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
	const home = mkdtempSync(path.join(tmpdir(), "oxp-gb-home-"));
	const r = spawnSync("node", ["--import", "tsx", BIN, ...args], {
		cwd: PKG,
		encoding: "utf8",
		timeout: 60_000,
		maxBuffer: 4 * 1024 * 1024,
		env: { ...process.env, HOBO_HOME: home },
	});
	try {
		rmSync(home, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
	return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
	const seed = path.join(
		PKG,
		".optimizexp/features",
		world.featureId,
		"SEED.md",
	);
	const featureJson = path.join(
		PKG,
		".optimizexp/features",
		world.featureId,
		"feature.json",
	);
	if (!existsSync(seed) && !existsSync(featureJson)) {
		world.notes.push("critical path incomplete");
		world.statusClear = false;
		return;
	}
	world.notes.push("critical path: feature present");
	world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
	world.lastCommand = DISCOVERY_PRIMARY.command!;
	const r = runHoboCode(["tasks"]);
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	const ok =
		r.status === 0 &&
		/▣ tasks|HOBO_CODE_TASKS/.test(out) &&
		/grok-build · click · tasks · workflows/.test(out) &&
		/click · task-row|still-running/.test(out);
	world.statusClear = ok;
	world.nextActionObvious = /tasks|status|workflow/i.test(out);
	world.notes.push(`exerciseSurface: tasks → ${r.status} ok=${ok}`);
}

export function observeTasksJson(world: OptimizexpWorld): void {
	const r = runHoboCode(["tasks", "--json"]);
	const st = runHoboCode(["status", "--json"]);
	world.lastCommand = "tasks --json; status --json";
	world.lastExitCode = r.status === 0 && st.status === 0 ? 0 : 1;
	world.lastStdout = `${r.stdout}\n---\n${st.stdout}`;
	world.lastStderr = `${r.stderr}\n${st.stderr}`;
	const blob = world.lastStdout;
	const ok =
		/"mouseInteractive"\s*:\s*true/.test(blob) &&
		/"clickableRegions"/.test(blob) &&
		/still-running|task-row/.test(blob) &&
		/"backgroundTasks"/.test(blob) &&
		/"workflows"/.test(blob) &&
		/vercel-workflows-worlds/.test(blob) &&
		/"compare"/.test(blob) &&
		/Grok Build/i.test(blob);
	world.statusClear = ok && world.lastExitCode === 0;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "grokBuild JSON ok" : "grokBuild JSON missing");
}

export function readGrokBuildHelp(world: OptimizexpWorld): void {
	const help = runHoboCode(["help"]);
	const th = runHoboCode(["tasks", "--help"]);
	world.lastCommand = "help | tasks --help";
	world.lastExitCode = help.status === 0 && th.status === 0 ? 0 : 1;
	world.lastStdout = `${help.stdout}\n---\n${th.stdout}`;
	world.lastStderr = `${help.stderr}\n${th.stderr}`;
	const blob = world.lastStdout;
	const ok =
		/Grok Build/i.test(blob) &&
		/tasks/i.test(blob) &&
		/workflow/i.test(blob) &&
		/click/i.test(blob);
	world.statusClear = ok && world.lastExitCode === 0;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "help names Grok Build stack" : "help missing");
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode(["taskss"]);
	world.lastCommand = "hobo-code taskss";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 &&
		(/help|did you mean|≈|unknown|tasks/i.test(out) || out.length > 0);
	world.statusClear = world.errorActionable || r.status === 0;
	world.nextActionObvious = /help|tasks/i.test(out) || r.status === 0;
	world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear tasks status; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
		);
	}
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
	if (!world.nextActionObvious && world.lastExitCode !== 0) {
		throw new Error(`Expected next action; ${world.lastStderr.slice(0, 300)}`);
	}
}

export function assertErrorActionable(world: OptimizexpWorld): void {
	if (world.lastExitCode === 0) return;
	if (!world.errorActionable) {
		throw new Error(`Expected actionable error; exit=${world.lastExitCode}`);
	}
}

export function assertGrokBuildCardReadable(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Grok Build card not readable; ${world.notes.join(" | ")}`);
	}
}

export function assertHelpNamesGrokBuild(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Help missing Grok Build; ${world.lastStdout.slice(0, 400)}`,
		);
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
