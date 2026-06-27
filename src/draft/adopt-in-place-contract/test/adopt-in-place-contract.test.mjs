import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdoptionGraph,
  createExternalResource,
  createFixtureIacState,
  createManagedResource,
  detectAdoptedDrift,
  graphDigest,
  importIacState,
  planDestroy,
  planReconcile,
  resolveBindings,
} from "../src/adopt-in-place-contract.mjs";

test("hobo import turns fixture IaC state into adopted nodes and resource.Adopted facts", () => {
  const result = importIacState({
    graph: createAdoptionGraph(),
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });

  assert.equal(result.status, "imported");
  assert.equal(result.graph.nodes["legacy-db"].kind, "adopted");
  assert.equal(result.graph.nodes["legacy-db"].lifecycle.destroy, "retain");
  assert.equal(result.graph.nodes["legacy-db"].lifecycle.reconcile, "drift-detect-only");
  assert.deepEqual(result.events.map((event) => event.type), ["resource.Adopted"]);
  assert.deepEqual(result.events[0].data, {
    resourceId: "legacy-db",
    externalId: "urn:pulumi:prod::legacy::aws:rds/instance:Instance::legacy-db",
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });
});

test("adopted nodes reconcile by refresh/drift detection and are never destroy or recreate targets", () => {
  const { graph } = importIacState({
    graph: createAdoptionGraph(),
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });

  const reconcile = planReconcile({
    graph,
    observedOutputs: {
      "legacy-db": {
        endpoint: "postgres://legacy-db.internal:5432/shop",
        passwordRef: "secret://legacy-db/password",
      },
    },
  });

  assert.deepEqual(reconcile.actions, [
    { action: "refresh", resourceId: "legacy-db", mode: "drift-detect-only" },
  ]);
  assert.equal(
    reconcile.actions.some((action) => ["destroy", "provision", "recreate", "update"].includes(action.action)),
    false,
  );
});

test("managed resources bind across the boundary to external resource outputs", () => {
  const graph = createAdoptionGraph({
    nodes: [
      createExternalResource({
        id: "legacy-db",
        type: "database",
        declaredOutputs: ["endpoint", "passwordRef"],
        outputs: {
          endpoint: "postgres://legacy-db.internal:5432/shop",
          passwordRef: "secret://legacy-db/password",
        },
      }),
      createManagedResource({
        id: "api",
        binds: [
          { from: "legacy-db", output: "endpoint", as: "DATABASE_URL" },
          { from: "legacy-db", output: "passwordRef", as: "DATABASE_PASSWORD_REF" },
        ],
      }),
    ],
  });

  assert.deepEqual(resolveBindings(graph, "api"), {
    DATABASE_PASSWORD_REF: "secret://legacy-db/password",
    DATABASE_URL: "postgres://legacy-db.internal:5432/shop",
  });
});

test("destroy plans skip adopted and external nodes", () => {
  const imported = importIacState({
    graph: createAdoptionGraph({
      nodes: [
        createManagedResource({ id: "api", deps: ["legacy-db", "shared-vpc"] }),
        createExternalResource({
          id: "shared-vpc",
          type: "network",
          declaredOutputs: ["vpcId"],
          outputs: { vpcId: "vpc-123" },
        }),
      ],
    }),
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });

  const destroy = planDestroy(imported.graph);

  assert.deepEqual(destroy.actions, [{ action: "destroy", resourceId: "api" }]);
  assert.deepEqual(destroy.skipped, [
    { resourceId: "legacy-db", kind: "adopted", reason: "adopted resources are retained" },
    { resourceId: "shared-vpc", kind: "external", reason: "external resources are unmanaged" },
  ]);
});

test("import fails closed on an id collision with an existing managed node", () => {
  assert.throws(
    () =>
      importIacState({
        graph: createAdoptionGraph({
          nodes: [createManagedResource({ id: "legacy-db" })],
        }),
        state: createFixtureIacState(),
        source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
      }),
    {
      name: "AdoptInPlaceError",
      code: "import-id-collision",
    },
  );
});

test("external resources with wrong declared outputs fail the bind precisely", () => {
  const graph = createAdoptionGraph({
    nodes: [
      createExternalResource({
        id: "legacy-db",
        type: "database",
        declaredOutputs: ["endpoint"],
        outputs: { url: "postgres://legacy-db.internal:5432/shop" },
      }),
      createManagedResource({
        id: "api",
        binds: [{ from: "legacy-db", output: "endpoint", as: "DATABASE_URL" }],
      }),
    ],
  });

  assert.throws(() => resolveBindings(graph, "api"), {
    name: "AdoptInPlaceError",
    code: "external-output-missing",
  });
});

test("adopted resource drift is detect-only and does not auto-remediate by default", () => {
  const { graph } = importIacState({
    graph: createAdoptionGraph(),
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });

  const drift = detectAdoptedDrift({
    graph,
    observedOutputs: {
      "legacy-db": {
        endpoint: "postgres://moved-db.internal:5432/shop",
        passwordRef: "secret://legacy-db/password",
      },
    },
  });

  assert.deepEqual(drift.records, [
    {
      resourceId: "legacy-db",
      mode: "detect-only",
      changedOutputs: ["endpoint"],
      remediation: "manual",
    },
  ]);
  assert.deepEqual(drift.actions, [
    { action: "record-drift", resourceId: "legacy-db", mode: "detect-only" },
  ]);
});

test("re-importing the same state is idempotent", () => {
  const first = importIacState({
    graph: createAdoptionGraph(),
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });
  const second = importIacState({
    graph: first.graph,
    state: createFixtureIacState(),
    source: { kind: "pulumi", ref: "s3://legacy-estate/prod/pulumi-state.json" },
  });

  assert.equal(second.status, "noop");
  assert.deepEqual(second.events, []);
  assert.equal(graphDigest(second.graph), graphDigest(first.graph));
});
