/**
 * Flue harness agent for hobo-code (ADR-0139).
 *
 * Programmatic/durable surface: `flue run hobo-code --input '{"message":"…"}'`.
 * The interactive terminal surface (pi TUI) shares the same instructions and
 * tools via `src/harness-customization.ts` / `src/harness-tools.ts`.
 */
import { defineAgent } from "@flue/runtime";
import { local } from "@flue/runtime/node";
import {
	HOBO_AGENT_INSTRUCTIONS,
	HOBO_AGENT_MODEL,
} from "../src/harness-customization.js";
import { HOBO_AGENT_TOOLS } from "../src/harness-tools.js";

export default defineAgent(() => ({
	model: HOBO_AGENT_MODEL,
	instructions: HOBO_AGENT_INSTRUCTIONS,
	tools: HOBO_AGENT_TOOLS,
	sandbox: local(),
}));
