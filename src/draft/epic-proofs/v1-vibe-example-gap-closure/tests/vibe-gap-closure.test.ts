import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VIBE_GAP_CLOSURE_BACKLOG,
  evaluateVibeGapClosure,
  rejectVibeScopeCreep,
} from "../src/vibe-gap-closure.js";

test("HOBO-539 fixture closes the parent acceptance over all child artifact issues", () => {
  const result = evaluateVibeGapClosure();

  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
  assert.equal(result.summary.parentIssue, "HOBO-539");
  assert.equal(result.summary.childCount, 26);
  assert.deepEqual(result.summary.phases, { M1: 17, M2: 7, M5: 2 });
});

test("every child issue targets exp proof and proof note paths", () => {
  for (const issue of VIBE_GAP_CLOSURE_BACKLOG.childIssues) {
    assert.match(issue.targetPackagePath, /^src\/draft\/exp-proofs\/[a-z0-9-]+$/);
    assert.match(issue.proofNotePath, /^docs\/design\/proofs\/hobo-\d+-[a-z0-9-]+\/README\.md$/);
    assert.equal(issue.artifactSlices.length > 0, true);
  }
});

test("every child issue carries common vibe scenario and proof-mode coverage", () => {
  for (const issue of VIBE_GAP_CLOSURE_BACKLOG.childIssues) {
    assert.deepEqual(issue.requiredScenarios, [
      "happy path",
      "blocked path",
      "stale/unknown evidence path",
      "support handoff",
      "accessibility notes",
    ]);
    assert.deepEqual(issue.proofModes, ["live", "simulated", "reference fixture", "scope-out"]);
  }
});

test("launch-demo asset issues use M5 while non-launch children stay in M1 or M2", () => {
  const launchIssues = VIBE_GAP_CLOSURE_BACKLOG.childIssues.filter(
    (issue) => issue.project === "V1 Launch Site, Messaging & Demo Assets",
  );
  assert.deepEqual(
    launchIssues.map((issue) => issue.id),
    ["HOBO-555", "HOBO-556"],
  );
  assert.equal(launchIssues.every((issue) => issue.phase === "M5"), true);
  assert.equal(
    VIBE_GAP_CLOSURE_BACKLOG.childIssues
      .filter((issue) => issue.project !== "V1 Launch Site, Messaging & Demo Assets")
      .every((issue) => issue.phase === "M1" || issue.phase === "M2"),
    true,
  );
});

test("scope-out guard rejects production UI, provider, customer-data, credential, and launch-claim creep", () => {
  const denials = rejectVibeScopeCreep([
    "Implement the production UI for the first-run activation rail.",
    "Run live provider calls to capture the launch demo.",
    "Use live customer data and real credentials for support case fixtures.",
    "Publish final launch claims before proof-mode labels exist.",
  ]);

  assert.equal(denials.length, 4);
  assert.equal(denials.every((denial) => denial.decision === "reject"), true);
});

test("validation fails closed when a child loses required proof coverage", () => {
  const invalid = structuredClone(VIBE_GAP_CLOSURE_BACKLOG);
  invalid.childIssues[0].proofModes = ["live", "simulated"];
  invalid.childIssues[1].requiredScenarios = ["happy path"];
  invalid.childIssues[2].targetPackagePath = "src/draft/technical-proofs/not-an-exp-proof";
  invalid.childIssues[15].phase = "M1";

  const result = evaluateVibeGapClosure(invalid);

  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /missing proof mode label: reference fixture/);
  assert.match(result.violations.join("\n"), /missing scenario coverage: blocked path/);
  assert.match(result.violations.join("\n"), /must target src\/draft\/exp-proofs/);
  assert.match(result.violations.join("\n"), /launch-demo issue must use M5/);
});
