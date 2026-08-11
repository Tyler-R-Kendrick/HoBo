import { afterEach, describe, expect, it } from "vitest";

import {
	assertActionableMissingSession,
	assertBaseSessionHelp,
	assertCurrentSessionHelp,
	assertDetachHelp,
	cleanup,
	runBaseSessionHelp,
	runCurrentCli,
} from "../steps/implementations.ts";
import { createWorld, type OptimizexpWorld } from "../steps/world.ts";

let world: OptimizexpWorld;

afterEach(async () => {
	await cleanup(world);
});

describe("hobo-code Herdr mux acceptance bindings", () => {
	it("executes current resident-session help", () => {
		world = createWorld();
		runCurrentCli(world, ["session", "--help"]);
		assertCurrentSessionHelp(world);
		assertDetachHelp(world);
		expect(world.command?.status).toBe(0);
	});

	it("executes the reviewed base help", () => {
		world = createWorld();
		runBaseSessionHelp(world);
		assertBaseSessionHelp(world);
		expect(world.command?.stdout).toContain("durable handback");
	});

	it("executes the actionable missing-session path", () => {
		world = createWorld();
		runCurrentCli(world, ["session", "show", "missing-session"]);
		assertActionableMissingSession(world);
		expect(world.command?.status).toBe(1);
	});
});
