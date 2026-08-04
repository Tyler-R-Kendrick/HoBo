/**
 * Vitest binding/smoke tests for OptimizeXP feature `design-system-contract`.
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

describe("optimizexp feature design-system-contract bindings", () => {
  it("exposes discovery metadata", () => {
    expect(IMPLEMENTATION_STATUS).toBeTruthy();
    expect(["wired", "stub"]).toContain(IMPLEMENTATION_STATUS.exerciseSurface);
  });

  it("sets persona and feature context", () => {
    const world = createWorld("design-system-contract");
    setPersona(world, "developer");
    setFeatureContext(world, "design-system-contract");
    expect(world.personaId).toBe("developer");
    expect(world.featureId).toBe("design-system-contract");
  });

  it("critical path finds feature metadata", () => {
    const world = createWorld("design-system-contract");
    setFeatureContext(world, "design-system-contract");
    onCriticalPath(world);
    expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
  });

  it("exerciseSurface runs discovered command (may non-zero)", () => {
    const world = createWorld("design-system-contract");
    setFeatureContext(world, "design-system-contract");
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
