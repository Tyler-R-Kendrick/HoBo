/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-cost-zero`.
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

describe("optimizexp feature hobo-code-cost-zero bindings", () => {
	it("exposes discovery metadata", () => {
		expect(IMPLEMENTATION_STATUS).toBeTruthy();
		expect(["wired", "stub"]).toContain(IMPLEMENTATION_STATUS.exerciseSurface);
	});

	it("sets persona and feature context", () => {
		const world = createWorld("hobo-code-cost-zero");
		setPersona(world, "developer");
		setFeatureContext(world, "hobo-code-cost-zero");
		expect(world.personaId).toBe("developer");
		expect(world.featureId).toBe("hobo-code-cost-zero");
	});

	it("critical path finds feature metadata", () => {
		const world = createWorld("hobo-code-cost-zero");
		setFeatureContext(world, "hobo-code-cost-zero");
		onCriticalPath(world);
		expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
	});

	it("exerciseSurface is stub without discovered command", () => {
		const world = createWorld("hobo-code-cost-zero");
		setFeatureContext(world, "hobo-code-cost-zero");
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
