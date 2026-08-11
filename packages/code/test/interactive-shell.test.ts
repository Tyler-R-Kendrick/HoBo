import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";

/** Visible text only — accents must never change what a test sees. */
const plain = (frame: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR is the point
	frame.replace(/\u001b\[[0-9;]*m/g, "");
/** Visible width of each rendered line. */
const widths = (frame: string): number[] =>
	plain(frame)
		.split("\n")
		.map((l) => l.length);

import {
	APPROVAL_PROMPT,
	appendAssistant,
	createInitialShellState,
	DEFAULT_SLASH_ITEMS,
	filterSlash,
	PRODUCT_NOT_PI,
	reduceShellKey,
	renderShellFrame,
	runInteractiveShell,
	shellFrameIdentity,
	splitKeySequences,
} from "../src/interactive-shell.js";

describe("hobo-code InteractiveShell (product chrome)", () => {
	it("initial frame carries product identity without branding spam", () => {
		const state = createInitialShellState({
			width: 80,
			height: 28,
			welcome: true,
			reducedMotion: true,
		});
		const frame = plain(renderShellFrame(state));
		expect(shellFrameIdentity(frame).mentionsStockPiChrome).toBe(false);
		// Branding lives in /about, never sprayed on frames.
		expect(frame).not.toContain(PRODUCT_NOT_PI);
		expect(frame).not.toMatch(/not stock pi/i);
		expect(frame.toLowerCase()).not.toMatch(/welcome to pi/);
		// Rubberhose identity (site/DESIGN.md): ink outline + sticker shadow,
		// never the flat hairline rules of a SaaS dashboard.
		expect(frame).toContain("┏");
		expect(frame).toContain("┃");
		expect(frame).toContain("▒");
		expect(frame).not.toContain("───");
		// One status strap carries product, engine and state.
		expect(frame).toContain("hobo-code");
		expect(frame).toContain("engine:none");
	});

	it("welcome message says honestly that prompts queue dispatch tasks", () => {
		const state = createInitialShellState({
			width: 80,
			height: 28,
			welcome: true,
			reducedMotion: true,
		});
		// The entry moment is a title card, not a wall of dashboard copy.
		const welcome = state.messages.map((m) => m.text).join("\n");
		expect(welcome).toContain("┏");
		expect(welcome).toMatch(/rides the rails/);
		expect(welcome).toMatch(/Type to talk to Bo/);
		// Engine honesty now lives on the always-visible strap.
		expect(plain(renderShellFrame(state))).toContain("engine:none");
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
		const frame = plain(renderShellFrame(state));
		expect(frame).toMatch(/commands/);
		expect(frame).toMatch(/\/ide/);
		expect(frame).toMatch(/\/config/);
		expect(frame).toMatch(/\/about/);
		// One extensible editor command, not one command per harness.
		expect(DEFAULT_SLASH_ITEMS.some((i) => i.name === "ide")).toBe(true);
		expect(
			DEFAULT_SLASH_ITEMS.find((i) => i.name === "sessions")?.argv,
		).toEqual(["session", "list"]);
		expect(DEFAULT_SLASH_ITEMS.some((i) => i.name === "cursor")).toBe(false);
		expect(DEFAULT_SLASH_ITEMS.some((i) => i.name === "harness")).toBe(false);
	});

	it("arrow keys move the slash palette selection", () => {
		let state = createInitialShellState({
			width: 80,
			height: 30,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "/").state;
		expect(state.slashIndex).toBe(0);
		state = reduceShellKey(state, "\x1b[B").state; // down
		expect(state.slashIndex).toBe(1);
		state = reduceShellKey(state, "\x1b[B").state;
		expect(state.slashIndex).toBe(2);
		state = reduceShellKey(state, "\x1b[A").state; // up
		expect(state.slashIndex).toBe(1);
		// Selection marker follows the index
		const frame = plain(renderShellFrame(state));
		const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
		expect(frame).toContain(`▸ /${items[1]!.name.padEnd(9)}`);
		// Enter runs the item under the moved selection, not always the first
		const chosen = reduceShellKey(state, "\r");
		expect(chosen.slash?.name).toBe(items[1]!.name);
	});

	it("selection clamps at the ends and stays inside the filtered list", () => {
		let state = createInitialShellState({
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "/").state;
		state = reduceShellKey(state, "\x1b[A").state; // up at top clamps
		expect(state.slashIndex).toBe(0);
		for (let i = 0; i < 99; i += 1) {
			state = reduceShellKey(state, "\x1b[B").state;
		}
		expect(state.slashIndex).toBe(DEFAULT_SLASH_ITEMS.length - 1);
	});

	it("unrecognized escape sequences never leak into the input", () => {
		let state = createInitialShellState({
			welcome: false,
			reducedMotion: true,
		});
		// The old per-char loop typed "[A" into the input for every arrow press.
		state = reduceShellKey(state, "\x1b[A").state;
		state = reduceShellKey(state, "\x1b[1;5C").state;
		state = reduceShellKey(state, "\x1bOP").state;
		expect(state.input).toBe("");
	});

	it("bracketed paste inserts as a single edit with controls stripped", () => {
		let state = createInitialShellState({
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(
			state,
			"\x1b[200~add a button\nwith two lines\x1b[201~",
		).state;
		expect(state.input).toBe("add a button with two lines");
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
		const frame = plain(renderShellFrame(after));
		expect(frame).toMatch(/Bo {2}·/);
		expect(frame).toContain("Bo did the thing");
	});

	it("up/down and PgUp/PgDn scroll the chat transcript", () => {
		let state = createInitialShellState({
			width: 60,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		for (let i = 0; i < 30; i += 1) {
			state = appendAssistant(state, `message number ${i}`);
		}
		expect(state.chatScroll).toBe(0);
		state = reduceShellKey(state, "\x1b[A").state;
		expect(state.chatScroll).toBe(1);
		state = reduceShellKey(state, "\x1b[5~").state; // PgUp
		expect(state.chatScroll).toBe(6);
		const scrolled = renderShellFrame(state);
		expect(scrolled).toContain("↑6");
		state = reduceShellKey(state, "\x1b[6~").state; // PgDn
		expect(state.chatScroll).toBe(1);
		// New activity snaps back to the bottom
		state = appendAssistant(state, "latest");
		expect(state.chatScroll).toBe(0);
	});

	it("frame geometry is stable across animation frames (anti-flicker)", () => {
		const base = createInitialShellState({
			width: 80,
			height: 30,
			welcome: true,
		});
		const frames = [0, 5, 11].map((i) =>
			renderShellFrame({ ...base, tickMs: i * 95 * 7 }),
		);
		const heights = frames.map((f) => f.split("\n").length);
		expect(new Set(heights).size).toBe(1);
		for (const f of frames) {
			for (const width of widths(f)) expect(width).toBe(80);
		}
	});

	it("Ctrl+C requests quit", () => {
		const state = createInitialShellState({ welcome: false });
		const r = reduceShellKey(state, "\u0003");
		expect(r.quit).toBe(true);
	});

	it("splitKeySequences keeps escape sequences and paste blocks atomic", () => {
		expect(splitKeySequences("abc")).toEqual(["abc"]);
		expect(splitKeySequences("a\x1b[Ab")).toEqual(["a", "\x1b[A", "b"]);
		expect(splitKeySequences("\x1b[200~hi\x1b[201~x")).toEqual([
			"\x1b[200~hi\x1b[201~",
			"x",
		]);
		expect(splitKeySequences("\r\u0003")).toEqual(["\r", "\u0003"]);
		expect(splitKeySequences("\x1bOP")).toEqual(["\x1bOP"]);
	});

	it("passes typed /sessions arguments through the resident session verb", async () => {
		const calls: string[][] = [];
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
			host: {
				runVerb: async (argv) => {
					calls.push([...argv]);
					return "ok";
				},
				complete: async () => "unused",
			},
			reducedMotion: true,
			scriptedKeys:
				"/sessions agent-start task pane codex codex -- --full-auto\r",
		});
		expect(calls).toEqual([
			[
				"session",
				"agent-start",
				"task",
				"pane",
				"codex",
				"codex",
				"--",
				"--full-auto",
			],
		]);
	});

	it("documents typed resident session commands in /help", async () => {
		let output = "";
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({
				write: (chunk, _encoding, done) => {
					output += chunk.toString();
					done();
				},
			}),
			host: { runVerb: async () => "unused", complete: async () => "unused" },
			reducedMotion: true,
			scriptedKeys: "/help\r",
		});
		expect(plain(output)).toContain("/sessions <args>");
	});
});

describe("slash palette viewport", () => {
	it("keeps the selection visible when the palette exceeds the body height", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "/").state;
		const items = filterSlash(DEFAULT_SLASH_ITEMS, "");
		// Walk the whole palette; the marker must be on screen at every step.
		for (let i = 0; i < items.length; i += 1) {
			const frame = plain(renderShellFrame(state));
			expect(frame).toContain(`▸ /${items[i]!.name.padEnd(9)}`);
			state = reduceShellKey(state, "\x1b[B").state;
		}
	});

	it("shows a range indicator only when the palette is clipped", () => {
		let tall = createInitialShellState({
			width: 80,
			height: 60,
			welcome: false,
			reducedMotion: true,
		});
		tall = reduceShellKey(tall, "/").state;
		expect(plain(renderShellFrame(tall))).not.toMatch(/\d+-\d+ of \d+/);

		// The redesign fits the whole palette on a standard 80x24 — the old
		// chrome showed roughly four entries there. Clipping now needs a
		// genuinely short terminal.
		let standard = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		standard = reduceShellKey(standard, "/").state;
		const standardFrame = plain(renderShellFrame(standard));
		expect(standardFrame).toContain("/quit");
		expect(standardFrame).not.toMatch(/\d+-\d+ of \d+/);

		let short = createInitialShellState({
			width: 80,
			height: 14,
			welcome: false,
			reducedMotion: true,
		});
		short = reduceShellKey(short, "/").state;
		expect(plain(renderShellFrame(short))).toMatch(/1-\d+ of \d+/);
	});
});

describe("live usage surfacing", () => {
	it("footer shows the configured budget until real spend is reported", () => {
		const state = createInitialShellState({
			width: 100,
			height: 30,
			welcome: false,
			reducedMotion: true,
		});
		expect(state.usageLabel).toBe("");
		expect(plain(renderShellFrame(state))).toContain(state.costLabel);
	});

	it("footer replaces the budget chip with provider-reported usage", () => {
		const base = createInitialShellState({
			width: 100,
			height: 30,
			welcome: false,
			reducedMotion: true,
		});
		const frame = renderShellFrame({
			...base,
			usageLabel: "1.2k in \u00b7 340 out \u00b7 $0.0123",
		});
		expect(frame).toContain("1.2k in \u00b7 340 out \u00b7 $0.0123");
		expect(frame).not.toContain(base.costLabel);
	});
});

describe("approval gate rendering", () => {
	it("renders the pending promotion instead of the transcript", () => {
		const base = createInitialShellState({
			width: 90,
			height: 30,
			welcome: false,
			reducedMotion: true,
		});
		const frame = plain(
			renderShellFrame({
				...base,
				pendingApproval: {
					runId: "run-42",
					sandboxRoot: "/tmp/sandbox/run-42",
					changes: [{ status: "M", path: "src/a.ts" }],
				},
			}),
		);
		expect(frame).toContain("promote run-42?");
		expect(frame).toContain("M  src/a.ts");
		expect(frame).toContain(APPROVAL_PROMPT);
		expect(frame).toContain("squash-only, gated, audited");
	});

	it("truncates a large blast radius with a remainder count", () => {
		const base = createInitialShellState({
			width: 90,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const changes = Array.from({ length: 40 }, (_, i) => ({
			status: "M",
			path: `src/file-${i}.ts`,
		}));
		const frame = plain(
			renderShellFrame({
				...base,
				pendingApproval: {
					runId: "run-big",
					sandboxRoot: "/tmp/sandbox/run-big",
					changes,
				},
			}),
		);
		expect(frame).toMatch(/\u2026 \d+ more file\(s\)/);
		// Geometry must hold — the gate cannot blow the frame open.
		for (const width of widths(frame)) expect(width).toBe(90);
	});

	it("gate keys resolve exactly once and are otherwise inert", () => {
		const approval = {
			runId: "run-k",
			sandboxRoot: "/tmp/sandbox/run-k",
			changes: [],
		};
		const base = {
			...createInitialShellState({ welcome: false, reducedMotion: true }),
			pendingApproval: approval,
		};
		const yes = reduceShellKey(base, "y");
		expect(yes.approve).toBe(approval);
		expect(yes.state.pendingApproval).toBeNull();

		for (const key of ["n", "N", "\u001b", "\r"]) {
			const no = reduceShellKey(base, key);
			expect(no.decline).toBe(approval);
			expect(no.state.pendingApproval).toBeNull();
		}

		for (const key of ["x", "/", "\t", "\u001b[B"]) {
			const inert = reduceShellKey(base, key);
			expect(inert.approve).toBeUndefined();
			expect(inert.decline).toBeUndefined();
			expect(inert.state.pendingApproval).toBe(approval);
			expect(inert.state.input).toBe("");
		}
		expect(reduceShellKey(base, "\u0003").quit).toBe(true);
	});
});
