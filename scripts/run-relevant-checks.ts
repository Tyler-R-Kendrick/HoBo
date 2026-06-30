import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { selectRelevantChecks, type Check } from "./relevant-check-policy.js";

const args = new Set(process.argv.slice(2));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const base = baseArg?.slice("--base=".length) ?? process.env.HOBO_CHECK_BASE ?? "origin/main";
const staged = args.has("--staged");
const all = args.has("--all");
const explain = args.has("--explain");
const includeBuild = args.has("--build");

function commandForPlatform(command: string, commandArgs: string[]) {
  if (process.platform === "win32" && command === "pnpm") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/c", "pnpm.cmd", ...commandArgs],
    };
  }

  return { command, args: commandArgs };
}

function run(command: string, commandArgs: string[]) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n▶ ${printable}`);
  const platformCommand = commandForPlatform(command, commandArgs);
  const result = spawnSync(platformCommand.command, platformCommand.args, { stdio: "inherit", shell: false });
  if (result.status !== 0 && isTurboWorkspaceTest(command, commandArgs) && runWorkspaceTestFallback(commandArgs) === 0) {
    return 0;
  }
  return result.status ?? 1;
}

function runAsync(check: Check): Promise<number> {
  const printable = [check.command, ...check.args].join(" ");
  console.log(`\n▶ ${printable}`);
  const platformCommand = commandForPlatform(check.command, check.args);
  const child = spawn(platformCommand.command, platformCommand.args, { stdio: "inherit", shell: false });

  return new Promise<number>((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (status) => resolve(status ?? 1));
  }).then((status) => {
    if (status !== 0 && isTurboWorkspaceTest(check.command, check.args) && runWorkspaceTestFallback(check.args) === 0) {
      return 0;
    }
    return status;
  });
}

function isTurboWorkspaceTest(command: string, commandArgs: string[]) {
  return command === "pnpm"
    && commandArgs[0] === "exec"
    && commandArgs[1] === "turbo"
    && commandArgs[2] === "run"
    && commandArgs[3] === "test";
}

function runWorkspaceTestFallback(commandArgs: string[]) {
  const workspaces = commandArgs
    .flatMap((arg, index) => arg === "--filter" ? [commandArgs[index + 1]] : [])
    .filter((workspace): workspace is string => Boolean(workspace))
    .map((workspace) => workspace.replace(/^\.\//u, ""));

  if (workspaces.length === 0) return 1;

  console.warn("Turbo workspace test runner failed before completion; falling back to direct workspace test scripts.");
  for (const workspace of workspaces) {
    if (!fs.existsSync(path.join(workspace, "package.json"))) {
      console.warn(`Skipping ${workspace}; no package.json test script manifest exists.`);
      continue;
    }
    const status = run("pnpm", ["--prefix", workspace, "test"]);
    if (status !== 0) return status;
  }
  return 0;
}

function capture(command: string, commandArgs: string[]) {
  const platformCommand = commandForPlatform(command, commandArgs);
  const result = spawnSync(platformCommand.command, platformCommand.args, { encoding: "utf8", shell: false });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function changedFiles() {
  if (all) return capture("git", ["ls-files"]).split(/\r?\n/).filter(Boolean);
  if (staged) return capture("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).split(/\r?\n/).filter(Boolean);
  return capture("git", ["diff", "--name-only", "--diff-filter=ACMR", diffBase, "HEAD"]).split(/\r?\n/).filter(Boolean);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rootPackageJsonScriptsOnlyChanged() {
  if (staged || all) return false;
  const beforeRaw = capture("git", ["show", `${diffBase}:package.json`]);
  if (!beforeRaw || !fs.existsSync("package.json")) return false;

  try {
    const before = JSON.parse(beforeRaw) as Record<string, unknown>;
    const after = JSON.parse(fs.readFileSync("package.json", "utf8")) as Record<string, unknown>;
    delete before.scripts;
    delete after.scripts;
    return stableJson(before) === stableJson(after);
  } catch {
    return false;
  }
}

const diffBase = capture("git", ["merge-base", base, "HEAD"]) || base;
const files = changedFiles();
if (files.length === 0) {
  console.log("No changed files; skipping relevant checks.");
  process.exit(0);
}

const turboAvailable = Boolean(capture("pnpm", ["exec", "turbo", "--version"]));
const { checks, scopes } = selectRelevantChecks({
  files,
  base,
  staged,
  all,
  includeBuild,
  rootPackageJsonScriptsOnlyChanged: rootPackageJsonScriptsOnlyChanged(),
  turboAvailable,
});

console.log(`Changed files: ${files.length}`);
console.log(`Detected scope: ${scopes.join(", ") || "standard"}`);
for (const check of checks) console.log(`- ${check.command} ${check.args.join(" ")} (${check.reason})`);

if (explain) process.exit(0);

for (const check of checks.filter((check) => check.serial)) {
  const status = run(check.command, check.args);
  if (status !== 0) process.exit(status);
}

const parallelChecks = checks.filter((check) => !check.serial);
const statuses = await Promise.all(parallelChecks.map(runAsync));
const failed = statuses.find((status) => status !== 0);
if (failed) process.exit(failed);
