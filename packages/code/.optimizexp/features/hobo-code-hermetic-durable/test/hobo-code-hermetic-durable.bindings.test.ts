/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-hermetic-durable`.
 */
import { describe, expect, it } from "vitest";
import {
	DISCOVERY_PRIMARY,
	IMPLEMENTATION_STATUS,
	assertClearStatus,
	assertErrorActionable,
	exerciseSurface,
	observeFailure,
	onCriticalPath,
	setFeatureContext,
	setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-hermetic-durable bindings", () => {
	it("exposes discovery metadata", () => {
		expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("wired");
		expect(DISCOVERY_PRIMARY.command).toMatch(/hobo-code/);
	});

	it("sets persona and feature context", () => {
		const world = createWorld("hobo-code-hermetic-durable");
		setPersona(world, "advanced-nix-devenv-developer");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		expect(world.personaId).toBe("advanced-nix-devenv-developer");
		expect(world.featureId).toBe("hobo-code-hermetic-durable");
	});

	it("critical path finds feature metadata", () => {
		const world = createWorld("hobo-code-hermetic-durable");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		onCriticalPath(world);
		expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
		expect(world.statusClear).toBe(true);
	});

	it("exerciseSurface runs env with devenv.nix", () => {
		const world = createWorld("hobo-code-hermetic-durable");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		exerciseSurface(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
		assertClearStatus(world);
	});

	it("observeFailure checks isolate durable purity", () => {
		const world = createWorld("hobo-code-hermetic-durable");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		observeFailure(world);
		expect(world.lastExitCode).toBe(0);
		assertErrorActionable(world);
	});
});
