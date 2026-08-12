/**
 * HoBo harness tools (ADR-0139) — model-callable actions exposed through
 * both the Flue harness agent and the Pi terminal agent. Each tool routes
 * through the normal hobo-code CLI pipeline so the agent never bypasses
 * platform composition, feature gates, or isolation checks.
 */
import { defineTool, type JsonValue } from "@flue/runtime";
import * as v from "valibot";
import { runHoboCodeCli } from "./cli.js";

async function runJson(argv: readonly string[]): Promise<JsonValue> {
	const result = await runHoboCodeCli(argv, { json: true });
	return {
		ok: result.ok,
		code: result.code,
		message: result.message,
		...(result.data !== undefined ? { data: result.data } : {}),
	} as JsonValue;
}

/** Inspect station / compute status (read-only). */
export const hoboHiveStatusTool = defineTool({
	name: "hobo_compute_status",
	description:
		"Inspect hobo-code status: station presence, agent panes, and multi-node compute readiness. Read-only.",
	run: async () => runJson(["status"]),
});

/** Dispatch a coding task onto multi-node compute. */
export const hoboDispatchTool = defineTool({
	name: "hobo_dispatch",
	description:
		"Dispatch a coding task prompt through hobo-code multi-node compute (station-scoped, isolation-checked). Returns the dispatch receipt.",
	input: v.object({
		prompt: v.string(),
	}),
	run: async ({ input }) => runJson(input.prompt.trim().split(/\s+/)),
});

/** Materialize a shipped repo example (hello-world, barebones, …). */
export const hoboScaffoldTool = defineTool({
	name: "hobo_scaffold",
	description:
		"Copy a shipped HoBo example from the repo catalog into the workspace. Prefer hello-world for greeting apps; unknown new-app requests use barebones. Does not call the hobo CLI or the network.",
	input: v.object({
		name: v.string(),
	}),
	run: async ({ input }) => runJson(["scaffold", input.name]),
});

/** Run the current Bindle on the local Yard and return live endpoints. */
export const hoboDevTool = defineTool({
	name: "hobo_dev",
	description:
		"Run the workspace Bindle on the local Yard with Evidence overlay. Returns the real bindle, debug, controls, and report URLs for this environment. Use when the user says run it or debug it.",
	input: v.object({
		cwd: v.optional(v.string()),
	}),
	run: async ({ input }) =>
		runJson(
			input.cwd
				? ["dev", "--cwd", input.cwd, "--port", "0", "--debug-port", "0"]
				: ["dev", "--port", "0", "--debug-port", "0"],
		),
});

export const HOBO_AGENT_TOOLS = [
	hoboHiveStatusTool,
	hoboDispatchTool,
	hoboScaffoldTool,
	hoboDevTool,
];
