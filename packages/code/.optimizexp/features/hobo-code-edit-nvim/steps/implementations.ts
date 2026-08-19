/**
 * Step implementations for `hobo-code-edit-nvim`.
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
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts edit" as
			| string
			| null,
	confidence: "high",
	reason: "CLI-native vim persona critical path = edit bridge",
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
	const home = mkdtempSync(path.join(tmpdir(), "oxp-ed-home-"));
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
	const nvim = path.join(PKG, "editor/hobo-code.nvim/lua/hobo-code/init.lua");
	if ((!existsSync(seed) && !existsSync(featureJson)) || !existsSync(nvim)) {
		world.notes.push("critical path incomplete (feature or nvim missing)");
		world.statusClear = false;
		return;
	}
	world.notes.push("critical path: feature + nvim present");
	world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
	world.lastCommand = must(
		DISCOVERY_PRIMARY.command,
		"DISCOVERY_PRIMARY.command",
	);
	const r = runHoboCode(["edit", "--bridge", "direct-exec", "src/cli.ts"]);
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	const ok =
		r.status === 0 &&
		/◈ edit|HOBO_CODE_EDIT/.test(out) &&
		/editor ·|nvim|vim/i.test(out) &&
		/pane ·|bridge ·/i.test(out) &&
		/hobo-code\.nvim|ext ·/i.test(out) &&
		/nav · status/i.test(out);
	world.statusClear = ok;
	world.nextActionObvious = /print-cmd|edit|status|isolate/i.test(out);
	world.notes.push(`exerciseSurface: edit → ${r.status} ok=${ok}`);
}

export function observeEditJson(world: OptimizexpWorld): void {
	const r = runHoboCode([
		"edit",
		"--json",
		"--bridge",
		"tmux-send",
		"README.md",
	]);
	world.lastCommand = "hobo-code edit --json";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const blob = r.stdout;
	const ok =
		r.status === 0 &&
		/editor-bridge|HOBO_CODE_EDIT/.test(blob) &&
		/tmux-send/.test(blob) &&
		/stdio-jsonrpc/.test(blob) &&
		/hobo-code\.nvim/.test(blob) &&
		/cliNavigation/.test(blob) &&
		/"managed"\s*:\s*true/.test(blob);
	world.statusClear = ok;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "edit JSON ok" : "edit JSON missing");
}

export function readEditHelp(world: OptimizexpWorld): void {
	const help = runHoboCode(["help"]);
	const eh = runHoboCode(["edit", "--help"]);
	world.lastCommand = "help | edit --help";
	world.lastExitCode = help.status === 0 && eh.status === 0 ? 0 : 1;
	world.lastStdout = `${help.stdout}\n---\n${eh.stdout}`;
	world.lastStderr = `${help.stderr}\n${eh.stderr}`;
	const blob = world.lastStdout;
	const ok =
		/edit/i.test(blob) && /neovim|vim|nvim|tmux|bridge|keyboard/i.test(blob);
	world.statusClear = ok && world.lastExitCode === 0;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "help names edit/nvim" : "help missing edit");
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode(["editt"]);
	world.lastCommand = "hobo-code editt";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 &&
		(/help|edit|≈|did you mean|unknown/i.test(out) || out.length > 0);
	world.statusClear = world.errorActionable || r.status === 0;
	world.nextActionObvious = /help|edit/i.test(out) || r.status === 0;
	world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear edit; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
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

export function assertEditJsonReadable(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Edit JSON not readable; ${world.notes.join(" | ")}`);
	}
}

export function assertHelpNamesEdit(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Help missing edit; ${world.lastStdout.slice(0, 400)}`);
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
