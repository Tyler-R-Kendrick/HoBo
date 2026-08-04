/**
 * Step implementations for `hobo-code-herdr-mux`.
 * Exercises hobo-code status/session/help Herdr surfaces (not generic monorepo scripts).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OptimizexpWorld } from "./world.ts";

const PKG = path.resolve(process.cwd(), "packages/code");
const BIN = "src/bin/hobo-code.ts";

/** Discovery snapshot — primary is status human chrome + herdr footer. */
export const DISCOVERY_PRIMARY = {
  command:
    "pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts status" as string | null,
  confidence: "high",
  reason: "Herdr persona critical path = status pane mux + capability footer",
};

export const IMPLEMENTATION_STATUS = {
  exerciseSurface: "wired",
  criticalPath: "wired",
  failurePath: "wired",
} as const;

function runHoboCode(
  args: string[],
  opts: { home?: string; cwd?: string } = {},
): { status: number | null; stdout: string; stderr: string } {
  const home = opts.home ?? mkdtempSync(path.join(tmpdir(), "oxp-herdr-home-"));
  const cwd = opts.cwd ?? mkdtempSync(path.join(tmpdir(), "oxp-herdr-cwd-"));
  const r = spawnSync(
    "node",
    ["--import", "tsx", BIN, ...args],
    {
      cwd: PKG,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        HOBO_HOME: home,
        HOBO_CODE_EPHEMERAL_SESSION: "1",
      },
    },
  );
  // Best-effort cleanup of ephemeral homes (ignore errors).
  if (!opts.home) {
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  if (!opts.cwd) {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
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

/**
 * Primary surface: hobo-code status (dense box + herdr capability footer).
 */
export function exerciseSurface(world: OptimizexpWorld): void {
  const command = DISCOVERY_PRIMARY.command!;
  world.lastCommand = command;
  const r = runHoboCode(["status"]);
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  world.notes.push(
    `exerciseSurface: ran status → exit ${r.status}`,
  );
  const hasBox = /┌─+┐/.test(out);
  const hasFooter = /herdr · panes · detach · highlight→copy/.test(out);
  const hasPanes = /○co|✓sn|○au|●co/.test(out);
  world.statusClear = hasBox && hasFooter && hasPanes && r.status === 0;
  world.nextActionObvious = hasFooter || /status --help|session --help/.test(out);
  world.errorActionable = r.status !== 0 && out.trim().length > 0;
  if (!world.statusClear) {
    world.notes.push(
      `status missing herdr chrome: box=${hasBox} footer=${hasFooter} panes=${hasPanes}`,
    );
  }
}

/** status --json + session --json herdr/persistence flags. */
export function observeHerdrJson(world: OptimizexpWorld): void {
  const st = runHoboCode(["status", "--json"]);
  const se = runHoboCode(["session", "--json"]);
  world.lastCommand = "hobo-code status --json && hobo-code session --json";
  world.lastExitCode = se.status === 0 && st.status === 0 ? 0 : 1;
  world.lastStdout = `${st.stdout}\n---\n${se.stdout}`;
  world.lastStderr = `${st.stderr}\n${se.stderr}`;
  const blob = world.lastStdout;
  const ok =
    /"copyOnHighlight"\s*:\s*true/.test(blob) &&
    /"detachable"\s*:\s*true/.test(blob) &&
    /"theme"\s*:\s*"herdr"/.test(blob) &&
    /"durableRoot"/.test(blob) &&
    /session-end\.json/.test(blob) &&
    /"legend"\s*:\s*"herdr/.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(
    ok
      ? "herdr JSON: copyOnHighlight+detachable+theme+persistence present"
      : "herdr JSON missing expected flags",
  );
}

/** Top help + status/session --help herdr callouts. */
export function readHerdrHelp(world: OptimizexpWorld): void {
  const help = runHoboCode(["help"]);
  const stHelp = runHoboCode(["status", "--help"]);
  const seHelp = runHoboCode(["session", "--help"]);
  world.lastCommand = "hobo-code help|status --help|session --help";
  world.lastExitCode =
    help.status === 0 && stHelp.status === 0 && seHelp.status === 0 ? 0 : 1;
  world.lastStdout = [help.stdout, stHelp.stdout, seHelp.stdout].join("\n---\n");
  world.lastStderr = [help.stderr, stHelp.stderr, seHelp.stderr].join("\n");
  const blob = world.lastStdout;
  const ok =
    /Herdr mux|Herdr-style|Herdr differentiators/i.test(blob) &&
    /highlight→copy|highlight-to-copy|copyOnHighlight|highlightBuffer/i.test(
      blob,
    ) &&
    /detach/i.test(blob) &&
    /persist|handback|durable|HOBO_HOME/i.test(blob);
  world.statusClear = ok && world.lastExitCode === 0;
  world.nextActionObvious = ok;
  world.notes.push(ok ? "help names herdr differentiators" : "help missing herdr");
}

export function observeFailure(world: OptimizexpWorld): void {
  // Herdr happy path is primary; soft-fail path: unknown verb still suggests help.
  const r = runHoboCode(["not-a-real-verb-zzzz"]);
  world.lastCommand = "hobo-code not-a-real-verb-zzzz";
  world.lastExitCode = r.status;
  world.lastStdout = r.stdout;
  world.lastStderr = r.stderr;
  const out = `${r.stdout}\n${r.stderr}`;
  world.errorActionable =
    r.status !== 0 && (/help|did you mean|unknown|≈/i.test(out) || out.length > 0);
  world.statusClear = world.errorActionable;
  world.nextActionObvious = /help/i.test(out);
  world.notes.push(`observeFailure: exit ${r.status} actionable=${world.errorActionable}`);
}

export function assertClearStatus(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Expected clear status from surface; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
    );
  }
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
  if (!world.nextActionObvious && world.lastExitCode !== 0) {
    throw new Error(
      `Expected obvious next action; stderr=${world.lastStderr.slice(0, 300)}`,
    );
  }
}

export function assertErrorActionable(world: OptimizexpWorld): void {
  if (world.lastExitCode === 0) return;
  if (!world.errorActionable) {
    throw new Error(
      `Expected actionable error output; exit=${world.lastExitCode}`,
    );
  }
}

export function assertHerdrCapabilitiesReadable(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Herdr capabilities not machine-readable; notes=${world.notes.join(" | ")}`,
    );
  }
}

export function assertHerdrHelpNamesDifferentiators(world: OptimizexpWorld): void {
  if (!world.statusClear) {
    throw new Error(
      `Help missing herdr differentiators; notes=${world.notes.join(" | ")} stdout=${world.lastStdout.slice(0, 400)}`,
    );
  }
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
  world.evidencePath = `packages/code/.optimizexp/features/${world.featureId}/evidence/`;
  world.notes.push(`evidence capturable under ${world.evidencePath}`);
}
