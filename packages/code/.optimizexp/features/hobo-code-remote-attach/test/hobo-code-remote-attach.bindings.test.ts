/**
 * Vitest binding smoke for hobo-code-remote-attach (may be excluded by package vitest).
 */
import { describe, expect, it } from "vitest";
import {
	DISCOVERY_PRIMARY,
	exerciseSurface,
	IMPLEMENTATION_STATUS,
	observeAttachJson,
	readAttachHelp,
	setFeatureContext,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-remote-attach bindings", () => {
	it("is wired to attach", () => {
		expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("wired");
		expect(DISCOVERY_PRIMARY.command).toMatch(/attach/);
	});

	it("attach human surface is clear", () => {
		const world = createWorld("hobo-code-remote-attach");
		setFeatureContext(world, "hobo-code-remote-attach");
		exerciseSurface(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});

	it("attach JSON compare and overlay", () => {
		const world = createWorld("hobo-code-remote-attach");
		setFeatureContext(world, "hobo-code-remote-attach");
		observeAttachJson(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});

	it("help names stack", () => {
		const world = createWorld("hobo-code-remote-attach");
		setFeatureContext(world, "hobo-code-remote-attach");
		readAttachHelp(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});
});
