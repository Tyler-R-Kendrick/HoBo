import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSessionCommand } from "@hobo/code";

const envelope = {
  schemaVersion: "hobo.code.session-command/v1",
  commandId: "test-1",
  actorId: "test",
  sessionId: "session-1",
  expectedRevision: "0"
};

describe("agent session command parser", () => {
  it("accepts a valid command and rejects invalid nested input", () => {
    expect(parseSessionCommand({ ...envelope, createTab: { title: "review" } }).command.case).toBe("createTab");
    expect(() => parseSessionCommand({ ...envelope, splitPane: { paneId: "pane-1", title: "agent", direction: "diagonal" } })).toThrow("splitPane.direction");
  });

  it("pins the proof consumer to the production control-plane provider", () => {
    const pact = JSON.parse(readFileSync(join(import.meta.dirname, "../architecture/pacts/session-contract-proof.pact.json"), "utf8"));
    expect(pact.provider.name).toBe("SessionControlPlane");
    expect(pact.interactions[0].response.body.schemaVersion).toBe("hobo.code.session-snapshot/v1");
  });
});
