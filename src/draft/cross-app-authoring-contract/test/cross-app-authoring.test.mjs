import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCrossAppManifestEntry,
  createCrossAppBinding,
  generateCrossAppClientDeclaration,
} from "../src/cross-app-authoring.mjs";

const asanaAuth = {
  issuer: "https://asana.example.com",
  flows: [
    {
      type: "oauth2-xaa",
      idJag: true,
      authorizationServer: "https://asana.example.com/oauth",
      audience: "urn:asana:app",
      scopes: ["tasks:read", "tasks:write"],
      resourceIndicators: ["urn:asana:tasks"],
      operations: {
        "tasks.get": { scope: "tasks:read" },
        "tasks.create": { scope: "tasks:write" },
      },
    },
  ],
};

test("crossApp generates a client from auth.json advertised operations", () => {
  const asana = createCrossAppBinding("asana", asanaAuth);

  assert.equal(typeof asana.client.tasks.get, "function");
  assert.equal(typeof asana.client.tasks.create, "function");
  assert.equal(asana.client.tasks.delete, undefined);
  assert.throws(() => asana.call("tasks.delete"), /not advertised/);

  const declaration = generateCrossAppClientDeclaration(asana);
  assert.match(declaration, /readonly tasks:/);
  assert.match(declaration, /get\(input: unknown\): CrossAppCall<"tasks:read">/);
  assert.match(declaration, /create\(input: unknown\): CrossAppCall<"tasks:write">/);
  assert.doesNotMatch(declaration, /delete\(/);
});

test("crossApp lowers usage-inferred XAA scope into the manifest entry", () => {
  const asana = createCrossAppBinding("asana", asanaAuth);
  const entry = buildCrossAppManifestEntry(asana, ["tasks.create"]);

  assert.deepEqual(entry, {
    type: "external-app.v1",
    via: "xaa",
    audience: "urn:asana:app",
    onBehalfOf: "user",
    allow: ["tasks:write"],
    observedScopes: ["tasks:write"],
    declaredAllow: undefined,
    requestedScopeSource: "usage-inferred",
    usageContract: {
      compareObservedUsage: false,
      usageExceedsDeclaredAllow: false,
    },
    fallbackFrom: undefined,
  });
});

test("allow records a narrow-only declared set and keeps observed usage comparable", () => {
  const readOnlyAsana = createCrossAppBinding("asana", asanaAuth).allow("tasks:read");
  const entry = buildCrossAppManifestEntry(readOnlyAsana, ["tasks.get"]);

  assert.deepEqual(entry.allow, ["tasks:read"]);
  assert.deepEqual(entry.declaredAllow, ["tasks:read"]);
  assert.deepEqual(entry.observedScopes, ["tasks:read"]);
  assert.equal(entry.requestedScopeSource, "declared-narrowing");
  assert.deepEqual(entry.usageContract, {
    compareObservedUsage: true,
    usageExceedsDeclaredAllow: false,
  });
});

test("allow narrower than observed usage is marked for can-deploy comparison", () => {
  const readOnlyAsana = createCrossAppBinding("asana", asanaAuth).allow("tasks:read");
  const entry = buildCrossAppManifestEntry(readOnlyAsana, ["tasks.create"]);

  assert.deepEqual(entry.allow, ["tasks:read"]);
  assert.deepEqual(entry.observedScopes, ["tasks:write"]);
  assert.deepEqual(entry.usageContract, {
    compareObservedUsage: true,
    usageExceedsDeclaredAllow: true,
  });
});

test("non-XAA targets record the fallback flow instead of dropping the dependency", () => {
  const fallbackAuth = {
    issuer: "https://legacy.example.com",
    flows: [
      {
        type: "oauth2-obo",
        authorizationServer: "https://legacy.example.com/oauth",
        audience: "urn:legacy:app",
        scopes: ["tickets:read"],
        operations: {
          "tickets.list": { scope: "tickets:read" },
        },
      },
    ],
  };

  const legacy = createCrossAppBinding("legacy", fallbackAuth);
  const entry = buildCrossAppManifestEntry(legacy, ["tickets.list"]);

  assert.equal(entry.via, "oauth2-obo");
  assert.equal(entry.fallbackFrom, "oauth2-xaa");
  assert.deepEqual(entry.allow, ["tickets:read"]);
});

test("static-secret flows are not accepted as XAA authoring fallbacks", () => {
  assert.throws(
    () =>
      createCrossAppBinding("legacy", {
        flows: [
          {
            type: "api-key",
            scopes: ["tickets:read"],
            operations: {
              "tickets.list": { scope: "tickets:read" },
            },
          },
        ],
      }),
    /supported external-app auth flow/
  );
});

test("scope strings from auth.json are validated against advertised scopes", () => {
  assert.throws(
    () =>
      createCrossAppBinding("asana", {
        ...asanaAuth,
        flows: [
          {
            ...asanaAuth.flows[0],
            operations: {
              "tasks.create": { scope: "tasks:admin" },
            },
          },
        ],
      }),
    /scope not advertised/
  );

  assert.throws(
    () => createCrossAppBinding("asana", asanaAuth).allow("tasks:admin"),
    /scope not advertised/
  );

  assert.throws(
    () =>
      createCrossAppBinding("asana", {
        ...asanaAuth,
        flows: [{ ...asanaAuth.flows[0], scopes: ["tasks:*"] }],
      }),
    /Invalid scope/
  );

  assert.throws(
    () =>
      createCrossAppBinding("asana", {
        ...asanaAuth,
        flows: [{ ...asanaAuth.flows[0], idJag: false }],
      }),
    /idJag: true/
  );
});
