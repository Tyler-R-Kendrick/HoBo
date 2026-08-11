import { bench, describe } from "vitest";
import { parseSessionCommand } from "@hobo/code";

const input = {
  schemaVersion: "hobo.code.session-command/v1",
  commandId: "bench-1",
  actorId: "bench",
  sessionId: "session-1",
  expectedRevision: "0",
  focusPane: { paneId: "pane-1" }
};

describe("session command parser", () => {
  bench("parse focus command", () => parseSessionCommand(input));
});
