/**
 * HoBo-owned interactive product shell for bare `hobo-code` TTY.
 *
 * Architecture (ADR note in ARCHITECTURE.md):
 * - **This module owns chrome** (header/Bo, chat, tasks, slash, footer).
 * - Rendering rides pi-tui's differential renderer (`@earendil-works/pi-tui`)
 *   as a library — HoBo still owns every visible line; Pi is not the product UI.
 * - Frames repaint only when state changes; idle Bo ticks that resolve to the
 *   same sprite frame request no render at all.
 *
 * Pure frame rendering + key reduction are unit-tested. The run loop is a
 * thin driver over TUI + StreamTerminal.
 */

import type { Readable, Writable } from "node:stream";
import { type Component, matchesKey, TUI } from "@earendil-works/pi-tui";
import { inspectCost } from "./cost.js";
import { buildTasksSurface } from "./grok-build-parity.js";
import { hermeticEnvSummary, inspectHermeticEnv } from "./hermetic-env.js";
import { StreamTerminal } from "./shell-terminal.js";
import {
	BO_CELL_HEIGHT,
	BO_IDLE_TICK_MS,
	HOBO_LOGO_CONSOLE,
	HOBO_MARK_CONSOLE,
	padLine,
	renderBoIdleFrame,
	selectBoIdleFrame,
} from "./splash.js";
import { buildMultiplexerStatus, createPane, renderStatusText } from "./tui.js";

// ── Types ────────────────────────────────────────────────────────────────

export type ShellFocus = "chat" | "tasks" | "status" | "slash";

export type ShellAgentState = "idle" | "working" | "blocked" | "done";

export interface ShellMessage {
	readonly role: "system" | "user" | "assistant" | "product";
	readonly text: string;
	readonly at: number;
}

export interface ShellSlashItem {
	readonly name: string;
	readonly description: string;
	/** When set, shell invokes this CLI argv via the host callback. */
	readonly argv?: readonly string[];
	/** Built-in action id when not a CLI verb. */
	readonly action?: "help" | "about" | "clear" | "quit" | "guide-hint";
}

export interface InteractiveShellState {
	readonly width: number;
	readonly height: number;
	readonly tickMs: number;
	readonly reducedMotion: boolean;
	readonly dense: boolean;
	readonly focus: ShellFocus;
	readonly input: string;
	readonly messages: readonly ShellMessage[];
	readonly agentState: ShellAgentState;
	readonly slashOpen: boolean;
	readonly slashFilter: string;
	readonly slashIndex: number;
	/** Lines scrolled up from the bottom of the chat transcript. */
	readonly chatScroll: number;
	readonly statusPlain: string;
	readonly tasksPlain: string;
	readonly footerHints: string;
	readonly modelLabel: string;
	readonly costLabel: string;
	readonly hermeticLabel: string;
	readonly productTitle: string;
	/** Hard product identity — must never be stock Pi chrome. */
	readonly engineLabel: "hobo-shell";
}

export interface RenderShellOptions {
	readonly state: InteractiveShellState;
}

export const DEFAULT_SLASH_ITEMS: readonly ShellSlashItem[] = [
	{ name: "help", description: "Shell keys + product map", action: "help" },
	{
		name: "about",
		description: "What this shell is (and is not)",
		action: "about",
	},
	{
		name: "guide",
		description: "Claude Code → hobo-code map",
		argv: ["guide"],
	},
	{
		name: "cursor",
		description: "Cursor → hobo-code map",
		argv: ["guide", "--cursor"],
	},
	{ name: "agent", description: "Agent-native inventory", argv: ["agent"] },
	{ name: "config", description: "Setup / stack inventory", argv: ["config"] },
	{ name: "cost", description: "$0 path + budget + savings", argv: ["cost"] },
	{ name: "status", description: "Session / agent panes", argv: ["status"] },
	{ name: "tasks", description: "Background task board", argv: ["tasks"] },
	{
		name: "env",
		description: "Hermetic shell + durable layout",
		argv: ["env"],
	},
	{
		name: "auth",
		description: "Station auth status",
		argv: ["auth", "status"],
	},
	{
		name: "login",
		description: "Human-free local login",
		argv: ["auth", "login", "--agent"],
	},
	{
		name: "models",
		description: "Model + BYOK (no secrets)",
		argv: ["models"],
	},
	{
		name: "harness",
		description: "Pi engine / Flue dual surface",
		argv: ["harness"],
	},
	{
		name: "attach",
		description: "tmux/mosh/Tailscale-shaped attach",
		argv: ["attach"],
	},
	{ name: "clear", description: "Clear chat transcript", action: "clear" },
	{ name: "quit", description: "Exit hobo-code shell", action: "quit" },
] as const;

/**
 * Product identity claim. Shown in `/about` and `/help` only — never printed
 * on frames or replies (branding in the answer channel is noise).
 */
export const PRODUCT_NOT_PI = "hobo-code · HoBo shell (not stock Pi Agent)";

/** Footer engine label until a real completion engine is wired (Slice 2). */
export const ENGINE_NONE_LABEL = "engine:none · dispatch-only";

// ── Pure helpers ─────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

function wrapText(text: string, width: number): string[] {
	const w = Math.max(8, width);
	const out: string[] = [];
	for (const para of text.split("\n")) {
		if (para.length === 0) {
			out.push("");
			continue;
		}
		let rest = para;
		while (rest.length > w) {
			let breakAt = rest.lastIndexOf(" ", w);
			if (breakAt < w * 0.5) breakAt = w;
			out.push(rest.slice(0, breakAt).trimEnd());
			rest = rest.slice(breakAt).trimStart();
		}
		out.push(rest);
	}
	return out;
}

/** Per-message wrap cache — messages are immutable, so re-wrapping the whole
 * transcript on every frame is pure waste. Keyed by message object. */
const wrapCache = new WeakMap<
	ShellMessage,
	{ readonly width: number; readonly lines: readonly string[] }
>();

function messagePrefix(role: ShellMessage["role"]): string {
	return role === "user"
		? "you · "
		: role === "assistant"
			? "Bo  · "
			: role === "product"
				? "··· · "
				: "sys · ";
}

function wrapMessage(m: ShellMessage, width: number): readonly string[] {
	const hit = wrapCache.get(m);
	if (hit && hit.width === width) return hit.lines;
	const lines = wrapText(messagePrefix(m.role) + m.text, width);
	wrapCache.set(m, { width, lines });
	return lines;
}

export function filterSlash(
	items: readonly ShellSlashItem[],
	filter: string,
): ShellSlashItem[] {
	const f = filter.trim().toLowerCase().replace(/^\//, "");
	if (!f) return [...items];
	return items.filter(
		(i) => i.name.includes(f) || i.description.toLowerCase().includes(f),
	);
}

/**
 * Split raw terminal input into atomic key sequences: escape sequences
 * (CSI/SS3/paste blocks) stay whole, printable runs stay whole, single
 * control characters come out alone. Mirrors StdinBuffer's contract for
 * scripted/test input.
 */
export function splitKeySequences(data: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < data.length) {
		const ch = data[i]!;
		if (ch === "\x1b") {
			// Bracketed paste block: keep marker + content + end marker whole
			if (data.startsWith("\x1b[200~", i)) {
				const end = data.indexOf("\x1b[201~", i + 6);
				if (end >= 0) {
					out.push(data.slice(i, end + 6));
					i = end + 6;
					continue;
				}
			}
			// CSI: ESC [ params final-byte (0x40–0x7e)
			if (data[i + 1] === "[") {
				let j = i + 2;
				while (j < data.length && !(data[j]! >= "@" && data[j]! <= "~")) j += 1;
				out.push(data.slice(i, Math.min(j + 1, data.length)));
				i = j + 1;
				continue;
			}
			// SS3: ESC O final
			if (data[i + 1] === "O" && i + 2 < data.length) {
				out.push(data.slice(i, i + 3));
				i += 3;
				continue;
			}
			out.push(ch);
			i += 1;
			continue;
		}
		if (ch < " " || ch === "\u007f") {
			out.push(ch);
			i += 1;
			continue;
		}
		// Printable run
		let j = i;
		while (j < data.length && data[j]! >= " " && data[j] !== "\u007f") j += 1;
		out.push(data.slice(i, j));
		i = j;
	}
	return out;
}

/**
 * Build initial shell state from env/cwd — pure enough for tests with overrides.
 */
export function createInitialShellState(
	options: {
		readonly width?: number;
		readonly height?: number;
		readonly dense?: boolean;
		readonly reducedMotion?: boolean;
		readonly cwd?: string;
		readonly hoboHome?: string;
		readonly env?: NodeJS.ProcessEnv;
		readonly welcome?: boolean;
	} = {},
): InteractiveShellState {
	const env = options.env ?? process.env;
	const width = clamp(options.width ?? 80, 40, 200);
	const height = clamp(options.height ?? 24, 12, 80);
	const dense = options.dense === true;
	const reducedMotion =
		options.reducedMotion === true ||
		env.HOBO_CODE_REDUCED_MOTION === "1" ||
		env.HOBO_CODE_REDUCED_MOTION === "true";

	const hoboHome =
		options.hoboHome ??
		(typeof env.HOBO_HOME === "string" && env.HOBO_HOME
			? env.HOBO_HOME
			: `${env.HOME ?? "/tmp"}/.hobo`);
	const hermetic = inspectHermeticEnv({
		projectRoot: options.cwd ?? process.cwd(),
		hoboHome,
		env,
	});
	const cost = inspectCost(env);

	const panes = [
		createPane("coord", "idle", ""),
		createPane("station", "done", ""),
		createPane("auth", "idle", "login"),
	];
	const mux = buildMultiplexerStatus(panes, {
		remoteReady: true,
		theme: "herdr",
	});
	const statusPlain = renderStatusText(mux, { plain: true });
	const tasks = buildTasksSurface({ hoboHome, panes: mux.panes });
	const tasksPlain = [
		"Tasks · keyboard-first (Tab → Tasks) · clickable mouse residual later",
		...tasks.rows.map(
			(r) =>
				`  [${r.state}] ${r.kind}/${r.id}${r.summary ? ` — ${r.summary}` : ""}`,
		),
		"  Regions: task-row · still-working · status-chip (keyboard focus now)",
		"  Honest residual: fullscreen mouse TUI is not claimed complete yet",
	].join("\n");

	const welcome: ShellMessage[] =
		options.welcome === false
			? []
			: [
					{
						role: "product",
						text: [
							"Bo is with you. Type a prompt to queue a build task — no completion engine is wired yet, so prompts are recorded as dispatch tasks (see /about).",
							"Start: /guide (Claude map) · /config · /cost · /tasks · /env",
							"Keys: Tab panes · / commands · ↑/↓ + PgUp/PgDn scroll · ? help · Ctrl+C quit",
						].join("\n"),
						at: Date.now(),
					},
				];

	return {
		width,
		height,
		tickMs: 0,
		reducedMotion,
		dense,
		focus: "chat",
		input: "",
		messages: welcome,
		agentState: "idle",
		slashOpen: false,
		slashFilter: "",
		slashIndex: 0,
		chatScroll: 0,
		statusPlain,
		tasksPlain,
		footerHints: "Tab focus · / slash · ? help · Ctrl+C quit",
		modelLabel: ENGINE_NONE_LABEL,
		costLabel: `$${cost.budget.spendUsd.toFixed(2)}/$${cost.budget.capUsd.toFixed(2)} · ${cost.budget.routingPolicy}`,
		hermeticLabel: hermeticEnvSummary(hermetic).split("\n")[0] ?? "env",
		productTitle: "hobo-code",
		engineLabel: "hobo-shell",
	};
}

/** Bo header rows for the current geometry: full sprite on tall terminals,
 * body crop (rows 6–13 — the part with Bo in it) on standard ones, none when
 * dense or too short. The old top-crop showed rows 0–5, which are mostly
 * empty sky — that read as noise, not a mascot. */
function boHeaderRows(state: InteractiveShellState): string[] {
	if (state.dense) return [];
	if (state.height < 24) return [];
	const frame = selectBoIdleFrame({
		tickMs: state.tickMs,
		reducedMotion: state.reducedMotion,
	});
	const rows = renderBoIdleFrame(frame).split("\n");
	const slice = state.height >= 36 ? rows : rows.slice(6, BO_CELL_HEIGHT);
	return slice.map((row) =>
		padLine(row.trimEnd().slice(0, state.width), state.width),
	);
}

/**
 * Render one full-screen frame. Fixed structure for tests:
 * header (logo+Bo) · status line · body (chat|tasks|status|slash) · input · footer.
 * Geometry is stable for a given (width, height, dense) — animation frames
 * only change the Bo rows' bytes, never the line count.
 */
export function renderShellFrame(state: InteractiveShellState): string {
	const w = state.width;
	const lines: string[] = [];

	const logo = state.dense ? HOBO_MARK_CONSOLE : HOBO_LOGO_CONSOLE;
	for (const row of logo.split("\n")) {
		lines.push(padLine(row, w));
	}
	lines.push(...boHeaderRows(state));

	lines.push(
		padLine(
			`${state.productTitle} · ${state.engineLabel} · agent:${state.agentState} · focus:${state.focus}${state.chatScroll > 0 ? ` · ↑${state.chatScroll}` : ""}`,
			w,
		),
	);
	lines.push(padLine("─".repeat(Math.min(w, 40)), w));

	// Body budget: header + separator above, separator + input + footer + hints below
	const reserved = lines.length + 4;
	const bodyH = Math.max(4, state.height - reserved);

	let bodyLines: string[] = [];
	if (state.slashOpen) {
		const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
		bodyLines.push(padLine(`Slash palette  filter: /${state.slashFilter}`, w));
		items.forEach((item, i) => {
			const mark = i === state.slashIndex ? "▸" : " ";
			bodyLines.push(
				padLine(`${mark} /${item.name.padEnd(10)} ${item.description}`, w),
			);
		});
		if (items.length === 0) {
			bodyLines.push(padLine("  (no matches)", w));
		}
	} else if (state.focus === "tasks") {
		bodyLines = wrapText(state.tasksPlain, w).map((l) => padLine(l, w));
	} else if (state.focus === "status") {
		bodyLines = wrapText(state.statusPlain, w).map((l) => padLine(l, w));
	} else {
		// chat transcript: cached per-message wraps, scrollable window
		const chat: string[] = [];
		for (const m of state.messages) {
			for (const row of wrapMessage(m, w)) {
				chat.push(padLine(row, w));
			}
			chat.push(padLine("", w));
		}
		const scroll = clamp(state.chatScroll, 0, Math.max(0, chat.length - bodyH));
		const end = chat.length - scroll;
		bodyLines = chat.slice(Math.max(0, end - bodyH), end);
	}

	while (bodyLines.length < bodyH) bodyLines.push(padLine("", w));
	lines.push(...bodyLines.slice(0, bodyH));

	lines.push(padLine("─".repeat(Math.min(w, 40)), w));
	const prompt =
		state.slashOpen || state.input.startsWith("/")
			? `/${state.slashFilter || state.input.replace(/^\//, "")}`
			: state.input;
	lines.push(padLine(`❯ ${prompt}█`, w));
	lines.push(
		padLine(
			`${state.modelLabel} · ${state.costLabel} · ${state.hermeticLabel}`,
			w,
		),
	);
	lines.push(padLine(state.footerHints, w));

	return lines.join("\n");
}

/** Assert product identity tokens for persona hard gates. */
export function shellFrameIdentity(frame: string): {
	readonly isHoboShell: boolean;
	readonly claimsNotPi: boolean;
	readonly hasBoArt: boolean;
	readonly hasPrompt: boolean;
	readonly mentionsStockPiChrome: boolean;
} {
	const lower = frame.toLowerCase();
	return {
		isHoboShell: frame.includes("hobo-shell") && frame.includes("hobo-code"),
		claimsNotPi:
			frame.includes(PRODUCT_NOT_PI) || lower.includes("not stock pi"),
		hasBoArt: /[▀▄█]/.test(frame) || frame.includes(HOBO_MARK_CONSOLE),
		hasPrompt: frame.includes("❯"),
		// Stock Pi product chrome phrases we must not show as our UI
		mentionsStockPiChrome:
			/\bpi coding agent\b/i.test(frame) ||
			/\bpi-agent\b/i.test(frame) ||
			/welcome to pi\b/i.test(frame),
	};
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

export function reduceShellKey(
	state: InteractiveShellState,
	key: string,
): {
	readonly state: InteractiveShellState;
	readonly quit?: boolean;
	readonly submit?: string;
	readonly slash?: ShellSlashItem;
} {
	// Ctrl+C
	if (key === "\u0003") {
		return { state, quit: true };
	}
	// Bracketed paste — insert content as one edit (newlines become spaces;
	// control characters dropped so pasted escapes can't corrupt the input line)
	if (key.startsWith(PASTE_START)) {
		const content = key
			.slice(
				PASTE_START.length,
				key.endsWith(PASTE_END) ? -PASTE_END.length : undefined,
			)
			.replace(/\r?\n/g, " ")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping controls is the point
			.replace(/[\x00-\x1f\x7f]/g, "");
		if (!content) return { state };
		if (state.slashOpen) {
			const f = state.slashFilter + content;
			return {
				state: { ...state, slashFilter: f, slashIndex: 0, input: `/${f}` },
			};
		}
		return { state: { ...state, input: state.input + content } };
	}
	// Esc
	if (key === "\u001b") {
		if (state.slashOpen) {
			return {
				state: {
					...state,
					slashOpen: false,
					slashFilter: "",
					slashIndex: 0,
					input: "",
					focus: "chat",
				},
			};
		}
		return { state };
	}
	// Arrow up/down — slash palette navigation, or chat scroll
	if (matchesKey(key, "up") || matchesKey(key, "down")) {
		const dirUp = matchesKey(key, "up");
		if (state.slashOpen) {
			const count = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter).length;
			if (count === 0) return { state };
			const next = clamp(state.slashIndex + (dirUp ? -1 : 1), 0, count - 1);
			return { state: { ...state, slashIndex: next } };
		}
		if (state.focus === "chat" && state.input.length === 0) {
			return {
				state: {
					...state,
					chatScroll: Math.max(0, state.chatScroll + (dirUp ? 1 : -1)),
				},
			};
		}
		return { state };
	}
	// PgUp/PgDn — chat scroll (clamped against content at render time)
	if (matchesKey(key, "pageUp") || matchesKey(key, "pageDown")) {
		if (state.focus !== "chat" || state.slashOpen) return { state };
		const delta = matchesKey(key, "pageUp") ? 5 : -5;
		return {
			state: { ...state, chatScroll: Math.max(0, state.chatScroll + delta) },
		};
	}
	// Tab — cycle focus
	if (key === "\t") {
		const order: ShellFocus[] = ["chat", "tasks", "status"];
		const i = order.indexOf(state.focus === "slash" ? "chat" : state.focus);
		const next = order[(i + 1) % order.length]!;
		return {
			state: {
				...state,
				focus: next,
				slashOpen: false,
				footerHints: `focus:${next} · Tab cycle · / slash · ? help`,
			},
		};
	}
	// ?
	if (key === "?" && state.input.length === 0 && !state.slashOpen) {
		const help: ShellMessage = {
			role: "product",
			text: [
				"hobo-code shell help",
				"  Type a prompt to queue a build task (see /about for what runs it).",
				"  / opens the slash palette (↑/↓ to pick, Enter to run).",
				"  Tab cycles Chat → Tasks → Status. ↑/↓ or PgUp/PgDn scroll chat.",
			].join("\n"),
			at: Date.now(),
		};
		return {
			state: { ...state, messages: [...state.messages, help], chatScroll: 0 },
		};
	}
	// Enter
	if (key === "\r" || key === "\n") {
		if (state.slashOpen) {
			const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
			const item = items[state.slashIndex] ?? items[0];
			if (!item) {
				return {
					state: {
						...state,
						slashOpen: false,
						slashFilter: "",
						input: "",
					},
				};
			}
			return {
				state: {
					...state,
					slashOpen: false,
					slashFilter: "",
					slashIndex: 0,
					input: "",
					focus: "chat",
					chatScroll: 0,
				},
				slash: item,
			};
		}
		const text = state.input.trim();
		if (!text) return { state };
		if (text.startsWith("/")) {
			const name = text.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
			const item = DEFAULT_SLASH_ITEMS.find((i) => i.name === name);
			if (item) {
				return {
					state: {
						...state,
						input: "",
						slashOpen: false,
						slashFilter: "",
						chatScroll: 0,
					},
					slash: item,
				};
			}
			return {
				state: {
					...state,
					input: "",
					slashOpen: false,
					slashFilter: "",
					chatScroll: 0,
				},
				submit: text,
			};
		}
		return {
			state: {
				...state,
				input: "",
				chatScroll: 0,
				messages: [...state.messages, { role: "user", text, at: Date.now() }],
				agentState: "working",
			},
			submit: text,
		};
	}
	// Backspace
	if (key === "\u007f" || key === "\b") {
		if (state.slashOpen) {
			const f = state.slashFilter.slice(0, -1);
			return {
				state: {
					...state,
					slashFilter: f,
					slashIndex: 0,
					input: f ? `/${f}` : "/",
				},
			};
		}
		return { state: { ...state, input: state.input.slice(0, -1) } };
	}
	// Printable run (single keystroke or fallback paste) — no control chars
	if (key.length >= 1 && !key.includes("\x1b") && key >= " ") {
		if (key === "/" && state.input.length === 0 && !state.slashOpen) {
			return {
				state: {
					...state,
					slashOpen: true,
					slashFilter: "",
					slashIndex: 0,
					input: "/",
					focus: "slash",
				},
			};
		}
		if (state.slashOpen) {
			const f = state.slashFilter + key;
			return {
				state: {
					...state,
					slashFilter: f,
					slashIndex: 0,
					input: `/${f}`,
				},
			};
		}
		return { state: { ...state, input: state.input + key } };
	}
	// Unrecognized escape sequences must never leak into the input line
	return { state };
}

export function appendAssistant(
	state: InteractiveShellState,
	text: string,
	agentState: ShellAgentState = "idle",
): InteractiveShellState {
	return {
		...state,
		agentState,
		chatScroll: 0,
		messages: [...state.messages, { role: "assistant", text, at: Date.now() }],
	};
}

export function appendProduct(
	state: InteractiveShellState,
	text: string,
): InteractiveShellState {
	return {
		...state,
		chatScroll: 0,
		messages: [...state.messages, { role: "product", text, at: Date.now() }],
	};
}

// ── TTY driver ───────────────────────────────────────────────────────────

export interface ShellHost {
	/** Run a product CLI surface; return human text. */
	readonly runVerb: (argv: readonly string[]) => Promise<string>;
	/** Handle a user chat prompt; return assistant text. */
	readonly complete: (prompt: string) => Promise<string>;
}

export interface RunInteractiveShellOptions {
	readonly stdin?: Readable;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly host: ShellHost;
	readonly dense?: boolean;
	readonly reducedMotion?: boolean;
	readonly cwd?: string;
	readonly hoboHome?: string;
	readonly env?: NodeJS.ProcessEnv;
	/** Test hook: stop after N ms */
	readonly maxMs?: number;
	/** Inject keys for tests (skips raw mode). */
	readonly scriptedKeys?: string;
	/** Test hook: receives the terminal for repaint-economy assertions. */
	readonly onTerminal?: (terminal: StreamTerminal) => void;
}

/**
 * Interactive driver: pi-tui differential renderer over StreamTerminal.
 *
 * Render economy contract (asserted by test/render-budget.test.ts):
 * - a repaint happens only when state changes (key, submit result, resize,
 *   or a Bo sprite frame that differs from the previous one);
 * - idle rest spans request no renders at all;
 * - unchanged lines are never rewritten (pi-tui line diff);
 * - the transcript survives exit — no alternate screen.
 */
export async function runInteractiveShell(
	options: RunInteractiveShellOptions,
): Promise<number> {
	const stdin = options.stdin ?? process.stdin;
	const stdout = options.stdout ?? process.stdout;
	const isTty =
		"isTTY" in stdin &&
		(stdin as NodeJS.ReadStream).isTTY === true &&
		"isTTY" in stdout &&
		(stdout as NodeJS.WriteStream).isTTY === true;

	let state = createInitialShellState({
		width:
			"columns" in stdout &&
			typeof (stdout as NodeJS.WriteStream).columns === "number"
				? (stdout as NodeJS.WriteStream).columns
				: 80,
		height:
			"rows" in stdout &&
			typeof (stdout as NodeJS.WriteStream).rows === "number"
				? (stdout as NodeJS.WriteStream).rows
				: 24,
		...(options.dense !== undefined ? { dense: options.dense } : {}),
		...(options.reducedMotion !== undefined
			? { reducedMotion: options.reducedMotion }
			: {}),
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.hoboHome !== undefined ? { hoboHome: options.hoboHome } : {}),
		...(options.env !== undefined ? { env: options.env } : {}),
	});

	const terminal = new StreamTerminal({
		stdin,
		stdout,
		columns: state.width,
		rows: state.height,
		rawMode: isTty && options.scriptedKeys === undefined,
	});
	options.onTerminal?.(terminal);
	const tui = new TUI(terminal, false);

	let quit = false;
	let resolveDone!: () => void;
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const requestQuit = () => {
		if (quit) return;
		quit = true;
		resolveDone();
	};

	const applySlash = async (item: ShellSlashItem) => {
		if (item.action === "quit") {
			requestQuit();
			return;
		}
		if (item.action === "clear") {
			state = { ...state, messages: [], chatScroll: 0 };
			return;
		}
		if (item.action === "help") {
			state = appendProduct(
				state,
				[
					"Slash: /guide /config /cost /tasks /status /agent /env /auth /login /about /quit",
					"Chat: type a prompt and Enter — it is queued as a dispatch task (/about).",
					"Keys: Tab panes · ↑/↓ pick + scroll · PgUp/PgDn scroll · Ctrl+C quit",
				].join("\n"),
			);
			return;
		}
		if (item.action === "about") {
			state = appendProduct(
				state,
				[
					PRODUCT_NOT_PI,
					"This shell is HoBo product chrome over the hobo-code CLI.",
					"Prompts queue dispatch tasks; no completion engine is wired yet",
					"(footer shows engine:none until one lands). Pi remains an opt-in",
					"engine via `hobo-code --pi` — never the product UI.",
				].join("\n"),
			);
			return;
		}
		if (item.argv) {
			state = { ...state, agentState: "working" };
			tui.requestRender();
			try {
				const text = await options.host.runVerb(item.argv);
				state = appendProduct(state, text.slice(0, 4000));
			} catch (err) {
				state = appendProduct(
					state,
					`/${item.name} failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			state = { ...state, agentState: "idle" };
		}
	};

	const onSubmit = async (prompt: string) => {
		try {
			const text = await options.host.complete(prompt);
			if (quit) return;
			state = appendAssistant(state, text.slice(0, 8000), "idle");
		} catch (err) {
			if (quit) return;
			state = appendAssistant(
				state,
				`Could not complete: ${err instanceof Error ? err.message : String(err)}`,
				"blocked",
			);
		}
	};

	const handleKey = (sequence: string) => {
		if (quit) return;
		const result = reduceShellKey(state, sequence);
		state = result.state;
		if (result.quit) {
			requestQuit();
			return;
		}
		if (result.slash) {
			void applySlash(result.slash).then(() => {
				if (!quit) tui.requestRender();
			});
		} else if (result.submit) {
			void onSubmit(result.submit).then(() => {
				if (!quit) tui.requestRender();
			});
		}
		tui.requestRender();
	};

	const view: Component = {
		render(width: number): string[] {
			const w = clamp(width, 40, 200);
			const h = clamp(terminal.rows, 12, 80);
			if (w !== state.width || h !== state.height) {
				state = { ...state, width: w, height: h };
			}
			return renderShellFrame(state).split("\n");
		},
		invalidate(): void {},
		handleInput(data: string): void {
			handleKey(data);
		},
	};

	tui.addChild(view);
	tui.setFocus(view);
	tui.start();

	// Idle animation: request a repaint only when the sprite frame actually
	// changes. Rest spans (15 of 26 ticks) request nothing.
	const started = Date.now();
	let lastBoFrame = selectBoIdleFrame({
		tickMs: 0,
		reducedMotion: state.reducedMotion,
	});
	const tick = setInterval(() => {
		if (quit || state.reducedMotion) return;
		const tickMs = Date.now() - started;
		const frame = selectBoIdleFrame({ tickMs, reducedMotion: false });
		if (frame === lastBoFrame) return;
		lastBoFrame = frame;
		state = { ...state, tickMs };
		tui.requestRender();
	}, BO_IDLE_TICK_MS);
	tick.unref?.();

	let maxMsTimer: NodeJS.Timeout | undefined;
	if (options.maxMs !== undefined) {
		maxMsTimer = setTimeout(requestQuit, options.maxMs);
		maxMsTimer.unref?.();
	}

	if (options.scriptedKeys !== undefined) {
		for (const sequence of splitKeySequences(options.scriptedKeys)) {
			if (quit) break;
			handleKey(sequence);
			// Let submit/slash promises and render scheduling settle per key.
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		// Allow the final coalesced render to flush before stopping.
		await new Promise((resolve) => setTimeout(resolve, 40));
		requestQuit();
	}

	await done;
	clearInterval(tick);
	if (maxMsTimer) clearTimeout(maxMsTimer);
	// No alternate screen: TUI.stop() parks the cursor after the last frame,
	// so the session's final view stays in the terminal scrollback.
	tui.stop();
	return 0;
}
