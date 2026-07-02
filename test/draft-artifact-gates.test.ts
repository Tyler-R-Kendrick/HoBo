import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished, test } from "vitest";

import { checkWorkspace } from "../scripts/check-draft-artifacts.js";
import { compareSkill } from "../scripts/check-skill-mirrors.js";

const NOTEBOOK_OK = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [{ cell_type: "code", execution_count: 1, metadata: {}, source: ["console.log(1)"], outputs: [{ output_type: "stream", name: "stdout", text: ["1\n"] }] }],
});
const NOTEBOOK_UNEXECUTED = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [{ cell_type: "code", execution_count: null, metadata: {}, source: ["console.log(1)"], outputs: [] }],
});

async function scaffoldTechnical(root: string, slug: string, overrides: { notebook?: string; expected?: string; manifest?: object } = {}) {
  const pkg = path.join(root, "src/draft/technical-proofs", slug);
  await mkdir(path.join(pkg, "examples"), { recursive: true });
  await writeFile(path.join(pkg, "ADR.md"), "# ADR\n\nbench is not applicable: docs-only contract fixture.\n");
  await writeFile(path.join(pkg, "proof.json"), JSON.stringify(overrides.manifest ?? {
    layer: "technical",
    slug,
    title: "fixture",
    references: { technicalProofs: [], epicProofs: [], expProofs: [], designDocs: [] },
    artifacts: { examples: "examples", notebook: "notebook.ipynb", diagrams: [] },
    waivers: [{ requirement: "bench", reason: "docs-only contract fixture, nothing to benchmark", adr: "ADR.md" }],
  }));
  await writeFile(path.join(pkg, "notebook.ipynb"), overrides.notebook ?? NOTEBOOK_OK);
  await writeFile(path.join(pkg, "examples/usage.ts"), 'console.log("hello-proof");\n');
  await writeFile(path.join(pkg, "examples/usage.expected.txt"), overrides.expected ?? "hello-proof\n");
  return `src/draft/technical-proofs/${slug}`;
}

test("draft-artifact gate: compliant technical proof passes (example actually executes)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "draft-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const workspace = await scaffoldTechnical(root, "fixture-ok");

  const report = checkWorkspace(workspace, { root });
  assert.deepEqual(report.problems, []);
});

test("draft-artifact gate: missing proof.json fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "draft-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/draft/technical-proofs/fixture-bare/src"), { recursive: true });
  await writeFile(path.join(root, "src/draft/technical-proofs/fixture-bare/src/x.ts"), "export {};\n");

  const report = checkWorkspace("src/draft/technical-proofs/fixture-bare", { root });
  assert.ok(report.problems.some((p) => p.includes("missing proof.json")));
});

test("draft-artifact gate: example output mismatch fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "draft-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const workspace = await scaffoldTechnical(root, "fixture-drift", { expected: "some other output\n" });

  const report = checkWorkspace(workspace, { root });
  assert.ok(report.problems.some((p) => p.includes("output does not match")));
});

test("draft-artifact gate: unexecuted notebook fails structure check", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "draft-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const workspace = await scaffoldTechnical(root, "fixture-nb", { notebook: NOTEBOOK_UNEXECUTED });

  const report = checkWorkspace(workspace, { root });
  assert.ok(report.problems.some((p) => p.includes("no executed outputs")));
});

test("draft-artifact gate: ux proof demands real visual assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "draft-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, "src/draft/exp-proofs/ux/fixture-ux");
  await mkdir(path.join(pkg, "examples"), { recursive: true });
  await mkdir(path.join(pkg, "assets"), { recursive: true });
  await writeFile(path.join(pkg, "proof.json"), JSON.stringify({
    layer: "exp",
    slug: "fixture-ux",
    experienceType: "ux",
    title: "fixture",
    artifacts: { examples: "examples", notebook: "notebook.ipynb", diagrams: [], assets: "assets" },
    waivers: [],
  }));
  await writeFile(path.join(pkg, "notebook.ipynb"), NOTEBOOK_OK);
  await writeFile(path.join(pkg, "examples/usage.ts"), 'console.log("ux");\n');
  await writeFile(path.join(pkg, "examples/usage.expected.txt"), "ux\n");

  const missing = checkWorkspace("src/draft/exp-proofs/ux/fixture-ux", { root });
  assert.ok(missing.problems.some((p) => p.includes("real visual assets")));

  await writeFile(
    path.join(pkg, "assets/wireframe.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#eee"/><text x="10" y="55">wireframe fixture for gate self-test</text></svg>\n`,
  );
  const present = checkWorkspace("src/draft/exp-proofs/ux/fixture-ux", { root });
  assert.deepEqual(present.problems, []);
});

test("skill-mirror gate: equal mirrors pass, drifted mirrors fail, absent-on-both passes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mirror-gate-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".claude/skills/draft"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/draft"), { recursive: true });
  await writeFile(path.join(root, ".claude/skills/draft/SKILL.md"), "same\n");
  await writeFile(path.join(root, ".agents/skills/draft/SKILL.md"), "same\n");

  assert.deepEqual(compareSkill("draft", root), []);
  assert.deepEqual(compareSkill("sdlc", root), []); // missing on both sides

  await writeFile(path.join(root, ".agents/skills/draft/SKILL.md"), "drifted\n");
  assert.ok(compareSkill("draft", root).some((p) => p.includes("differs")));
});
