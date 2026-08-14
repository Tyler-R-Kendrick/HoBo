import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	buildAgentPicks,
	createChecklist,
	eraseAgentChecklist,
	reduceChecklistKey,
	renderAgentChecklist,
	repaintAgentChecklist,
	selectedPickIds,
	shouldWriteAgentsInit,
} from "../src/agent-harness-picks.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-picks-"));
	dirs.push(dir);
	return dir;
}

describe("shouldWriteAgentsInit", () => {
	it("writes for --yes, --non-interactive, CI, and non-TTY", () => {
		expect(
			shouldWriteAgentsInit({ flags: { yes: true }, tty: true }),
		).toBe(true);
		expect(
			shouldWriteAgentsInit({
				flags: { "non-interactive": true },
				tty: true,
			}),
		).toBe(true);
		expect(
			shouldWriteAgentsInit({
				flags: {},
				tty: true,
				env: { CI: "true" },
			}),
		).toBe(true);
		expect(shouldWriteAgentsInit({ flags: {}, tty: false })).toBe(true);
	});

	it("does not write on a TTY without a write flag", () => {
		expect(shouldWriteAgentsInit({ flags: {}, tty: true })).toBe(false);
	});

	it("never writes on --dry-run", () => {
		expect(
			shouldWriteAgentsInit({
				flags: { yes: true },
				tty: false,
				dryRun: true,
			}),
		).toBe(false);
	});
});

describe("agent checklist", () => {
	it("toggles the focused pick and writes selected ids on enter", () => {
		let state = createChecklist([
			{
				id: "codex",
				kind: "coding-cli",
				label: "Codex",
				detected: true,
				selected: true,
				note: "bin",
			},
			{
				id: "claude",
				kind: "coding-cli",
				label: "Claude Code",
				detected: true,
				selected: true,
				note: "bin",
			},
		]);
		state = reduceChecklistKey(state, " ");
		expect(state.picks[0]?.selected).toBe(false);
		state = reduceChecklistKey(state, "j");
		state = reduceChecklistKey(state, " ");
		expect(state.picks[1]?.selected).toBe(false);
		state = reduceChecklistKey(state, "\r");
		expect(state.done).toBe("write");
		expect(selectedPickIds(state)).toEqual([]);
	});

	it("aborts on q", () => {
		const state = reduceChecklistKey(
			createChecklist([
				{
					id: "codex",
					kind: "coding-cli",
					label: "Codex",
					detected: true,
					selected: true,
					note: "",
				},
			]),
			"q",
		);
		expect(state.done).toBe("abort");
	});

	it("renders a checkable list", () => {
		const frame = renderAgentChecklist(
			createChecklist([
				{
					id: "codex",
					kind: "coding-cli",
					label: "Codex",
					detected: true,
					selected: true,
					note: "bin",
				},
			]),
		);
		expect(frame).toMatch(/\[x\]/);
		expect(frame).toMatch(/codex/);
		expect(frame).toMatch(/space toggle/);
	});

	it("repaints by rewinding the previous frame instead of appending", () => {
		const first = renderAgentChecklist(
			createChecklist([
				{
					id: "codex",
					kind: "coding-cli",
					label: "Codex",
					detected: true,
					selected: true,
					note: "bin",
				},
			]),
		);
		const opened = repaintAgentChecklist(0, first);
		expect(opened.write).not.toMatch(/\x1b\[\d+F/);
		expect(opened.lines).toBeGreaterThan(1);
		const toggled = reduceChecklistKey(createChecklist([
			{
				id: "codex",
				kind: "coding-cli",
				label: "Codex",
				detected: true,
				selected: true,
				note: "bin",
			},
		]), " ");
		const second = repaintAgentChecklist(
			opened.lines,
			renderAgentChecklist(toggled),
		);
		expect(second.write.startsWith(`\x1b[${opened.lines}F\x1b[J`)).toBe(true);
		expect(second.write).toMatch(/\[ \]/);
		expect(eraseAgentChecklist(opened.lines)).toBe(
			`\x1b[${opened.lines}F\x1b[J\x1b[?25h`,
		);
	});
});

describe("buildAgentPicks", () => {
	it("includes Eve/SDK slots and never lists hobo-code as ACP", () => {
		const cwd = tmp();
		mkdirSync(join(cwd, "agent"), { recursive: true });
		writeFileSync(join(cwd, "agent", "instructions.md"), "hi\n");
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({ dependencies: { ai: "5.0.0" } }),
			"utf8",
		);
		const home = tmp();
		mkdirSync(join(home, ".codex"), { recursive: true });
		const picks = buildAgentPicks({
			home,
			cwd,
			env: { HOME: home, PATH: "/empty" },
			eveTrees: [{ id: "agent" }],
		});
		expect(picks.map((pick) => pick.id)).toEqual(
			expect.arrayContaining(["codex", "eve", "sdk"]),
		);
		expect(picks.some((pick) => pick.id === "acp")).toBe(false);
		expect(picks.some((pick) => pick.id === "hobo-code")).toBe(false);
		expect(picks.find((pick) => pick.id === "sdk")?.selected).toBe(true);
	});

	it("ignores an explicit acp / hobo-code request", () => {
		const home = tmp();
		const picks = buildAgentPicks({
			home,
			cwd: home,
			env: { HOME: home, PATH: "/empty" },
			all: true,
			ids: ["acp", "hobo-code", "codex"],
		});
		expect(picks.map((pick) => pick.id)).not.toContain("acp");
		expect(picks.map((pick) => pick.id)).not.toContain("hobo-code");
	});
});
