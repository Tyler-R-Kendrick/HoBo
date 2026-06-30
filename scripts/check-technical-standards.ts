import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

type Mode = "worktree" | "staged";

let base = "";
let mode: Mode = "worktree";
let baseRefExists: boolean | undefined;
const failures: string[] = [];

for (const arg of process.argv.slice(2)) {
  if (arg === "--staged") {
    mode = "staged";
  } else if (arg.startsWith("--base=")) {
    base = arg.slice("--base=".length);
  } else if (arg === "--help" || arg === "-h") {
    console.log(`Usage: node --import tsx scripts/check-technical-standards.ts [--staged] [--base=<git-ref>]

Enforces HoBo's compile-time-first technical standards on changed files:
- TypeScript toolchain is declared in package metadata.
- New JavaScript-family implementation files are rejected in favor of .ts.
- Canonical agent/design docs keep the Protobuf, CUE, parse-don't-validate,
  and PACT guidance present.
- Repository-wide data-model catalogs stay forbidden; CUE-backed data models
  live beside the package/project that owns the type.`);
    process.exit(0);
  }
}

function fail(message: string): void {
  failures.push(message);
}

function requireText(file: string, pattern: RegExp, message: string): void {
  const contents = readFileSync(file, "utf8");
  if (!pattern.test(contents)) {
    fail(message);
  }
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  }

  return result.stdout;
}

function baseRefAvailable(): boolean {
  if (!base) {
    return false;
  }
  baseRefExists ??= spawnSync("git", ["rev-parse", "--verify", `${base}^{commit}`], {
    shell: false,
    stdio: "ignore",
  }).status === 0;
  return baseRefExists;
}

function existsAtBase(file: string): boolean {
  if (!baseRefAvailable()) {
    return false;
  }
  return spawnSync("git", ["cat-file", "-e", `${base}:${file}`], {
    shell: false,
    stdio: "ignore",
  }).status === 0;
}

function changedFiles(): string[] {
  const nameStatus =
    mode === "staged"
      ? run("git", ["diff", "--cached", "--name-status", "--diff-filter=ACMR"])
      : base
        ? run("git", ["diff", "--name-status", "--diff-filter=ACMR", `${base}...HEAD`])
        : run("git", ["diff", "--name-status", "--diff-filter=ACMR", "HEAD"]);

  const changed = nameStatus
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [status, firstPath, secondPath] = line.split(/\t/);
      if (!status) {
        return [];
      }
      if (status.startsWith("R") || status.startsWith("C")) {
        return secondPath ? [{ status: "A", file: secondPath }] : [];
      }
      return firstPath ? [{ status, file: firstPath }] : [];
    })
    .filter((entry) => entry.status.startsWith("A"))
    .map((entry) => entry.file);

  const addedFiles =
    mode === "staged" && base
      ? changed.filter((file) => !existsAtBase(file))
      : changed;

  if (mode === "worktree" && !base) {
    const untracked = run("git", ["ls-files", "--others", "--exclude-standard"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    addedFiles.push(...untracked);
  }

  return addedFiles;
}

function isJavaScriptImplementationFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return (
    /^(src|scripts|test)\//.test(normalized) &&
    /\.(?:js|mjs|cjs)$/.test(normalized)
  );
}

requireText("package.json", /"typescript"\s*:/, "package.json: missing TypeScript dev dependency");
requireText("pnpm-lock.yaml", /typescript@6\.0\.3/, "pnpm-lock.yaml: missing locked TypeScript toolchain");
requireText("AGENTS.md", /Protobuf/, "AGENTS.md: missing Protobuf agent guidance");
requireText("AGENTS.md", /CUE/, "AGENTS.md: missing CUE agent guidance");
requireText("AGENTS.md", /Parse, don't validate/, "AGENTS.md: missing parse-don't-validate guidance");
requireText("AGENTS.md", /PACT/, "AGENTS.md: missing PACT agent guidance");
requireText("docs/design/technical-standards.md", /Protobuf/, "technical standards: missing Protobuf guidance");
requireText("docs/design/technical-standards.md", /CUE/, "technical standards: missing CUE guidance");
requireText("docs/design/technical-standards.md", /Parse, don't validate/, "technical standards: missing parse-don't-validate guidance");
requireText("docs/design/technical-standards.md", /PACT/, "technical standards: missing PACT guidance");

const newJavaScriptFiles = changedFiles().filter(isJavaScriptImplementationFile).sort();
if (newJavaScriptFiles.length > 0) {
  fail(
    [
      "New JavaScript-family implementation files detected; use TypeScript (.ts) for new code or document an ADR exception:",
      ...newJavaScriptFiles.map((file) => `- ${file}`),
    ].join("\n"),
  );
}

if (existsSync("contracts/data-models")) {
  fail("central contracts/data-models is forbidden; CUE-backed data models must live in the owning project/package data-models folder");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
if (packageJson.scripts?.["contracts:data-models"]) {
  fail("package.json must not define contracts:data-models; do not regenerate a central data-model catalog");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("technical standards ok");
