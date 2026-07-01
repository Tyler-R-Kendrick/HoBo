import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findCaseCollisions } from "../scripts/check-case-collisions.js";
import { selectRelevantChecks, type Check } from "../scripts/relevant-check-policy.js";

function plan(files: string[], overrides = {}) {
  return selectRelevantChecks({
    files,
    base: "origin/main",
    ...overrides,
  });
}

function isAllPackageTurbo(check: Check) {
  return check.command === "pnpm"
    && check.args.join(" ") === "exec turbo run build typecheck lint test --filter=[HEAD^...HEAD]";
}

function isGlobalUnit(check: Check) {
  return check.command === "pnpm" && check.args.join(" ") === "run test:unit";
}

function isGlobalContract(check: Check) {
  return check.command === "pnpm" && check.args.join(" ") === "run test:contract";
}

function isGlobalContractConsumer(check: Check) {
  return check.command === "pnpm" && check.args.join(" ") === "run test:contract:consumer";
}

function isGlobalContractProvider(check: Check) {
  return check.command === "pnpm" && check.args.join(" ") === "run test:contract:provider";
}

function isWorkspacePrefixTest(check: Check) {
  return check.command === "pnpm"
    && check.args[0] === "--prefix"
    && check.args[2] === "test";
}

test("root script-only package changes do not select all-package Turbo", () => {
  const { checks } = plan(["package.json"], { rootPackageJsonScriptsOnlyChanged: true });

  assert.equal(checks.some(isAllPackageTurbo), false);
  assert.equal(checks.some((check) => check.args.join(" ") === "run test:root"), true);
});

test("lockfile importer-only changes do not select all-package Turbo", () => {
  const { checks } = plan(["pnpm-lock.yaml"]);

  assert.equal(checks.some(isAllPackageTurbo), false);
  assert.equal(checks.some((check) => check.args.join(" ") === "run install:check"), true);
});

test("--build still selects all-package Turbo", () => {
  const { checks } = plan(["docs/agent-tooling.md"], { includeBuild: true });

  assert.equal(checks.some(isAllPackageTurbo), true);
});

test("root dependency and task-graph config changes do not select all-package Turbo by default", () => {
  const dependencyPlan = plan(["package.json"], { rootPackageJsonScriptsOnlyChanged: false });
  const configPlan = plan(["turbo.json"], { rootPackageJsonScriptsOnlyChanged: true });

  assert.equal(dependencyPlan.checks.some(isAllPackageTurbo), false);
  assert.equal(configPlan.checks.some(isAllPackageTurbo), false);
  assert.equal(dependencyPlan.checks.some((check) => check.args.join(" ") === "run install:check"), true);
  assert.equal(configPlan.checks.some((check) => check.args.join(" ") === "run install:check"), true);
});

test("draft aggregate folders without package metadata do not select workspace tests", () => {
  const { checks, workspaces } = plan(
    ["src/draft/epic-proofs/_registry.md"],
    { workspacePackageExists: () => false },
  );

  assert.deepEqual(workspaces, []);
  assert.equal(checks.some((check) => check.args.includes("./src/draft/epic-proofs")), false);
});

test("draft package files select workspace tests when package metadata exists", () => {
  const { checks, workspaces } = plan(
    ["src/draft/technical-proofs/example-proof/src/index.ts"],
    { workspacePackageExists: (workspace: string) => workspace === "src/draft/technical-proofs/example-proof" },
  );

  assert.deepEqual(workspaces, ["src/draft/technical-proofs/example-proof"]);
  assert.equal(checks.some((check) => check.args.join(" ") === "--prefix src/draft/technical-proofs/example-proof test"), true);
});

test("draft package README-only changes do not select workspace tests", () => {
  const { checks, workspaces } = plan(
    ["src/draft/technical-proofs/example-proof/README.md"],
    { workspacePackageExists: (workspace: string) => workspace === "src/draft/technical-proofs/example-proof" },
  );

  assert.deepEqual(workspaces, []);
  assert.equal(checks.some((check) => check.args.includes("./src/draft/technical-proofs/example-proof")), false);
});

test("move-only draft package files can be excluded from workspace tests", () => {
  const { checks, workspaces } = plan(
    ["src/draft/technical-proofs/example-proof/src/index.ts"],
    {
      workspacePackageExists: (workspace: string) => workspace === "src/draft/technical-proofs/example-proof",
      workspaceTestFiles: [],
    },
  );

  assert.deepEqual(workspaces, []);
  assert.equal(checks.some((check) => check.args.includes("./src/draft/technical-proofs/example-proof")), false);
});

test("draft Pact changes stay on workspace tests instead of selecting global contract sweep", () => {
  const { checks } = plan([
    "src/draft/technical-proofs/broker-receipt-integrity-contract/architecture/pacts/broker_receipt_integrity.pact.json",
  ]);

  assert.equal(checks.some(isGlobalContract), false);
  assert.equal(checks.some(isWorkspacePrefixTest), true);
});

test("shared Pact changes still select the global contract sweep", () => {
  const { checks } = plan(["tests/pacts/runtime-provider.pact.json"]);

  assert.equal(checks.some(isGlobalContract), true);
});

test("root schema changes do not select broad contract sweeps by default", () => {
  const { checks } = plan(["contracts/runtime/runtime.proto"]);

  assert.equal(checks.some((check) => check.args.join(" ") === "run test:schema"), true);
  assert.equal(checks.some(isGlobalContractConsumer), false);
  assert.equal(checks.some(isGlobalContractProvider), false);
});

test("root schema final validation can opt into broad contract sweeps", () => {
  const { checks } = plan(["contracts/runtime/runtime.proto"], { includeBroadSweeps: true });

  assert.equal(checks.some((check) => check.args.join(" ") === "run test:schema"), true);
  assert.equal(checks.some(isGlobalContractConsumer), true);
  assert.equal(checks.some(isGlobalContractProvider), true);
});

test("oversized draft workspace selections stay direct instead of falling back to global unit sweep", () => {
  const files = Array.from({ length: 520 }, (_, index) => {
    const slug = `very-long-draft-proof-package-name-${index.toString().padStart(4, "0")}-with-contract-fixtures-and-tests`;
    return `src/draft/technical-proofs/${slug}/test/proof.test.ts`;
  });
  const { checks, workspaces } = plan(files, { workspacePackageExists: () => true });
  const workspaceTestChecks = checks.filter(isWorkspacePrefixTest);

  assert.equal(workspaces.length, 520);
  assert.equal(checks.some(isGlobalUnit), false);
  assert.equal(workspaceTestChecks.length, 520);
  assert.ok(
    workspaceTestChecks.every((check) => check.args[0] === "--prefix" && check.args[2] === "test"),
  );
});

test("draft package tests use direct workspace prefixes", () => {
  const { checks } = plan(
    ["src/draft/technical-proofs/provider-authoring-contract/src/provider-authoring-contract.ts"],
  );

  assert.equal(
    checks.some((check) => check.args.join(" ") === "--prefix src/draft/technical-proofs/provider-authoring-contract test"),
    true,
  );
});

test("fast test script is root-only and full quiet unit lane remains explicit", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts["test:fast"], "node --import tsx scripts/run-tests.ts --root-only --quiet --no-artifacts");
  assert.equal(packageJson.scripts["test:unit:quiet"], "node --import tsx scripts/run-tests.ts --category=unit --quiet --no-artifacts");
});

test("case-collision helper reports tracked paths that differ only by case", () => {
  assert.deepEqual(
    findCaseCollisions(["docs/ARCHITECTURE.md", "docs/architecture.md", "src/ok.ts"]),
    [["docs/architecture.md", "docs/ARCHITECTURE.md"]],
  );
  assert.deepEqual(findCaseCollisions(["docs/architecture.md", "src/ok.ts"]), []);
});
