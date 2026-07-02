import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { scanPatternsStandardsLinks } from "../src/link-guard.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

function anchorExists(file: string, anchor: string) {
  const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
  const slug = anchor.slice(1);
  return (
    content.includes(`{#${slug}}`) ||
    content.includes(`id="${slug}"`) ||
    new RegExp(`^##\\s+Plan\\s+${slug.replace(/^plan-0*/, "")}\\b`, "im").test(content)
  );
}

test("patterns have zero rotted forge-generated-stack or event-model links", () => {
  const { rottedReferences, brokenLinks } = scanPatternsStandardsLinks(repoRoot, ["patterns"]);

  assert.deepEqual(
    rottedReferences,
    [],
    `rotted references remain: ${JSON.stringify(rottedReferences, null, 2)}`,
  );
  assert.deepEqual(brokenLinks, [], `broken links remain: ${JSON.stringify(brokenLinks, null, 2)}`);
});

test("standards cross-links resolve to current design paths", () => {
  const { rottedReferences, brokenLinks } = scanPatternsStandardsLinks(repoRoot, ["standards"]);

  assert.deepEqual(rottedReferences, []);
  assert.deepEqual(brokenLinks, []);
});

test("remapped plan anchors still exist in target design docs", () => {
  assert.equal(anchorExists("docs/design/data-plane.md", "#plan-11"), true);
  assert.equal(anchorExists("docs/design/generated-stack.md", "#plan-23"), true);
});
