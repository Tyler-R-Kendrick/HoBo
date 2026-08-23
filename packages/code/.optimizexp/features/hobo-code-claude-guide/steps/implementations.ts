/**
 * Step implementations for `hobo-code-claude-guide`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { must } from "@hobo/core/total-access";
import type { OptimizexpWorld } from "./world.ts";

const PKG = path.resolve(process.cwd(), "packages/code");
const BIN = "src/bin/hobo-code.ts";

export const DISCOVERY_PRIMARY = {
	command:
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts guide" as
			| string
			| null,
	confidence: "high",
	reason: "Claude Code persona critical path = guide map",
};

export const IMPLEMENTATION_STATUS = {
	exerciseSurface: "wired",
	criticalPath: "wired",
	failurePath: "wired",
} as const;

function runHoboCode(args: string[]) {
	const home = mkdtempSync(path.join(tmpdir(), "oxp-cc-home-"));
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
	world.lastCommand = must(
		DISCOVERY_PRIMARY.command,
		"DISCOVERY_PRIMARY.command",
	);
	const r = runHoboCode(["guide"]);
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	const ok =
		r.status === 0 &&
		/Claude Code → hobo-code|HOBO_CODE_GUIDE/.test(out) &&
		/workflows/i.test(out) &&
		/fork|isolate/i.test(out) &&
		/Happy path|auth login/i.test(out) &&
		/Residual/i.test(out) &&
		/browser|Chrome/i.test(out);
	world.statusClear = ok;
	world.nextActionObvious = /auth login|scaffold|try ·/i.test(out);
	world.notes.push(`exerciseSurface: guide → ${r.status} ok=${ok}`);
}

export function observeGuideJson(world: OptimizexpWorld): void {
	const r = runHoboCode(["guide", "--json"]);
	world.lastCommand = "hobo-code guide --json";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const blob = r.stdout;
	const ok =
		r.status === 0 &&
		/"map"/.test(blob) &&
		/"claudeCode"/.test(blob) &&
		/"status"\s*:\s*"(supported|partial|residual)"/.test(blob) &&
		/"residual"/.test(blob) &&
		/"happyPath"/.test(blob) &&
		/workflow/i.test(blob);
	world.statusClear = ok;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "guide JSON map ok" : "guide JSON missing fields");
}

export function readClaudeGuideHelp(world: OptimizexpWorld): void {
	const help = runHoboCode(["help"]);
	const gh = runHoboCode(["guide", "--help"]);
	world.lastCommand = "help | guide --help";
	world.lastExitCode = help.status === 0 && gh.status === 0 ? 0 : 1;
	world.lastStdout = `${help.stdout}\n---\n${gh.stdout}`;
	world.lastStderr = `${help.stderr}\n${gh.stderr}`;
	const blob = world.lastStdout;
	const ok =
		/Claude Code/i.test(blob) &&
		/guide/i.test(blob) &&
		/workflow|remote|fork|btw|ultrareview|browser/i.test(blob);
	world.statusClear = ok && world.lastExitCode === 0;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "help names Claude Code guide" : "help missing guide");
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode(["guied"]);
	world.lastCommand = "hobo-code guied";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 &&
		(/help|did you mean|≈|guide|unknown/i.test(out) || out.length > 0);
	world.statusClear = world.errorActionable || r.status === 0;
	world.nextActionObvious = /help|guide/i.test(out) || r.status === 0;
	world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear guide; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
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

export function assertClaudeMapReadable(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Claude map not readable; ${world.notes.join(" | ")}`);
	}
}

export function assertHelpNamesClaudeGuide(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Help missing Claude guide; ${world.lastStdout.slice(0, 400)}`,
		);
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
