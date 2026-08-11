import { strict as assert } from "node:assert";
import { parseSessionCommand } from "@hobo/code";

const command = parseSessionCommand({
  schemaVersion: "hobo.code.session-command/v1",
  commandId: "demo-1",
  actorId: "cli",
  sessionId: "review-auth",
  expectedRevision: "0",
  createSession: {
    name: "review-auth",
    projectRoot: "/repo",
    branch: "code/review-auth",
    clientId: "cli"
  }
});

assert.equal(command.command.case, "createSession");
console.log(`session-command: ${command.command.case}`);
