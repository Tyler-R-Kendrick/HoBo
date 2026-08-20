/**
 * Vitest binding/smoke tests for OptimizeXP feature `hobo-code-hermetic-durable`.
 */
import { describe, expect, it } from "vitest";
import {
	assertClearStatus,
	assertErrorActionable,
	DISCOVERY_PRIMARY,
	exerciseSurface,
	IMPLEMENTATION_STATUS,
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

	it("observeFailure checks isolate durable purity", async () => {
		const world = createWorld("hobo-code-hermetic-durable");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		await observeFailure(world);
		expect(world.lastExitCode).toBe(0);
		assertErrorActionable(world);
	});

	it("puts the durable root outside the sandbox", async () => {
		// The property the step exists to check, asserted directly rather than
		// only through an exit code: an isolated run's durable output must not
		// live inside the disposable worktree, or cleaning up the sandbox would
		// delete the handback along with it.
		const world = createWorld("hobo-code-hermetic-durable");
		setFeatureContext(world, "hobo-code-hermetic-durable");
		await observeFailure(world);
		const observed = JSON.parse(world.lastStdout ?? "{}") as {
			rootPath?: string;
			durableRoot?: string;
			pureSeparation?: boolean;
		};
		expect(observed.pureSeparation).toBe(true);
		expect(observed.rootPath).toContain("sandboxes");
		expect(observed.durableRoot).toContain("durable");
		expect(observed.rootPath).not.toBe(observed.durableRoot);
	});
});
