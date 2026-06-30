import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

let failed = false;
function ok(message: string) { console.log(`ok  ${message}`); }
function warn(message: string) { console.warn(`warn ${message}`); }
function fail(message: string) { console.error(`fail ${message}`); failed = true; }
function version(command: string, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) ok(`Node ${process.versions.node}`); else fail(`Node ${process.versions.node}; expected >=20`);
const pnpm = version("pnpm");
if (pnpm) ok(`pnpm ${pnpm}`); else fail("pnpm not available; run corepack enable pnpm");
if (version("corepack")) ok("Corepack available"); else warn("Corepack not available in PATH");
if (existsSync("pnpm-lock.yaml")) ok("pnpm-lock.yaml present"); else fail("pnpm-lock.yaml missing");
if (existsSync("pnpm-workspace.yaml")) ok("pnpm-workspace.yaml present"); else fail("pnpm-workspace.yaml missing");
if (existsSync("turbo.json")) ok("turbo.json present"); else fail("turbo.json missing");
if (existsSync("contracts/data-models")) fail("central contracts/data-models is forbidden; move CUE-backed data models into the owning project/package"); else ok("no central data-model catalog present");
if (existsSync("AGENTS.md")) ok("root AGENTS.md present"); else fail("root AGENTS.md missing");
process.exit(failed ? 1 : 0);
