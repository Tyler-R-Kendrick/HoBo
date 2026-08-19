import { describe, expect, it } from "vitest";
import { stripSgr as plain } from "../src/ansi.js";
import {
	applyHarnessDetach,
	executeHarnessChromeAction,
	harnessActionFromSlash,
	nextAgentTabName,
	parseHarnessChromeKey,
} from "../src/harness-session-actions.js";
import { harnessViewFromLivePanes } from "../src/harness-session-view.js";
import type { InSessionPanes } from "../src/in-session-panes.js";
import {
	createInitialShellState,
	reduceShellKey,
	renderShellFrame,
	slashItemForInput,
} from "../src/interactive-shell.js";
import type { MuxRunner } from "../src/mux.js";
import { AGENTS_KEY_LEGEND } from "../src/tui-components.js";

function fakeMux(options: {
	readonly windows?: string;
}): MuxRunner & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		async run(args) {
			calls.push([...args]);
			const head = args[0] ?? "";
			if (head === "list-windows") {
				return {
					code: 0,
					stdout: options.windows ?? "codex\t%1\npi\t%2\n",
					stderr: "",
				};
			}
			if (head === "capture-pane") {
				return { code: 0, stdout: "capture body\n", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		},
	};
}

const muxPanes: InSessionPanes = {
	session: "hobo",
	windows: [
		{ name: "codex", target: "%1", kind: "coding-agent" },
		{ name: "pi", target: "%2", kind: "coding-agent" },
	],
	focused: 0,
	capture: "hello",
	note: "in-session",
	tmux: true,
};

describe("harness-session-actions", () => {
	it("never binds bare letters — composer stays free", () => {
		expect(parseHarnessChromeKey("d")).toBeUndefined();
		expect(parseHarnessChromeKey("t")).toBeUndefined();
		expect(parseHarnessChromeKey("S")).toBeUndefined();
		expect(harnessActionFromSlash("session-tab")?.kind).toBe("createTab");
		expect(harnessActionFromSlash("session-detach")?.kind).toBe("detach");
		expect(slashItemForInput("/mux tab")?.action).toBe("session-tab");
		expect(slashItemForInput("/mux detach")?.action).toBe("session-detach");
		expect(slashItemForInput("/mux pane")?.action).toBe("session-pane");
		expect(slashItemForInput("/mux attach")?.action).toBe("pane-attach");
		expect(slashItemForInput("/mux")?.action).toBe("mux");
		expect(slashItemForInput("/tab")).toBeUndefined();
	});

	it("names new tabs after the agent (codex → codex-2)", () => {
		expect(nextAgentTabName([{ name: "codex" }, { name: "pi" }], "codex")).toBe(
			"codex-2",
		);
		expect(
			nextAgentTabName(
				[{ name: "codex" }, { name: "codex-2" }, { name: "pi" }],
				"codex",
			),
		).toBe("codex-3");
	});

	it("detach returns to chat without killing the session", () => {
		const view = harnessViewFromLivePanes(muxPanes);
		const result = applyHarnessDetach(view, muxPanes);
		expect(result.focus).toBe("chat");
		expect(result.note).toMatch(/detached/i);
	});

	it("mux createTab keeps the agent name in the window title", async () => {
		const runner = fakeMux({
			windows: "codex\t%1\npi\t%2\ncodex-2\t%3\n",
		});
		const view = harnessViewFromLivePanes(muxPanes);
		const result = await executeHarnessChromeAction(
			{
				hoboHome: "/tmp/hobo-test-home",
				harnessView: view,
				livePanes: muxPanes,
				runner,
			},
			{ kind: "createTab" },
		);
		const newWindow = runner.calls.find((row) => row[0] === "new-window");
		expect(newWindow?.includes("codex-2")).toBe(true);
		expect(result.note).toMatch(/codex-2/);
		expect(
			result.livePanes?.windows.some((row) => row.name === "codex-2"),
		).toBe(true);
	});

	it("chat focus never steals [ ] or letter keys for harness ops", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "chat",
			agentWork: true,
			input: "",
			livePanes: muxPanes,
		};
		const bracket = reduceShellKey(state, "]");
		expect(bracket.state.focus).toBe("chat");
		expect(bracket.state.livePanes?.focused).toBe(0);
		const letter = reduceShellKey(state, "t");
		expect(letter.sessionAction).toBeUndefined();
		expect(letter.state.input).toBe("t");
	});

	it("/mux tab from Agents emits sessionAction; bare t types into composer", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			input: "",
			livePanes: muxPanes,
		};
		expect(reduceShellKey(state, "t").state.input).toBe("t");
		expect(reduceShellKey(state, "t").sessionAction).toBeUndefined();
		const slash = reduceShellKey(
			{ ...state, input: "/mux tab", slashOpen: false },
			"\r",
		);
		expect(slash.sessionAction?.kind).toBe("createTab");
	});

	it("Agents pins legend line and keeps body chrome key-free", () => {
		let state = createInitialShellState({
			width: 80,
			height: 28,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			livePanes: muxPanes,
		};
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("Detach · Stop session · New tab");
		expect(frame).toContain("New pane");
		expect(frame).toContain("Focus · Prompt");
		expect(frame).not.toMatch(/\bd Detach\b/);
		expect(frame).toContain(AGENTS_KEY_LEGEND);
	});

	it("[ ] and { } are redundant on single-pane agent tabs", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			input: "",
			livePanes: muxPanes,
		};
		state = reduceShellKey(state, "]").state;
		expect(state.livePanes?.focused).toBe(1);
		state = reduceShellKey(state, "{").state;
		expect(state.livePanes?.focused).toBe(0);
	});
});
