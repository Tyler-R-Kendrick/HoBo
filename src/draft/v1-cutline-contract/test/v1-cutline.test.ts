import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_READINESS_DOMAINS,
  assertV1Cutline,
  validateDogfoodAlphaEvidence,
  validateV1Cutline,
  v1Cutline,
  v1CutlineDogfoodAlphaEvidence
} from "../src/v1-cutline.js";

test("cutline writes explicit v1 in-scope and out-of-scope lists", () => {
  const result = validateV1Cutline(v1Cutline);

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(v1Cutline.inScope.length >= 6);
  assert.ok(v1Cutline.outOfScope.length >= 6);
  assert.ok(v1Cutline.inScope.every((item) => item.id && item.decision && item.ownerProject));
  assert.ok(v1Cutline.outOfScope.every((item) => item.id && item.decision && item.postV1Disposition));
});

test("every blocker category maps to an owner and readiness domain", () => {
  for (const category of v1Cutline.blockerCategories) {
    assert.match(category.id, /^v1-blocker\./);
    assert.ok(category.ownerProject);
    assert.ok(category.ownerInitiative);
    assert.ok(REQUIRED_READINESS_DOMAINS.includes(category.readinessDomain));
    assert.ok(category.evidenceRequired.length > 0);
  }
});

test("reference architecture, productization, support, legal/privacy, docs, and operations are represented", () => {
  const represented = new Set([
    ...v1Cutline.inScope.map((item) => item.readinessDomain),
    ...v1Cutline.blockerCategories.map((item) => item.readinessDomain)
  ]);

  assert.deepEqual([...represented].sort(), [...REQUIRED_READINESS_DOMAINS].sort());
});

test("scope-out decisions cite design docs or ADRs", () => {
  for (const item of v1Cutline.outOfScope) {
    assert.ok(item.citations.length > 0, `${item.id} missing citations`);
    assert.ok(
      item.citations.every((citation) => citation.startsWith("docs/design/") && citation.includes("#")),
      `${item.id} must cite design docs or ADR anchors`
    );
  }
});

test("scope-out guard rejects capability work and premature execution tasks", () => {
  const invalid = structuredClone(v1Cutline);
  invalid.inScope.push({
    id: "build-capability-now",
    decision: "Implement live multi-cloud capability work in the cutline issue",
    ownerProject: "Providers",
    readinessDomain: "productization",
    blockerCategory: "v1-blocker.productization",
    evidenceRequired: ["runtime implementation"],
    citations: ["docs/design/control-plane.md#plan-04"],
    workKind: "capability-implementation"
  });
  invalid.followUpTaskPolicy.createdExecutionTasksBeforeM0Acceptance = true;

  const result = validateV1Cutline(invalid);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /capability implementation is scope-out/);
  assert.match(result.errors.join("\n"), /M1-M4 execution tasks require accepted M0 criteria/);
  assert.throws(() => assertV1Cutline(invalid), /v1 cutline contract invalid/);
});

test("M1 dogfood alpha evidence records owners, blockers, risks, dependencies, follow-ups, and parent sync", () => {
  const result = validateDogfoodAlphaEvidence(v1CutlineDogfoodAlphaEvidence);

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(v1CutlineDogfoodAlphaEvidence.issue, "HOBO-454");
  assert.equal(v1CutlineDogfoodAlphaEvidence.phase, "M1");
  assert.equal(v1CutlineDogfoodAlphaEvidence.milestoneGate, "M1 Dogfood/alpha proof");
  assert.ok(v1CutlineDogfoodAlphaEvidence.requiredEvidence.every((item) => item.ownerProject));
  assert.ok(v1CutlineDogfoodAlphaEvidence.blockers.length > 0);
  assert.ok(v1CutlineDogfoodAlphaEvidence.acceptedRisks.length > 0);
  assert.ok(v1CutlineDogfoodAlphaEvidence.crossProjectDependencies.length > 0);
  assert.ok(
    v1CutlineDogfoodAlphaEvidence.followUpIssues.every((item) =>
      v1CutlineDogfoodAlphaEvidence.missingEvidence.some((missing) => missing.id === item.missingEvidenceId)
    )
  );
  assert.equal(v1CutlineDogfoodAlphaEvidence.parentInitiativeSync.statusUpdated, true);
});

test("M1 dogfood alpha guard rejects pending evidence, speculative follow-ups, and unsynced launch risk", () => {
  const invalid = structuredClone(v1CutlineDogfoodAlphaEvidence);
  invalid.requiredEvidence.find((item) => item.id === "dogfood-alpha-outcome").status = "pending";
  invalid.followUpIssues.push({
    id: "speculative-docs-follow-up",
    ownerProject: "V1 Release Notes & Upgrade Guide",
    missingEvidenceId: "cutline-baseline",
    allowedReason: "Create docs work even though cutline baseline evidence is accepted"
  });
  invalid.parentInitiativeSync.statusUpdated = false;

  const result = validateDogfoodAlphaEvidence(invalid);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /dogfood-alpha-outcome must be accepted/);
  assert.match(result.errors.join("\n"), /follow-up is allowed only for missing evidence/);
  assert.match(result.errors.join("\n"), /parent initiative status must be updated/);
});
