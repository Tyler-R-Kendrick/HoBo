import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRequiredSessionCommands, REQUIRED_SESSION_COMMANDS } from "../src/session-command-suite.js";

describe("resident session orchestration command suite", () => {
  it("routes every required operation through the canonical parser", () => {
    expect(parseRequiredSessionCommands()).toEqual(REQUIRED_SESSION_COMMANDS);
  });

  it("pins detach as a nonterminal provider interaction", () => {
    const pact = JSON.parse(readFileSync(join(import.meta.dirname, "../contracts/pacts/session-orchestration-proof.pact.json"), "utf8"));
    expect(pact.provider.name).toBe("SessionControlPlane");
    expect(pact.interactions[0].response.body.session.lifecycleState).toBe("SESSION_LIFECYCLE_STATE_RUNNING");
  });
});
