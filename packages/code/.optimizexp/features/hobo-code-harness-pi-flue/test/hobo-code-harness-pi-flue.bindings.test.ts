/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-harness-pi-flue`.
 * Does not require Cucumber CLI; imports implementations directly.
 */
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_PRIMARY,
  IMPLEMENTATION_STATUS,
  exerciseSurface,
  onCriticalPath,
  setFeatureContext,
  setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-harness-pi-flue bindings", () => {
  it("exposes discovery metadata", () => {
    expect(IMPLEMENTATION_STATUS).toBeTruthy();
    expect(["wired", "stub"]).toContain(IMPLEMENTATION_STATUS.exerciseSurface);
  });

  it("sets persona and feature context", () => {
    const world = createWorld("hobo-code-harness-pi-flue");
    setPersona(world, "developer");
    setFeatureContext(world, "hobo-code-harness-pi-flue");
    expect(world.personaId).toBe("developer");
    expect(world.featureId).toBe("hobo-code-harness-pi-flue");
  });

  it("critical path finds feature metadata", () => {
    const world = createWorld("hobo-code-harness-pi-flue");
    setFeatureContext(world, "hobo-code-harness-pi-flue");
    onCriticalPath(world);
    expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
  });

  it("exerciseSurface runs discovered command (may non-zero)", () => {
    const world = createWorld("hobo-code-harness-pi-flue");
    setFeatureContext(world, "hobo-code-harness-pi-flue");
    exerciseSurface(world);
    if (DISCOVERY_PRIMARY.command) {
      expect(world.lastCommand).toBe(DISCOVERY_PRIMARY.command);
      expect(world.lastExitCode === null || typeof world.lastExitCode === "number").toBe(
        true,
      );
    } else {
      expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("stub");
      expect(world.notes.some((n) => n.includes("STUB"))).toBe(true);
    }
  });
});
