import { spawnSync } from "node:child_process";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const base = baseArg?.slice("--base=".length) ?? process.env.HOBO_CHECK_BASE ?? "origin/main";
const staged = args.has("--staged");
const all = args.has("--all");
const explain = args.has("--explain");
const includeBuild = args.has("--build");

type Check = { command: string; args: string[]; reason: string; fallback?: Check[] };

function run(command: string, commandArgs: string[], options: { allowFailure?: boolean } = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n▶ ${printable}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: false });
  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

function runCheck(check: Check) {
  const status = run(check.command, check.args, { allowFailure: Boolean(check.fallback) });
  if (status === 0) return;

  if (check.fallback && isTurboNativeStartupFailure(status)) {
    console.warn("\nTurbo native binary failed at startup; running equivalent workspace test scripts.");
    for (const fallbackCheck of check.fallback) runCheck(fallbackCheck);
    return;
  }

  process.exit(status);
}

function isTurboNativeStartupFailure(status: number) {
  return process.platform === "win32" && status === 0xc0000135;
}

function capture(command: string, commandArgs: string[]) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", shell: false });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function changedFiles() {
  if (all) return capture("git", ["ls-files"]).split(/\r?\n/).filter(Boolean);
  if (staged) return capture("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).split(/\r?\n/).filter(Boolean);
  const mergeBase = capture("git", ["merge-base", base, "HEAD"]) || base;
  return capture("git", ["diff", "--name-only", "--diff-filter=ACMR", mergeBase, "HEAD"]).split(/\r?\n/).filter(Boolean);
}

function workspaceFor(file: string) {
  const normalized = file.split(path.sep).join("/");
  const match = normalized.match(/^src\/draft\/([^/]+)\//);
  return match ? `src/draft/${match[1]}` : undefined;
}

const files = changedFiles();
if (files.length === 0) {
  console.log("No changed files; skipping relevant checks.");
  process.exit(0);
}

const workspaces = [...new Set(files.map(workspaceFor).filter((value): value is string => Boolean(value)))];
const touched = (prefixes: string[]) => files.some((file) => prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)));
const touchedAny = (patterns: RegExp[]) => files.some((file) => patterns.some((pattern) => pattern.test(file)));

const checks: Check[] = [];
const automationChanged = touched(["scripts", ".githooks", ".github", ".codex", ".cursor", ".claude", ".agents"])
  || touchedAny([/^package\.json$/, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^turbo\.json$/]);
const rootConfigChanged = touchedAny([/^package\.json$/, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^turbo\.json$/, /^tsconfig.*\.json$/]);
const sourceChanged = touched(["src", "contracts", "test", "tests"]);
const docsChanged = touched(["docs"]) || touchedAny([/^README\.md$/, /^CONTRIBUTING\.md$/, /^AGENTS\.md$/, /^CLAUDE\.md$/]);
const schemaChanged = touched(["contracts"]) || touchedAny([/\.(proto|cue)$/]);
const pactChanged = touchedAny([/(^|\/)pacts\//, /\.pact\.json$/]);
const uiChanged = touched(["apps/web", "packages/ui"]) || touchedAny([/\.(tsx|jsx|css)$/]);
const behaviorChanged = touched(["tests/behavior", "features"]) || touchedAny([/playwright\.behavior\.config\./, /cucumber\.config\./]);
const visualChanged = touched(["tests/visual", "storybook"]) || touchedAny([/playwright\.visual\.config\./, /\.stories\./]);
const agentEvalChanged = touched(["evals"]) || touchedAny([/agent/i, /prompt/i]);

if (rootConfigChanged) {
  checks.push({ command: "pnpm", args: ["run", "install:check"], reason: "package manager or root task graph changed" });
}

if (sourceChanged || automationChanged) {
  checks.push({
    command: "pnpm",
    args: ["run", staged ? "architecture:guard:staged" : "architecture:guard", "--", `--base=${base}`],
    reason: "architecture-sensitive source or automation changed",
  });
}

if (schemaChanged) {
  checks.push({ command: "pnpm", args: ["run", "test:schema"], reason: "protobuf/CUE/schema changed; run schema compatibility lane" });
  checks.push({ command: "pnpm", args: ["run", "test:contract:consumer"], reason: "schema changes can affect consumer contracts" });
  checks.push({ command: "pnpm", args: ["run", "test:contract:provider"], reason: "schema changes can affect provider verification" });
} else if (pactChanged) {
  checks.push({ command: "pnpm", args: ["run", "test:contract"], reason: "PACT artifacts changed" });
}

if (workspaces.length > 0) {
  checks.push({
    command: "pnpm",
    args: ["exec", "turbo", "run", "test", ...workspaces.flatMap((workspace) => ["--filter", `./${workspace}`])],
    reason: `draft package unit/contract tests for ${workspaces.length} changed workspace(s)`,
    fallback: workspaces.map((workspace) => ({
      command: "pnpm",
      args: ["--filter", `./${workspace}`, "run", "test"],
      reason: `draft package test script for ${workspace}`,
    })),
  });
}

if (uiChanged) {
  checks.push({ command: "pnpm", args: ["run", "test:dom"], reason: "UI rendered-state lane for component/browser-surface changes" });
  checks.push({ command: "pnpm", args: ["run", "test:component"], reason: "component behavior lane uses mocked service boundaries" });
}

if (behaviorChanged) checks.push({ command: "pnpm", args: ["run", "test:behavior"], reason: "browser-driven behavior specs; never full-stack E2E" });
if (visualChanged) checks.push({ command: "pnpm", args: ["run", "test:visual"], reason: "visual/story state changed" });
if (agentEvalChanged) checks.push({ command: "pnpm", args: ["run", "eval:agent:mock"], reason: "agent workflow/eval changed; live evals are manual only" });

if (touched(["scripts", "test", "tests"]) || rootConfigChanged) {
  checks.push({ command: "pnpm", args: ["run", "test:root"], reason: "root scripts/tests changed" });
}

if (automationChanged || sourceChanged) {
  checks.push({ command: "pnpm", args: ["run", "standards:check", "--", "--staged", `--base=${base}`], reason: "technical standards evidence may need refreshing" });
}

if (docsChanged || automationChanged) {
  checks.push({ command: "pnpm", args: ["run", staged ? "lint:docs:staged" : "lint:docs:changed", "--", `--base=${base}`], reason: "markdown docs linters may be affected" });
  checks.push({ command: "pnpm", args: ["run", "docs:coverage"], reason: "documentation coverage may be affected" });
}

if (sourceChanged || automationChanged) checks.push({ command: "pnpm", args: ["run", staged ? "docs:freshness:staged" : "docs:freshness"], reason: "docs freshness gate for code/config changes" });
if (sourceChanged || automationChanged || docsChanged) checks.push({ command: "node", args: ["--import", "tsx", "scripts/validate-traceability.ts"], reason: "traceability evidence may be affected" });
if (sourceChanged || touched(["contracts"])) checks.push({ command: "node", args: ["--import", "tsx", "scripts/validate-deployment-set-delta.ts"], reason: "deployment delta contracts may be affected" });
if (includeBuild || (rootConfigChanged && !staged)) checks.push({ command: "pnpm", args: ["exec", "turbo", "run", "build", "typecheck", "lint", "test", "--filter=[HEAD^...HEAD]"], reason: "build-impacting changed check requested" });

console.log(`Changed files: ${files.length}`);
console.log(`Detected scope: ${[
  schemaChanged && "schema",
  pactChanged && "contract",
  uiChanged && "ui",
  behaviorChanged && "behavior",
  visualChanged && "visual",
  agentEvalChanged && "agent-eval",
  docsChanged && "docs",
  automationChanged && "automation",
].filter(Boolean).join(", ") || "standard"}`);
for (const check of checks) console.log(`- ${check.command} ${check.args.join(" ")} (${check.reason})`);

if (explain) process.exit(0);
for (const check of checks) runCheck(check);
