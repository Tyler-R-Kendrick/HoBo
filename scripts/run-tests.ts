import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MAX_BATCH_CHARS = process.platform === "win32" ? 500 : 12000;
const HEARTBEAT_MS = 5_000;
const MAX_OUTPUT_CHARS = 96 * 1024;
const STALE_RUN_MS = 24 * 60 * 60 * 1000;
const TEST_CONCURRENCY_ARGS = process.platform === "win32" ? ["--test-concurrency=1"] : [];
const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet");
const artifactsEnabled = !quiet && !args.has("--no-artifacts");
const workspaceHash = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);
const workerId = safePathSegment(
  process.env.HOBO_TEST_WORKER_ID
    ?? process.env.TURBO_TASK_ID
    ?? process.env.TURBO_HASH
    ?? process.env.CI_NODE_INDEX
    ?? "local",
);
const RUN_TMP_ROOT = process.env.HOBO_TEST_TMPDIR
  ? resolve(process.env.HOBO_TEST_TMPDIR)
  : join(tmpdir(), "hobo-design-tests", workspaceHash, `worker-${workerId}`);
const categoryArg = process.argv.find((arg) => arg.startsWith("--category="));
const category = categoryArg?.slice("--category=".length) ?? "unit";
const rootOnly = process.argv.includes("--root-only");

const categories: Record<string, string[]> = {
  unit: rootOnly ? ["test/*test.ts", "test/*test.mjs"] : ["test/*test.ts", "test/*test.mjs", "src/draft/*/test/*test.ts", "src/draft/*/test/*test.mjs"],
  types: ["src/draft/*/type-tests/*.ts", "src/draft/*/test-types/*.ts", "**/*.test-d.ts"],
  "contract-consumer": ["src/draft/*/test/*contract*.test.ts", "src/draft/*/test/*contract*.test.mjs", "test/*contract*.test.ts"],
  "contract-provider": ["src/draft/*/test/*provider*.test.ts", "src/draft/*/test/*provider*.test.mjs", "test/*provider*.test.ts"],
  dom: ["tests/dom/**/*test.ts", "test/dom/**/*test.ts"],
  component: ["tests/component/**/*test.ts", "test/component/**/*test.ts"],
  behavior: ["tests/behavior/**/*test.ts", "features/**/*.feature"],
  visual: ["tests/visual/**/*test.ts"],
  "agent-mock": ["evals/**/*.mock.test.ts", "test/evals/**/*.mock.test.ts"],
  "agent-live": ["evals/**/*.live.test.ts", "test/evals/**/*.live.test.ts"],
};

// Known compile-heavy TypeScript consumer tests that must run in their own
// batch so a grouped Node test-file wrapper failure cannot mask them.
const ISOLATED_TEST_FILES = new Set([
  "src/draft/auth-port-rbac-resolution-contract/test/auth-port-rbac-resolution.test.ts",
  "src/draft/built-in-policy-engine-contract/test/built-in-policy-engine.test.ts",
  "src/draft/camp-mapping-sugar-compiler/test/camp-mapping-sugar-compiler.test.ts",
  "src/draft/domain-validation-gate-contract/test/domain-validation-gate.test.ts",
  "src/draft/end-user-authorization-policy-contract/test/end-user-authorization-policy.test.ts",
  "src/draft/hobo-auth-authoring-surface/test/auth-authoring-surface.test.ts",
  "src/draft/hobo-codegen-cli-contract/test/codegen-cli-contract.test.ts",
  "src/draft/hobo-config-secret-schema-contract/test/config-schema-contract.test.ts",
  "src/draft/hobo-new-scaffold-contract/test/scaffold.test.ts",
  "src/draft/hobo-wit-toolchain-contract/test/wit-toolchain-contract.test.ts",
  "src/draft/ifc-author-flow-contract/test/ifc-author-flow.test.mjs",
  "src/draft/matching-engine-skeleton-contract/test/matching-engine.test.ts",
  "src/draft/planner-dag-skeleton-contract/test/planner.test.ts",
  "src/draft/policy-authoring-waiver-contract/test/policy-authoring-waiver.test.ts",
  "src/draft/policy-engine-provider-adapters-contract/test/policy-engine-provider-adapters.test.ts",
  "src/draft/projection-consistency-reactivity-contract/test/type-contract.test.ts",
  "src/draft/projection-sink-change-feed-conformance-contract/test/type-contract.test.ts",
  "src/draft/provider-default-definitions-contract/test/provider-default-definitions.test.ts",
  "src/draft/sdk-flag-surface-contract/test/sdk-flag-surface.test.ts",
  "src/draft/streamer-runtime-port-contract/test/streamer-runtime-port.test.ts",
]);

function gitLsFiles(patterns: string[]): string[] {
  const result = spawnSync("git", ["ls-files", ...patterns], { encoding: "utf8", shell: false });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function batches(files: string[]): string[][] {
  const grouped: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const file of files) {
    if (ISOLATED_TEST_FILES.has(file)) {
      if (current.length > 0) {
        grouped.push(current);
        current = [];
        currentLength = 0;
      }
      grouped.push([file]);
      continue;
    }

    const projectedLength = currentLength + file.length + 1;
    if (current.length > 0 && projectedLength > MAX_BATCH_CHARS) {
      grouped.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(file);
    currentLength += file.length + 1;
  }
  if (current.length > 0) grouped.push(current);
  return grouped;
}

const patterns = categories[category];
if (!patterns) {
  console.error(`unknown test category: ${category}`);
  process.exit(1);
}

const testFiles = gitLsFiles(patterns).filter((file) => !file.endsWith(".feature"));
if (testFiles.length === 0) {
  console.log(`No ${category} tests found; lane skipped.`);
  process.exit(0);
}

mkdirSync(RUN_TMP_ROOT, { recursive: true });
pruneStaleRuns(RUN_TMP_ROOT);
const runTmpDir = mkdtempSync(join(RUN_TMP_ROOT, `run-${process.pid}-`));

let failed = false;
const testBatches = batches(testFiles);
for (const [index, batch] of testBatches.entries()) {
  const batchNumber = index + 1;
  const batchTmpDir = join(runTmpDir, `batch-${batchNumber}`);
  mkdirSync(batchTmpDir, { recursive: true });
  const result = await runBatch(batch, batchNumber, testBatches.length, batchTmpDir);

  if (result.status !== 0 || result.error) {
    if (result.output && (quiet || artifactsEnabled)) process.stdout.write(result.output);
    console.error(
      `test batch ${batchNumber}/${testBatches.length} failed with status ${result.status ?? result.signal ?? "unknown"}${result.error ? ` (${result.error.message})` : ""}: ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
    if (artifactsEnabled) {
      const outputPath = join(batchTmpDir, "node-test.log");
      writeFileSync(outputPath, result.output ?? "", "utf8");
      console.error(`test batch ${batchNumber}/${testBatches.length} failure log: ${outputPath}`);
    }
    failed = true;
  } else {
    if (!quiet) {
      console.log(
        `test batch ${batchNumber}/${testBatches.length} passed: ${batch.length} file(s), ${batch[0]} .. ${batch[batch.length - 1]}`,
      );
    }
    removeTempDir(batchTmpDir);
  }
}

if (failed) {
  if (artifactsEnabled) console.error(`failed test artifacts kept in ${runTmpDir}`);
  else removeTempDir(runTmpDir);
  process.exitCode = 1;
} else {
  removeTempDir(runTmpDir);
}

function runBatch(
  batch: string[],
  batchNumber: number,
  batchCount: number,
  tmpDir: string,
): Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error; output: string }> {
  const outputTail = createOutputTail(MAX_OUTPUT_CHARS);
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...TEST_CONCURRENCY_ARGS, ...batch], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir },
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    outputTail.append(text);
    if (!quiet && !artifactsEnabled) process.stdout.write(text);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    outputTail.append(text);
    if (!quiet && !artifactsEnabled) process.stderr.write(text);
  });

  const heartbeat = quiet ? undefined : setInterval(() => {
    console.log(
      `test batch ${batchNumber}/${batchCount} still running: ${batch.length} file(s), ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
  }, HEARTBEAT_MS);

  return new Promise((resolve) => {
    child.once("error", (error) => {
      if (heartbeat) clearInterval(heartbeat);
      resolve({ status: null, signal: null, error, output: outputTail.text() });
    });
    child.once("exit", (status, signal) => {
      if (heartbeat) clearInterval(heartbeat);
      resolve({ status, signal, output: outputTail.text() });
    });
  });
}

function safePathSegment(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 48);
  return sanitized || "local";
}

function pruneStaleRuns(root: string) {
  if (!existsSync(root)) return;
  const cutoff = Date.now() - STALE_RUN_MS;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^run-\d+-/u.test(entry.name)) continue;
    const fullPath = join(root, entry.name);
    try {
      if (statSync(fullPath).mtimeMs < cutoff) rmSync(fullPath, { force: true, recursive: true });
    } catch {
      // Another worker may be pruning or deleting its own stale run.
    }
  }
}

function removeTempDir(path: string) {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch (error) {
    if (!quiet) console.warn(`could not remove temp directory ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createOutputTail(maxChars: number) {
  let value = "";
  let truncated = false;

  return {
    append(chunk: string) {
      value += chunk;
      if (value.length > maxChars) {
        value = value.slice(value.length - maxChars);
        truncated = true;
      }
    },
    text() {
      return truncated ? `[output truncated to last ${maxChars} chars]\n${value}` : value;
    },
  };
}
