import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES,
  REQUIRED_BOUNDARY_CASES,
  REQUIRED_OPERATIONS,
  classifyControlPlaneApiScope,
  parseControlPlaneApiResourceLifecycleShapes,
  summarizeOperationParity,
} from "../src/control-plane-api-resource-lifecycle-shapes.ts";

describe("control-plane API resource lifecycle shapes", () => {
  it("specifies every shared control-plane operation with request and response shapes", () => {
    const contract = parseControlPlaneApiResourceLifecycleShapes(CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES);

    assert.equal(contract.issue, "HOBO-569");
    assert.equal(
      contract.targetPackage,
      "src/draft/exp-proofs/control-plane-api-resource-lifecycle-shapes",
    );

    assert.deepEqual(
      contract.operations.map((operation) => operation.id),
      REQUIRED_OPERATIONS,
    );

    for (const operation of contract.operations) {
      assert.ok(operation.requestShape.length > 0, `${operation.id} request`);
      assert.ok(operation.responseShape.length > 0, `${operation.id} response`);
      assert.ok(operation.domainTerms.length > 0, `${operation.id} domain terms`);
    }
  });

  it("pins fail-closed refusal envelopes for every required boundary case", () => {
    const contract = parseControlPlaneApiResourceLifecycleShapes(CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES);
    const refusalCodes = new Set(contract.refusalEnvelopes.map((envelope) => envelope.code));

    for (const code of REQUIRED_BOUNDARY_CASES) {
      assert.ok(refusalCodes.has(code), `missing ${code}`);
    }

    assert.ok(
      contract.refusalEnvelopes.every(
        (envelope) => envelope.remediation && envelope.proofMode && envelope.fixtureId && envelope.redactionClass,
      ),
      "refusals carry remediation, proof mode, fixture id, and redaction class",
    );
  });

  it("proves API and MCP callers receive equivalent typed results", () => {
    const parity = summarizeOperationParity(
      parseControlPlaneApiResourceLifecycleShapes(CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES),
    );

    assert.equal(parity.length, REQUIRED_OPERATIONS.length);
    assert.ok(parity.every((row) => row.apiEndpoint.startsWith("/")));
    assert.ok(parity.every((row) => row.mcpTool.startsWith("hobo_")));
    assert.ok(parity.every((row) => row.sharedResultEnvelope === true));
  });

  it("requires protobuf, CUE, and Pact fixture expectations for the boundary", () => {
    const contract = parseControlPlaneApiResourceLifecycleShapes(CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES);

    assert.equal(contract.contractFixtures.protobuf, "architecture/control_plane_api_resource_lifecycle_shapes.proto");
    assert.equal(contract.contractFixtures.cue, "architecture/control_plane_api_resource_lifecycle_shapes.cue");
    assert.equal(
      contract.contractFixtures.pact,
      "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json",
    );
  });

  it("guards scope-out requests for production implementation and live state", () => {
    assert.deepEqual(classifyControlPlaneApiScope("Build the production REST implementation"), {
      allowed: false,
      reason: "production-api-implementation",
    });
    assert.deepEqual(classifyControlPlaneApiScope("Persist real DeploymentPlans in a live database"), {
      allowed: false,
      reason: "real-persistence",
    });
    assert.deepEqual(classifyControlPlaneApiScope("Call an AWS provider adapter with real credentials"), {
      allowed: false,
      reason: "live-provider-or-credential",
    });
    assert.deepEqual(classifyControlPlaneApiScope("Bypass Planner and Gatekeeper for a dashboard endpoint"), {
      allowed: false,
      reason: "planner-gatekeeper-bypass",
    });
    assert.deepEqual(classifyControlPlaneApiScope("Add deterministic API shape fixtures"), {
      allowed: true,
      reason: "fixture-contract",
    });
  });
});
