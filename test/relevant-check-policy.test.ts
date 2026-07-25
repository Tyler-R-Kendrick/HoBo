import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import { findCaseCollisions } from "../scripts/check-case-collisions.js";
import {
	selectRelevantChecks,
	type Check,
} from "../scripts/relevant-check-policy.js";

function plan(files: string[], overrides = {}) {
	return selectRelevantChecks({
		files,
		base: "origin/main",
		...overrides,
	});
}

function isAllPackageTurbo(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args.join(" ") ===
			"exec turbo run build typecheck lint test --filter=[HEAD^...HEAD]"
	);
}

function isGlobalUnit(check: Check) {
	return check.command === "pnpm" && check.args.join(" ") === "run test:unit";
}

function isGlobalContract(check: Check) {
	return (
		check.command === "pnpm" && check.args.join(" ") === "run test:contract"
	);
}

function isGlobalContractConsumer(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args.join(" ") === "run test:contract:consumer"
	);
}

function isGlobalContractProvider(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args.join(" ") === "run test:contract:provider"
	);
}

function isWorkspaceTurboTest(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args[0] === "exec" &&
		check.args[1] === "turbo" &&
		check.args[2] === "run" &&
		check.args[3] === "test" &&
		check.args.some((arg) => arg.startsWith("--filter=./"))
	);
}

function turboTestSelects(checks: Check[], workspace: string) {
	return checks.some(
		(check) =>
			isWorkspaceTurboTest(check) &&
			check.args.includes(`--filter=./${workspace}`),
	);
}

function standardsCheck(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args[0] === "run" &&
		check.args[1] === "standards:check"
	);
}

function lintCodeCheck(check: Check) {
	return check.command === "pnpm" && check.args.join(" ") === "run lint:code";
}

function konsistentCheck(check: Check) {
	return check.command === "pnpm" && check.args.join(" ") === "run konsistent";
}

test("root script-only package changes do not select all-package Turbo", () => {
	const { checks } = plan(["package.json"], {
		rootPackageJsonScriptsOnlyChanged: true,
	});

	assert.equal(checks.some(isAllPackageTurbo), false);
	assert.equal(
		checks.some((check) => check.args.join(" ") === "run test:root"),
		true,
	);
});

test("lockfile importer-only changes do not select all-package Turbo", () => {
	const { checks } = plan(["pnpm-lock.yaml"]);

	assert.equal(checks.some(isAllPackageTurbo), false);
	assert.equal(
		checks.some((check) => check.args.join(" ") === "run install:check"),
		true,
	);
});

test("--build still selects all-package Turbo", () => {
	const { checks } = plan(["docs/agent-tooling.md"], { includeBuild: true });

	assert.equal(checks.some(isAllPackageTurbo), true);
});

test("root dependency and task-graph config changes do not select all-package Turbo by default", () => {
	const dependencyPlan = plan(["package.json"], {
		rootPackageJsonScriptsOnlyChanged: false,
	});
	const configPlan = plan(["turbo.json"], {
		rootPackageJsonScriptsOnlyChanged: true,
	});

	assert.equal(dependencyPlan.checks.some(isAllPackageTurbo), false);
	assert.equal(configPlan.checks.some(isAllPackageTurbo), false);
	assert.equal(
		dependencyPlan.checks.some(
			(check) => check.args.join(" ") === "run install:check",
		),
		true,
	);
	assert.equal(
		configPlan.checks.some(
			(check) => check.args.join(" ") === "run install:check",
		),
		true,
	);
});

test("worktree relevant checks pass standards base without staged mode", () => {
	const { checks } = plan(["scripts/run-relevant-checks.ts"]);
	const check = checks.find(standardsCheck);

	assert.ok(check);
	assert.equal(check.args.includes("--staged"), false);
	assert.equal(check.args.includes("--base=origin/main"), true);
});

test("staged relevant checks pass staged mode to standards", () => {
	const { checks } = plan(["scripts/run-relevant-checks.ts"], { staged: true });
	const check = checks.find(standardsCheck);

	assert.ok(check);
	assert.equal(check.args.includes("--staged"), true);
	assert.equal(check.args.includes("--base=origin/main"), true);
});

test("source changes select the Biome formatting lane", () => {
	const { checks } = plan(["packages/core/src/index.ts"]);

	assert.equal(checks.some(lintCodeCheck), true);
});

test("automation changes select the Biome formatting lane", () => {
	const { checks } = plan(["scripts/run-relevant-checks.ts"]);

	assert.equal(checks.some(lintCodeCheck), true);
});

test("docs-only changes do not select the Biome formatting lane", () => {
	const { checks } = plan(["docs/agent-tooling.md"]);

	assert.equal(checks.some(lintCodeCheck), false);
});

test("source changes select the konsistent structural lane", () => {
	const { checks } = plan(["packages/core/src/index.ts"]);

	assert.equal(checks.some(konsistentCheck), true);
});

test("konsistent.json changes select the konsistent structural lane", () => {
	const { checks } = plan(["konsistent.json"]);

	assert.equal(checks.some(konsistentCheck), true);
});

test("docs-only changes do not select the konsistent structural lane", () => {
	const { checks } = plan(["docs/agent-tooling.md"]);

	assert.equal(checks.some(konsistentCheck), false);
});

test("draft aggregate folders without package metadata do not select workspace tests", () => {
	const { checks, workspaces } = plan(["src/draft/epic-proofs/_registry.md"], {
		workspacePackageExists: () => false,
	});

	assert.deepEqual(workspaces, []);
	assert.equal(
		checks.some((check) => check.args.includes("./src/draft/epic-proofs")),
		false,
	);
});

test("draft package files select workspace tests when package metadata exists", () => {
	const { checks, workspaces } = plan(
		["src/draft/technical-proofs/example-proof/src/index.ts"],
		{
			workspacePackageExists: (workspace: string) =>
				workspace === "src/draft/technical-proofs/example-proof",
		},
	);

	assert.deepEqual(workspaces, ["src/draft/technical-proofs/example-proof"]);
	assert.equal(
		turboTestSelects(checks, "src/draft/technical-proofs/example-proof"),
		true,
	);
});

test("draft package README-only changes do not select workspace tests", () => {
	const { checks, workspaces } = plan(
		["src/draft/technical-proofs/example-proof/README.md"],
		{
			workspacePackageExists: (workspace: string) =>
				workspace === "src/draft/technical-proofs/example-proof",
		},
	);

	assert.deepEqual(workspaces, []);
	assert.equal(
		checks.some((check) =>
			check.args.includes("./src/draft/technical-proofs/example-proof"),
		),
		false,
	);
});

test("proof.json-only changes select draft artifact and cascade gates without workspace tests", () => {
	const workspace = "src/draft/technical-proofs/example-proof";
	const { checks, workspaces } = plan([`${workspace}/proof.json`], {
		workspacePackageExists: (candidate: string) => candidate === workspace,
	});

	assert.deepEqual(workspaces, []);
	assert.equal(checks.some(isWorkspaceTurboTest), false);
	assert.equal(
		checks.some(
			(check) =>
				check.args.join(" ") === "run draft:artifacts -- --base=origin/main",
		),
		true,
	);
	assert.equal(
		checks.some(
			(check) =>
				check.args.join(" ") === "run draft:cascade -- --base=origin/main",
		),
		true,
	);
});

test("move-only draft package files can be excluded from workspace tests", () => {
	const { checks, workspaces } = plan(
		["src/draft/technical-proofs/example-proof/src/index.ts"],
		{
			workspacePackageExists: (workspace: string) =>
				workspace === "src/draft/technical-proofs/example-proof",
			workspaceTestFiles: [],
		},
	);

	assert.deepEqual(workspaces, []);
	assert.equal(
		checks.some((check) =>
			check.args.includes("./src/draft/technical-proofs/example-proof"),
		),
		false,
	);
});

test("draft Pact changes stay on workspace tests instead of selecting global contract sweep", () => {
	const { checks } = plan([
		"src/draft/technical-proofs/broker-receipt-integrity-contract/architecture/pacts/broker_receipt_integrity.pact.json",
	]);

	assert.equal(checks.some(isGlobalContract), false);
	assert.equal(checks.some(isWorkspaceTurboTest), true);
});

test("shared Pact changes do not select global contract sweeps by default", () => {
	const { checks } = plan(["tests/pacts/runtime-provider.pact.json"]);

	assert.equal(checks.some(isGlobalContract), false);
	assert.equal(checks.some(isGlobalContractConsumer), false);
	assert.equal(checks.some(isGlobalContractProvider), false);
});

test("shared Pact final validation can opt into broad contract sweeps", () => {
	const { checks } = plan(["tests/pacts/runtime-provider.pact.json"], {
		includeBroadSweeps: true,
	});

	assert.equal(checks.some(isGlobalContract), false);
	assert.equal(checks.some(isGlobalContractConsumer), true);
	assert.equal(checks.some(isGlobalContractProvider), true);
});

test("root schema changes do not select broad contract sweeps by default", () => {
	const { checks } = plan(["contracts/runtime/runtime.proto"]);

	assert.equal(
		checks.some((check) => check.args.join(" ") === "run test:schema"),
		true,
	);
	assert.equal(checks.some(isGlobalContractConsumer), false);
	assert.equal(checks.some(isGlobalContractProvider), false);
});

test("root schema final validation can opt into broad contract sweeps", () => {
	const { checks } = plan(["contracts/runtime/runtime.proto"], {
		includeBroadSweeps: true,
	});

	assert.equal(
		checks.some((check) => check.args.join(" ") === "run test:schema"),
		true,
	);
	assert.equal(checks.some(isGlobalContractConsumer), true);
	assert.equal(checks.some(isGlobalContractProvider), true);
});

test("oversized draft workspace selections batch into one Turbo run instead of a global unit sweep", () => {
	const files = Array.from({ length: 520 }, (_, index) => {
		const slug = `very-long-draft-proof-package-name-${index.toString().padStart(4, "0")}-with-contract-fixtures-and-tests`;
		return `src/draft/technical-proofs/${slug}/test/proof.test.ts`;
	});
	const { checks, workspaces } = plan(files, {
		workspacePackageExists: () => true,
	});
	const workspaceTestChecks = checks.filter(isWorkspaceTurboTest);

	assert.equal(workspaces.length, 520);
	assert.equal(checks.some(isGlobalUnit), false);
	assert.equal(workspaceTestChecks.length, 1);
	const filters =
		workspaceTestChecks[0]?.args.filter((arg) =>
			arg.startsWith("--filter=./"),
		) ?? [];
	assert.equal(filters.length, 520);
});

test("draft package tests are delegated to Turbo with a path filter", () => {
	const { checks } = plan([
		"src/draft/technical-proofs/provider-authoring-contract/src/provider-authoring-contract.ts",
	]);

	assert.equal(
		turboTestSelects(
			checks,
			"src/draft/technical-proofs/provider-authoring-contract",
		),
		true,
	);
});

test("fast test script is root-only and full quiet unit lane remains explicit", () => {
	const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
		scripts: Record<string, string>;
	};

	assert.equal(
		packageJson.scripts["test:fast"],
		"node --import tsx scripts/run-tests.ts --root-only --quiet --no-artifacts",
	);
	assert.equal(
		packageJson.scripts["test:unit:quiet"],
		"node --import tsx scripts/run-tests.ts --category=unit --quiet --no-artifacts",
	);
});

test("experience-proof packages resolve through their type subfolder", () => {
	const workspace = "src/draft/exp-proofs/dx/app-dev-journey-contract";
	const { checks, workspaces } = plan([`${workspace}/src/app-dev-journey.ts`], {
		workspacePackageExists: (candidate: string) => candidate === workspace,
	});

	assert.deepEqual(workspaces, [workspace]);
	assert.equal(turboTestSelects(checks, workspace), true);
});

test("legacy two-level exp-proof paths no longer resolve to a workspace", () => {
	const { checks, workspaces } = plan(
		["src/draft/exp-proofs/app-dev-journey-contract/src/app-dev-journey.ts"],
		{ workspacePackageExists: () => true },
	);

	assert.deepEqual(workspaces, []);
	assert.equal(checks.some(isWorkspaceTurboTest), false);
});

test("exp-proof schema changes under type subfolders stay on workspace tests", () => {
	const workspace = "src/draft/exp-proofs/ux/vibe-workspace-project-states";
	const { checks } = plan(
		[`${workspace}/architecture/vibe_workspace_project_states.cue`],
		{ workspacePackageExists: (candidate: string) => candidate === workspace },
	);

	assert.equal(
		checks.some((check) => check.args.join(" ") === "run test:schema"),
		false,
	);
	assert.equal(checks.some(isWorkspaceTurboTest), true);
});

test("case-collision helper reports tracked paths that differ only by case", () => {
	assert.deepEqual(
		findCaseCollisions([
			"docs/ARCHITECTURE.md",
			"docs/architecture.md",
			"src/ok.ts",
		]),
		[["docs/architecture.md", "docs/ARCHITECTURE.md"]],
	);
	assert.deepEqual(
		findCaseCollisions(["docs/architecture.md", "src/ok.ts"]),
		[],
	);
});

function architectureGuardCheck(check: Check) {
	return (
		check.command === "pnpm" &&
		check.args[0] === "run" &&
		check.args[1] === "architecture:guard"
	);
}

test("production package source changes select architecture guard and workspace tests", () => {
	const { checks, workspaces } = plan(["packages/core/src/index.ts"], {
		workspacePackageExists: () => true,
	});

	assert.deepEqual(workspaces, ["packages/core"]);
	assert.equal(checks.some(architectureGuardCheck), true);
	assert.equal(turboTestSelects(checks, "packages/core"), true);
});

test("examples package source changes select architecture guard and workspace tests", () => {
	const { checks, workspaces } = plan(["examples/hello-bindle/src/main.ts"], {
		workspacePackageExists: () => true,
	});

	assert.deepEqual(workspaces, ["examples/hello-bindle"]);
	assert.equal(checks.some(architectureGuardCheck), true);
	assert.equal(turboTestSelects(checks, "examples/hello-bindle"), true);
});

test("production package schema changes select workspace tests instead of root schema lane", () => {
	const { checks, workspaces } = plan(
		["packages/core/data-models/core.proto"],
		{ workspacePackageExists: () => true },
	);

	assert.deepEqual(workspaces, ["packages/core"]);
	assert.equal(
		checks.some((check) => check.args.join(" ") === "run test:schema"),
		false,
	);
	assert.equal(turboTestSelects(checks, "packages/core"), true);
});

test("root script and test changes select the root typecheck lane", () => {
	const { checks } = plan(["scripts/run-relevant-checks.ts"]);

	assert.equal(
		checks.some((check) => check.args.join(" ") === "run typecheck:root"),
		true,
	);
});

test("nested production category packages resolve to their own workspace", () => {
	const workspace = "packages/runtimes/runtime-local";
	const { checks, workspaces } = plan([`${workspace}/src/host.ts`], {
		workspacePackageExists: (candidate: string) => candidate === workspace,
	});

	assert.deepEqual(workspaces, [workspace]);
	assert.equal(turboTestSelects(checks, workspace), true);
});

function isBehaviorLane(check: Check) {
	return (
		check.command === "pnpm" && check.args.join(" ") === "run test:behavior"
	);
}

test("editing an epic-proof feature file trips the behavior lane", () => {
	const { checks } = plan([
		"src/draft/epic-proofs/finops-budget-routing-control-plane/features/finops-budget-routing-control-plane.feature",
	]);
	assert.ok(checks.some(isBehaviorLane));
});

test("editing a step definition trips the behavior lane", () => {
	const { checks } = plan([
		"src/draft/epic-proofs/finops-budget-routing-control-plane/features/steps/steps.ts",
	]);
	assert.ok(checks.some(isBehaviorLane));
});

test("editing cucumber.yaml trips the behavior lane", () => {
	const { checks } = plan(["cucumber.yaml"]);
	assert.ok(checks.some(isBehaviorLane));
});

test("unrelated docs edits do not trip the behavior lane", () => {
	const { checks } = plan(["docs/design/vision.md"]);
	assert.ok(!checks.some(isBehaviorLane));
});
