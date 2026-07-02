import assert from "node:assert/strict";
import test from "node:test";

import { contentDigest } from "../../slsa-provenance-certification-contract/src/provenance.js";
import {
  STUB_IMPLEMENTATION_REPAIR_BUDGET,
  buildStubImplementationGenerationRequest,
  loadPaymentsStubRecordingsFixture,
  parseStubRecordings,
  runNonConvergingStubImplementationGeneration,
  runStubImplementationGeneration
} from "../src/stub-implementation-generation.js";

test("acceptance: stubbed payments port receives generated implementation that passes conformance and reproduces all recorded traces", async () => {
  const parsedStub = loadPaymentsStubRecordingsFixture();
  const result = await runStubImplementationGeneration({
    validationScript: ["trace-mismatch", "pass"]
  });

  assert.equal(result.outcome, "promoted");
  assert.equal(result.parsedStub.stubId, "stub-payments-fixture");
  assert.equal(result.parsedStub.traceIds.length, 2);
  assert.equal(result.conformance.ok, true, result.conformance.reasons.join("\n"));
  assert.equal(result.traceReplay.ok, true, result.traceReplay.reasons.join("\n"));
  assert.deepEqual(result.promotion.reproducedTraces, [...parsedStub.traceIds]);
  assert.equal(result.promotion.event.type, "impl.Promoted");
  assert.deepEqual(
    result.repair.events.map((event) => event.type),
    ["gen.ValidationFailed", "gen.Repaired", "gen.Validated"]
  );
  assert.equal(result.finalValidation.report.traceReplay.passed, true);
});

test("adversarial: trace mismatch blocks promotion even when conformance is green", async () => {
  const result = await runStubImplementationGeneration({
    validationScript: ["trace-mismatch", "trace-mismatch", "trace-mismatch"]
  });

  assert.equal(result.outcome, "needs-human");
  assert.equal(result.promotion, null);
  assert.equal(result.repair.finalEvent.type, "gen.NeedsHuman");
  assert.match(result.repair.finalEvent.data.failingAssertions.join("\n"), /trace:trace:payments-charge-happy-path/);
});

test("adversarial: bounded non-convergence emits one NeedsHuman and never promotes", async () => {
  const result = await runNonConvergingStubImplementationGeneration();

  assert.equal(result.outcome, "needs-human");
  assert.equal(result.repair.repairAttempts, STUB_IMPLEMENTATION_REPAIR_BUDGET);
  assert.equal(result.repair.finalEvent.type, "gen.NeedsHuman");
  assert.equal(result.repair.events.filter((event) => event.type === "gen.NeedsHuman").length, 1);
  assert.equal(result.promotion, null);
});

test("adversarial: contradictory stub material cannot override authoritative WIT target", async () => {
  const contradictoryStub = parseStubRecordings({
    schema: "hobo.stub.recordings/v1",
    port: "hobo:cache/redis@0.1.0",
    stubId: "stub-redis-wrong-port",
    recordings: [
      {
        id: "trace:redis-get",
        type: "link.Called",
        method: "get",
        inputDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        outputDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      }
    ]
  });
  const request = buildStubImplementationGenerationRequest({ stubRecordings: contradictoryStub });

  assert.equal(request.target.witPort, "hobo:service/payments@0.1.0");
  assert.equal(request.authoritativeRefs.at(-1).suiteId, "conformance.service.payments@0.1.0");

  await assert.rejects(
    () =>
      runStubImplementationGeneration({
        stubRecordings: contradictoryStub,
        validationScript: ["pass"]
      }),
    /stub\.port_mismatch/
  );
});

test("adversarial: empty stub recordings are rejected at parse boundary", () => {
  assert.throws(
    () =>
      parseStubRecordings({
        schema: "hobo.stub.recordings/v1",
        port: "hobo:service/payments@0.1.0",
        stubId: "empty",
        recordings: []
      }),
    /stub\.recordings_empty/
  );
});

test("determinism: pinned seed reproduces candidate and promotion payload digests", async () => {
  const first = await runStubImplementationGeneration();
  const second = await runStubImplementationGeneration();
  const differentSeed = await runStubImplementationGeneration({ seed: "seed-hobo-652-different" });

  assert.equal(first.finalCandidateRef.digest, second.finalCandidateRef.digest);
  assert.equal(
    contentDigest(first.promotion),
    contentDigest(second.promotion)
  );
  assert.notEqual(first.finalCandidateRef.digest, differentSeed.finalCandidateRef.digest);
});
