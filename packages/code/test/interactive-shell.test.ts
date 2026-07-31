import { describe, expect, it } from "vitest";
import {
	PRODUCT_NOT_PI,
	createInitialShellState,
	reduceShellKey,
	renderShellFrame,
	shellFrameIdentity,
	appendAssistant,
	DEFAULT_SLASH_ITEMS,
} from "../src/interactive-shell.js";

describe("hobo-code InteractiveShell (product chrome, not Pi)", () => {
	it("initial frame is HoBo shell identity — not stock Pi chrome", () => {
		const state = createInitialShellState({
			width: 80,
			height: 28,
			welcome: true,
			reducedMotion: true,
		});
		const frame = renderShellFrame(state);
		const id = shellFrameIdentity(frame);
		expect(id.isHoboShell).toBe(true);
		expect(id.claimsNotPi).toBe(true);
		expect(id.hasPrompt).toBe(true);
		expect(id.mentionsStockPiChrome).toBe(false);
		expect(frame).toContain(PRODUCT_NOT_PI);
		expect(frame).toContain("hobo-shell");
		expect(frame).toContain("❯");
		// Must not look like we handed the session to Pi product UI
		expect(frame.toLowerCase()).not.toMatch(/welcome to pi/);
		expect(frame).toMatch(/Bo is with you|press \/ for the palette/i);
	});

	it("slash palette lists product journeys", () => {
		let state = createInitialShellState({
			width: 80,
			height: 28,
			welcome: false,
			reducedMotion: true,
		});
		const open = reduceShellKey(state, "/");
		state = open.state;
		expect(state.slashOpen).toBe(true);
		const frame = renderShellFrame(state);
		expect(frame).toMatch(/Slash palette/);
		expect(frame).toMatch(/\/guide/);
		expect(frame).toMatch(/\/config/);
		expect(frame).toMatch(/\/cost/);
		expect(frame).toMatch(/\/tasks/);
		expect(DEFAULT_SLASH_ITEMS.some((i) => i.name === "guide")).toBe(true);
	});

	it("Tab cycles chat → tasks → status focus", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		expect(state.focus).toBe("chat");
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("tasks");
		const tasksFrame = renderShellFrame(state);
		expect(tasksFrame).toMatch(/Tasks/);
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("status");
		const statusFrame = renderShellFrame(state);
		expect(statusFrame).toMatch(/session status|Agents:/i);
	});

	it("Enter on a prompt appends user message and marks working", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		for (const ch of "add a button") {
			state = reduceShellKey(state, ch).state;
		}
		const sub = reduceShellKey(state, "\r");
		expect(sub.submit).toBe("add a button");
		expect(sub.state.agentState).toBe("working");
		expect(sub.state.messages.some((m) => m.role === "user")).toBe(true);
		const after = appendAssistant(sub.state, "Bo did the thing", "idle");
		const frame = renderShellFrame(after);
		expect(frame).toMatch(/Bo  ·/);
		expect(shellFrameIdentity(frame).isHoboShell).toBe(true);
	});

	it("Ctrl+C requests quit", () => {
		const state = createInitialShellState({ welcome: false });
		const r = reduceShellKey(state, "\u0003");
		expect(r.quit).toBe(true);
	});
});
