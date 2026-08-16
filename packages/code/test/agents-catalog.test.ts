import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { HarnessSpec } from "../src/agent-harness-adapters.js";
import {
	buildAgentsCatalog,
	createProjectEveAgent,
	discoverProjectEveAgents,
	flattenVisible,
	reduceAgentsCatalogKey,
	type AgentsCatalogState,
} from "../src/agents-catalog.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agents-cat-"));
	dirs.push(dir);
	return dir;
}

const specs: readonly HarnessSpec[] = [
	{
		id: "codex",
		label: "Codex",
		kind: "coding-agent",
		seat: 10,
	},
	{
		id: "hobo-code",
		label: "Hobo Bo",
		kind: "harness",
		host: true,
	},
	{
		id: "pi",
		label: "Pi",
		kind: "coding-agent",
		seat: 20,
	},
	{
		id: "eve",
		label: "Eve agent tree",
		kind: "eve-agent",
	},
];

describe("agents catalog", () => {
	it("lists Hobo Bo first among harness roots", () => {
		const catalog = buildAgentsCatalog(specs, []);
		expect(catalog.roots[0]?.id).toBe("harness:hobo-code");
		expect(catalog.roots[0]?.label).toBe("Hobo Bo");
		expect(catalog.roots.map((row) => row.id)).toEqual([
			"harness:hobo-code",
			"harness:codex",
			"harness:pi",
		]);
	});

	it("excludes inference and eve-agent top-level rows", () => {
		const withExtras: HarnessSpec[] = [
			...specs,
			{
				id: "ollama",
				label: "local inference",
				kind: "inference",
			},
		];
		const catalog = buildAgentsCatalog(withExtras, []);
		expect(catalog.roots.map((row) => row.harnessId)).not.toContain("ollama");
		expect(catalog.roots.map((row) => row.harnessId)).not.toContain("eve");
		expect(catalog.roots[0]?.label).toBe("Hobo Bo");
	});

	it("discovers Eve vfs agents under .hobo/agents as children of Hobo Bo", () => {
		const cwd = tmp();
		const agentDir = join(cwd, ".hobo", "agents", "investigator");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "instructions.md"), "# Investigator\n", "utf8");
		mkdirSync(join(agentDir, "subagents", "scout"), { recursive: true });
		writeFileSync(
			join(agentDir, "subagents", "scout", "instructions.md"),
			"# Scout\n",
			"utf8",
		);

		const trees = discoverProjectEveAgents(cwd);
		expect(trees.map((row) => row.id)).toEqual(["investigator"]);
		expect(trees[0]?.children.map((row) => row.id)).toEqual(["scout"]);

		const catalog = buildAgentsCatalog(specs, trees);
		const hobo = catalog.roots[0]!;
		expect(hobo.children.some((child) => child.id.includes("investigator"))).toBe(
			true,
		);
	});

	it("prefers .hobo/agents over legacy agent/ for the same id", () => {
		const cwd = tmp();
		mkdirSync(join(cwd, ".hobo", "agents", "worker"), { recursive: true });
		writeFileSync(
			join(cwd, ".hobo", "agents", "worker", "agent.ts"),
			"export default {}",
			"utf8",
		);
		mkdirSync(join(cwd, "agent", "subagents", "worker"), { recursive: true });
		writeFileSync(
			join(cwd, "agent", "instructions.md"),
			"# legacy\n",
			"utf8",
		);
		writeFileSync(
			join(cwd, "agent", "subagents", "worker", "instructions.md"),
			"# legacy worker\n",
			"utf8",
		);

		const trees = discoverProjectEveAgents(cwd);
		const worker = trees.find((row) => row.id === "worker");
		expect(worker?.path).toContain(".hobo/agents/worker");
	});

	it("expand/collapse and cursor move over visible rows", () => {
		const trees = [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents" as const,
				children: [
					{
						id: "scout",
						path: "/tmp/.hobo/agents/investigator/subagents/scout",
						source: "hobo-agents" as const,
						parentId: "investigator",
						children: [],
					},
				],
			},
		];
		let state = buildAgentsCatalog(specs, trees);
		expect(flattenVisible(state).map((row) => row.id)).toEqual([
			"harness:hobo-code",
			"harness:codex",
			"harness:pi",
		]);

		state = reduceAgentsCatalogKey(state, " ", 8).state;
		expect(state.expanded.has("harness:hobo-code")).toBe(true);
		expect(flattenVisible(state).some((row) => row.id.includes("investigator"))).toBe(
			true,
		);
		// Expand lands on first child — no extra ↓ required.
		expect(flattenVisible(state)[state.cursor]?.id).toMatch(/investigator/);

		state = reduceAgentsCatalogKey(state, "\x1b[C", 8).state;
		expect(state.expanded.has(flattenVisible(state)[state.cursor]!.id) || flattenVisible(state)[state.cursor]?.id.includes("scout")).toBe(true);
		expect(flattenVisible(state).some((row) => row.id.includes("scout"))).toBe(true);
		// Landed on scout after expanding investigator.
		expect(flattenVisible(state)[state.cursor]?.id).toMatch(/scout/);

		// ← on child collapses parent / moves up — from scout, ← goes to investigator
		state = reduceAgentsCatalogKey(state, "\x1b[D", 8).state;
		expect(flattenVisible(state)[state.cursor]?.id).toMatch(/investigator/);
		state = reduceAgentsCatalogKey(state, "\x1b[D", 8).state;
		expect(state.expanded.has("harness:hobo-code") || flattenVisible(state)[state.cursor]?.id).toBeTruthy();
	});

	it("scrolls when the visible tree overflows the viewport", () => {
		const many: HarnessSpec[] = [
			{ id: "hobo-code", label: "Hobo Bo", kind: "harness", host: true },
			...Array.from({ length: 12 }, (_, i) => ({
				id: `bot-${i}`,
				label: `Bot ${i}`,
				kind: "coding-agent" as const,
				seat: i,
			})),
		];
		let state: AgentsCatalogState = buildAgentsCatalog(many, []);
		for (let i = 0; i < 10; i += 1) {
			state = reduceAgentsCatalogKey(state, "\x1b[B", 4).state;
		}
		expect(state.cursor).toBeGreaterThanOrEqual(4);
		expect(state.scroll).toBeGreaterThan(0);
		const visible = flattenVisible(state).slice(
			state.scroll,
			state.scroll + 4,
		);
		expect(visible).toHaveLength(4);
	});

	it("↓ at last row does not select past end", () => {
		let state = buildAgentsCatalog(specs, []);
		const last = flattenVisible(state).length - 1;
		for (let i = 0; i < last + 5; i += 1) {
			state = reduceAgentsCatalogKey(state, "\x1b[B", 8).state;
		}
		expect(state.cursor).toBe(last);
		expect(state.cursor).toBeLessThan(flattenVisible(state).length);
	});

	it("↑ at first row does not select negative index", () => {
		let state = buildAgentsCatalog(specs, []);
		for (let i = 0; i < 5; i += 1) {
			state = reduceAgentsCatalogKey(state, "\x1b[A", 8).state;
		}
		expect(state.cursor).toBe(0);
	});

	it("createProjectEveAgent writes instructions.md and rediscovers", () => {
		const cwd = tmp();
		const created = createProjectEveAgent(cwd, "builder");
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(created.error);
		expect(created.agent.id).toBe("builder");
		expect(created.agent.path).toContain(".hobo/agents/builder");
		const trees = discoverProjectEveAgents(cwd);
		expect(trees.map((row) => row.id)).toEqual(["builder"]);
	});

	it("Enter on Hobo Bo picks configure-hobo-bo; coding harness picks configure", () => {
		const catalog = buildAgentsCatalog(specs, []);
		const host = reduceAgentsCatalogKey(catalog, "\r", 8);
		expect(host.pick?.kind).toBe("configure-hobo-bo");

		let onCodex = catalog;
		onCodex = reduceAgentsCatalogKey(onCodex, "\x1b[B", 8).state;
		const seat = reduceAgentsCatalogKey(onCodex, "\r", 8);
		expect(seat.pick?.kind).toBe("configure-harness");
		expect(seat.pick && "harnessId" in seat.pick ? seat.pick.harnessId : "").toBe(
			"codex",
		);
	});

	it("Enter on Eve vfs agent picks configure-eve", () => {
		const trees = [
			{
				id: "investigator",
				path: "/proj/.hobo/agents/investigator",
				source: "hobo-agents" as const,
				description: "Read-only investigation",
				children: [],
			},
		];
		let state = buildAgentsCatalog(specs, trees);
		state = {
			...state,
			expanded: new Set(["harness:hobo-code"]),
		};
		state = reduceAgentsCatalogKey(state, "\x1b[B", 8).state;
		const result = reduceAgentsCatalogKey(state, "\r", 8);
		expect(result.pick?.kind).toBe("configure-eve");
		expect(result.pick && "path" in result.pick ? result.pick.path : "").toContain(
			"investigator",
		);
	});

	it("Esc closes the catalog", () => {
		const catalog = buildAgentsCatalog(specs, []);
		expect(reduceAgentsCatalogKey(catalog, "\x1b", 8).close).toBe(true);
	});
});
