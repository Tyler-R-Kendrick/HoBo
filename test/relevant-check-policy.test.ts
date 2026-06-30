import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findCaseCollisions } from "../scripts/check-case-collisions.js";
import { selectRelevantChecks, type Check } from "../scripts/relevant-check-policy.js";

function plan(files: string[], overrides = {}) {
  return selectRelevantChecks({
    files,
    base: "origin/main",
    turboAvailable: true,
    ...overrides,
  });
}

function isAllPackageTurbo(check: Check) {
  return check.command === "pnpm"
    && check.args.join(" ") === "exec turbo run build typecheck lint test --filter=[HEAD^...HEAD]";
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

test("root dependency and task-graph config changes select all-package Turbo", () => {
  const dependencyPlan = plan(["package.json"], { rootPackageJsonScriptsOnlyChanged: false });
  const configPlan = plan(["turbo.json"], { rootPackageJsonScriptsOnlyChanged: true });

  assert.equal(dependencyPlan.checks.some(isAllPackageTurbo), true);
  assert.equal(configPlan.checks.some(isAllPackageTurbo), true);
});

test("draft aggregate folders without package metadata do not select workspace tests", () => {
  const { checks, workspaces } = plan(
    ["src/draft/epic-reference-implementations/_registry.md"],
    { workspacePackageExists: () => false },
  );

  assert.deepEqual(workspaces, []);
  assert.equal(checks.some((check) => check.args.includes("./src/draft/epic-reference-implementations")), false);
});

test("draft package files select workspace tests when package metadata exists", () => {
  const { checks, workspaces } = plan(
    ["src/draft/example-proof/src/index.ts"],
    { workspacePackageExists: (workspace: string) => workspace === "src/draft/example-proof" },
  );

  assert.deepEqual(workspaces, ["src/draft/example-proof"]);
  assert.equal(checks.some((check) => check.args.includes("./src/draft/example-proof")), true);
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
