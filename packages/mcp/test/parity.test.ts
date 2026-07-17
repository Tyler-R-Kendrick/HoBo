import { describe, expect, it } from "vitest";

import { CANONICAL_VERBS } from "@hobo/cli";

import {
	MCP_TOOL_SURFACE,
	assertToolSurfaceParity,
	capabilityForTool,
	deriveToolSurface,
	type ToolDescriptor,
} from "../src/tool-surface.js";

// NFR-004 — the MCP tool surface is DERIVED from CANONICAL_VERBS, not a
// divergent hand-list.

describe("MCP tool surface parity with CANONICAL_VERBS", () => {
	it("derives exactly one tool per canonical verb, in order", () => {
		expect(MCP_TOOL_SURFACE.map((tool) => tool.verb)).toEqual(
			CANONICAL_VERBS.map((verb) => verb.name),
		);
		expect(MCP_TOOL_SURFACE.map((tool) => tool.name)).toEqual(
			CANONICAL_VERBS.map((verb) => verb.name),
		);
	});

	it("scopes each tool to its own hobo:mcp capability", () => {
		for (const tool of MCP_TOOL_SURFACE) {
			expect(tool.capability).toEqual(capabilityForTool(tool.name));
			expect(tool.capability.port).toBe("hobo:mcp");
			expect(tool.capability.resource).toBe(`tool:${tool.name}`);
		}
	});

	it("reports parity ok for the derived surface", () => {
		const report = assertToolSurfaceParity();
		expect(report.ok).toBe(true);
		expect(report.missing).toEqual([]);
		expect(report.extra).toEqual([]);
	});

	it("fails parity for a divergent hand-list (a dropped tool)", () => {
		const truncated = MCP_TOOL_SURFACE.slice(0, -1);
		const report = assertToolSurfaceParity(truncated);
		expect(report.ok).toBe(false);
		expect(report.missing.length).toBeGreaterThan(0);
	});

	it("fails parity for a divergent hand-list (an invented tool)", () => {
		const invented: ToolDescriptor = {
			name: "deploy",
			verb: "deploy",
			role: "lifecycle",
			summary: "invented tool not in CANONICAL_VERBS",
			capability: capabilityForTool("deploy"),
			inputSchema: MCP_TOOL_SURFACE[0].inputSchema,
		};
		const report = assertToolSurfaceParity([...MCP_TOOL_SURFACE, invented]);
		expect(report.ok).toBe(false);
		expect(report.extra).toContain("deploy");
	});

	it("deriveToolSurface tracks a mutated verb list (proving derivation, not hardcoding)", () => {
		const surface = deriveToolSurface([
			{ name: "plan", role: "read-only", summary: "dry-run" },
		]);
		expect(surface).toHaveLength(1);
		expect(surface[0].name).toBe("plan");
	});
});
