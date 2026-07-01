import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ROLE_JOURNEY_CLI_MCP_TRANSCRIPTS,
  REQUIRED_ROLE_JOURNEY_COVERAGE,
  REQUIRED_ROLE_JOURNEY_ROLES,
  classifyRoleJourneyScope,
  listAcceptedQuickstartFixtureIds,
  parseRoleJourneyCliMcpTranscripts,
  renderRoleJourneyTranscript,
  renderStepMcpResult,
} from "../src/role-journey-cli-mcp-transcripts.js";

describe("role journey CLI and MCP transcripts", () => {
  it("covers the six required role journeys with accepted quickstart fixture ids", () => {
    const acceptedFixtureIds = new Set(listAcceptedQuickstartFixtureIds());
    const proof = parseRoleJourneyCliMcpTranscripts(ROLE_JOURNEY_CLI_MCP_TRANSCRIPTS);

    assert.deepEqual(
      proof.journeys.map((journey) => journey.role).sort(),
      [...REQUIRED_ROLE_JOURNEY_ROLES].sort(),
    );

    for (const journey of proof.journeys) {
      assert.ok(
        acceptedFixtureIds.has(journey.primaryQuickstartFixtureId),
        `${journey.role} must start from an accepted HOBO-577 fixture`,
      );
      assert.ok(journey.sequence.length >= 3, `${journey.role} needs a real command sequence`);

      for (const step of journey.sequence) {
        assert.ok(step.command.startsWith("hobo "), `${step.id} must stay CLI-first`);
        assert.ok(acceptedFixtureIds.has(step.quickstartFixtureId), `${step.id} must reuse HOBO-577 fixtures`);
        assert.equal(step.jsonResult.fixtureId, step.quickstartFixtureId);
        assert.equal(step.mcpResult.fixtureId, step.quickstartFixtureId);
        assert.equal(step.mcpResult.proofMode, step.proofMode);
      }
    }
  });

  it("pins terminal output, JSON, MCP result, support, accessibility, and negative paths", () => {
    const proof = parseRoleJourneyCliMcpTranscripts(ROLE_JOURNEY_CLI_MCP_TRANSCRIPTS);

    for (const journey of proof.journeys) {
      const transcript = renderRoleJourneyTranscript(journey);
      assert.match(transcript, /proof-mode:/);
      assert.match(transcript, /support handoff:/);
      assert.match(transcript, /accessibility:/);
      assert.ok(
        journey.negativePaths.includes("blocked") &&
          journey.negativePaths.includes("stale-or-unknown-evidence"),
        `${journey.role} must carry blocked and stale/unknown evidence paths`,
      );

      for (const step of journey.sequence) {
        assert.equal(step.jsonResult.schema, "hobo.role-journey-cli-mcp-result/v1");
        assert.match(step.expectedTerminalOutput, /(blocked|ready|stale|support|rollback|migrate|deploy)/i);
        assert.match(step.accessibilityNote, /(plain text|screen reader|non-color|stable heading)/i);
        assert.match(step.supportHandoff, /support/i);
        assert.equal(renderStepMcpResult(step).tool, step.mcpResult.tool);
      }
    }
  });

  it("covers deploy, manage, migrate, rollback, policy or contract denial, and support handoff", () => {
    const proof = parseRoleJourneyCliMcpTranscripts(ROLE_JOURNEY_CLI_MCP_TRANSCRIPTS);
    const aggregateCoverage = new Set(proof.journeys.flatMap((journey) => journey.coverage));

    for (const required of REQUIRED_ROLE_JOURNEY_COVERAGE) {
      assert.ok(aggregateCoverage.has(required), `missing coverage ${required}`);
    }
  });

  it("rejects production CLI, live provider, credentials, customer data, and dashboard-first scope creep", () => {
    assert.deepEqual(classifyRoleJourneyScope("Implement the production CLI parser."), {
      allowed: false,
      reason: "production-cli",
    });
    assert.deepEqual(classifyRoleJourneyScope("Call AWS with real credentials."), {
      allowed: false,
      reason: "live-provider-or-credential",
    });
    assert.deepEqual(classifyRoleJourneyScope("Use customer tenant data in the examples."), {
      allowed: false,
      reason: "customer-data",
    });
    assert.deepEqual(classifyRoleJourneyScope("Replace the transcript with an enterprise dashboard tour."), {
      allowed: false,
      reason: "dashboard-first",
    });
  });
});
