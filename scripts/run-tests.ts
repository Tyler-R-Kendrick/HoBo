import { spawnSync } from "node:child_process";

const MAX_BATCH_CHARS = 12000;
const TEST_CONCURRENCY = process.env.HOBO_NODE_TEST_CONCURRENCY ?? "4";
const TEST_TIMEOUT_MS = Number.parseInt(process.env.HOBO_NODE_TEST_TIMEOUT_MS ?? "300000", 10);

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
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      `--test-concurrency=${TEST_CONCURRENCY}`,
      `--test-timeout=${TEST_TIMEOUT_MS}`,
      ...batch,
    ],
    {
      encoding: "utf8",
      shell: false,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    console.error(
      `test batch ${index + 1}/${testBatches.length} failed with status ${result.status ?? "unknown"}: ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
