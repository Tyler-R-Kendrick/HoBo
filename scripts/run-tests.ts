import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const MAX_BATCH_CHARS = process.platform === "win32" ? 500 : 12000;
const HEARTBEAT_MS = 5_000;
const TEST_CONCURRENCY_ARGS = process.platform === "win32" ? ["--test-concurrency=1"] : [];
const RUN_TMP_ROOT = process.env.HOBO_TEST_TMPDIR ?? join(process.cwd(), ".tmp", "test-runs");
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
const runTmpDir = mkdtempSync(join(RUN_TMP_ROOT, `run-${process.pid}-`));

let failed = false;
const testBatches = batches(testFiles);
for (const [index, batch] of testBatches.entries()) {
  const batchNumber = index + 1;
  const batchTmpDir = join(runTmpDir, `batch-${batchNumber}`);
  mkdirSync(batchTmpDir, { recursive: true });
  const outputPath = join(batchTmpDir, "node-test.log");
  const outputFd = openSync(outputPath, "w");
  const result = await runBatch(batch, batchNumber, testBatches.length, outputFd, batchTmpDir);
  closeSync(outputFd);

  if (result.status !== 0 || result.error) {
    process.stdout.write(readFileSync(outputPath, "utf8"));
    console.error(
      `test batch ${batchNumber}/${testBatches.length} failed with status ${result.status ?? result.signal ?? "unknown"}${result.error ? ` (${result.error.message})` : ""}: ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
    failed = true;
  } else {
    console.log(
      `test batch ${batchNumber}/${testBatches.length} passed: ${batch.length} file(s), ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
    rmSync(batchTmpDir, { force: true, recursive: true });
  }
}

if (failed) {
  console.error(`failed test artifacts kept in ${runTmpDir}`);
  process.exitCode = 1;
} else {
  rmSync(runTmpDir, { force: true, recursive: true });
}

function runBatch(
  batch: string[],
  batchNumber: number,
  batchCount: number,
  outputFd: number,
  tmpDir: string,
): Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error }> {
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...TEST_CONCURRENCY_ARGS, ...batch], {
    shell: false,
    stdio: ["ignore", outputFd, outputFd],
    env: { ...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir },
  });

  const heartbeat = setInterval(() => {
    console.log(
      `test batch ${batchNumber}/${batchCount} still running: ${batch.length} file(s), ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
  }, HEARTBEAT_MS);

  return new Promise((resolve) => {
    child.once("error", (error) => {
      clearInterval(heartbeat);
      resolve({ status: null, signal: null, error });
    });
    child.once("exit", (status, signal) => {
      clearInterval(heartbeat);
      resolve({ status, signal });
    });
  });
}
