import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkCliDocs,
  lintMarkdownContent,
  loadCliSpec,
} from "../scripts/check-cli-docs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("canonical CLI spec maps every verb to an implementation issue", async () => {
  const spec = await loadCliSpec(root);
  const verbs = new Map(spec.verbs.map((verb) => [verb.name, verb]));

  assert.equal(verbs.get("up")?.implementationIssues.includes("HOBO-130"), true);
  assert.equal(verbs.has("deploy"), false);
  assert.equal(verbs.has("yard"), false);
  assert.equal(verbs.has("forge"), false);

  for (const verb of spec.verbs) {
    assert.match(
      verb.implementationIssues.join(" "),
      /HOBO-\d+/,
      `${verb.name} must cite at least one implementation issue`,
    );
  }

  assert.deepEqual(
    spec.retiredAliases.find((alias) => alias.name === "deploy"),
    { name: "deploy", replacement: "up" },
  );
});

test("repository docs contain no unreconciled CLI command mentions", async () => {
  const result = await checkCliDocs({ root });
  assert.deepEqual(result.problems, []);
});

test("fenced command examples reject retired lifecycle verbs", async () => {
  const spec = await loadCliSpec(root);
  const problems = lintMarkdownContent(
    "bad.md",
    ["```bash", "hobo deploy --camp prod", "hobo yard up", "```"].join("\n"),
    spec,
  );

  assert.deepEqual(
    problems.map((problem) => problem.command),
    ["hobo deploy", "hobo yard"],
  );
});

test("cli package summaries reject retired pipe-delimited verbs", async () => {
  const spec = await loadCliSpec(root);
  const problems = lintMarkdownContent(
    "packages.md",
    "  cli/ @hobo/cli hobo dev|deploy|plan|inspect|login|registry|yard|forge\n",
    spec,
  );

  assert.deepEqual(
    problems.map((problem) => problem.command),
    ["hobo deploy", "hobo yard", "hobo forge"],
  );
});

test("doc checker can scan a focused docs tree", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "hobo-cli-docs-"));

  try {
    await writeFile(
      path.join(tempRoot, "ok.md"),
      ["```bash", "hobo up --camp prod", "hobo down --camp pr-1", "```"].join("\n"),
    );

    const result = await checkCliDocs({
      root,
      files: [path.join(tempRoot, "ok.md")],
    });
    assert.deepEqual(result.problems, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
