import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

/** Visible text only — accents must never change what a test sees. */
const plain = (frame: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR is the point
	frame.replace(/\u001b\[[0-9;]*m/g, "");
/** Visible width of each rendered line. */
const widths = (frame: string): number[] =>
	plain(frame)
		.split("\n")
		.map((l) => l.length);

import { authLogin } from "../src/auth.js";
import {
	APPROVAL_PROMPT,
	appendAssistant,
	buildShellTree,
	buildWelcomeTable,
	createInitialShellState,
	DEFAULT_SLASH_ITEMS,
	filterSlash,
	PRODUCT_NOT_PI,
	reduceShellKey,
	renderShellFrame,
	runInteractiveShell,
	shellFrameIdentity,
	slashItemForInput,
	splitKeySequences,
} from "../src/interactive-shell.js";
import { findDescendantById } from "../src/tui-tree.js";

describe("hobo-code InteractiveShell (product chrome)", () => {
	it("wraps a long template list inside the card without chopping words", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			messages: [
				{
					role: "product",
					text: [
						"templates · 2",
						"bindle.web-only",
						"  a very long intent that must wrap on spaces instead of being sliced mid-word by the dock",
						"station.init",
						"  initialize a local station",
						"0 LLM calls · 0 LLM tokens",
					].join("\n"),
					at: 0,
				},
			],
		};
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("bindle.web-only");
		expect(frame).toContain("station.init");
		expect(frame).toContain("0 LLM calls");
		const card = frame
			.split("\n")
			.filter((line) => line.includes("█"))
			.join("\n");
		expect(card).not.toMatch(/\w…/);
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});

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
		expect(frame).toContain("█");
		expect(frame).toContain("▄");
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
		expect(welcome).toMatch(/[█▄▀]/);
		expect(welcome).toMatch(/rides the rails/);
		expect(state.welcomeTable.map((row) => row.label)).toEqual([
			"talk",
			"patterns",
			"focus",
		]);
		expect(state.welcomeTable.map((row) => row.value).join("\n")).toMatch(
			/Type\+Enter stays in chat/,
		);
		const frame = plain(renderShellFrame(state));
		expect(frame).toMatch(/talk\s+Type\+Enter stays in chat/);
		expect(frame).toMatch(/patterns\s+\/templates/);
		expect(frame).toMatch(/focus\s+Tab/);
		expect(findDescendantById(buildShellTree(state), "welcome-table")?.id).toBe(
			"welcome-table",
		);
		// Engine honesty now lives on the always-visible strap.
		expect(frame).toContain("engine:none");
	});

	it("puts occupancy endpoints in the welcome table as named hosts", () => {
		const rows = buildWelcomeTable({
			dashboardUrl: "http://127.0.0.1:8787/",
			evidenceUrl: "http://127.0.0.1:8788/__hobo/evidence",
		});
		expect(rows.map((row) => row.label)).toEqual([
			"talk",
			"patterns",
			"focus",
			"dashboard",
			"evidence",
		]);
		expect(rows.at(-2)?.value).toBe(
			"http://dashboard.code.local.hobo.localhost:8787/",
		);
		expect(rows.at(-1)?.value).toBe(
			"http://evidence.code.local.hobo.localhost:8788/__hobo/evidence",
		);
		expect(rows.map((row) => row.value).join("\n")).not.toMatch(/127\.0\.0\.1/);
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
		expect(DEFAULT_SLASH_ITEMS.some((i) => i.name === "dev")).toBe(true);
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

	it("Tab cycles chat → status → resources and skips agents until work exists", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		expect(state.focus).toBe("chat");
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("status");
		const statusFrame = renderShellFrame(state);
		expect(statusFrame).toMatch(/session status|Agents:/i);
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("resources");
		const resourcesFrame = renderShellFrame(state);
		expect(resourcesFrame).toMatch(/resources/);
		expect(resourcesFrame).toMatch(/auth:out|station:|local@/);
	});

	it("keeps Type+Enter in chat even when a coding CLI is seated", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			livePanes: {
				session: "hobo",
				windows: [
					{ name: "hobo-code", target: "%0", kind: "harness" },
					{ name: "codex", target: "%1", kind: "coding-agent" },
				],
				focused: 1,
				capture: "codex ›",
				note: "in-session",
				tmux: true,
			},
		};
		for (const ch of "add a login form") {
			state = reduceShellKey(state, ch).state;
		}
		const sent = reduceShellKey(state, "\r");
		expect(sent.toAgent).toBeUndefined();
		expect(sent.submit).toBe("add a login form");
		expect(sent.state.focus).toBe("chat");
	});

	it("steers the focused subagent from the agents screen, including harnesses", () => {
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
			livePanes: {
				session: "hobo",
				windows: [
					{ name: "hobo-code", target: "%0", kind: "harness" },
					{ name: "codex", target: "%1", kind: "coding-agent" },
				],
				focused: 0,
				capture: "hobo-code ›",
				note: "in-session",
				tmux: true,
			},
		};
		for (const ch of "stay on the auth path") {
			state = reduceShellKey(state, ch).state;
		}
		const sent = reduceShellKey(state, "\r");
		expect(sent.toAgent).toEqual({
			agent: "hobo-code",
			text: "stay on the auth path",
		});
		expect(sent.submit).toBeUndefined();
		expect(sent.state.focus).toBe("agents");
		expect(
			sent.state.messages.some((row) =>
				row.text.includes("stay on the auth path"),
			),
		).toBe(true);
	});

	it("[ and ] cycle working subagents without leaving the TTY", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			agentWork: true,
			livePanes: {
				session: "hobo",
				windows: [
					{ name: "codex", target: "%1", kind: "coding-agent" },
					{ name: "claude", target: "%2", kind: "coding-agent" },
				],
				focused: 0,
				capture: "",
				note: "in-session",
				tmux: true,
			},
		};
		state = reduceShellKey(state, "]").state;
		expect(state.focus).toBe("agents");
		expect(state.livePanes?.windows[state.livePanes.focused]?.name).toBe(
			"claude",
		);
		state = reduceShellKey(state, "[").state;
		expect(state.livePanes?.windows[state.livePanes.focused]?.name).toBe(
			"codex",
		);
	});

	it("[ and ] do not open agents when no subagent work exists", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			livePanes: {
				session: "hobo",
				windows: [{ name: "codex", target: "%1", kind: "coding-agent" }],
				focused: 0,
				capture: "",
				note: "in-session",
				tmux: true,
			},
		};
		state = reduceShellKey(state, "]").state;
		expect(state.focus).toBe("chat");
	});

	it("/agents opens the agents screen when a subagent is seated", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			livePanes: {
				session: "hobo",
				windows: [{ name: "codex", target: "%1", kind: "coding-agent" }],
				focused: 0,
				capture: "",
				note: "in-session",
				tmux: true,
			},
		};
		for (const ch of "/agents") {
			state = reduceShellKey(state, ch).state;
		}
		const next = reduceShellKey(state, "\r");
		expect(next.slash).toBeUndefined();
		expect(next.state.focus).toBe("agents");
		expect(slashItemForInput("/agents")?.action).toBe("agents");
		expect(slashItemForInput("/panes")?.action).toBe("agents");
		expect(slashItemForInput("/tasks")?.action).toBe("agents");
	});

	it("keeps run-it / debug-it on Bo even when Codex is seated", () => {
		let state = createInitialShellState({
			width: 72,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			livePanes: {
				session: "hobo",
				windows: [{ name: "codex", target: "%1", kind: "coding-agent" }],
				focused: 0,
				capture: "",
				note: "in-session",
				tmux: true,
			},
		};
		for (const ch of "run it") {
			state = reduceShellKey(state, ch).state;
		}
		const sent = reduceShellKey(state, "\r");
		expect(sent.toAgent).toBeUndefined();
		expect(sent.submit).toBe("run it");
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
		expect(state.chatScroll).toBeGreaterThan(1);
		const scrolled = renderShellFrame(state);
		expect(scrolled).toMatch(/chat ↑/);
		const afterPage = state.chatScroll;
		state = reduceShellKey(state, "\x1b[6~").state; // PgDn
		expect(state.chatScroll).toBeLessThan(afterPage);
		// New activity snaps back to the bottom
		state = appendAssistant(state, "latest");
		expect(state.chatScroll).toBe(0);
	});

	it("scrolls the welcome chat surface as one viewport", () => {
		let state = createInitialShellState({
			width: 60,
			height: 18,
			welcome: true,
			reducedMotion: true,
		});
		for (let i = 0; i < 20; i += 1) {
			state = appendAssistant(state, `tail-line-${i}`);
		}
		const bottom = plain(renderShellFrame(state));
		expect(bottom).toContain("tail-line-19");
		expect(bottom).not.toContain("↑");
		state = reduceShellKey(state, "\x1b[5~").state;
		expect(state.chatScroll).toBeGreaterThan(0);
		const up = plain(renderShellFrame(state));
		expect(up).toMatch(/chat ↑/);
		expect(up).not.toContain("tail-line-19");
	});

	it("nests claimed tasks under the focused subagent on Agents", () => {
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
			livePanes: {
				session: "hobo",
				windows: [
					{ name: "implementer", target: "%1", kind: "coding-agent" },
					{ name: "reviewer", target: "%2", kind: "coding-agent" },
				],
				focused: 0,
				capture: "implementer ›",
				note: "in-session",
				tmux: true,
			},
			agentBoard: {
				schema: "hobo.code.agent-work/v1",
				groups: [
					{
						agentId: "implementer",
						tasks: [
							{
								id: "task-login",
								kind: "task",
								state: "working",
								summary: "implement login",
								clickable: true,
							},
						],
						claims: [
							{
								schema: "hobo.code.work-claim/v1",
								taskId: "task-login",
								agentId: "implementer",
								runId: "claim-implementer-task-login",
								branch: "code/implementer/task-login",
								rootPath: "/tmp/impl",
								isolation: "worktree",
								delivery: {
									checkins: "incremental",
									pullRequests: "stacked",
									merge: "squash",
								},
								claimedAt: "2026-08-14T00:00:00.000Z",
							},
						],
					},
					{
						agentId: "reviewer",
						tasks: [],
						claims: [],
					},
				],
				unclaimed: [
					{
						id: "task-shot",
						kind: "look",
						state: "captured",
						summary: "capture screenshot",
						clickable: true,
					},
				],
			},
		};
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("implementer");
		expect(frame).toContain("implement login");
		expect(frame).toContain("code/implementer/task-login");
		expect(frame).toContain("reviewer");
		expect(frame).toContain("no claimed tasks");
		expect(frame).toContain("unclaimed");
		expect(frame).toContain("capture screenshot");
	});

	it("scrolls agents, status, and resources from the top", () => {
		const long = Array.from(
			{ length: 40 },
			(_, i) => `row-${String(i).padStart(2, "0")}`,
		).join("\n");
		const scenes = [
			{
				focus: "status" as const,
				field: "statusPlain" as const,
				title: "status",
			},
			{
				focus: "resources" as const,
				field: "resourcesPlain" as const,
				title: "resources",
			},
		];
		for (const scene of scenes) {
			let state = createInitialShellState({
				width: 60,
				height: 16,
				welcome: false,
				reducedMotion: true,
			});
			state = {
				...state,
				focus: scene.focus,
				[scene.field]: long,
			};
			const top = plain(renderShellFrame(state));
			expect(top, scene.title).toContain("row-00");
			expect(top, scene.title).not.toContain("row-39");
			state = reduceShellKey(state, "\x1b[B").state; // down
			expect(state.paneScroll, scene.title).toBe(1);
			state = reduceShellKey(state, "\x1b[6~").state; // PgDn
			expect(state.paneScroll, scene.title).toBeGreaterThan(1);
			const down = plain(renderShellFrame(state));
			expect(down, scene.title).toMatch(new RegExp(`${scene.title} ↑`));
			expect(down, scene.title).not.toContain("row-00");
			state = reduceShellKey(state, "\x1b[A").state; // up toward top
			expect(state.paneScroll, scene.title).toBeGreaterThan(0);
		}
	});

	it("scrolls the approval dialog and the btw overlay", () => {
		let approval = createInitialShellState({
			width: 60,
			height: 16,
			welcome: false,
			reducedMotion: true,
		});
		approval = {
			...approval,
			pendingApproval: {
				runId: "run-scroll",
				sandboxRoot: "/tmp/sandbox",
				changes: Array.from({ length: 30 }, (_, i) => ({
					status: "M",
					path: `src/file-${String(i).padStart(2, "0")}.ts`,
				})),
			},
		};
		const approvalTop = plain(renderShellFrame(approval));
		expect(approvalTop).toContain("file-00.ts");
		approval = reduceShellKey(approval, "\x1b[6~").state;
		expect(approval.paneScroll).toBeGreaterThan(0);
		const approvalDown = plain(renderShellFrame(approval));
		expect(approvalDown).not.toContain("file-00.ts");

		let btw = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
		});
		btw = {
			...btw,
			focus: "btw",
			btw: {
				snapshot: {
					focus: "btw",
					agentState: "idle",
					stationLabel: "auth:out",
					envLabel: "",
					modelLabel: "engine:none",
					usageLabel: "",
					messageCount: 1,
					lastUser: "hi",
					lastAssistant: "yo",
					slashOpen: false,
				},
				turns: Array.from({ length: 20 }, (_, i) => ({
					role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
					text: `btw-turn-${i}`,
					at: i,
				})),
				originMessageCount: 1,
			},
		};
		const btwBottom = plain(renderShellFrame(btw));
		expect(btwBottom).toContain("btw-turn-19");
		btw = reduceShellKey(btw, "\x1b[5~").state;
		expect(btw.chatScroll).toBeGreaterThan(0);
		const btwUp = plain(renderShellFrame(btw));
		expect(btwUp).not.toContain("btw-turn-19");
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

	it("starts Station dashboard and Evidence sidecars for a live session", async () => {
		const { authLogin } = await import("../src/auth.js");
		const { readStationSidecars } = await import("../src/station-sidecars.js");
		const home = mkdtempSync(join(tmpdir(), "hobo-code-shell-sidecars-"));
		authLogin({ hoboHome: home, autoInitLocal: true });
		try {
			await runInteractiveShell({
				stdin: new PassThrough(),
				stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
				host: {
					runVerb: async () => "ok",
					complete: async () => "unused",
				},
				hoboHome: home,
				sidecars: true,
				reducedMotion: true,
				scriptedKeys: "\u0003",
			});
			const { stopStationSidecars } = await import(
				"../src/station-sidecars.js"
			);
			const disk = readStationSidecars(home, "station:local");
			expect(disk?.evidenceUrl).toMatch(/evidence\.code\..*\.hobo\.localhost/);
			const { loopbackFetchUrl } = await import(
				"../src/occupancy-endpoints.js"
			);
			const still = await fetch(loopbackFetchUrl(disk?.evidenceUrl ?? ""));
			expect(still.status).toBe(200);
			await stopStationSidecars(home, "station:local");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	}, 20_000);

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

	it("routes /template through runVerb and never starts a model turn", async () => {
		const verbs: string[][] = [];
		let streamTurns = 0;
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
			host: {
				runVerb: async (argv) => {
					verbs.push([...argv]);
					return "0 LLM calls · 0 LLM tokens";
				},
				streamTurn: async () => {
					streamTurns += 1;
					return { ok: true, text: "model", toolCalls: 0, aborted: false };
				},
				complete: async () => "unused",
			},
			reducedMotion: true,
			scriptedKeys: "/template web frontend backed by an api\r",
		});
		expect(verbs).toEqual([
			["template", "web", "frontend", "backed", "by", "an", "api"],
		]);
		expect(streamTurns).toBe(0);
	});

	it("lists templates from /templates and bare /template", async () => {
		const verbs: string[][] = [];
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
			host: {
				runVerb: async (argv) => {
					verbs.push([...argv]);
					return "templates · 1\n  bindle.web-only";
				},
				complete: async () => "unused",
			},
			reducedMotion: true,
			scriptedKeys: "/templates\r",
		});
		expect(verbs).toEqual([["template", "list"]]);

		verbs.length = 0;
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
			host: {
				runVerb: async (argv) => {
					verbs.push([...argv]);
					return "templates · 1\n  bindle.web-only";
				},
				complete: async () => "unused",
			},
			reducedMotion: true,
			scriptedKeys: "/template\r",
		});
		expect(verbs).toEqual([["template", "list"]]);
	});

	it("matches /templates in the slash palette filter", () => {
		const items = filterSlash(DEFAULT_SLASH_ITEMS, "templates");
		expect(items.map((item) => item.name)).toContain("template");
	});

	it("resolves every palette command, including /templates, through the shipped resolver", () => {
		for (const item of DEFAULT_SLASH_ITEMS) {
			const hit = slashItemForInput(`/${item.name}`);
			expect(hit, `/${item.name} should resolve`).toBeDefined();
			expect(
				hit?.action ?? hit?.argv,
				`/${item.name} needs an action or argv`,
			).toBeTruthy();
		}
		expect(slashItemForInput("/templates")?.argv).toEqual(["template", "list"]);
		expect(slashItemForInput("/template")?.argv).toEqual(["template", "list"]);
		expect(slashItemForInput("/help")?.action).toBe("help");
		expect(slashItemForInput("/about")?.action).toBe("about");
		expect(slashItemForInput("/status")?.argv).toEqual(["status"]);
		expect(slashItemForInput("/resources")?.argv).toEqual(["resources"]);
		expect(slashItemForInput("/history")?.argv).toEqual(["history"]);
		expect(slashItemForInput("/alias")?.argv).toEqual(["alias"]);
		expect(slashItemForInput("/auth")?.argv).toEqual(["auth", "status"]);
		expect(slashItemForInput("/sessions")?.argv).toEqual(["session", "list"]);
		expect(slashItemForInput("/panes")?.action).toBe("agents");
		expect(slashItemForInput("/agents")?.action).toBe("agents");
		expect(slashItemForInput("/agents init")?.argv).toEqual(["agents", "init"]);
	});

	it("runs inspect slashes as product replies, never a model turn", async () => {
		const verbs: string[][] = [];
		let output = "";
		const host = {
			runVerb: async (argv: readonly string[]) => {
				verbs.push([...argv]);
				return `${argv.join(" ")} · ok`;
			},
			streamTurn: async () => {
				throw new Error("inspect slashes must not start a model turn");
			},
			complete: async () => "unused",
		};
		const sink = new Writable({
			write: (chunk: Buffer, _encoding, done) => {
				output += chunk.toString();
				done();
			},
		});
		for (const keys of [
			"/help\r",
			"/about\r",
			"/status\r",
			"/auth\r",
			"/sessions\r",
			"/templates\r",
		]) {
			await runInteractiveShell({
				stdin: new PassThrough(),
				stdout: sink,
				host,
				reducedMotion: true,
				scriptedKeys: keys,
			});
		}
		expect(verbs).toEqual([
			["status"],
			["auth", "status"],
			["session", "list"],
			["template", "list"],
		]);
		expect(plain(output)).toMatch(/Commands:|Chat stays first/);
		expect(plain(output)).toContain(PRODUCT_NOT_PI);
		expect(plain(output)).not.toContain("HOBO_CODE_TEMPLATE_INDEX_INVALID");
		expect(plain(output)).not.toContain("template needs a query");
	});

	it("passes typed /hobo arguments through to the HoBo control plane", async () => {
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
			scriptedKeys: "/hobo yard status\r",
		});
		expect(calls).toEqual([["hobo", "yard", "status"]]);
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
		expect(plain(output)).toContain("/hobo <args>");
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
		expect(standardFrame).toContain("/template");
		expect(standardFrame).toMatch(/1-\d+ of \d+/);

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

	it("keeps a large blast radius inside the frame and starts at the top", () => {
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
		expect(frame).toContain("src/file-0.ts");
		expect(frame).not.toContain("src/file-39.ts");
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

describe("interactive shell station occupancy chrome", () => {
	const homes: string[] = [];
	afterEach(() => {
		for (const home of homes) rmSync(home, { recursive: true, force: true });
		homes.length = 0;
	});

	it("puts the logged-in station and environment on the strap and status pane", () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-shell-station-"));
		homes.push(hoboHome);
		authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
		const state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
			hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "staging" },
		});
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("local@staging");
		expect(state.statusPlain).toContain("station:local");
		expect(state.statusPlain).toContain("tenant   camp-west");
		expect(state.statusPlain).toContain("env      staging");
	});

	it("shows auth:out on the strap when the coding agent has no session", () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-shell-anon-"));
		homes.push(hoboHome);
		const state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
			hoboHome,
			env: { HOBO_HOME: hoboHome },
		});
		expect(plain(renderShellFrame(state))).toContain("auth:out");
	});
});
