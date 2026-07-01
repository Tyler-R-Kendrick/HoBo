#!/usr/bin/env node
import { runExampleFixture } from "../src/fixture-runner.js";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixture = args.fixture;
  const phase = args.phase as "deploy-and-assert" | "teardown" | "sweep-orphans" | undefined;
  const runId = args["run-id"] ?? process.env.GITHUB_RUN_ID ?? "local-run";

  if (!fixture || !phase) {
    console.error("usage: run-example-fixture.ts --fixture <path> --phase <phase> --run-id <id>");
    process.exitCode = 1;
    return;
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    assertGitHubOidcEnvironment();
  }

  await runExampleFixture({ fixture, phase, runId });
}

function assertGitHubOidcEnvironment(): void {
  const missing = ["ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new Error(`GitHub OIDC token environment missing: ${missing.join(", ")}`);
  }

  const storedSecretKeys = Object.keys(process.env)
    .filter((key) => /SECRET|ACCESS_KEY|PRIVATE_KEY/i.test(key))
    .filter((key) => key !== "ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    .sort();
  if (storedSecretKeys.length > 0) {
    throw new Error(`stored cloud secret environment is not allowed: ${storedSecretKeys.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
