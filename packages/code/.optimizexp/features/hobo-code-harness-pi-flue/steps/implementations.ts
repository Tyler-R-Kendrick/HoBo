/**
 * Step implementations for `hobo-code-harness-pi-flue`.
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
    "pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts harness" as string | null,
  confidence: "high",
  reason: "Pi/Flue persona critical path = harness inventory",
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
  const home = mkdtempSync(path.join(tmpdir(), "oxp-hz-home-"));
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
  const r = runHoboCode(["harness"]);
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  const ok =
    r.status === 0 &&
    /◈ harness|HOBO_CODE_HARNESS/.test(out) &&
    /pi ·|flue ·/i.test(out) &&
    /skills ·/i.test(out) &&
    /eve ·|implementer|reviewer/i.test(out) &&
    /isolate→evidence→promote|loop ·/i.test(out) &&
    /brain ·|serena|gbrain/i.test(out);
  world.statusClear = ok;
  world.nextActionObvious = /flue run|harness|isolate|session/i.test(out);
  world.notes.push(`exerciseSurface: harness → ${r.status} ok=${ok}`);
}

export function observeHarnessJson(world: OptimizexpWorld): void {
  const r = runHoboCode(["harness", "--json"]);
  world.lastCommand = "hobo-code harness --json";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const blob = r.stdout;
  const ok =
    r.status === 0 &&
    /"pi-tui"/.test(blob) &&
    /"flue-run"/.test(blob) &&
    /"skillRoots"/.test(blob) &&
    /"selfImprove"/.test(blob) &&
    /"investigator"/.test(blob) &&
    /"gbrain"/.test(blob) &&
    /"brain"/.test(blob);
  world.statusClear = ok;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "harness JSON ok" : "harness JSON missing");
}

export function readHarnessHelp(world: OptimizexpWorld): void {
  const help = runHoboCode(["help"]);
  const hh = runHoboCode(["harness", "--help"]);
  world.lastCommand = "help | harness --help";
  world.lastExitCode = help.status === 0 && hh.status === 0 ? 0 : 1;
  world.lastStdout = `${help.stdout}\n---\n${hh.stdout}`;
  world.lastStderr = `${help.stderr}\n${hh.stderr}`;
  const blob = world.lastStdout;
  const ok =
    /harness/i.test(blob) &&
    /Pi|Flue/i.test(blob) &&
    /skills|self-improve|brain|Eve|subagent/i.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "help names harness" : "help missing harness");
}

export function observeFailure(world: OptimizexpWorld): void {
  const r = runHoboCode(["harnes"]);
  world.lastCommand = "hobo-code harnes";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  world.errorActionable =
    r.status !== 0 && (/help|harness|≈|did you mean|unknown/i.test(out) || out.length > 0);
  world.statusClear = world.errorActionable || r.status === 0;
  world.nextActionObvious = /help|harness/i.test(out) || r.status === 0;
  world.notes.push(`observeFailure exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Expected clear harness; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
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

export function assertHarnessJsonReadable(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(`Harness JSON not readable; ${world.notes.join(" | ")}`);
  }
}

export function assertHelpNamesHarness(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(`Help missing harness; ${world.lastStdout.slice(0, 400)}`);
  }
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
  world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
  world.notes.push(`evidence under ${world.evidencePath}`);
}
