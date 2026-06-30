import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BATCH_CHARS = process.platform === "win32" ? 500 : 12000;
const HEARTBEAT_MS = 5_000;
const TEST_CONCURRENCY_ARGS = process.platform === "win32" ? ["--test-concurrency=1"] : [];

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
  const result = spawnSync("git", ["ls-files", ...patterns], {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

  if (current.length > 0) {
    grouped.push(current);
  }

  return grouped;
}

const testFiles = gitLsFiles(["*test.ts", "*test.mjs"]);

if (testFiles.length === 0) {
  console.error("no tracked TypeScript or ESM test files found");
  process.exit(1);
}

let failed = false;
const testBatches = batches(testFiles);
for (const [index, batch] of testBatches.entries()) {
  const batchNumber = index + 1;
  const outputPath = join(tmpdir(), `hobo-test-batch-${process.pid}-${batchNumber}.log`);
  const outputFd = openSync(outputPath, "w");
  const result = await runBatch(batch, batchNumber, testBatches.length, outputFd);
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
    rmSync(outputPath, { force: true });
  }
}

if (failed) {
  process.exitCode = 1;
}

function runBatch(
  batch: string[],
  batchNumber: number,
  batchCount: number,
  outputFd: number,
): Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error }> {
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...TEST_CONCURRENCY_ARGS, ...batch], {
    shell: false,
    stdio: ["ignore", outputFd, outputFd],
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
