/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-config-setup`.
 */
import { describe, expect, it } from "vitest";
import {
	DISCOVERY_PRIMARY,
	IMPLEMENTATION_STATUS,
	exerciseSurface,
	observeConfigHelp,
	observeConfigJson,
	observeFailure,
	onCriticalPath,
	setFeatureContext,
	setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-config-setup bindings", () => {
	it("exposes discovery metadata", () => {
		expect(IMPLEMENTATION_STATUS).toBeTruthy();
		expect(["wired", "stub"]).toContain(IMPLEMENTATION_STATUS.exerciseSurface);
		expect(DISCOVERY_PRIMARY.command).toMatch(/hobo-code\.ts config/);
	});

	it("sets persona and feature context", () => {
		const world = createWorld("hobo-code-config-setup");
		setPersona(world, "cost-conscious-open-source-dev");
		setFeatureContext(world, "hobo-code-config-setup");
		expect(world.personaId).toBe("cost-conscious-open-source-dev");
		expect(world.featureId).toBe("hobo-code-config-setup");
	});

	it("critical path finds feature metadata", () => {
		const world = createWorld("hobo-code-config-setup");
		setFeatureContext(world, "hobo-code-config-setup");
		onCriticalPath(world);
		expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
	});

	it("exerciseSurface runs config inventory", () => {
		const world = createWorld("hobo-code-config-setup");
		setFeatureContext(world, "hobo-code-config-setup");
		exerciseSurface(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
		expect(world.lastStdout).toMatch(/◈ config|setup ·|cost-budget/i);
	});

	it("config JSON schema and no secret leak", () => {
		const world = createWorld("hobo-code-config-setup");
		setFeatureContext(world, "hobo-code-config-setup");
		observeConfigJson(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
		expect(world.lastStdout).toMatch(/hobo\.code\.config/);
	});

	it("config help names stacks", () => {
		const world = createWorld("hobo-code-config-setup");
		observeConfigHelp(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});

	it("unknown stack is actionable", () => {
		const world = createWorld("hobo-code-config-setup");
		observeFailure(world);
		expect(world.lastExitCode).not.toBe(0);
		expect(world.errorActionable).toBe(true);
	});
});
