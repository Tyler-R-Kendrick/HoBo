import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalManifestHash,
  parseManifestReference,
  parseOutputPlaceholder,
  validateManifest,
} from "../src/manifest.mjs";

const goldenManifest = {
  schema: "hobo.manifest/v1",
  componentHost: {
    kind: "wasmtime",
    version: "1.0.0",
  },
  resources: {
    db: {
      type: "data.v1",
      port: "hobo:data",
      paradigm: "relational",
      allow: ["query"],
      connectionString: "{db.connectionString}",
    },
    api: {
      type: "component.v1",
      image: "oci://registry.example.com/api@sha256:abc123",
      runtime: "wasm",
      exports: ["wasi:http/incoming-handler"],
      links: [{ import: "hobo:data", to: "db" }],
      endpoints: {
        http: { scheme: "http", targetPort: 8080, external: true },
      },
      env: {
        ConnectionStrings__db: "{db.connectionString}",
        SERVICE_REF:
          "${resources.data.postgres#db.outputs.connectionString}",
      },
      annotations: {
        scaling: { min: 1, max: 10 },
        with: { "aws.fargate": { cpu: 512 } },
      },
    },
    site: {
      type: "website.v1",
      bind: ["api"],
    },
  },
};

describe("hobo.manifest/v1 contract", () => {
  it("validates the db/api/site golden manifest and records Aspire fallback env mapping", () => {
    const result = validateManifest(goldenManifest);

    assert.equal(result.valid, true);
    assert.deepEqual(result.aspireEnv, {
      api: ["ConnectionStrings__db"],
    });
  });

  it("rejects malformed manifests with precise paths", () => {
    const missingPort = structuredClone(goldenManifest);
    delete missingPort.resources.db.port;

    assert.throws(
      () => validateManifest(missingPort),
      /resources\.db\.port: required/,
    );

    const unknownType = structuredClone(goldenManifest);
    unknownType.resources.db.type = "queue.v9";

    assert.throws(
      () => validateManifest(unknownType),
      /resources\.db\.type: unknown resource type queue\.v9/,
    );
  });

  it("canonicalizes equivalent manifests to the same content hash", () => {
    const reordered = {
      resources: {
        site: goldenManifest.resources.site,
        api: goldenManifest.resources.api,
        db: goldenManifest.resources.db,
      },
      componentHost: {
        version: "1.0.0",
        kind: "wasmtime",
      },
      schema: "hobo.manifest/v1",
    };

    assert.equal(
      canonicalManifestHash(goldenManifest),
      canonicalManifestHash(reordered),
    );
  });

  it("parses lazy tokens and Humanitec placeholders", () => {
    assert.deepEqual(parseManifestReference("{db.connectionString}"), {
      resourceId: "db",
      output: "connectionString",
    });

    assert.deepEqual(
      parseOutputPlaceholder("${resources.data.postgres#db.outputs.url}"),
      {
        type: "data",
        className: "postgres",
        resourceId: "db",
        output: "url",
      },
    );

    assert.deepEqual(parseOutputPlaceholder("${context.environment}"), {
      contextPath: "environment",
    });
  });

  it("fails dangling references and unresolved link imports closed", () => {
    const danglingToken = structuredClone(goldenManifest);
    danglingToken.resources.api.env.ConnectionStrings__missing =
      "{missing.connectionString}";

    assert.throws(
      () => validateManifest(danglingToken),
      /resources\.api\.env\.ConnectionStrings__missing: unknown resource missing/,
    );

    const danglingLink = structuredClone(goldenManifest);
    danglingLink.resources.api.links = [{ import: "hobo:queue", to: "db" }];

    assert.throws(
      () => validateManifest(danglingLink),
      /resources\.api\.links\[0\]\.import: no matching declared resource for hobo:queue/,
    );
  });
});
