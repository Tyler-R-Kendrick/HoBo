import { spawnSync } from "node:child_process";

const MAX_BATCH_CHARS = 6000;
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
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...batch], {
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(
      `test batch ${index + 1}/${testBatches.length} failed with status ${result.status ?? "unknown"} signal ${result.signal ?? "none"} error ${result.error?.message ?? "none"}: ${batch[0]} .. ${batch[batch.length - 1]}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
