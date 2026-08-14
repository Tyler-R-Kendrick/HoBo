/**
 * HoBo-owned interactive product shell for bare `hobo-code` TTY.
 *
 * Architecture (ADR note in ARCHITECTURE.md):
 * - **This module owns chrome** (header/Bo, chat, tasks, slash, footer).
 * - Chrome is a retained semantic TUI tree (`tui-tree` + React-style
 *   `tui-components.tsx`). `pi-tui` is only the differential framebuffer.
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
import {
	buildTasksSurface,
	renderTasksBoardText,
} from "./grok-build-parity.js";

import { hermeticEnvSummary, inspectHermeticEnv } from "./hermetic-env.js";
import { type AccentName, centreBlock } from "./rubberhose.js";
import {
	assembleSessionResources,
	formatSessionResources,
} from "./session-resources.js";
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
import {
	describeAuthedStationSession,
	formatStationStatusBlock,
	formatStationStrap,
} from "./station-session.js";
import {
	formatSidecarStrap,
	type StationSidecars,
	sidecarsEnabled,
	startStationSidecars,
} from "./station-sidecars.js";
import { buildMultiplexerStatus, createPane, renderStatusText } from "./tui.js";
import {
	BROADCAST_CHROME_ROWS,
	BROADCAST_INNER_INSET,
} from "./tui-broadcast.js";
import {
	ApprovalDialog,
	BtwAside,
	ChatTranscript,
	InkTable,
	ShellChrome,
	SlashPalette,
	TextPane,
} from "./tui-components.js";
import {
	answerBtw,
	type BtwSession,
	captureBtwSnapshot,
	isBtwDismiss,
	matchBtwInput,
	parentDelta,
	refreshBtwSnapshot,
} from "./btw.js";
import {
	formatShellCloseout,
	newChatSessionId,
	saveChatSession,
} from "./chat-sessions.js";
import { compactTranscript } from "./compact.js";
import {
	openSessionEvidencePort,
	recordSessionDecision,
	writeCurrentSessionContext,
} from "./session-evidence.js";
import { clearWrapCache, wrapMessage } from "./tui-layout.js";
import { renderTuiTree } from "./tui-render.js";
import { h, type TuiNode } from "./tui-tree.js";
import { preferNamedEndpoint } from "./occupancy-endpoints.js";
import type { InkTableRow } from "./tui-layout.js";
import {
	cycleInSessionWindow,
	emptyInSessionPanes,
	ensureInSessionPanes,
	type InSessionPanes,
	isProductPrompt,
	pickSendWindow,
	refreshInSessionPanes,
} from "./in-session-panes.js";
import { tmuxRunner } from "./mux.js";
import { matchWorkspaceAction } from "./workspace-actions.js";

// ── Types ────────────────────────────────────────────────────────────────

export type ShellFocus =
	| "chat"
	| "panes"
	| "tasks"
	| "status"
	| "resources"
	| "slash"
	| "btw";

export const SHELL_FOCUS_ORDER: readonly ShellFocus[] = [
	"chat",
	"panes",
	"tasks",
	"status",
	"resources",
];

export type ShellAgentState = "idle" | "working" | "blocked" | "done";

export interface ShellMessage {
	readonly role: "system" | "user" | "assistant" | "product";
	readonly text: string;
	readonly at: number;
}

export interface ShellSlashItem {
	readonly name: string;
	readonly description: string;
	/** Extra names that resolve to this item (`/templates` → `/template`). */
	readonly aliases?: readonly string[];
	/** When set, shell invokes this CLI argv via the host callback. */
	readonly argv?: readonly string[];
	/** Built-in action id when not a CLI verb. */
	readonly action?:
		| "help"
		| "about"
		| "clear"
		| "quit"
		| "guide-hint"
		| "btw"
		| "resume"
		| "compact"
		| "panes";
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
	/** Welcome + occupancy endpoints as a two-column ink table. */
	readonly welcomeTable: readonly InkTableRow[];
	readonly agentState: ShellAgentState;
	readonly slashOpen: boolean;
	readonly slashFilter: string;
	readonly slashIndex: number;
	/** Lines scrolled up from the bottom of the chat / btw transcript. */
	readonly chatScroll: number;
	/** Lines scrolled down from the top of tasks / status / resources / approval. */
	readonly paneScroll: number;
	/**
	 * Promotion approval gate (ADR-0139): engine edits live in a mediated
	 * sandbox and only reach the canonical tree through an explicit human
	 * approval. Non-null means the shell is waiting on y/n.
	 */
	readonly pendingApproval: PendingApproval | null;
	/** Temporary side-chat borrowed from this moment. Null when dismissed. */
	readonly btw: BtwSession | null;
	/** Live session token/cost accounting shown in the footer and /cost. */
	readonly usageLabel: string;
	/** Rows the Editor occupies, so the transcript can size around it. */
	readonly inputRows: number;
	readonly statusPlain: string;
	readonly tasksPlain: string;
	readonly resourcesPlain: string;
	/** Live tmux agent panes captured into this TTY. Null until seated. */
	readonly livePanes: InSessionPanes | null;
	readonly footerHints: string;
	readonly modelLabel: string;
	readonly costLabel: string;
	readonly hermeticLabel: string;
	/** Logged-in Station chip (`station:local` or `auth:out`). */
	readonly stationLabel: string;
	/** Occupancy environment chip (`env:local-dev`). Empty when logged out. */
	readonly envLabel: string;
	/** Occupied Station sidecar chips (`dash:host:port`). */
	readonly sidecarChips: readonly string[];
	readonly productTitle: string;
	/** Hard product identity — must never be stock Pi chrome. */
	readonly engineLabel: "hobo-shell";
	/** Durable interactive-chat id. Null until the first persistable turn. */
	readonly sessionId: string | null;
	readonly hoboHome: string;
	readonly projectDir: string;
	/** Full journal when the working pane has been compacted. */
	readonly journal: readonly ShellMessage[] | null;
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
		name: "panes",
		description: "In-session agent CLIs (Codex, Claude, …)",
		action: "panes",
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
		name: "resources",
		description: "Session topology + real endpoints",
		argv: ["resources"],
	},
	{
		name: "history",
		description: "Station command search",
		argv: ["history"],
	},
	{
		name: "alias",
		description: "Station aliases + env",
		argv: ["alias"],
	},
	{
		name: "agents",
		description: "Register coding harnesses (init / list / status)",
		argv: ["agents"],
	},
	{
		name: "dashboard",
		description: "Local Aspire SPA + OTel + start/stop",
		argv: ["dashboard"],
	},
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
		aliases: ["templates"],
		description: "List / search / render HoBo patterns (zero LLM)",
		argv: ["template"],
	},
	{
		name: "review",
		description:
			"Durable review session (coverage, threads, exact-effect publish)",
		argv: ["review"],
	},
	{
		name: "btw",
		description: "Temporary side-chat about this moment",
		action: "btw",
	},
	{
		name: "resume",
		description: "This chat id + how to reopen it later",
		action: "resume",
	},
	{
		name: "compact",
		description: "Shrink working context; keep the durable journal",
		action: "compact",
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

export { clearWrapCache, peekWrapCache } from "./tui-layout.js";

function slashNames(item: ShellSlashItem): readonly string[] {
	return item.aliases ? [item.name, ...item.aliases] : [item.name];
}

export function filterSlash(
	items: readonly ShellSlashItem[],
	filter: string,
): ShellSlashItem[] {
	const f = filter.trim().toLowerCase().replace(/^\//, "");
	if (!f) return [...items];
	return items.filter((item) => {
		const names = slashNames(item);
		return (
			names.some(
				(name) => name.includes(f) || f.startsWith(name) || name.startsWith(f),
			) || item.description.toLowerCase().includes(f)
		);
	});
}

function slashItemByName(name: string): ShellSlashItem | undefined {
	const key = name.toLowerCase();
	return DEFAULT_SLASH_ITEMS.find((candidate) =>
		slashNames(candidate).includes(key),
	);
}

/** Bare `/template` (and `/templates`) lists; extra words search or subcommand. */
export function resolveSlashArgv(
	item: ShellSlashItem,
	extraArgs: readonly string[] = [],
): readonly string[] | undefined {
	if (!item.argv) return undefined;
	if (item.name === "sessions") {
		return extraArgs.length > 0 ? ["session", ...extraArgs] : item.argv;
	}
	if (item.name === "template") {
		return extraArgs.length > 0
			? ["template", ...extraArgs]
			: ["template", "list"];
	}
	return extraArgs.length > 0 ? [...item.argv, ...extraArgs] : item.argv;
}

export function slashItemForInput(text: string): ShellSlashItem | undefined {
	const [name = "", ...args] = text.slice(1).trim().split(/\s+/);
	const item = slashItemByName(name);
	if (!item) return undefined;
	if (item.action === "btw") return { ...item, argv: args };
	if (item.action === "compact") return { ...item, argv: args };
	if (item.action === "panes") return item;
	const argv = resolveSlashArgv(item, args);
	return argv ? { ...item, argv } : item;
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

export function buildWelcomeTable(occupancy?: {
	readonly dashboardUrl?: string;
	readonly evidenceUrl?: string;
}): InkTableRow[] {
	const rows: InkTableRow[] = [
		{ label: "talk", value: "Type+Enter · seated Codex/Claude writes app" },
		{ label: "patterns", value: "/templates lists patterns" },
		{ label: "focus", value: "Tab · panes / tasks / status / resources" },
	];
	if (occupancy?.dashboardUrl) {
		rows.push({
			label: "dashboard",
			value: preferNamedEndpoint(occupancy.dashboardUrl, "dashboard"),
		});
	}
	if (occupancy?.evidenceUrl) {
		rows.push({
			label: "evidence",
			value: preferNamedEndpoint(occupancy.evidenceUrl, "evidence"),
		});
	}
	return rows;
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
		readonly sessionId?: string;
		readonly messages?: readonly ShellMessage[];
		readonly journal?: readonly ShellMessage[];
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
	const station = describeAuthedStationSession({ hoboHome, env });
	const stationChips = formatStationStrap(station);

	const panes = [
		createPane("coord", "idle", ""),
		createPane(
			"station",
			station.loggedIn ? "done" : "blocked",
			station.loggedIn ? station.displayName : "login",
		),
		createPane(
			"auth",
			station.loggedIn ? "done" : "idle",
			station.loggedIn
				? station.mode === "local"
					? ""
					: station.displayName
				: "login",
		),
	];
	const mux = buildMultiplexerStatus(panes, {
		remoteReady: true,
		theme: "herdr",
	});
	const statusPlain = [
		formatStationStatusBlock(station),
		renderStatusText(mux, { plain: true }),
	].join("\n");
	const tasks = buildTasksSurface({
		hoboHome,
		panes: mux.panes,
		evidence: openSessionEvidencePort(hoboHome),
	});
	const tasksPlain = renderTasksBoardText(tasks);
	const resourcesPlain = formatSessionResources(
		assembleSessionResources({
			hoboHome,
			env,
			projectDir: options.cwd ?? process.cwd(),
		}),
	);

	const projectDir = options.cwd ?? process.cwd();
	const welcome: ShellMessage[] =
		options.messages !== undefined
			? [...options.messages]
			: options.welcome === false
				? []
				: [
					{
						role: "product",
						text: [
							...centreBlock(
								HOBO_LOGO_TUI.split("\n").filter(
									(line) => line.trim().length > 0,
								),
								Math.min(width - BROADCAST_INNER_INSET, 70),
							),
							"",
							...centreBlock(
								["a coding harness that rides the rails"],
								Math.min(width - BROADCAST_INNER_INSET, 70),
							),
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
		welcomeTable:
			options.messages !== undefined || options.welcome === false
				? []
				: buildWelcomeTable(),
		agentState: "idle",
		slashOpen: false,
		slashFilter: "",
		slashIndex: 0,
		chatScroll: 0,
		paneScroll: 0,
		pendingApproval: null,
		btw: null,
		usageLabel: "",
		inputRows: 1,
		statusPlain,
		tasksPlain,
		resourcesPlain,
		livePanes: null,
		footerHints: "Tab focus · / slash · btw aside · ? help · Ctrl+C quit",
		modelLabel: ENGINE_NONE_LABEL,
		costLabel: `$${cost.budget.spendUsd.toFixed(2)}/$${cost.budget.capUsd.toFixed(2)} · ${cost.budget.routingPolicy}`,
		hermeticLabel: hermeticEnvSummary(hermetic).split("\n")[0] ?? "env",
		stationLabel: stationChips[0] ?? "auth:out",
		envLabel: stationChips[1] ?? "",
		sidecarChips: [],
		productTitle: "hobo-code",
		engineLabel: "hobo-shell",
		sessionId: options.sessionId ?? null,
		hoboHome,
		projectDir,
		journal: options.journal ?? null,
	};
}

function persistShellChat(
	state: InteractiveShellState,
	force = false,
): InteractiveShellState {
	if (
		!force &&
		!state.messages.some(
			(message) => message.role === "user" || message.role === "assistant",
		)
	) {
		return state;
	}
	const journal = state.journal ?? state.messages;
	const saved = saveChatSession(state.hoboHome, {
		...(state.sessionId !== null ? { id: state.sessionId } : {}),
		cwd: state.projectDir,
		messages: journal,
		...(state.journal
			? {
					workingMessages: state.messages.map((message) => ({
						role: message.role,
						text: message.text,
						at: message.at,
					})),
				}
			: {}),
		...(state.stationLabel ? { stationLabel: state.stationLabel } : {}),
		...(state.envLabel ? { envLabel: state.envLabel } : {}),
		...(state.modelLabel ? { modelLabel: state.modelLabel } : {}),
	});
	const next =
		state.sessionId === saved.id
			? state
			: { ...state, sessionId: saved.id };
	writeCurrentSessionContext(next.hoboHome, {
		sessionId: saved.id,
		cwd: next.projectDir,
		...(next.stationLabel ? { stationLabel: next.stationLabel } : {}),
		...(next.envLabel ? { envLabel: next.envLabel } : {}),
		...(next.modelLabel ? { modelLabel: next.modelLabel } : {}),
	});
	return next;
}

function appendWorking(
	state: InteractiveShellState,
	message: ShellMessage,
): InteractiveShellState {
	return {
		...state,
		messages: [...state.messages, message],
		journal: state.journal ? [...state.journal, message] : state.journal,
	};
}

export function applyCompact(
	state: InteractiveShellState,
	focus = "",
): InteractiveShellState {
	const journal = state.journal ?? state.messages;
	const plan = compactTranscript({
		messages: journal,
		...(focus.trim() ? { focus: focus.trim() } : {}),
		...(state.stationLabel ? { stationLabel: state.stationLabel } : {}),
		...(state.envLabel ? { envLabel: state.envLabel } : {}),
		...(state.sessionId !== null ? { sessionId: state.sessionId } : {}),
	});
	const next: InteractiveShellState = {
		...state,
		messages: plan.working.map((row) => ({
			role: row.role,
			text: row.text,
			at: row.at,
		})),
		journal: plan.journal.map((row) => ({
			role: row.role,
			text: row.text,
			at: row.at,
		})),
		input: "",
		slashOpen: false,
		slashFilter: "",
		slashIndex: 0,
		chatScroll: 0,
		focus: "chat",
		footerHints:
			plan.droppedCount > 0
				? "compact · journal intact · Esc/scroll still work"
				: state.footerHints,
	};
	return persistShellChat(next, true);
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
 * header (logo+Bo) · status line · body (chat|tasks|status|resources|slash) · input · footer.
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
	const modelChip =
		state.modelLabel === ENGINE_NONE_LABEL ? "engine:none" : state.modelLabel;
	return [
		`${boMarker(state)} hobo-code`,
		state.stationLabel,
		state.envLabel,
		...state.sidecarChips,
		modelChip,
		state.usageLabel || state.costLabel,
		state.agentState,
	];
}

/**
 * Render one frame.
 *
 * Layout (site/DESIGN.md — ink and paper, never flat SaaS chrome):
 *
 *     ▄▄▄████ chat ████▄▄▄         ← cartoon CRT / film bezel
 *   ▄█▀ ▪     ▪     ▪     ▪ ▀█▄
 *   █▌  …                      ▐█▒
 *   ▀█▄ ▪     ▪     ▪     ▪ ▄█▀▒
 *     ▀▀▀████████████████▀▀▀ ▒
 *      ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
 *   ❯ prompt█
 *   [ (••) hobo-code · model · cost · state ]   ← one inverse strap
 *
 * Every line is exactly `width` cells and the line count is stable for a
 * given (width, height), so the differential renderer sees no churn.
 */
function snapshotFromState(state: InteractiveShellState) {
	return captureBtwSnapshot({
		focus: state.focus,
		agentState: state.agentState,
		stationLabel: state.stationLabel,
		envLabel: state.envLabel,
		modelLabel: state.modelLabel,
		usageLabel: state.usageLabel,
		slashOpen: state.slashOpen,
		messages: state.messages,
		...(state.pendingApproval
			? {
					pendingApproval: {
						runId: state.pendingApproval.runId,
						changeCount: state.pendingApproval.changes.length,
					},
				}
			: {}),
	});
}

export function applyBtwPrompt(
	state: InteractiveShellState,
	question: string,
): InteractiveShellState {
	if (state.btw && (question.trim().length === 0 || isBtwDismiss(question))) {
		return {
			...state,
			btw: null,
			focus: "chat",
			input: "",
			slashOpen: false,
			slashFilter: "",
			footerHints: "Tab focus · / slash · btw aside · ? help · Ctrl+C quit",
		};
	}
	const snapshot = snapshotFromState(state);
	const prior = state.btw?.turns ?? [];
	const originMessageCount =
		state.btw?.originMessageCount ?? snapshot.messageCount;
	const now = Date.now();
	const asked = question.trim();
	const userTurns =
		asked.length === 0
			? prior
			: [...prior, { role: "user" as const, text: asked, at: now }];
	const answer = answerBtw(snapshot, asked, prior);
	return {
		...state,
		btw: {
			snapshot,
			turns: [...userTurns, { role: "assistant", text: answer, at: now + 1 }],
			originMessageCount,
		},
		focus: "btw",
		input: "",
		slashOpen: false,
		slashFilter: "",
		slashIndex: 0,
		chatScroll: 0,
		footerHints: "btw overlay · Esc dismisses · parent thread stays visible",
	};
}

function withLiveBtw(state: InteractiveShellState): InteractiveShellState {
	if (!state.btw) return state;
	return {
		...state,
		btw: refreshBtwSnapshot(state.btw, snapshotFromState(state)),
	};
}

function viewportRows(state: InteractiveShellState): number {
	const bodyRows = Math.max(3, state.height - 1 - state.inputRows);
	return Math.max(1, bodyRows - (BROADCAST_CHROME_ROWS + 1));
}

/** Retained semantic tree for the current frame (tests / evidence). */
export function buildShellTree(state: InteractiveShellState) {
	const inner = viewportRows(state);
	const innerWidth = state.width - BROADCAST_INNER_INSET;
	let title = "chat";
	let accent: AccentName = "none";
	let surface: TuiNode;

	if (state.pendingApproval) {
		title = `promote ${state.pendingApproval.runId}?`;
		accent = "spark";
		surface = ApprovalDialog({
			runId: state.pendingApproval.runId,
			sandboxRoot: state.pendingApproval.sandboxRoot,
			changes: state.pendingApproval.changes,
			prompt: APPROVAL_PROMPT,
			scroll: state.paneScroll,
		});
		if (state.paneScroll > 0) title = `promote ${state.pendingApproval.runId}? ↑${state.paneScroll}`;
	} else if (state.slashOpen) {
		title = "commands";
		const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
		surface = SlashPalette({
			items,
			selectedIndex: state.slashIndex,
		});
	} else if (state.focus === "panes") {
		const panes = state.livePanes;
		const current = panes?.windows[panes.focused];
		title = current
			? `pane ${current.name}${state.paneScroll > 0 ? ` ↑${state.paneScroll}` : ""}`
			: "panes";
		accent = "go";
		const body = panes
			? [
					panes.note,
					panes.windows
						.map((row, i) => (i === panes.focused ? `▸ ${row.name}` : `  ${row.name}`))
						.join("   "),
					"",
					panes.capture ||
						"(agent CLI is seated in this session — type a prompt and Enter to send it here)",
				].join("\n")
			: "no agent panes yet · install codex on PATH · tmux required";
		surface = TextPane({
			id: "agent-panes",
			text: body,
			scroll: state.paneScroll,
		});
	} else if (state.focus === "tasks") {
		title = state.paneScroll > 0 ? `tasks ↑${state.paneScroll}` : "tasks";
		surface = TextPane({
			id: "tasks-pane",
			text: state.tasksPlain,
			scroll: state.paneScroll,
		});
	} else if (state.focus === "status") {
		title = state.paneScroll > 0 ? `status ↑${state.paneScroll}` : "status";
		surface = TextPane({
			id: "status-pane",
			text: state.statusPlain,
			scroll: state.paneScroll,
		});
	} else if (state.focus === "resources") {
		title =
			state.paneScroll > 0 ? `resources ↑${state.paneScroll}` : "resources";
		surface = TextPane({
			id: "resources-pane",
			text: state.resourcesPlain,
			scroll: state.paneScroll,
		});
	} else {
		const transcript: string[] = [];
		for (const message of state.messages) {
			transcript.push(...wrapMessage(message, innerWidth));
			transcript.push("");
		}
		const scroll = clamp(
			state.chatScroll,
			0,
			Math.max(0, transcript.length - inner),
		);
		if (scroll > 0) title = `chat ↑${scroll}`;
		const lead = state.messages[0];
		const leadIsArt =
			lead?.role === "product" && /[█▄▀]/.test(lead.text);
		if (state.welcomeTable.length > 0 && leadIsArt) {
			surface = h(
				"box",
				{
					id: "chat-surface",
					role: "region",
					className: "chat-surface",
					scroll,
				},
				ChatTranscript({
					messages: [lead],
					width: innerWidth,
				}),
				InkTable({ id: "welcome-table", rows: state.welcomeTable }),
				ChatTranscript({
					messages: state.messages.slice(1),
					width: innerWidth,
				}),
			);
		} else if (state.welcomeTable.length > 0) {
			surface = h(
				"box",
				{
					id: "chat-surface",
					role: "region",
					className: "chat-surface",
					scroll,
				},
				InkTable({ id: "welcome-table", rows: state.welcomeTable }),
				ChatTranscript({
					messages: state.messages,
					width: innerWidth,
				}),
			);
		} else {
			surface = ChatTranscript({
				messages: state.messages,
				width: innerWidth,
				scroll,
			});
		}
	}

	const phase =
		state.reducedMotion || state.agentState !== "working"
			? 0
			: Math.floor(state.tickMs / BO_IDLE_TICK_MS);
	const live = state.btw ? snapshotFromState(state) : undefined;
	const overlay =
		state.btw && live
			? BtwAside({
					turns: state.btw.turns,
					scroll: state.chatScroll,
					...((live.lastAssistant ?? live.lastUser ?? live.lastProduct)
						? {
								parentLatest:
									live.lastAssistant ?? live.lastUser ?? live.lastProduct,
							}
						: {}),
					newFromParent: parentDelta({
						...state.btw,
						snapshot: live,
					}),
				})
			: undefined;
	return ShellChrome({
		title,
		accent,
		segments: statusSegments(state),
		viewportRows: inner,
		phase,
		...(overlay !== undefined ? { overlay } : {}),
		children: surface,
	});
}

export function renderShellFrame(state: InteractiveShellState): string {
	return renderTuiTree(buildShellTree(state), state.width);
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
	readonly toAgent?: { readonly agent: string; readonly text: string };
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
		if (matchesKey(key, "up") || matchesKey(key, "down")) {
			return {
				state: scrollFocused(
					state,
					matchesKey(key, "up") ? "up" : "down",
					1,
				),
			};
		}
		if (matchesKey(key, "pageUp") || matchesKey(key, "pageDown")) {
			const page = Math.max(3, viewportRows(state) - 1);
			return {
				state: scrollFocused(
					state,
					matchesKey(key, "pageUp") ? "up" : "down",
					page,
				),
			};
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
		if (state.btw) {
			return { state: applyBtwPrompt(state, "done") };
		}
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
	// Arrow up/down — slash palette, or scroll the focused scene
	if (matchesKey(key, "up") || matchesKey(key, "down")) {
		const dirUp = matchesKey(key, "up");
		if (state.slashOpen) {
			const count = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter).length;
			if (count === 0) return { state };
			const next = clamp(state.slashIndex + (dirUp ? -1 : 1), 0, count - 1);
			return { state: { ...state, slashIndex: next } };
		}
		if (state.focus === "chat" && state.input.length > 0) {
			return { state };
		}
		return {
			state: scrollFocused(state, dirUp ? "up" : "down", 1),
		};
	}
	// PgUp/PgDn — page the focused scene (slash jumps the palette)
	if (matchesKey(key, "pageUp") || matchesKey(key, "pageDown")) {
		const dirUp = matchesKey(key, "pageUp");
		if (state.slashOpen) {
			const count = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter).length;
			if (count === 0) return { state };
			const page = Math.max(3, viewportRows(state) - 1);
			const next = clamp(
				state.slashIndex + (dirUp ? -page : page),
				0,
				count - 1,
			);
			return { state: { ...state, slashIndex: next } };
		}
		const page = Math.max(3, viewportRows(state) - 1);
		return {
			state: scrollFocused(state, dirUp ? "up" : "down", page),
		};
	}
	// Tab — cycle focus
	if (key === "\t") {
		const order = SHELL_FOCUS_ORDER;
		const from = state.focus === "slash" || state.focus === "btw" ? "chat" : state.focus;
		const i = order.indexOf(from);
		const next = order[(i + 1) % order.length]!;
		return {
			state: {
				...state,
				focus: next,
				slashOpen: false,
				btw: null,
				paneScroll: 0,
				footerHints: `focus:${next} · Tab cycle · [ ] agents · ↑/↓ scroll · / slash · ? help`,
			},
		};
	}
	if (
		(key === "[" || key === "]") &&
		state.input.length === 0 &&
		!state.slashOpen &&
		state.livePanes &&
		state.livePanes.windows.length > 0
	) {
		return {
			state: {
				...state,
				livePanes: cycleInSessionWindow(
					state.livePanes,
					key === "]" ? 1 : -1,
				),
				focus: "panes",
				paneScroll: 0,
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
				"  btw <question> opens a temporary aside about this moment (Esc dismisses).",
				"  Tab cycles Chat → Panes → Tasks → Status → Resources.",
				"  [ and ] cycle agent CLIs (Codex, Claude) without leaving this TTY.",
				"  Coding prompts go to the focused agent pane, not Bo.",
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
			if (item.action === "btw") {
				const asked = matchBtwInput(state.input)?.question ?? "";
				return { state: applyBtwPrompt(state, asked) };
			}
			if (item.action === "compact") {
				const extra = state.input.trim().replace(/^\/?compact\s*/iu, "");
				return { state: applyCompact(state, extra) };
			}
			if (item.action === "panes") {
				return {
					state: {
						...state,
						slashOpen: false,
						slashFilter: "",
						slashIndex: 0,
						input: "",
						focus: "panes",
						paneScroll: 0,
					},
				};
			}
			const argv = resolveSlashArgv(item);
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
				slash: argv ? { ...item, argv } : item,
			};
		}
		const text = state.input.trim();
		if (!text) {
			if (state.btw) return { state: applyBtwPrompt(state, "") };
			return { state };
		}
		const aside = matchBtwInput(text);
		if (aside !== undefined || state.btw) {
			return {
				state: applyBtwPrompt(state, aside?.question ?? text),
			};
		}
		if (text.startsWith("/")) {
			const item = slashItemForInput(text);
			if (item?.action === "compact") {
				return {
					state: applyCompact(state, (item.argv ?? []).join(" ")),
				};
			}
			if (item?.action === "panes") {
				return {
					state: {
						...state,
						input: "",
						slashOpen: false,
						slashFilter: "",
						slashIndex: 0,
						focus: "panes",
						paneScroll: 0,
						chatScroll: 0,
					},
				};
			}
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
		const seated = state.livePanes
			? pickSendWindow(state.livePanes)
			: undefined;
		if (
			seated &&
			!isProductPrompt(text) &&
			matchWorkspaceAction(text) === undefined
		) {
			return {
				state: persistShellChat(
					appendWorking(
						{
							...state,
							input: "",
							chatScroll: 0,
							focus: "panes",
							agentState: "working",
						},
						{
							role: "user",
							text: `→ ${seated.name}: ${text}`,
							at: Date.now(),
						},
					),
				),
				toAgent: { agent: seated.name, text },
			};
		}
		return {
			state: persistShellChat(
				appendWorking(
					{ ...state, input: "", chatScroll: 0, agentState: "working" },
					{ role: "user", text, at: Date.now() },
				),
			),
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
	const order = SHELL_FOCUS_ORDER;
	const i = order.indexOf(
		state.focus === "slash" || state.focus === "btw" ? "chat" : state.focus,
	);
	return {
		...state,
		focus: order[(i + 1) % order.length]!,
		btw: null,
		paneScroll: 0,
	};
}

function isDocumentPane(state: InteractiveShellState): boolean {
	return (
		state.pendingApproval !== null ||
		state.focus === "panes" ||
		state.focus === "tasks" ||
		state.focus === "status" ||
		state.focus === "resources"
	);
}

/** Scroll the focused scene. Up means older/top for chat, top for documents. */
export function scrollFocused(
	state: InteractiveShellState,
	intent: "up" | "down",
	amount: number,
): InteractiveShellState {
	const step = Math.max(0, amount);
	if (isDocumentPane(state)) {
		const delta = intent === "down" ? step : -step;
		return { ...state, paneScroll: Math.max(0, state.paneScroll + delta) };
	}
	const delta = intent === "up" ? step : -step;
	return { ...state, chatScroll: Math.max(0, state.chatScroll + delta) };
}

/** Positive scrolls back through the transcript, negative returns toward now. */
export function scrollChat(
	state: InteractiveShellState,
	delta: number,
): InteractiveShellState {
	return scrollFocused(state, delta >= 0 ? "up" : "down", Math.abs(delta));
}

export function appendAssistant(
	state: InteractiveShellState,
	text: string,
	agentState: ShellAgentState = "idle",
): InteractiveShellState {
	return persistShellChat(
		withLiveBtw(
			appendWorking(
				{ ...state, agentState, chatScroll: 0 },
				{ role: "assistant", text, at: Date.now() },
			),
		),
	);
}

export function appendProduct(
	state: InteractiveShellState,
	text: string,
): InteractiveShellState {
	return persistShellChat(
		withLiveBtw(
			appendWorking(
				{ ...state, chatScroll: 0 },
				{ role: "product", text, at: Date.now() },
			),
		),
	);
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
	const replaced = { role: "assistant" as const, text, at: last.at };
	const journal = state.journal;
	let nextJournal = journal;
	if (journal && journal.length > 0) {
		const lastJournal = journal[journal.length - 1];
		nextJournal =
			lastJournal?.role === "assistant"
				? [...journal.slice(0, -1), replaced]
				: [...journal, replaced];
	}
	return persistShellChat(
		withLiveBtw({
			...state,
			agentState,
			chatScroll: 0,
			messages: [...state.messages.slice(0, -1), replaced],
			journal: nextJournal,
		}),
	);
}

// ── TTY driver ───────────────────────────────────────────────────────────

export interface ShellHost {
	/** Run a product CLI surface; return human text. */
	readonly runVerb: (argv: readonly string[]) => Promise<string>;
	/** Handle a user chat prompt; return assistant text. */
	readonly complete: (prompt: string) => Promise<string>;
	/** Send a coding prompt into the focused in-session agent CLI pane. */
	readonly sendToAgent?: (
		agent: string,
		text: string,
	) => Promise<string>;
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
	/**
	 * Start Station dashboard + Evidence sidecars. Default: on for a live TTY
	 * unless HOBO_CODE_SIDECARS=0. Tests pass false to stay off-network.
	 */
	readonly sidecars?: boolean;
	readonly sessionId?: string;
	readonly messages?: readonly ShellMessage[];
	readonly journal?: readonly ShellMessage[];
}

/**
 * Interactive driver: pi-tui differential renderer over StreamTerminal.
 *
 * Render economy contract (asserted by test/render-budget.test.ts):
 * - a repaint happens only when state changes (key, submit result, resize,
 *   or a Bo sprite frame that differs from the previous one);
 * - idle rest spans request no renders at all;
 * - unchanged lines are never rewritten (pi-tui line diff);
 * - live TTY uses the alternate screen so quit does not leave the frame
 *   in scrollback (Claude/Codex/Grok Build).
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

	const shellEnv = options.env ?? process.env;
	const shellHome =
		options.hoboHome ??
		(typeof shellEnv.HOBO_HOME === "string" && shellEnv.HOBO_HOME
			? shellEnv.HOBO_HOME
			: `${shellEnv.HOME ?? "/tmp"}/.hobo`);
	describeAuthedStationSession({
		hoboHome: shellHome,
		env: shellEnv,
		ensureLocalLogin: true,
	});
	const wantSidecars =
		options.sidecars === true ||
		(options.sidecars !== false && sidecarsEnabled(shellEnv) && isTty);
	let sidecars: StationSidecars | undefined;
	if (wantSidecars) {
		try {
			sidecars = await startStationSidecars({
				hoboHome: shellHome,
				projectRoot: options.cwd ?? process.cwd(),
				env: shellEnv,
				persistEvidence: true,
			});
		} catch {
			sidecars = undefined;
		}
	}
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
		hoboHome: shellHome,
		env: shellEnv,
		...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
		...(options.messages !== undefined ? { messages: options.messages } : {}),
		...(options.journal !== undefined ? { journal: options.journal } : {}),
	});
	if (options.host.engineLabel) {
		state = { ...state, modelLabel: options.host.engineLabel };
	}
	const sessionId = state.sessionId ?? newChatSessionId();
	if (state.sessionId !== sessionId) {
		state = { ...state, sessionId };
	}
	writeCurrentSessionContext(state.hoboHome, {
		sessionId,
		cwd: state.projectDir,
		...(state.stationLabel ? { stationLabel: state.stationLabel } : {}),
		...(state.envLabel ? { envLabel: state.envLabel } : {}),
		...(state.modelLabel ? { modelLabel: state.modelLabel } : {}),
	});
	if (sidecars) {
		state = {
			...state,
			sidecarChips: [...formatSidecarStrap(sidecars)],
			welcomeTable: buildWelcomeTable({
				dashboardUrl: sidecars.dashboardUrl,
				evidenceUrl: sidecars.evidenceUrl,
			}),
		};
	}
	if (isTty) {
		try {
			const seated = await ensureInSessionPanes({
				cwd: options.cwd ?? process.cwd(),
				env: shellEnv,
			});
			state = {
				...state,
				livePanes: seated,
				focus: seated.windows.length > 0 ? "panes" : state.focus,
				footerHints:
					seated.windows.length > 0
						? "Tab panes · [ ] agents · type+Enter sends to the focused CLI"
						: state.footerHints,
			};
		} catch {
			state = {
				...state,
				livePanes: emptyInSessionPanes("could not seat agent panes"),
			};
		}
	}

	const liveTty = isTty && options.scriptedKeys === undefined;
	const terminal = new StreamTerminal({
		stdin,
		stdout,
		columns: state.width,
		rows: state.height,
		rawMode: liveTty,
		alternateScreen: liveTty,
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
		if (item.action === "btw") {
			const asked = (item.argv ?? []).join(" ");
			state = applyBtwPrompt(state, asked);
			return;
		}
		if (item.action === "resume") {
			state = persistShellChat(state);
			state = appendProduct(
				state,
				state.sessionId
					? `This chat is ${state.sessionId}. Resume later: hobo-code resume ${state.sessionId}`
					: "No persisted chat yet. Send a prompt first, then hobo-code resume.",
			);
			return;
		}
		if (item.action === "compact") {
			state = applyCompact(state, (item.argv ?? []).join(" "));
			return;
		}
		if (item.action === "panes") {
			state = { ...state, focus: "panes", paneScroll: 0 };
			return;
		}
		if (state.btw) {
			state = { ...state, btw: null, focus: "chat" };
		}
		if (item.action === "help") {
			state = appendProduct(
				state,
				[
					"Commands: type / and pick — /dev /templates /hobo /ide /config /tasks /status /resources /btw /resume /compact /about /quit",
					"Aside: btw <question> borrows this moment without joining the main chat.",
					"Resume: /resume prints this chat id · later `hobo-code resume [id]`.",
					"Compact: /compact [focus] shrinks the working pane; the journal stays.",
					"Templates: /templates lists; /template <query> searches (zero LLM).",
					"Resident control: /sessions <args> (plain /sessions lists).",
					"HoBo control plane: /hobo <args> (for example /hobo yard status).",
					"Chat: coding prompts go to the focused agent pane (Codex/Claude).",
					"HoBo verbs stay on Bo: /dev /resources /history /alias.",
					"Keys: Tab panes · [ ] cycle agents · ↑/↓ scroll · Ctrl+C quit",
				].join("\n"),
			);
			return;
		}
		if (item.action === "about") {
			const engineLines = options.host.aboutLines ?? [
				"Coding prompts go to seated agent CLIs (Codex/Claude) in this TTY.",
				"HoBo verbs stay on Bo: /dev /resources /history /alias.",
				"Pi TUI remains an opt-in escape hatch via `hobo-code --pi`.",
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
			turnInFlight = true;
			try {
				const handled = await options.host.tryWorkspaceAction(prompt);
				if (handled !== null) {
					if (quit) return;
					state = appendAssistant(state, handled.slice(0, 8000), "idle");
					return;
				}
			} finally {
				turnInFlight = false;
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
		const impact = approval.changes
			.map((change) => `${change.status} ${change.path}`)
			.join("\n");
		if (state.sessionId) {
			recordSessionDecision(state.hoboHome, {
				sessionId: state.sessionId,
				title: approved ? "Promoted sandbox" : "Kept sandboxed",
				reason: approved
					? `Apply run ${approval.runId}.\n${impact || "No file changes listed."}`
					: `Refused run ${approval.runId}. Work stays in ${approval.sandboxRoot}.\n${impact}`,
			});
		}
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
		const aside = matchBtwInput(text);
		if (aside !== undefined || (state.btw && !text.startsWith("/"))) {
			state = applyBtwPrompt(state, aside?.question ?? text);
			tui.requestRender();
			return;
		}
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
		const seated = state.livePanes
			? pickSendWindow(state.livePanes)
			: undefined;
		if (
			seated &&
			!isProductPrompt(text) &&
			matchWorkspaceAction(text) === undefined &&
			options.host.sendToAgent
		) {
			state = persistShellChat(
				appendWorking(
					{
						...state,
						chatScroll: 0,
						focus: "panes",
						agentState: "working",
					},
					{ role: "user", text: `→ ${seated.name}: ${text}`, at: Date.now() },
				),
			);
			tui.requestRender();
			void options.host
				.sendToAgent(seated.name, text)
				.then((reply) => {
					if (quit) return;
					state = appendProduct(state, reply);
					state = { ...state, agentState: "idle" };
				})
				.catch((err: unknown) => {
					if (quit) return;
					state = appendProduct(
						state,
						`pane ${seated.name} refused: ${err instanceof Error ? err.message : String(err)}`,
					);
					state = { ...state, agentState: "blocked" };
				})
				.then(() => {
					if (!quit) tui.requestRender();
				});
			return;
		}
		state = persistShellChat(
			appendWorking(
				{ ...state, chatScroll: 0, agentState: "working" },
				{ role: "user", text, at: Date.now() },
			),
		);
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
		} else if (result.toAgent && options.host.sendToAgent) {
			void options.host
				.sendToAgent(result.toAgent.agent, result.toAgent.text)
				.then((reply) => {
					if (quit) return;
					state = appendProduct(state, reply);
					state = { ...state, agentState: "idle" };
				})
				.catch((err: unknown) => {
					if (quit) return;
					state = appendProduct(
						state,
						`pane ${result.toAgent?.agent} refused: ${err instanceof Error ? err.message : String(err)}`,
					);
					state = { ...state, agentState: "blocked" };
				})
				.then(() => {
					if (!quit) tui.requestRender();
				});
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
		if (
			(data === "[" || data === "]") &&
			input.text().length === 0 &&
			state.livePanes &&
			state.livePanes.windows.length > 0
		) {
			state = {
				...state,
				livePanes: cycleInSessionWindow(
					state.livePanes,
					data === "]" ? 1 : -1,
				),
				focus: "panes",
				paneScroll: 0,
			};
			tui.requestRender();
			return { consume: true };
		}
		if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
			state = scrollFocused(
				state,
				matchesKey(data, "pageUp") ? "up" : "down",
				Math.max(3, viewportRows(state) - 1),
			);
			tui.requestRender();
			return { consume: true };
		}
		// Scroll the focused pane with the arrows only when the editor is empty,
		// so ↑ still means "previous prompt" while composing.
		if (
			input.text().length === 0 &&
			(matchesKey(data, "up") || matchesKey(data, "down"))
		) {
			state = scrollFocused(
				state,
				matchesKey(data, "up") ? "up" : "down",
				1,
			);
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
	const paneTick = setInterval(() => {
		if (quit || state.focus !== "panes" || !state.livePanes?.tmux) return;
		void refreshInSessionPanes(state.livePanes, tmuxRunner())
			.then((next) => {
				if (quit) return;
				if (next.capture === state.livePanes?.capture) return;
				state = { ...state, livePanes: next };
				tui.requestRender();
			})
			.catch(() => {});
	}, 400);
	paneTick.unref?.();

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
		// `run it` / `debug it` boot occupancy + named endpoints — 2s is
		// not enough for the assistant reply to land before scripted quit.
		const drainDeadline = Date.now() + 12_000;
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
		clearInterval(paneTick);
		if (maxMsTimer) clearTimeout(maxMsTimer);
		process.removeListener("SIGTERM", onSignal);
		process.removeListener("SIGHUP", onSignal);
		// Leave the alternate screen (and raw mode) even if the driver threw —
		// a CLI that can strand a terminal in raw mode is not shippable.
		tui.stop();
		state = persistShellChat(state, true);
		if (state.sessionId) {
			stdout.write(`${formatShellCloseout(state.sessionId)}\n`);
		}
		await sidecars?.close().catch(() => {});
	}
	return 0;
}
