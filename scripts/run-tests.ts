import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BATCH_CHARS = process.platform === "win32" ? 500 : 12000;
const HEARTBEAT_MS = 5_000;
const TEST_CONCURRENCY_ARGS = process.platform === "win32" ? ["--test-concurrency=1"] : [];
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
