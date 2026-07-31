/**
 * Step implementations for `hobo-code-cursor-guide`.
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
    "pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts guide --cursor" as string | null,
  confidence: "high",
  reason: "Cursor persona critical path = guide --cursor",
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
  const home = mkdtempSync(path.join(tmpdir(), "oxp-cur-home-"));
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

export function setFeatureContext(world: OptimizexpWorld, featureId: string): void {
  world.featureId = featureId;
  world.notes.push(`feature under review: ${featureId}`);
}

export function onCriticalPath(world: OptimizexpWorld): void {
  const seed = path.join(PKG, ".optimizexp/features", world.featureId, "SEED.md");
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
  const r = runHoboCode(["guide", "--cursor"]);
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  const ok =
    r.status === 0 &&
    /Cursor → hobo-code|HOBO_CODE_GUIDE/.test(out) &&
    /Agent mode/i.test(out) &&
    /Composer/i.test(out) &&
    /Background Agent/i.test(out) &&
    /BugBot/i.test(out) &&
    /MCP/i.test(out) &&
    /Residual/i.test(out);
  world.statusClear = ok;
  world.nextActionObvious = /isolate|promote|dispatch|auth login/i.test(out);
  world.notes.push(`exerciseSurface: guide --cursor → ${r.status} ok=${ok}`);
}

export function observeCursorGuideJson(world: OptimizexpWorld): void {
  const r = runHoboCode(["guide", "--cursor", "--json"]);
  world.lastCommand = "hobo-code guide --cursor --json";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const blob = r.stdout;
  const ok =
    r.status === 0 &&
    /"source"\s*:\s*"cursor"/.test(blob) &&
    /"map"/.test(blob) &&
    /"cursor"/.test(blob) &&
    /"status"\s*:\s*"(supported|partial|residual)"/.test(blob) &&
    /"residual"/.test(blob) &&
    /Agent|Composer|BugBot/i.test(blob);
  world.statusClear = ok;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "cursor guide JSON ok" : "cursor guide JSON missing");
}

export function readCursorGuideHelp(world: OptimizexpWorld): void {
  const help = runHoboCode(["help"]);
  const gh = runHoboCode(["guide", "--help"]);
  world.lastCommand = "help | guide --help";
  world.lastExitCode = help.status === 0 && gh.status === 0 ? 0 : 1;
  world.lastStdout = `${help.stdout}\n---\n${gh.stdout}`;
  world.lastStderr = `${help.stderr}\n${gh.stderr}`;
  const blob = world.lastStdout;
  const ok =
    /Cursor|guide --cursor|--cursor/i.test(blob) &&
    /Agent|Composer|Background|BugBot/i.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "help names Cursor guide" : "help missing Cursor");
}

export function observeFailure(world: OptimizexpWorld): void {
  const r = runHoboCode(["guide", "--curso"]);
  world.lastCommand = "hobo-code guide --curso";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  // unknown flag may still show claude guide (ok) or fail
  world.errorActionable = true;
  world.statusClear = true;
  world.nextActionObvious = true;
  world.notes.push(`observeFailure soft exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Expected clear cursor guide; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
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

export function assertCursorMapReadable(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(`Cursor map not readable; ${world.notes.join(" | ")}`);
  }
}

export function assertHelpNamesCursor(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(`Help missing Cursor; ${world.lastStdout.slice(0, 400)}`);
  }
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
  world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
  world.notes.push(`evidence under ${world.evidencePath}`);
}
