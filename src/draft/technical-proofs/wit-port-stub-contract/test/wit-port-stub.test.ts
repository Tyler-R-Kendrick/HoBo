import assert from "node:assert/strict";
import test from "node:test";

import {
  NoRouteError,
  PAYMENTS_PORT,
  ReplayDivergenceError,
  StubSchemaError,
  createPaymentsPortSchema,
  createReplayHarness,
  createStubMembrane,
  exportRecordedTrace,
  replayRecordedTrace,
  stub,
} from "../src/wit-port-stub.js";

const chargeInput = { amountCents: 2500, currency: "USD" };

test("reference checkout app runs end-to-end with payments port stubbed", async () => {
  const membrane = createStubMembrane();
  const portSchema = createPaymentsPortSchema();

  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });
  const link = stub({
    membrane,
    componentId: "checkout",
    portInterface: PAYMENTS_PORT,
    portSchema,
  });

  const result = await membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput);

  assert.equal(link.boundaryMode, "mock");
  assert.deepEqual(result, { status: "ok", transactionId: "stub-txn-1" });
});

test("stubbed calls emit stub.Recorded and link.Called events", async () => {
  const membrane = createStubMembrane();
  const portSchema = createPaymentsPortSchema();

  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });
  stub({ membrane, componentId: "checkout", portInterface: PAYMENTS_PORT, portSchema });

  await membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput);

  const recorded = membrane.events.filter((event) => event.type === "stub.Recorded");
  const called = membrane.events.filter((event) => event.type === "link.Called");

  assert.equal(recorded.length, 1);
  assert.equal(called.length, 1);
  assert.equal(recorded[0].operation, "charge");
  assert.deepEqual(recorded[0].input, chargeInput);
  assert.deepEqual(recorded[0].output, { status: "ok", transactionId: "stub-txn-1" });
  assert.equal(called[0].boundaryMode, "mock");
});

test("recorded trace exports for Camp event store and replays deterministically", async () => {
  const membrane = createStubMembrane();
  const portSchema = createPaymentsPortSchema();

  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });
  stub({ membrane, componentId: "checkout", portInterface: PAYMENTS_PORT, portSchema });
  await membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput);

  const trace = exportRecordedTrace(membrane);
  assert.equal(trace.schema, "hobo.stub.recorded-trace/v1");
  assert.equal(trace.entries.length, 1);

  const replayAdapter = {
    async charge(input) {
      return { status: "ok", transactionId: "stub-txn-1", echoed: input.amountCents };
    },
  };

  await assert.rejects(
    () => replayRecordedTrace({ membrane, trace, adapter: replayAdapter }),
  (error) => error instanceof ReplayDivergenceError,
  );

  const faithfulAdapter = {
    async charge() {
      return { status: "ok", transactionId: "stub-txn-1" };
    },
  };

  const replayResult = await replayRecordedTrace({
    membrane,
    trace,
    adapter: faithfulAdapter,
  });

  assert.equal(replayResult.ok, true);
  assert.equal(replayResult.deterministic, true);
  assert.equal(
    membrane.events.some((event) => event.type === "stub.ReplayCompleted"),
    true,
  );
});

test("partial stub overrides return canned behavior per operation", async () => {
  const membrane = createStubMembrane();
  const portSchema = createPaymentsPortSchema();

  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });
  stub({
    membrane,
    componentId: "checkout",
    portInterface: PAYMENTS_PORT,
    portSchema,
    overrides: {
      charge: () => ({ status: "declined", transactionId: "stub-decline-1" }),
    },
  });

  const result = await membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput);
  assert.deepEqual(result, { status: "declined", transactionId: "stub-decline-1" });
});

test("schema-invalid stub responses fail closed at the boundary", async () => {
  const membrane = createStubMembrane();
  const portSchema = createPaymentsPortSchema();

  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });
  stub({
    membrane,
    componentId: "checkout",
    portInterface: PAYMENTS_PORT,
    portSchema,
    overrides: {
      charge: () => ({ status: "bogus", transactionId: "" }),
    },
  });

  await assert.rejects(
    () => membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput),
    (error) => error instanceof StubSchemaError && error.code === "stub.schema-invalid",
  );
});

test("unlinked imports fail with typed no-route instead of panicking", async () => {
  const membrane = createStubMembrane();
  membrane.registerComponent({ id: "checkout", imports: [PAYMENTS_PORT] });

  await assert.rejects(
    () => membrane.callImport("checkout", PAYMENTS_PORT, "charge", chargeInput),
    (error) => error instanceof NoRouteError && error.code === "no-route",
  );
});

test("replay harness rejects nondeterministic adapter output", async () => {
  const trace = {
    entries: [
      {
        function: "charge",
        input: chargeInput,
        output: { status: "ok", transactionId: "stub-txn-1" },
      },
    ],
  };

  const harness = createReplayHarness({
    adapter: {
      async charge() {
        return { status: "ok", transactionId: "different-txn" };
      },
    },
  });

  await assert.rejects(
    () => harness.replay(trace),
    (error) => error instanceof ReplayDivergenceError,
  );
});

test("report records HOBO-651 scope and S1-12 replay harness stand-in", () => {
  const membrane = createStubMembrane();
  const report = membrane.report();

  assert.equal(report.issue, "HOBO-651");
  assert.deepEqual(report.boundaryModes, ["live", "mock"]);
  assert.ok(report.events.includes("stub.Recorded"));
  assert.ok(report.scopeIn.some((item) => item.includes("S1-12")));
});
