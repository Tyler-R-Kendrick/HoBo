import { existsSync } from "node:fs";

import { workspaceForDraftFile } from "./lib/proof-manifest.ts";

export type Check = {
	command: string;
	args: string[];
	reason: string;
	serial?: boolean;
};

export type RelevantCheckPolicyOptions = {
	files: string[];
	base: string;
	workspaceTestFiles?: string[];
	staged?: boolean;
	all?: boolean;
	includeBuild?: boolean;
	includeBroadSweeps?: boolean;
	rootPackageJsonScriptsOnlyChanged?: boolean;
	workspacePackageExists?: (workspace: string) => boolean;
};

export type RelevantCheckPolicy = {
	checks: Check[];
	scopes: string[];
	workspaces: string[];
};

export function workspaceFor(file: string) {
	const normalized = file.replaceAll("\\", "/");
	const draft = normalized.match(
		/^src\/draft\/(technical-proofs|epic-proofs|projects)\/([^/]+)\//u,
	);
	if (draft) return `src/draft/${draft[1]}/${draft[2]}`;
	const exp = normalized.match(
		/^src\/draft\/exp-proofs\/(dx|ux|cx|ax|api)\/([^/]+)\//u,
	);
	if (exp) return `src/draft/exp-proofs/${exp[1]}/${exp[2]}`;
	const production = normalized.match(
		/^(packages|examples)\/(?:(runtimes|providers|iac|build)\/)?([^/]+)\//u,
	);
	if (!production) return undefined;
	return production[2]
		? `${production[1]}/${production[2]}/${production[3]}`
		: `${production[1]}/${production[3]}`;
}

function workspaceTestRelevant(file: string) {
	const normalized = file.replaceAll("\\", "/");
	const workspace = workspaceFor(normalized);
	if (!workspace) return false;

	const relative = normalized.slice(workspace.length + 1);
	return (
		/^(src|test|tests|type-tests|features|contracts|simulation|scripts|data-models)\//u.test(
			relative,
		) ||
		/^(package|tsconfig(?:\.[^.]+)?)\.json$/u.test(relative) ||
		/^(pnpm-lock\.yaml|turbo\.json)$/u.test(relative) ||
		/\.(?:proto|cue|pact\.json)$/u.test(relative)
	);
}

function defaultWorkspacePackageExists(workspace: string) {
	return existsSync(`${workspace}/package.json`);
}

export function selectRelevantChecks(
	options: RelevantCheckPolicyOptions,
): RelevantCheckPolicy {
	const files = options.files.map((file) => file.replaceAll("\\", "/"));
	const workspaceTestFiles = (options.workspaceTestFiles ?? options.files).map(
		(file) => file.replaceAll("\\", "/"),
	);
	const staged = Boolean(options.staged);
	const includeBuild = Boolean(options.includeBuild);
	const includeBroadSweeps = Boolean(options.includeBroadSweeps || options.all);
	const rootPackageJsonScriptsOnlyChanged = Boolean(
		options.rootPackageJsonScriptsOnlyChanged,
	);
	const workspacePackageExists =
		options.workspacePackageExists ?? defaultWorkspacePackageExists;

	const workspaces = [
		...new Set(
			workspaceTestFiles
				.filter(workspaceTestRelevant)
				.map(workspaceFor)
				.filter((value): value is string => Boolean(value)),
		),
	].filter(workspacePackageExists);
	const draftWorkspaces = [
		...new Set(
			files
				.map(workspaceForDraftFile)
				.filter((value): value is string => Boolean(value)),
		),
	].filter(workspacePackageExists);
	const touched = (prefixes: string[]) =>
		files.some((file) =>
			prefixes.some(
				(prefix) => file === prefix || file.startsWith(`${prefix}/`),
			),
		);
	const touchedAny = (patterns: RegExp[]) =>
		files.some((file) => patterns.some((pattern) => pattern.test(file)));

	const automationChanged =
		touched([
			"scripts",
			".githooks",
			".github",
			".codex",
			".cursor",
			".claude",
			".agents",
		]) ||
		touchedAny([
			/^package\.json$/u,
			/^pnpm-lock\.yaml$/u,
			/^pnpm-workspace\.yaml$/u,
			/^turbo\.json$/u,
		]);
	const rootConfigChanged = touchedAny([
		/^package\.json$/u,
		/^pnpm-lock\.yaml$/u,
		/^pnpm-workspace\.yaml$/u,
		/^turbo\.json$/u,
		/^tsconfig.*\.json$/u,
	]);
	const sourceChanged = touched([
		"src",
		"contracts",
		"test",
		"tests",
		"packages",
		"examples",
	]);
	const docsChanged =
		touched(["docs"]) ||
		touchedAny([
			/^README\.md$/u,
			/^CONTRIBUTING\.md$/u,
			/^AGENTS\.md$/u,
			/^CLAUDE\.md$/u,
		]);
	const workspaceSchemaChanged = files.some(
		(file) => /\.(?:proto|cue)$/u.test(file) && Boolean(workspaceFor(file)),
	);
	const rootSchemaChanged =
		touched(["contracts"]) ||
		touchedAny([/(^|\/)_generated\//u, /(^|\/)buf(\.gen)?\.yaml$/u]) ||
		files.some((file) => /\.(?:proto|cue)$/u.test(file) && !workspaceFor(file));
	const schemaChanged = rootSchemaChanged || workspaceSchemaChanged;
	const pactChanged = touchedAny([/(^|\/)pacts\//u, /\.pact\.json$/u]);
	const rootPactChanged = files.some(
		(file) =>
			(/(^|\/)pacts\//u.test(file) || /\.pact\.json$/u.test(file)) &&
			!workspaceFor(file),
	);
	const uiChanged =
		touched(["apps/web", "packages/ui"]) || touchedAny([/\.(tsx|jsx|css)$/u]);
	const behaviorChanged =
		touched(["tests/behavior", "features"]) ||
		touchedAny([/playwright\.behavior\.config\./u, /cucumber\.config\./u]);
	const visualChanged =
		touched(["tests/visual", "storybook"]) ||
		touchedAny([/playwright\.visual\.config\./u, /\.stories\./u]);
	const agentEvalChanged =
		touched(["evals"]) ||
		touchedAny([
			/(^|\/)(prompts?|agent-evals?)(\/|$)/iu,
			/\.(?:prompt|eval)\.(?:ts|md|json)$/iu,
		]);
	const deploymentDeltaChanged =
		touched(["docs/design/proofs/hobo-50-deployment-set-delta"]) ||
		touchedAny([/^scripts\/validate-deployment-set-delta\.ts$/u]);
	const traceabilityChanged =
		touched(["docs/design/proofs"]) ||
		touchedAny([
			/^docs\/design\/(?:traceability|index)\.md$/u,
			/^docs\/design\/adr\//u,
			/^scripts\/validate-traceability\.ts$/u,
		]);

	const checks: Check[] = [];

	if (rootConfigChanged) {
		checks.push({
			command: "pnpm",
			args: ["run", "install:check"],
			reason: "package manager or root task graph changed",
			serial: true,
		});
	}

	if (sourceChanged || automationChanged) {
		checks.push({
			command: "pnpm",
			args: ["run", "case:check"],
			reason: "Windows case-collision preflight for tracked paths",
		});
		checks.push({
			command: "pnpm",
			args: [
				"run",
				staged ? "architecture:guard:staged" : "architecture:guard",
				"--",
				`--base=${options.base}`,
			],
			reason: "architecture-sensitive source or automation changed",
		});
		checks.push({
			command: "pnpm",
			args: ["run", "lint:code"],
			reason:
				"Biome code formatting is enforced for source or automation changes",
		});
	}

	if (rootSchemaChanged) {
		checks.push({
			command: "pnpm",
			args: ["run", "test:schema"],
			reason:
				"root protobuf/CUE/schema changed; run repository schema compatibility lane",
		});
		if (includeBroadSweeps) {
			checks.push({
				command: "pnpm",
				args: ["run", "test:contract:consumer"],
				reason:
					"final/all root schema validation can affect consumer contracts",
			});
			checks.push({
				command: "pnpm",
				args: ["run", "test:contract:provider"],
				reason:
					"final/all root schema validation can affect provider verification",
			});
		}
	} else if (rootPactChanged && includeBroadSweeps) {
		checks.push({
			command: "pnpm",
			args: ["run", "test:contract:consumer"],
			reason: "final/all root Pact validation can affect consumer contracts",
		});
		checks.push({
			command: "pnpm",
			args: ["run", "test:contract:provider"],
			reason: "final/all root Pact validation can affect provider verification",
		});
	}

	if (workspaces.length > 0) {
		checks.push({
			command: "pnpm",
			args: [
				"exec",
				"turbo",
				"run",
				"test",
				...workspaces.map((workspace) => `--filter=./${workspace}`),
				"--continue",
				"--output-logs=new-only",
			],
			reason: `workspace tests for ${workspaces.length} changed package(s) via Turbo; strict env strips harness NODE_OPTIONS and warm runs replay from cache`,
		});
	}

	if (draftWorkspaces.length > 0) {
		checks.push({
			command: "pnpm",
			args: [
				"run",
				staged ? "draft:artifacts:staged" : "draft:artifacts",
				"--",
				`--base=${options.base}`,
			],
			reason:
				"changed proof packages must satisfy the draft-artifact requirements (grandfathered packages get advisories)",
		});
		checks.push({
			command: "pnpm",
			args: [
				"run",
				staged ? "draft:cascade:staged" : "draft:cascade",
				"--",
				`--base=${options.base}`,
			],
			reason:
				"changed technical/exp proofs must cascade into referencing epic/project rollups",
		});
	}

	if (
		files.some((file) =>
			/^\.(claude|agents)\/skills\/(draft|repo|sdlc)\//u.test(file),
		)
	) {
		checks.push({
			command: "pnpm",
			args: ["run", "skills:mirror-check"],
			reason:
				"repo-local skill mirrors must stay byte-identical across .claude and .agents",
		});
	}

	if (uiChanged) {
		checks.push({
			command: "pnpm",
			args: ["run", "test:dom"],
			reason: "UI rendered-state lane for component/browser-surface changes",
		});
		checks.push({
			command: "pnpm",
			args: ["run", "test:component"],
			reason: "component behavior lane uses mocked service boundaries",
		});
	}

	if (behaviorChanged)
		checks.push({
			command: "pnpm",
			args: ["run", "test:behavior"],
			reason: "browser-driven behavior specs; never full-stack E2E",
		});
	if (visualChanged)
		checks.push({
			command: "pnpm",
			args: ["run", "test:visual"],
			reason: "visual/story state changed",
		});
	if (agentEvalChanged)
		checks.push({
			command: "pnpm",
			args: ["run", "eval:agent:mock"],
			reason: "agent workflow/eval changed; live evals are manual only",
		});

	if (touched(["scripts", "test", "tests"]) || rootConfigChanged) {
		checks.push({
			command: "pnpm",
			args: ["run", "test:root"],
			reason: "root scripts/tests changed",
		});
		checks.push({
			command: "pnpm",
			args: ["run", "typecheck:root"],
			reason: "root scripts/tests must stay type-clean",
		});
	}

	if (automationChanged || sourceChanged) {
		checks.push({
			command: "pnpm",
			args: staged
				? ["run", "standards:check", "--", "--staged", `--base=${options.base}`]
				: ["run", "standards:check", "--", `--base=${options.base}`],
			reason: "technical standards evidence may need refreshing",
		});
	}

	if (docsChanged || automationChanged) {
		checks.push({
			command: "pnpm",
			args: [
				"run",
				staged ? "lint:docs:staged" : "lint:docs:changed",
				"--",
				`--base=${options.base}`,
			],
			reason: "markdown docs linters may be affected",
		});
		checks.push({
			command: "pnpm",
			args: ["run", "docs:coverage"],
			reason: "documentation coverage may be affected",
		});
	}

	if (sourceChanged || automationChanged) {
		checks.push({
			command: "pnpm",
			args: staged
				? ["run", "docs:freshness:staged"]
				: ["run", "docs:freshness", "--", `--base=${options.base}`],
			reason: "docs freshness gate for code/config changes",
		});
	}
	if (traceabilityChanged)
		checks.push({
			command: "node",
			args: ["--import", "tsx", "scripts/validate-traceability.ts"],
			reason: "traceability evidence changed",
		});
	if (deploymentDeltaChanged)
		checks.push({
			command: "node",
			args: ["--import", "tsx", "scripts/validate-deployment-set-delta.ts"],
			reason: "deployment delta proof changed",
		});
	if (includeBuild) {
		checks.push({
			command: "pnpm",
			args: [
				"exec",
				"turbo",
				"run",
				"build",
				"typecheck",
				"lint",
				"test",
				"--filter=[HEAD^...HEAD]",
			],
			reason: "explicit build-impact check requested",
		});
	}

	const scopes = [
		schemaChanged && "schema",
		pactChanged && "contract",
		uiChanged && "ui",
		behaviorChanged && "behavior",
		visualChanged && "visual",
		agentEvalChanged && "agent-eval",
		docsChanged && "docs",
		automationChanged && "automation",
	].filter((scope): scope is string => Boolean(scope));

	return { checks, scopes, workspaces };
}
