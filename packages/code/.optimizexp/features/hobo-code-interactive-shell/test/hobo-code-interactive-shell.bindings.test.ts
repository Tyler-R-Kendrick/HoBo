/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-interactive-shell`.
 * Does not require Cucumber CLI; imports implementations directly.
 */
import { describe, expect, it } from "vitest";
import {
	DISCOVERY_PRIMARY,
	exerciseSurface,
	IMPLEMENTATION_STATUS,
	onCriticalPath,
	setFeatureContext,
	setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-interactive-shell bindings", () => {
	it("exposes discovery metadata", () => {
		expect(IMPLEMENTATION_STATUS).toBeTruthy();
		expect(["wired", "stub"]).toContain(IMPLEMENTATION_STATUS.exerciseSurface);
	});

	it("sets persona and feature context", () => {
		const world = createWorld("hobo-code-interactive-shell");
		setPersona(world, "developer");
		setFeatureContext(world, "hobo-code-interactive-shell");
		expect(world.personaId).toBe("developer");
		expect(world.featureId).toBe("hobo-code-interactive-shell");
	});

	it("critical path finds feature metadata", () => {
		const world = createWorld("hobo-code-interactive-shell");
		setFeatureContext(world, "hobo-code-interactive-shell");
		onCriticalPath(world);
		expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
	});

	it("exerciseSurface runs discovered command (may non-zero)", () => {
		const world = createWorld("hobo-code-interactive-shell");
		setFeatureContext(world, "hobo-code-interactive-shell");
		exerciseSurface(world);
		if (DISCOVERY_PRIMARY.command) {
			expect(world.lastCommand).toBe(DISCOVERY_PRIMARY.command);
			expect(
				world.lastExitCode === null ||
					Object.prototype.toString.call(world.lastExitCode) ===
						"[object Number]",
			).toBe(true);
		} else {
			expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("stub");
			expect(world.notes.some((n) => n.includes("STUB"))).toBe(true);
		}
	});
});
