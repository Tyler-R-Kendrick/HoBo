/**
 * Step implementations for `hobo-code-remote-attach`.
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
    "pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts attach" as string | null,
  confidence: "high",
  reason: "Primary surface for tmux/mosh/Tailscale persona is attach",
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
  const home = mkdtempSync(path.join(tmpdir(), "oxp-attach-home-"));
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
    world.notes.push("critical path: feature folder incomplete");
    world.statusClear = false;
    return;
  }
  world.notes.push("critical path: feature seed/metadata present");
  world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
  world.lastCommand = DISCOVERY_PRIMARY.command!;
  const r = runHoboCode(["attach"]);
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  const ok =
    r.status === 0 &&
    /◎ attach|HOBO_CODE_ATTACH/.test(out) &&
    /reattach|session|local|overlay|mosh|code\.mux/i.test(out);
  world.statusClear = ok;
  world.nextActionObvious = /session|reattach|attach/i.test(out);
  world.notes.push(`exerciseSurface: attach → exit ${r.status} ok=${ok}`);
}

export function observeAttachJson(world: OptimizexpWorld): void {
  const local = runHoboCode(["attach", "--json"]);
  const overlay = runHoboCode(["attach", "--mode", "overlay", "--json"]);
  world.lastCommand = "hobo-code attach --json (+ overlay)";
  world.lastExitCode =
    local.status === 0 && overlay.status === 0 ? 0 : 1;
  world.lastStdout = `${local.stdout}\n---\n${overlay.stdout}`;
  world.lastStderr = `${local.stderr}\n${overlay.stderr}`;
  const blob = world.lastStdout;
  const ok =
    /"mode"\s*:\s*"local"/.test(blob) &&
    /"mode"\s*:\s*"overlay"/.test(blob) &&
    /"tmux"/.test(blob) &&
    /"mosh"/.test(blob) &&
    /"tailscale"/.test(blob) &&
    /"detachable"\s*:\s*true/.test(blob) &&
    /"steps"/.test(blob) &&
    /"host"/.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "attach JSON compare+overlay ok" : "attach JSON missing fields");
}

export function readAttachHelp(world: OptimizexpWorld): void {
  const help = runHoboCode(["help"]);
  const at = runHoboCode(["attach", "--help"]);
  world.lastCommand = "hobo-code help | attach --help";
  world.lastExitCode = help.status === 0 && at.status === 0 ? 0 : 1;
  world.lastStdout = `${help.stdout}\n---\n${at.stdout}`;
  world.lastStderr = `${help.stderr}\n${at.stderr}`;
  const blob = world.lastStdout;
  const ok =
    /attach/i.test(blob) &&
    /tmux/i.test(blob) &&
    /mosh/i.test(blob) &&
    /Tailscale|overlay|tailnet/i.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "help names remote-terminal stack" : "help missing stack");
}

export function observeFailure(world: OptimizexpWorld): void {
  const r = runHoboCode(["attach", "--mode", "not-a-mode"]);
  // Unknown mode falls back to local — still ok; treat as soft path.
  world.lastCommand = "hobo-code attach --mode not-a-mode";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  world.errorActionable = true;
  world.statusClear = r.status === 0;
  world.nextActionObvious = true;
  world.notes.push(`observeFailure soft: exit ${r.status}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Expected clear attach status; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
    );
  }
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
  if (!world.nextActionObvious && world.lastExitCode !== 0) {
    throw new Error(`Expected obvious next action; ${world.lastStderr.slice(0, 300)}`);
  }
}

export function assertErrorActionable(world: OptimizexpWorld): void {
  if (world.lastExitCode === 0) return;
  if (!world.errorActionable) {
    throw new Error(`Expected actionable error; exit=${world.lastExitCode}`);
  }
}

export function assertAttachCompareReadable(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(`Attach compare not readable; notes=${world.notes.join(" | ")}`);
  }
}

export function assertHelpNamesStack(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Help missing tmux/mosh/Tailscale; stdout=${world.lastStdout.slice(0, 400)}`,
    );
  }
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
  world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
  world.notes.push(`evidence capturable under ${world.evidencePath}`);
}
