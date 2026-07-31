/**
 * Vitest bindings for OptimizeXP feature `hobo-code-agent-native`.
 */
import { describe, expect, it } from "vitest";
import {
	DISCOVERY_PRIMARY,
	IMPLEMENTATION_STATUS,
	exerciseSurface,
	observeAgentHelp,
	observeAgentJson,
	observeAuthAgent,
	observeFailure,
	onCriticalPath,
	setFeatureContext,
	setPersona,
} from "../steps/implementations.ts";
import { createWorld } from "../steps/world.ts";

describe("optimizexp feature hobo-code-agent-native bindings", () => {
	it("exposes discovery metadata", () => {
		expect(IMPLEMENTATION_STATUS.exerciseSurface).toBe("wired");
		expect(DISCOVERY_PRIMARY.command).toMatch(/hobo-code\.ts agent/);
	});

	it("sets persona and feature context", () => {
		const world = createWorld("hobo-code-agent-native");
		setPersona(world, "protocol-native-coding-agent");
		setFeatureContext(world, "hobo-code-agent-native");
		expect(world.personaId).toBe("protocol-native-coding-agent");
	});

	it("critical path finds feature metadata", () => {
		const world = createWorld("hobo-code-agent-native");
		setFeatureContext(world, "hobo-code-agent-native");
		onCriticalPath(world);
		expect(world.notes.some((n) => n.includes("critical path"))).toBe(true);
	});

	it("exerciseSurface runs agent inventory", () => {
		const world = createWorld("hobo-code-agent-native");
		setFeatureContext(world, "hobo-code-agent-native");
		exerciseSurface(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
		expect(world.lastStdout).toMatch(/◈ agent|human-free|mcp/i);
	});

	it("agent JSON schema", () => {
		const world = createWorld("hobo-code-agent-native");
		observeAgentJson(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
		expect(world.lastStdout).toMatch(/hobo\.code\.agent/);
	});

	it("auth login --agent human-free", () => {
		const world = createWorld("hobo-code-agent-native");
		observeAuthAgent(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});

	it("agent help names protocols", () => {
		const world = createWorld("hobo-code-agent-native");
		observeAgentHelp(world);
		expect(world.lastExitCode).toBe(0);
		expect(world.statusClear).toBe(true);
	});

	it("agent remote device-code refused", () => {
		const world = createWorld("hobo-code-agent-native");
		observeFailure(world);
		expect(world.lastExitCode).not.toBe(0);
		expect(world.errorActionable).toBe(true);
	});
});
