/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-herdr-mux`.
 */
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_PRIMARY,
  IMPLEMENTATION_STATUS,
  exerciseSurface,
  observeHerdrJson,
  onCriticalPath,
  readHerdrHelp,
  setFeatureContext,
  setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-herdr-mux bindings", () => {
  it("exposes discovery metadata", () => {
    expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("wired");
    expect(DISCOVERY_PRIMARY.command).toMatch(/status/);
  });

  it("sets persona and feature context", () => {
    const world = createWorld("hobo-code-herdr-mux");
    setPersona(world, "senior-engineer-advanced-herdr-user");
    setFeatureContext(world, "hobo-code-herdr-mux");
    expect(world.personaId).toBe("senior-engineer-advanced-herdr-user");
    expect(world.featureId).toBe("hobo-code-herdr-mux");
  });

  it("critical path finds feature metadata", () => {
    const world = createWorld("hobo-code-herdr-mux");
    setFeatureContext(world, "hobo-code-herdr-mux");
    onCriticalPath(world);
    expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
  });

  it("status surface shows herdr footer and pane fold", () => {
    const world = createWorld("hobo-code-herdr-mux");
    setFeatureContext(world, "hobo-code-herdr-mux");
    exerciseSurface(world);
    expect(world.lastExitCode).toBe(0);
    expect(world.lastStdout).toMatch(/herdr · panes · detach · highlight→copy/);
    expect(world.statusClear).toBe(true);
  });

  it("JSON exposes herdr capabilities and persistence", () => {
    const world = createWorld("hobo-code-herdr-mux");
    setFeatureContext(world, "hobo-code-herdr-mux");
    observeHerdrJson(world);
    expect(world.lastExitCode).toBe(0);
    expect(world.statusClear).toBe(true);
  });

  it("help names herdr differentiators", () => {
    const world = createWorld("hobo-code-herdr-mux");
    setFeatureContext(world, "hobo-code-herdr-mux");
    readHerdrHelp(world);
    expect(world.lastExitCode).toBe(0);
    expect(world.statusClear).toBe(true);
  });
});
