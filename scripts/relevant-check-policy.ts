import { existsSync } from "node:fs";

export type Check = { command: string; args: string[]; reason: string; serial?: boolean };

export type RelevantCheckPolicyOptions = {
  files: string[];
  base: string;
  staged?: boolean;
  all?: boolean;
  includeBuild?: boolean;
  rootPackageJsonScriptsOnlyChanged?: boolean;
  turboAvailable?: boolean;
  workspacePackageExists?: (workspace: string) => boolean;
};

export type RelevantCheckPolicy = {
  checks: Check[];
  scopes: string[];
  workspaces: string[];
};

const MAX_WINDOWS_TURBO_COMMAND_LENGTH = 24_000;
const TURBO_TEST_PREFIX = ["exec", "turbo", "run", "test"];

export function workspaceFor(file: string) {
  const normalized = file.replaceAll("\\", "/");
  const match = normalized.match(/^src\/draft\/(technical-proofs|exp-proofs|epic-proofs|projects)\/([^/]+)\//u);
  return match ? `src/draft/${match[1]}/${match[2]}` : undefined;
}

function defaultWorkspacePackageExists(workspace: string) {
  return existsSync(`${workspace}/package.json`);
}

function turboTestArgsFor(workspaces: string[]) {
  return [
    ...TURBO_TEST_PREFIX,
    ...workspaces.flatMap((workspace) => ["--filter", `./${workspace}`]),
  ];
}

function commandLength(command: string, args: string[]) {
  return [command, ...args].join(" ").length;
}

function chunkTurboWorkspaceTests(workspaces: string[]) {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const workspace of workspaces) {
    const candidate = [...current, workspace];
    if (current.length > 0 && commandLength("pnpm", turboTestArgsFor(candidate)) > MAX_WINDOWS_TURBO_COMMAND_LENGTH) {
      chunks.push(current);
      current = [workspace];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function selectRelevantChecks(options: RelevantCheckPolicyOptions): RelevantCheckPolicy {
  const files = options.files.map((file) => file.replaceAll("\\", "/"));
  const staged = Boolean(options.staged);
  const includeBuild = Boolean(options.includeBuild);
  const rootPackageJsonScriptsOnlyChanged = Boolean(options.rootPackageJsonScriptsOnlyChanged);
  const turboAvailable = options.turboAvailable !== false;
  const workspacePackageExists = options.workspacePackageExists ?? defaultWorkspacePackageExists;

  const workspaces = [...new Set(files.map(workspaceFor).filter((value): value is string => Boolean(value)))]
    .filter(workspacePackageExists);
  const touched = (prefixes: string[]) => files.some((file) => prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)));
  const touchedAny = (patterns: RegExp[]) => files.some((file) => patterns.some((pattern) => pattern.test(file)));

  const automationChanged = touched(["scripts", ".githooks", ".github", ".codex", ".cursor", ".claude", ".agents"])
    || touchedAny([/^package\.json$/u, /^pnpm-lock\.yaml$/u, /^pnpm-workspace\.yaml$/u, /^turbo\.json$/u]);
  const rootConfigChanged = touchedAny([/^package\.json$/u, /^pnpm-lock\.yaml$/u, /^pnpm-workspace\.yaml$/u, /^turbo\.json$/u, /^tsconfig.*\.json$/u]);
  const rootBuildImpactChanged = touchedAny([/^pnpm-workspace\.yaml$/u, /^turbo\.json$/u, /^tsconfig.*\.json$/u])
    || (touchedAny([/^package\.json$/u]) && !rootPackageJsonScriptsOnlyChanged);
  const sourceChanged = touched(["src", "contracts", "test", "tests"]);
  const docsChanged = touched(["docs"]) || touchedAny([/^README\.md$/u, /^CONTRIBUTING\.md$/u, /^AGENTS\.md$/u, /^CLAUDE\.md$/u]);
  const draftSchemaChanged = files.some((file) => /^src\/draft\/(?:technical-proofs|exp-proofs|epic-proofs|projects)\/[^/]+\/.*\.(?:proto|cue)$/u.test(file));
  const rootSchemaChanged = touched(["contracts"]) || files.some((file) => /\.(?:proto|cue)$/u.test(file) && !/^src\/draft\/(?:technical-proofs|exp-proofs|epic-proofs|projects)\/[^/]+\//u.test(file));
  const schemaChanged = rootSchemaChanged || draftSchemaChanged;
  const pactChanged = touchedAny([/(^|\/)pacts\//u, /\.pact\.json$/u]);
  const rootPactChanged = files.some((file) => (/(^|\/)pacts\//u.test(file) || /\.pact\.json$/u.test(file)) && !workspaceFor(file));
  const uiChanged = touched(["apps/web", "packages/ui"]) || touchedAny([/\.(tsx|jsx|css)$/u]);
  const behaviorChanged = touched(["tests/behavior", "features"]) || touchedAny([/playwright\.behavior\.config\./u, /cucumber\.config\./u]);
  const visualChanged = touched(["tests/visual", "storybook"]) || touchedAny([/playwright\.visual\.config\./u, /\.stories\./u]);
  const agentEvalChanged = touched(["evals"]) || touchedAny([/(^|\/)(prompts?|agent-evals?)(\/|$)/iu, /\.(?:prompt|eval)\.(?:ts|md|json)$/iu]);
  const deploymentDeltaChanged = touched(["docs/design/proofs/hobo-50-deployment-set-delta"]) || touchedAny([/^scripts\/validate-deployment-set-delta\.ts$/u]);
  const traceabilityChanged = touched(["docs/design/proofs"]) || touchedAny([/^docs\/design\/(?:traceability|index)\.md$/u, /^docs\/design\/adr\//u, /^scripts\/validate-traceability\.ts$/u]);

  const checks: Check[] = [];

  if (rootConfigChanged) {
    checks.push({ command: "pnpm", args: ["run", "install:check"], reason: "package manager or root task graph changed", serial: true });
  }

  if (sourceChanged || automationChanged) {
    checks.push({ command: "pnpm", args: ["run", "case:check"], reason: "Windows case-collision preflight for tracked paths" });
    checks.push({
      command: "pnpm",
      args: ["run", staged ? "architecture:guard:staged" : "architecture:guard", "--", `--base=${options.base}`],
      reason: "architecture-sensitive source or automation changed",
    });
  }

  if (rootSchemaChanged) {
    checks.push({ command: "pnpm", args: ["run", "test:schema"], reason: "root protobuf/CUE/schema changed; run repository schema compatibility lane" });
    checks.push({ command: "pnpm", args: ["run", "test:contract:consumer"], reason: "root schema changes can affect consumer contracts" });
    checks.push({ command: "pnpm", args: ["run", "test:contract:provider"], reason: "root schema changes can affect provider verification" });
  } else if (rootPactChanged) {
    checks.push({ command: "pnpm", args: ["run", "test:contract"], reason: "root or shared PACT artifacts changed" });
  }

  if (workspaces.length > 0) {
    const turboArgs = turboTestArgsFor(workspaces);
    const turboCommandLength = commandLength("pnpm", turboArgs);

    if (!turboAvailable) {
      for (const workspace of workspaces) {
        checks.push({
          command: "pnpm",
          args: ["--prefix", workspace, "test"],
          reason: `draft package unit/contract tests for ${workspace}; local turbo binary unavailable`,
        });
      }
    } else if (turboCommandLength > MAX_WINDOWS_TURBO_COMMAND_LENGTH) {
      for (const [index, chunk] of chunkTurboWorkspaceTests(workspaces).entries()) {
        checks.push({
          command: "pnpm",
          args: turboTestArgsFor(chunk),
          reason: `draft package unit/contract tests for changed workspace chunk ${index + 1} (${chunk.length}/${workspaces.length}); command length is bounded`,
        });
      }
    } else {
      checks.push({
        command: "pnpm",
        args: turboArgs,
        reason: `draft package unit/contract tests for ${workspaces.length} changed workspace(s); turbo runs isolated draft contract regenerations in parallel`,
      });
    }
  }

  if (uiChanged) {
    checks.push({ command: "pnpm", args: ["run", "test:dom"], reason: "UI rendered-state lane for component/browser-surface changes" });
    checks.push({ command: "pnpm", args: ["run", "test:component"], reason: "component behavior lane uses mocked service boundaries" });
  }

  if (behaviorChanged) checks.push({ command: "pnpm", args: ["run", "test:behavior"], reason: "browser-driven behavior specs; never full-stack E2E" });
  if (visualChanged) checks.push({ command: "pnpm", args: ["run", "test:visual"], reason: "visual/story state changed" });
  if (agentEvalChanged) checks.push({ command: "pnpm", args: ["run", "eval:agent:mock"], reason: "agent workflow/eval changed; live evals are manual only" });

  if (touched(["scripts", "test", "tests"]) || rootConfigChanged) {
    checks.push({ command: "pnpm", args: ["run", "test:root"], reason: "root scripts/tests changed" });
  }

  if (automationChanged || sourceChanged) {
    checks.push({ command: "pnpm", args: ["run", "standards:check", "--", "--staged", `--base=${options.base}`], reason: "technical standards evidence may need refreshing" });
  }

  if (docsChanged || automationChanged) {
    checks.push({ command: "pnpm", args: ["run", staged ? "lint:docs:staged" : "lint:docs:changed", "--", `--base=${options.base}`], reason: "markdown docs linters may be affected" });
    checks.push({ command: "pnpm", args: ["run", "docs:coverage"], reason: "documentation coverage may be affected" });
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
  if (traceabilityChanged) checks.push({ command: "node", args: ["--import", "tsx", "scripts/validate-traceability.ts"], reason: "traceability evidence changed" });
  if (deploymentDeltaChanged) checks.push({ command: "node", args: ["--import", "tsx", "scripts/validate-deployment-set-delta.ts"], reason: "deployment delta proof changed" });
  if (includeBuild || (rootBuildImpactChanged && !staged)) {
    checks.push({ command: "pnpm", args: ["exec", "turbo", "run", "build", "typecheck", "lint", "test", "--filter=[HEAD^...HEAD]"], reason: "build-impacting changed check requested" });
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
