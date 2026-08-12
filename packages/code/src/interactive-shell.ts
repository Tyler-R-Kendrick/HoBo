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
import { HOBO_LOGO_TUI } from "./_generated/hobo-logo-tui.js";
import {
	EMPTY_TURN,
	reduceTurn,
	renderTurn as renderTurnView,
} from "./agui.js";
import { inspectCost } from "./cost.js";
import { buildTasksSurface } from "./grok-build-parity.js";
import { hermeticEnvSummary, inspectHermeticEnv } from "./hermetic-env.js";
import {
	type AccentName,
	fitCells,
	INK,
	inkCard,
	statusStripe,
	titleCard,
} from "./rubberhose.js";
import type {
	EngineTurnEvent,
	EngineTurnResult,
	SandboxChange,
} from "./shell-engine.js";
import { createShellInput } from "./shell-input.js";
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

/** A promotion awaiting explicit approval — the sole audited mutation path. */
export interface PendingApproval {
	readonly runId: string;
	readonly sandboxRoot: string;
	readonly changes: readonly SandboxChange[];
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
	/**
	 * Promotion approval gate (ADR-0139): engine edits live in a mediated
	 * sandbox and only reach the canonical tree through an explicit human
	 * approval. Non-null means the shell is waiting on y/n.
	 */
	readonly pendingApproval: PendingApproval | null;
	/** Live session token/cost accounting shown in the footer and /cost. */
	readonly usageLabel: string;
	/** Rows the Editor occupies, so the transcript can size around it. */
	readonly inputRows: number;
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
		name: "ide",
		description: "Open your editor on this session (neovim by default)",
		argv: ["edit"],
	},
	{
		name: "agent",
		description: "Agent-native readiness (auth, protocols, unattended)",
		argv: ["agent"],
	},
	{ name: "config", description: "Setup / stack inventory", argv: ["config"] },
	{ name: "cost", description: "$0 path + budget + savings", argv: ["cost"] },
	{
		name: "dev",
		description: "Run this Bindle on a local Yard + Evidence",
		argv: ["dev"],
	},
	{
		name: "hobo",
		description: "Run Bindle, Yard, and control-plane commands",
		argv: ["hobo"],
	},
	{ name: "status", description: "Session / agent panes", argv: ["status"] },
	{
		name: "sessions",
		description: "Resident tmux sessions",
		argv: ["session", "list"],
	},
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
		name: "attach",
		description: "tmux/mosh/Tailscale-shaped attach",
		argv: ["attach"],
	},
	{ name: "clear", description: "Clear chat transcript", action: "clear" },
	{
		name: "template",
		description: "Search/render HoBo patterns with zero LLM tokens",
		argv: ["template"],
	},
	{ name: "quit", description: "Exit hobo-code shell", action: "quit" },
] as const;

/**
 * Product identity claim. Shown in `/about` and `/help` only — never printed
 * on frames or replies (branding in the answer channel is noise).
 */
// public-contract: shell identity shown by help and about consumers.
export const PRODUCT_NOT_PI = "hobo-code · HoBo shell (not stock Pi Agent)";

/** Footer engine label until a real completion engine is wired (Slice 2). */
// public-contract: stable engine status text rendered by shell clients.
export const ENGINE_NONE_LABEL = "engine:none · dispatch-only";

/** Approval-gate affordance text — y promotes, n/Esc keeps work sandboxed. */
// public-contract: stable approval affordance shared by shell renderers.
export const APPROVAL_PROMPT = "y promote · n keep sandboxed";

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
let wrapCache = new WeakMap<
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

/** Drop every cached wrap — used when the renderer asks for a clean slate. */
export function clearWrapCache(): void {
	wrapCache = new WeakMap();
}

/** Test probe: is this message currently cached? Makes invalidation observable. */
export function peekWrapCache(
	message: ShellMessage,
): { readonly width: number; readonly lines: readonly string[] } | undefined {
	return wrapCache.get(message);
}

function wrapMessage(m: ShellMessage, width: number): readonly string[] {
	const hit = wrapCache.get(m);
	if (hit && hit.width === width) return hit.lines;
	// Pre-rendered art (the title card) is already fitted — wrapping it would
	// shred the frame. Detect it by its ink and pass it through untouched.
	const lines = m.text.includes(INK.topLeft)
		? m.text.split("\n").map((l) => fitCells(l, width))
		: wrapText(messagePrefix(m.role) + m.text, width);
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

function slashItemForInput(text: string): ShellSlashItem | undefined {
	const [name = "", ...args] = text.slice(1).trim().split(/\s+/);
	const item = DEFAULT_SLASH_ITEMS.find(
		(candidate) => candidate.name === name.toLowerCase(),
	);
	if (!item?.argv || args.length === 0) return item;
	return item.name === "sessions"
		? { ...item, argv: ["session", ...args] }
		: { ...item, argv: [...item.argv, ...args] };
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
							titleCard(HOBO_LOGO_TUI, {
								width: Math.min(width - 3, 70),
								subtitle: "a coding harness that rides the rails",
								flat: true,
							}).join("\n"),
							"",
							"Type to talk to Bo. / for commands. Tab for tasks and status.",
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
		pendingApproval: null,
		usageLabel: "",
		inputRows: 1,
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
/**
 * Bo, reduced to a single animated cell for the status stripe.
 *
 * The mascot's full sprite belongs to the entry title card — a moment, not a
 * permanent 12-row header. Here he is a bindlebug that squashes and stretches
 * only while a turn is in flight (Fleischer bounce, honoring reduced motion).
 */
const BO_MARKERS = ["(••)", "(‥)", "(••)", "(°°)"] as const;

export function boMarker(state: InteractiveShellState): string {
	if (state.agentState !== "working") return "(••)";
	if (state.reducedMotion) return "(••)";
	const tick = Math.floor(state.tickMs / BO_IDLE_TICK_MS);
	return BO_MARKERS[tick % BO_MARKERS.length]!;
}

/** The one-line strap: who is thinking, on what, at what cost. */
export function statusSegments(state: InteractiveShellState): string[] {
	return [
		`${boMarker(state)} hobo-code`,
		state.modelLabel,
		state.usageLabel || state.costLabel,
		state.agentState,
	];
}

/**
 * Render one frame.
 *
 * Layout (site/DESIGN.md — ink and paper, never flat SaaS chrome):
 *
 *   ┏━ chat ━━━━━━━━━━━━━━━━━━┓     ← transcript is the surface, not a slit
 *   ┃ …                       ┃▒       (ink outline + hard sticker shadow)
 *   ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛▒
 *    ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
 *   ❯ prompt█
 *   [ (••) hobo-code · model · cost · state ]   ← one inverse strap
 *
 * Every line is exactly `width` cells and the line count is stable for a
 * given (width, height), so the differential renderer sees no churn.
 */
export function renderShellFrame(state: InteractiveShellState): string {
	const w = state.width;
	const lines: string[] = [];

	// Bottom furniture: the status strap. The prompt is a real Editor
	// component rendered beneath this frame, and it reports its own height.
	const bodyRows = Math.max(3, state.height - 1 - state.inputRows);
	// Card overhead: top rule + bottom rule + shadow row.
	const inner = Math.max(1, bodyRows - 3);
	const innerWidth = w - 3;

	let cardTitle: string;
	let accent: AccentName = "none";
	let body: string[] = [];

	if (state.pendingApproval) {
		// The gate owns the frame; vermillion is reserved for exactly this
		// class of moment (a decision that can change the real tree).
		cardTitle = `promote ${state.pendingApproval.runId}?`;
		accent = "spark";
		const { changes, sandboxRoot } = state.pendingApproval;
		body.push("The canonical tree is untouched until you say yes.");
		body.push("");
		const room = Math.max(1, inner - 6);
		for (const change of changes.slice(0, room)) {
			body.push(`  ${change.status.padEnd(2)} ${change.path}`);
		}
		if (changes.length > room) {
			body.push(`  … ${changes.length - room} more file(s)`);
		}
		if (changes.length === 0) {
			body.push("  (no file changes detected in the sandbox)");
		}
		body.push("");
		body.push(`  ${APPROVAL_PROMPT}`);
		body.push(`  squash-only, gated, audited · ${sandboxRoot}`);
	} else if (state.slashOpen) {
		cardTitle = "commands";
		const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
		if (items.length === 0) {
			body.push("  (nothing matches that)");
		} else {
			const visible = Math.max(1, inner - 1);
			const start = clamp(
				state.slashIndex - Math.floor((visible - 1) / 2),
				0,
				Math.max(0, items.length - visible),
			);
			const end = Math.min(items.length, start + visible);
			for (let i = start; i < end; i += 1) {
				const item = items[i]!;
				const mark = i === state.slashIndex ? "▸" : " ";
				body.push(`${mark} /${item.name.padEnd(9)} ${item.description}`);
			}
			if (items.length > visible) {
				body.push(`  ${start + 1}-${end} of ${items.length}`);
			}
		}
	} else if (state.focus === "tasks") {
		cardTitle = "tasks";
		body = wrapText(state.tasksPlain, innerWidth);
	} else if (state.focus === "status") {
		cardTitle = "status";
		body = wrapText(state.statusPlain, innerWidth);
	} else {
		cardTitle = "chat";
		const transcript: string[] = [];
		for (const m of state.messages) {
			for (const row of wrapMessage(m, innerWidth)) transcript.push(row);
			transcript.push("");
		}
		const scroll = clamp(
			state.chatScroll,
			0,
			Math.max(0, transcript.length - inner),
		);
		const end = transcript.length - scroll;
		body = transcript.slice(Math.max(0, end - inner), end);
		if (scroll > 0) cardTitle = `chat ↑${scroll}`;
	}

	while (body.length < inner) body.push("");
	lines.push(
		...inkCard(body.slice(0, inner), {
			width: w,
			title: cardTitle,
			accent,
		}),
	);

	lines.push(statusStripe(statusSegments(state), w));

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
	readonly approve?: PendingApproval;
	readonly decline?: PendingApproval;
} {
	// Ctrl+C
	if (key === "\u0003") {
		return { state, quit: true };
	}
	// The approval gate is modal: while it is up, no key may reach the input
	// line or a verb. Only an explicit y/n (Esc/Enter decline) resolves it, so
	// a promotion can never be triggered by a stray keystroke.
	if (state.pendingApproval) {
		const pending = state.pendingApproval;
		const cleared = { ...state, pendingApproval: null, chatScroll: 0 };
		if (key === "y" || key === "Y") {
			return { state: cleared, approve: pending };
		}
		if (
			key === "n" ||
			key === "N" ||
			key === "\u001b" ||
			key === "\r" ||
			key === "\n"
		) {
			return { state: cleared, decline: pending };
		}
		return { state };
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
			const item = slashItemForInput(text);
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

/** Tab cycles the transcript pane. */
export function cycleFocus(
	state: InteractiveShellState,
): InteractiveShellState {
	const order: ShellFocus[] = ["chat", "tasks", "status"];
	const i = order.indexOf(state.focus === "slash" ? "chat" : state.focus);
	return { ...state, focus: order[(i + 1) % order.length]! };
}

/** Positive scrolls back through the transcript, negative returns toward now. */
export function scrollChat(
	state: InteractiveShellState,
	delta: number,
): InteractiveShellState {
	return { ...state, chatScroll: Math.max(0, state.chatScroll + delta) };
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

/**
 * Replace the trailing assistant message (streaming turns grow it in place).
 * Appends when the last message is not an assistant message.
 */
export function replaceLastAssistant(
	state: InteractiveShellState,
	text: string,
	agentState: ShellAgentState = "working",
): InteractiveShellState {
	const last = state.messages[state.messages.length - 1];
	if (!last || last.role !== "assistant") {
		const appended = appendAssistant(state, text, agentState);
		return appended;
	}
	return {
		...state,
		agentState,
		chatScroll: 0,
		messages: [
			...state.messages.slice(0, -1),
			{ role: "assistant", text, at: last.at },
		],
	};
}

// ── TTY driver ───────────────────────────────────────────────────────────

export interface ShellHost {
	/** Run a product CLI surface; return human text. */
	readonly runVerb: (argv: readonly string[]) => Promise<string>;
	/** Handle a user chat prompt; return assistant text. */
	readonly complete: (prompt: string) => Promise<string>;
	/**
	 * Deterministic create / run / debug turns. When this returns text, the
	 * shell must not send the prompt to the completion engine.
	 */
	readonly tryWorkspaceAction?: (prompt: string) => Promise<string | null>;
	/**
	 * Streaming turn (Slice 2, engine wired): events render live; the promise
	 * resolves with the final turn result. When absent, `complete` is used.
	 */
	readonly streamTurn?: (
		prompt: string,
		onEvent: (event: EngineTurnEvent) => void,
	) => Promise<EngineTurnResult>;
	/** Cancel the in-flight streaming turn (Esc). */
	readonly cancelTurn?: () => Promise<void>;
	/** Footer label for the wired engine, e.g. "pi · anthropic/claude-…". */
	readonly engineLabel?: string;
	/**
	 * Raise the promotion approval gate after an editing turn. Returning null
	 * means nothing changed in the sandbox, so no gate is shown.
	 */
	readonly pendingApprovalFor?: (
		result: EngineTurnResult,
	) => Promise<PendingApproval | null>;
	/** Run the audited, squash-only promote for an approved run. */
	readonly promote?: (approval: PendingApproval) => Promise<string>;
	/** Live session usage label for the footer / `/cost`. */
	readonly usageLabel?: () => string;
	/** Extra `/about` lines describing the live engine + sandbox. */
	readonly aboutLines?: readonly string[];
	/** Release long-lived local dev sessions owned by this shell. */
	readonly dispose?: () => Promise<void>;
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
	if (options.host.engineLabel) {
		state = { ...state, modelLabel: options.host.engineLabel };
	}

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
					"Commands: type / and pick — /dev /hobo /ide /config /tasks /status /about /quit",
					"Resident control: /sessions <args> (plain /sessions lists).",
					"HoBo control plane: /hobo <args> (for example /hobo yard status).",
					"Chat: type a prompt and Enter — it is queued as a dispatch task (/about).",
					"Keys: Tab panes · ↑/↓ pick + scroll · PgUp/PgDn scroll · Ctrl+C quit",
				].join("\n"),
			);
			return;
		}
		if (item.action === "about") {
			const engineLines = options.host.aboutLines ?? [
				"Prompts queue dispatch tasks; no completion engine is wired",
				"(footer shows engine:none). Pi TUI remains an opt-in escape hatch",
				"via `hobo-code --pi` — never the product UI.",
			];
			state = appendProduct(
				state,
				[
					PRODUCT_NOT_PI,
					"This shell is HoBo product chrome over the hobo-code CLI.",
					...engineLines,
				].join("\n"),
			);
			return;
		}
		if (item.argv) {
			state = { ...state, agentState: "working" };
			tui.requestRender();
			try {
				const text = await options.host.runVerb(item.argv);
				// /cost must reflect what this session actually spent, not just
				// the configured budget — otherwise it is a brochure.
				const live =
					item.name === "cost" && state.usageLabel
						? `\n\nThis session (provider-reported): ${state.usageLabel}`
						: "";
				state = appendProduct(state, text.slice(0, 4000) + live);
			} catch (err) {
				state = appendProduct(
					state,
					`/${item.name} failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			state = { ...state, agentState: "idle" };
		}
	};

	let turnInFlight = false;

	const onSubmit = async (prompt: string) => {
		if (options.host.tryWorkspaceAction) {
			const handled = await options.host.tryWorkspaceAction(prompt);
			if (handled !== null) {
				if (quit) return;
				state = appendAssistant(state, handled.slice(0, 8000), "idle");
				return;
			}
		}
		if (options.host.streamTurn) {
			turnInFlight = true;
			let view = EMPTY_TURN;
			const startedAt = Date.now();
			// Paint an assistant entry the instant the turn starts. A local
			// model can take many seconds to produce its first token, and an
			// empty screen for that long reads as a hang.
			state = appendAssistant(state, "…", "working");
			tui.requestRender();
			const paint = () => {
				const elapsed = Math.round((Date.now() - startedAt) / 1000);
				const body = renderTurnView(view);
				// Until the first token lands, keep a visibly ticking counter:
				// a local model can take many seconds, and silence reads as a hang.
				const waiting =
					view.text.length === 0 ? `${body || "…"} ${elapsed}s` : body;
				state = replaceLastAssistant(state, waiting, "working");
				tui.requestRender();
			};
			// Tick while waiting so the elapsed counter proves it is alive even
			// before a single token has arrived.
			const heartbeat = setInterval(() => {
				if (!quit && view.text.length === 0) paint();
			}, 1000);
			heartbeat.unref?.();
			try {
				const result = await options.host.streamTurn(prompt, (event) => {
					if (quit) return;
					view = reduceTurn(view, event);
					paint();
				});
				if (quit) return;
				const finalBody = renderTurnView(view) || result.text;
				const tail = result.aborted
					? "(cancelled)"
					: result.ok
						? ""
						: `(failed: ${result.error ?? "unknown"})`;
				state = replaceLastAssistant(
					state,
					`${finalBody || "(no reply)"}${tail ? `\n${tail}` : ""}`.slice(
						0,
						8000,
					),
					result.ok || result.aborted ? "idle" : "blocked",
				);
				refreshUsage();
				if (result.ok && !result.aborted && options.host.pendingApprovalFor) {
					const approval = await options.host.pendingApprovalFor(result);
					if (approval && !quit) {
						state = { ...state, pendingApproval: approval, chatScroll: 0 };
					}
				}
			} catch (err) {
				if (quit) return;
				state = replaceLastAssistant(
					state,
					`Could not complete: ${err instanceof Error ? err.message : String(err)}`,
					"blocked",
				);
			} finally {
				clearInterval(heartbeat);
				turnInFlight = false;
			}
			return;
		}
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
		} finally {
			turnInFlight = false;
		}
	};

	const refreshUsage = () => {
		const label = options.host.usageLabel?.();
		if (label !== undefined && label !== state.usageLabel) {
			state = { ...state, usageLabel: label };
		}
	};

	const resolveApproval = async (
		approval: PendingApproval,
		approved: boolean,
	) => {
		if (!approved) {
			state = appendProduct(
				state,
				[
					`Kept sandboxed — run ${approval.runId} was not promoted.`,
					`Sandbox: ${approval.sandboxRoot}`,
					`Promote later (audited): hobo-code promote --run ${approval.runId}`,
				].join("\n"),
			);
			return;
		}
		state = { ...state, agentState: "working" };
		tui.requestRender();
		try {
			const text = options.host.promote
				? await options.host.promote(approval)
				: `no promote handler wired for run ${approval.runId}`;
			state = appendProduct(state, text.slice(0, 4000));
		} catch (err) {
			state = appendProduct(
				state,
				`Promotion failed for ${approval.runId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		state = { ...state, agentState: "idle" };
	};

	/** A completed line from the Editor: either a command or a prompt. */
	const handleSubmitText = (text: string) => {
		if (quit) return;
		if (text.startsWith("/")) {
			const item = slashItemForInput(text);
			if (item) {
				void applySlash(item)
					.then(() => {
						if (!quit) tui.requestRender();
					})
					.catch(() => {});
				return;
			}
			state = appendProduct(
				state,
				`Unknown command "${text}". Type / to see what exists.`,
			);
			tui.requestRender();
			return;
		}
		if (turnInFlight) {
			state = appendProduct(
				state,
				"Still working on the previous turn — Esc cancels it.",
			);
			tui.requestRender();
			return;
		}
		state = {
			...state,
			chatScroll: 0,
			messages: [...state.messages, { role: "user", text, at: Date.now() }],
			agentState: "working",
		};
		tui.requestRender();
		void onSubmit(text)
			.then(() => {
				if (!quit) tui.requestRender();
			})
			.catch(() => {});
	};

	const handleKey = (sequence: string) => {
		if (quit) return;
		// Esc cancels an in-flight streaming turn before normal key reduction.
		if (
			sequence === "\u001b" &&
			turnInFlight &&
			options.host.cancelTurn &&
			!state.slashOpen
		) {
			void options.host.cancelTurn().catch(() => {
				// A failed cancel is not worth crashing a session over — the
				// turn simply keeps running and Ctrl+C still exits cleanly.
			});
			return;
		}
		const result = reduceShellKey(state, sequence);
		state = result.state;
		if (result.quit) {
			requestQuit();
			return;
		}
		if (result.approve || result.decline) {
			const approval = (result.approve ?? result.decline)!;
			void resolveApproval(approval, Boolean(result.approve))
				.then(() => {
					if (!quit) tui.requestRender();
				})
				.catch(() => {});
		} else if (result.slash) {
			void applySlash(result.slash)
				.then(() => {
					if (!quit) tui.requestRender();
				})
				.catch(() => {});
		} else if (result.submit) {
			// One turn at a time: two overlapping streams would interleave into
			// the same transcript entry and leave cancel pointing at the wrong
			// request.
			if (turnInFlight) {
				state = appendProduct(
					state,
					"Still working on the previous turn — Esc cancels it.",
				);
			} else {
				void onSubmit(result.submit)
					.then(() => {
						if (!quit) tui.requestRender();
					})
					.catch(() => {});
			}
		}
		tui.requestRender();
	};

	const input = createShellInput({
		tui,
		commands: DEFAULT_SLASH_ITEMS.map((i) => ({
			name: i.name,
			description: i.description,
		})),
		onSubmit: (text) => handleSubmitText(text),
	});

	const view: Component = {
		render(width: number): string[] {
			const w = clamp(width, 40, 200);
			const h = clamp(terminal.rows, 12, 80);
			// The Editor grows with wrapped input; the transcript gives up rows
			// to match so the frame never overflows the screen.
			const rows = input.height(w);
			if (w !== state.width || h !== state.height || rows !== state.inputRows) {
				state = { ...state, width: w, height: h, inputRows: rows };
			}
			return renderShellFrame(state).split("\n");
		},
		invalidate(): void {
			// TUI calls this when it needs a from-scratch re-render (theme or
			// size change). Cached wraps are keyed by (message, width), but an
			// explicit invalidate must not be able to serve stale lines.
			clearWrapCache();
		},
		handleInput(data: string): void {
			handleKey(data);
		},
	};

	tui.addChild(view);
	tui.addChild(input.editor);
	// The Editor owns editing keys (backspace, word kill, undo, cursor,
	// history). The shell claims only true globals, and only when the editor
	// would not otherwise need them.
	tui.addInputListener((data) => {
		if (quit) return undefined;
		if (data === "\u0003") {
			requestQuit();
			return { consume: true };
		}
		if (state.pendingApproval) {
			// Modal: the gate must see every key so a mutation cannot be
			// approved by something falling through to the editor.
			handleKey(data);
			return { consume: true };
		}
		if (data === "\u001b") {
			if (turnInFlight && options.host.cancelTurn) {
				void options.host.cancelTurn().catch(() => {});
				return { consume: true };
			}
			// Esc clears a half-typed line instead of doing nothing at all.
			if (input.text().length > 0) {
				input.clear();
				tui.requestRender();
				return { consume: true };
			}
			return { consume: true };
		}
		if (data === "\t") {
			state = cycleFocus(state);
			tui.requestRender();
			return { consume: true };
		}
		if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
			state = scrollChat(state, matchesKey(data, "pageUp") ? 5 : -5);
			tui.requestRender();
			return { consume: true };
		}
		// Scroll the transcript with the arrows only when the editor is empty,
		// so ↑ still means "previous prompt" while composing.
		if (
			input.text().length === 0 &&
			(matchesKey(data, "up") || matchesKey(data, "down"))
		) {
			state = scrollChat(state, matchesKey(data, "up") ? 1 : -1);
			tui.requestRender();
			return { consume: true };
		}
		return undefined;
	});
	tui.setFocus(input.editor);
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
		// Drain any in-flight turn (bounded), then let the final render flush.
		const drainDeadline = Date.now() + 2000;
		while (turnInFlight && Date.now() < drainDeadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		await new Promise((resolve) => setTimeout(resolve, 40));
		requestQuit();
	}

	// Signals must restore the terminal too: closing the emulator or `kill`
	// otherwise leaves raw mode, a hidden cursor and bracketed paste enabled.
	const onSignal = () => requestQuit();
	process.once("SIGTERM", onSignal);
	process.once("SIGHUP", onSignal);

	try {
		await done;
	} finally {
		clearInterval(tick);
		if (maxMsTimer) clearTimeout(maxMsTimer);
		process.removeListener("SIGTERM", onSignal);
		process.removeListener("SIGHUP", onSignal);
		// No alternate screen: TUI.stop() parks the cursor after the last frame,
		// so the session's final view stays in the terminal scrollback. This
		// runs even if the driver threw — a CLI that can strand a terminal in
		// raw mode is not shippable.
		tui.stop();
	}
	return 0;
}
