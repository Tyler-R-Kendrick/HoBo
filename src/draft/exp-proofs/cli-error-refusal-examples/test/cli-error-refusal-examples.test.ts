import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

import {
  CLI_ERROR_REFUSAL_EXAMPLES,
  REQUIRED_ERROR_CASES,
  REQUIRED_OPERATIONS,
  classifyCliErrorRefusalScope,
  parseCliErrorRefusalCatalog,
  summarizeCliErrorRefusalExamples,
} from "../src/cli-error-refusal-examples.ts";

describe("CLI error and refusal examples", () => {
  it("covers every required error/refusal case across doctor, plan, up, inspect, logs, and MCP actions", () => {
    const catalog = parseCliErrorRefusalCatalog(CLI_ERROR_REFUSAL_EXAMPLES);
    const cases = new Set(catalog.examples.map((example) => example.caseId));
    const operations = new Set(catalog.examples.flatMap((example) => example.operations));

    assert.equal(catalog.issue, "HOBO-558");
    assert.equal(catalog.targetPackage, "src/draft/exp-proofs/cli-error-refusal-examples");
    assert.equal(catalog.proofNote, "docs/design/proofs/cli-error-refusal-examples/README.md");

    for (const caseId of REQUIRED_ERROR_CASES) {
      assert.ok(cases.has(caseId), `missing case ${caseId}`);
    }

    for (const operation of REQUIRED_OPERATIONS) {
      assert.ok(operations.has(operation), `missing operation ${operation}`);
    }
  });

  it("pins terminal copy, JSON output, MCP tool result shape, exit code, proof mode, fixture, accessibility, and safe wording", () => {
    const catalog = parseCliErrorRefusalCatalog(CLI_ERROR_REFUSAL_EXAMPLES);

    for (const example of catalog.examples) {
      assert.ok(example.humanTerminalCopy.length >= 2, `${example.caseId} has terminal copy`);
      assert.equal(example.jsonOutput.code, example.code);
      assert.equal(example.jsonOutput.proofMode, example.proofMode);
      assert.equal(example.jsonOutput.fixtureId, example.fixtureId);
      assert.equal(example.mcpToolResult.status, example.mcpStatus);
      assert.equal(example.mcpToolResult.metadata.code, example.code);
      assert.equal(example.mcpToolResult.metadata.proofMode, example.proofMode);
      assert.equal(example.mcpToolResult.metadata.fixtureId, example.fixtureId);
      assert.ok(example.exitCode > 0, `${example.caseId} uses a non-zero exit code`);
      assert.match(example.fixtureId, /^cli-error-refusal\./);
      assert.ok(example.accessibilityNotes.length >= 2, `${example.caseId} has accessibility notes`);
      assert.ok(example.customerSafeWording.length >= 2, `${example.caseId} has customer-safe wording`);
    }
  });

  it("fails closed and never claims live success for simulated or reference fixtures", () => {
    const catalog = parseCliErrorRefusalCatalog(CLI_ERROR_REFUSAL_EXAMPLES);
    const unsafeClaims = /\b(live success|successfully deployed|verified live|real provider passed|credentials accepted)\b/i;

    for (const example of catalog.examples) {
      const rendered = [
        ...example.humanTerminalCopy,
        example.jsonOutput.message,
        example.jsonOutput.remediation,
        ...example.mcpToolResult.content.map((entry) => entry.text),
        ...example.customerSafeWording,
      ].join("\n");

      assert.doesNotMatch(rendered, unsafeClaims, `${example.caseId} avoids live-success claims`);
      if (example.proofMode !== "live") {
        assert.match(rendered, /blocked|refused|unknown|simulated|reference|handoff|cannot/i);
      }
    }
  });

  it("rejects malformed fixtures that drop required cases or attempt scope creep", () => {
    const missingCase = structuredClone(CLI_ERROR_REFUSAL_EXAMPLES);
    missingCase.examples = missingCase.examples.filter(
      (example) => example.caseId !== "destructive-migration-blocked",
    );

    assert.throws(() => parseCliErrorRefusalCatalog(missingCase), /missing required case destructive-migration-blocked/);

    const unsafe = structuredClone(CLI_ERROR_REFUSAL_EXAMPLES);
    unsafe.examples[0] = {
      ...unsafe.examples[0],
      humanTerminalCopy: ["Successfully deployed against real provider credentials."],
    };

    assert.throws(() => parseCliErrorRefusalCatalog(unsafe), /live success claim/i);

    assert.deepEqual(classifyCliErrorRefusalScope("Implement the production CLI error handler"), {
      allowed: false,
      reason: "production-handler",
    });
    assert.deepEqual(classifyCliErrorRefusalScope("Run live auth and provider credential checks"), {
      allowed: false,
      reason: "live-auth-or-provider",
    });
    assert.deepEqual(classifyCliErrorRefusalScope("Automate support ticket creation"), {
      allowed: false,
      reason: "support-automation",
    });
    assert.deepEqual(classifyCliErrorRefusalScope("Add dashboard copy before envelope acceptance"), {
      allowed: false,
      reason: "premature-dashboard-copy",
    });
    assert.deepEqual(classifyCliErrorRefusalScope("Add reference fixture copy for hobo logs"), {
      allowed: true,
      reason: "reference-example",
    });
  });

  it("summarizes examples for downstream CLI, JSON, and MCP proof consumers", () => {
    const summary = summarizeCliErrorRefusalExamples(
      parseCliErrorRefusalCatalog(CLI_ERROR_REFUSAL_EXAMPLES),
    );

    assert.equal(summary.length, REQUIRED_ERROR_CASES.length);
    assert.ok(summary.every((row) => row.outputs.includes("terminal")));
    assert.ok(summary.every((row) => row.outputs.includes("json")));
    assert.ok(summary.every((row) => row.outputs.includes("mcp")));
    assert.ok(summary.every((row) => row.fixtureId.startsWith("cli-error-refusal.")));
  });

  it("reconciles protobuf, CUE, and Pact evidence for the design-time boundary", () => {
    const proto = readFileSync(
      new URL("../architecture/cli_error_refusal_examples.proto", import.meta.url),
      "utf8",
    );
    const cue = readFileSync(
      new URL("../architecture/cli_error_refusal_examples.cue", import.meta.url),
      "utf8",
    );
    const pact = JSON.parse(
      readFileSync(
        new URL("../architecture/pacts/cli_error_refusal_examples.pact.json", import.meta.url),
        "utf8",
      ),
    ) as { consumer: { name: string }; provider: { name: string }; interactions: unknown[] };

    assert.match(proto, /message CliErrorRefusalCatalog/);
    assert.match(cue, /#CliErrorRefusalCatalog/);
    assert.equal(pact.consumer.name, "HOBO-558 CLI error refusal examples");
    assert.equal(pact.provider.name, "HoBo design proof registry");
    assert.ok(pact.interactions.length >= 1);
  });
});
