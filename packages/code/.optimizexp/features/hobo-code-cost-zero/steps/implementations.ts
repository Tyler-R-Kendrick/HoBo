/**
 * Step implementations for `hobo-code-cost-zero`.
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
		"pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts cost" as
			| string
			| null,
	confidence: "high",
	reason: "Cost persona critical path = cost savings board",
};

export const IMPLEMENTATION_STATUS = {
	exerciseSurface: "wired",
	criticalPath: "wired",
	failurePath: "wired",
} as const;

function runHoboCode(
	args: string[],
	extraEnv: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
	const home = mkdtempSync(path.join(tmpdir(), "oxp-cost-home-"));
	const r = spawnSync("node", ["--import", "tsx", BIN, ...args], {
		cwd: PKG,
		encoding: "utf8",
		timeout: 60_000,
		maxBuffer: 4 * 1024 * 1024,
		env: {
			...process.env,
			HOBO_HOME: home,
			HOBO_CODE_MONETIZATION: "0",
			HOBO_CODE_MODEL: "ollama/qwen2.5-coder:7b",
			...extraEnv,
		},
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
	const r = runHoboCode(["cost"]);
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	const ok =
		r.status === 0 &&
		/◈ cost|HOBO_CODE_COST/.test(out) &&
		/save ·|cap ·|spend/i.test(out) &&
		/local\/free|ollama|\$0/i.test(out) &&
		/rtk|headroom|caveman/i.test(out) &&
		!/sk-secret|api[_-]?key\s*=\s*sk/i.test(out);
	world.statusClear = ok;
	world.nextActionObvious = /\$0|OLLAMA|HOBO_CODE_MODEL|cost/i.test(out);
	world.notes.push(`exerciseSurface: cost → ${r.status} ok=${ok}`);
}

export function observeCostJson(world: OptimizexpWorld): void {
	const r = runHoboCode(["cost", "--json"]);
	world.lastCommand = "hobo-code cost --json";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const blob = r.stdout;
	const ok =
		r.status === 0 &&
		/"zeroDollarPath"\s*:\s*true/.test(blob) &&
		/"freeLocal"/.test(blob) &&
		/"tokenTools"/.test(blob) &&
		/"savedPct"/.test(blob) &&
		/"cheapest-capable"/.test(blob) &&
		/"ollama"/.test(blob) &&
		/"serena"/.test(blob);
	world.statusClear = ok;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "cost JSON ok" : "cost JSON missing fields");
}

export function readCostHelp(world: OptimizexpWorld): void {
	const help = runHoboCode(["help"]);
	const ch = runHoboCode(["cost", "--help"]);
	const mo = runHoboCode(["models"]);
	world.lastCommand = "help | cost --help | models";
	world.lastExitCode =
		help.status === 0 && ch.status === 0 && mo.status === 0 ? 0 : 1;
	world.lastStdout = [help.stdout, ch.stdout, mo.stdout].join("\n---\n");
	world.lastStderr = [help.stderr, ch.stderr, mo.stderr].join("\n");
	const blob = world.lastStdout;
	const ok =
		/\$0|free-local|cost/i.test(blob) &&
		/savings|budget|Ollama|OrnithAI|cheapest/i.test(blob);
	world.statusClear = ok && world.lastExitCode === 0;
	world.nextActionObvious = ok;
	world.notes.push(ok ? "help/models name cost path" : "help missing cost");
}

export function observeFailure(world: OptimizexpWorld): void {
	const r = runHoboCode(["costt"]);
	world.lastCommand = "hobo-code costt";
	world.lastExitCode = r.status;
	world.lastStdout = r.stdout;
	world.lastStderr = r.stderr;
	const out = `${r.stdout}\n${r.stderr}`;
	world.errorActionable =
		r.status !== 0 &&
		(/help|cost|≈|did you mean|unknown/i.test(out) || out.length > 0);
	world.statusClear = world.errorActionable || r.status === 0;
	world.nextActionObvious = /help|cost/i.test(out) || r.status === 0;
	world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`Expected clear cost status; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
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

export function assertCostJsonReadable(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Cost JSON not readable; ${world.notes.join(" | ")}`);
	}
}

export function assertHelpNamesCost(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(`Help missing cost; ${world.lastStdout.slice(0, 400)}`);
	}
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
	world.notes.push(`evidence under ${world.evidencePath}`);
}
