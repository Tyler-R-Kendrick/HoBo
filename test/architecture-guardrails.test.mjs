import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkArchitectureGuardrails } from "../scripts/check-architecture-guardrails.mjs";

async function write(root, file, content = "") {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "hobo-architecture-guardrails-"));

  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("architecture guard rejects implementation packages without contract and state proofs", async () => {
  await withFixture(async (root) => {
    await write(root, "src/draft/demo-contract/src/demo.mjs", "export const ok = true;\n");

    const result = await checkArchitectureGuardrails({
      root,
      files: ["src/draft/demo-contract/src/demo.mjs"],
    });

    assert.deepEqual(
      result.problems.map((problem) => problem.code),
      [
        "missing-pact-contract",
        "missing-protobuf-definition",
        "missing-cue-constraints",
        "missing-parse-derived-type",
        "missing-event-architecture",
      ],
    );
  });
});

test("architecture guard accepts packages with PACT, protobuf, CUE, parsed types, and event architecture evidence", async () => {
  await withFixture(async (root) => {
    await write(root, "src/draft/demo-contract/src/demo.mjs", "export const ok = true;\n");
    await write(
      root,
      "src/draft/demo-contract/contracts/pacts/demo-boundary.pact.json",
      JSON.stringify({
        consumer: { name: "demo-consumer" },
        provider: { name: "demo-provider" },
        interactions: [],
      }),
    );
    await write(root, "src/draft/demo-contract/proto/demo.proto", 'syntax = "proto3";\nmessage Demo {}\n');
    await write(root, "src/draft/demo-contract/proto/demo.cue", "Demo: {}\n");
    await write(
      root,
      "src/draft/demo-contract/architecture.md",
      [
        "# Demo Architecture",
        "",
        "Parse, don't validate: constructors return derived parsed types after protobuf and CUE constraints pass.",
        "The CQRS actor consumes commands, emits events, and appends to the event store.",
        "A materialized view exposes rx-style projection streams with cached snapshots.",
        "Historical snapshots persist in the read store.",
      ].join("\n"),
    );

    const result = await checkArchitectureGuardrails({
      root,
      files: ["src/draft/demo-contract/src/demo.mjs"],
    });

    assert.deepEqual(result.problems, []);
  });
});

test("architecture guard requires CUE constraints for every protobuf type", async () => {
  await withFixture(async (root) => {
    await write(root, "src/draft/demo-contract/src/demo.mjs", "export const ok = true;\n");
    await write(
      root,
      "src/draft/demo-contract/contracts/pacts/demo-boundary.pact.json",
      JSON.stringify({
        consumer: { name: "demo-consumer" },
        provider: { name: "demo-provider" },
        interactions: [],
      }),
    );
    await write(
      root,
      "src/draft/demo-contract/proto/demo.proto",
      'syntax = "proto3";\nmessage Demo {}\nenum DemoState { DEMO_STATE_UNSPECIFIED = 0; }\n',
    );
    await write(root, "src/draft/demo-contract/proto/demo.cue", "Demo: {}\n");
    await write(
      root,
      "src/draft/demo-contract/architecture.md",
      [
        "# Demo Architecture",
        "",
        "Parse, don't validate: constructors return derived parsed types after protobuf and CUE constraints pass.",
        "The CQRS actor consumes commands, emits events, and appends to the event store.",
        "A materialized view exposes rx-style projection streams with cached snapshots.",
        "Historical snapshots persist in the read store.",
      ].join("\n"),
    );

    const result = await checkArchitectureGuardrails({
      root,
      files: ["src/draft/demo-contract/src/demo.mjs"],
    });

    assert.deepEqual(result.problems.map((problem) => problem.code), ["missing-cue-constraints"]);
  });
});

test("architecture guard ignores docs-only draft package edits", async () => {
  await withFixture(async (root) => {
    await write(root, "src/draft/demo-contract/README.md", "# Demo\n");

    const result = await checkArchitectureGuardrails({
      root,
      files: ["src/draft/demo-contract/README.md"],
    });

    assert.deepEqual(result.problems, []);
  });
});
