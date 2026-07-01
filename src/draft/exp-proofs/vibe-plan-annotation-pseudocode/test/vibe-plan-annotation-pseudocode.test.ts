import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

import {
  REQUIRED_ANNOTATION_CASES,
  REQUIRED_PSEUDOCODE_FIELDS,
  VIBE_PLAN_ANNOTATION_PSEUDOCODE,
  evaluatePlanAnnotationPseudocode,
  parsePlanAnnotationPseudocode,
  rejectPlanAnnotationScopeCreep,
  renderAnnotationPseudocode,
} from "../src/vibe-plan-annotation-pseudocode.ts";

describe("vibe plan annotation pseudocode", () => {
  it("pins the HOBO-543 target package, proof note, and required annotation cases", () => {
    const contract = parsePlanAnnotationPseudocode(VIBE_PLAN_ANNOTATION_PSEUDOCODE);

    assert.equal(contract.issue, "HOBO-543");
    assert.equal(contract.targetPackagePath, "src/draft/exp-proofs/vibe-plan-annotation-pseudocode");
    assert.equal(contract.proofNotePath, "docs/design/proofs/vibe-plan-annotation-pseudocode/README.md");
    assert.deepEqual(
      contract.annotations.map((annotation) => annotation.case),
      REQUIRED_ANNOTATION_CASES,
    );
  });

  it("renders pseudocode with input, grouping, severity, proof mode, missing evidence, and owner routing", () => {
    const contract = parsePlanAnnotationPseudocode(VIBE_PLAN_ANNOTATION_PSEUDOCODE);
    const pseudocode = renderAnnotationPseudocode(contract);

    for (const field of REQUIRED_PSEUDOCODE_FIELDS) {
      assert.match(pseudocode, new RegExp(field, "i"), `missing ${field}`);
    }
    assert.match(pseudocode, /groupBy\(annotation\.displayGroup\)/);
    assert.match(pseudocode, /routeToSupportOwner/);
    assert.match(pseudocode, /neverLabelUnknownEvidenceAsSuccess/);
  });

  it("covers proof-mode labels, support handoff, accessibility notes, and blocked evidence states", () => {
    const result = evaluatePlanAnnotationPseudocode(VIBE_PLAN_ANNOTATION_PSEUDOCODE);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.accepted.cases, REQUIRED_ANNOTATION_CASES);
    assert.deepEqual(result.accepted.proofModes, ["reference fixture", "simulated", "scope-out"]);
    assert.ok(result.accepted.blockedStates.includes("blocked"));
    assert.ok(result.accepted.blockedStates.includes("stale/unknown"));
  });

  it("keeps Pact and CUE architecture artifacts aligned with the parsed contract shape", () => {
    const pact = JSON.parse(
      readFileSync(
        new URL("../architecture/pacts/vibe_plan_annotation_pseudocode.pact.json", import.meta.url),
        "utf8",
      ),
    ) as {
      readonly interactions: ReadonlyArray<{
        readonly response: { readonly body: unknown };
      }>;
    };
    const pactContract = parsePlanAnnotationPseudocode(pact.interactions[0].response.body);

    assert.deepEqual(
      pactContract.annotations.map((annotation) => annotation.case),
      REQUIRED_ANNOTATION_CASES,
    );

    const cue = readFileSync(
      new URL("../architecture/vibe_plan_annotation_pseudocode.cue", import.meta.url),
      "utf8",
    );
    for (const field of [
      "targetPackagePath",
      "proofNotePath",
      "displayGroup",
      "severity",
      "proofMode",
      "missingEvidenceBehavior",
      "supportOwnerRoute",
      "accessibilityNote",
      "contractFixtures",
    ]) {
      assert.match(cue, new RegExp(`\\b${field}\\b`));
    }
  });

  it("guards scope-out requests for production engines, live APIs, credentials, UI, and launch claims", () => {
    const denials = rejectPlanAnnotationScopeCreep([
      "Implement the production policy engine for plan approval.",
      "Call a live cloud cost API for realistic prices.",
      "Build the approval runtime and quota enforcement service.",
      "Store provider credentials to enrich annotations.",
      "Ship the production UI and launch claims from this proof.",
    ]);

    assert.equal(denials.length, 5);
    assert.equal(denials.every((denial) => denial.decision === "reject"), true);
  });

  it("fails closed when acceptance evidence is missing or unsafe", () => {
    const invalid = structuredClone(VIBE_PLAN_ANNOTATION_PSEUDOCODE);
    invalid.annotations = invalid.annotations.filter((annotation) => annotation.case !== "missing approval");
    invalid.annotations[0].missingEvidenceBehavior = "show as success";
    invalid.annotations[1].supportOwnerRoute = "";
    invalid.annotations[2].accessibilityNote = "uses color only";
    invalid.annotations[3].proofMode = "live";

    const result = evaluatePlanAnnotationPseudocode(invalid);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /missing annotation case: missing approval/);
    assert.match(result.errors.join("\n"), /unknown evidence must not be shown as success/);
    assert.match(result.errors.join("\n"), /support owner route is required/);
    assert.match(result.errors.join("\n"), /accessibility note must be terminal-friendly/);
    assert.match(result.errors.join("\n"), /live proof mode is out of scope/);
  });
});
