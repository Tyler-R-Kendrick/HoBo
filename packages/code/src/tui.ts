import type { AgentPaneState, AgentSemanticState } from "./types.js";
import {
	renderDefaultLoadingScreen,
	type LoadingScreenOptions,
} from "./splash.js";

/**
 * Herdr-like multiplexer status surface:
 * agent semantic state, panes, copy-on-highlight.
 * Grok Build patterns: clickable regions / mouse-interactive themes (referenced).
 *
 * Default state (no panes, standalone): console HoBo logo + Bo idle loading
 * screen — see `renderDefaultLoadingScreen` / `splash.ts`.
 */

export interface MultiplexerStatus {
	readonly panes: readonly AgentPaneState[];
	readonly copyOnHighlight: true;
	readonly detachable: true;
	readonly remoteReady: boolean;
	readonly theme: "herdr" | "grok-build";
	readonly clickableRegions: readonly string[];
}

const STATE_GLYPH: Record<AgentSemanticState, string> = {
	idle: "○",
	working: "●",
	blocked: "▲",
	done: "✓",
};

export function createPane(
	agentId: string,
	semanticState: AgentSemanticState = "idle",
	summary = "",
): AgentPaneState {
	return {
		agentId,
		semanticState,
		summary,
		highlightBuffer: "",
	};
}

export function setPaneState(
	pane: AgentPaneState,
	semanticState: AgentSemanticState,
	summary?: string,
): AgentPaneState {
	return {
		...pane,
		semanticState,
		summary: summary ?? pane.summary,
	};
}

/**
 * Copy-on-highlight: selecting text in a pane populates highlightBuffer
 * (clipboard semantics for TUI / remote sessions).
 */
export function copyOnHighlight(
	pane: AgentPaneState,
	selectedText: string,
): AgentPaneState {
	return {
		...pane,
		highlightBuffer: selectedText,
	};
}

export function buildMultiplexerStatus(
	panes: readonly AgentPaneState[],
	options: { remoteReady?: boolean; theme?: "herdr" | "grok-build" } = {},
): MultiplexerStatus {
	return {
		panes,
		copyOnHighlight: true,
		detachable: true,
		remoteReady: options.remoteReady === true,
		theme: options.theme ?? "herdr",
		clickableRegions: [
			"pane-header",
			"pane-body",
			"status-bar",
			"budget-chip",
			"agent-state-badge",
		],
	};
}

function pad(s: string, n: number): string {
	if (s.length === n) return s;
	if (s.length > n) {
		if (n <= 1) return s.slice(0, n);
		return `${s.slice(0, Math.max(0, n - 1))}…`;
	}
	return s + " ".repeat(n - s.length);
}

function countStates(
	panes: readonly AgentPaneState[],
): Record<AgentSemanticState, number> {
	const counts: Record<AgentSemanticState, number> = {
		idle: 0,
		working: 0,
		blocked: 0,
		done: 0,
	};
	for (const p of panes) counts[p.semanticState] += 1;
	return counts;
}

export interface StatusRenderOptions {
	/**
	 * When true, omit standalone next/mux footers — used when the box is
	 * embedded under a parent panel that already carries those actions.
	 */
	readonly embedded?: boolean;
	/** Optional subtitle override (second header line). */
	readonly subtitle?: string;
	/**
	 * Full title override — replaces `hobo-code · mux · …` / `mux · …`.
	 * Used by session to fold product brand + handback into one header.
	 */
	readonly title?: string;
	/** Optional next-line override when not embedded. */
	readonly nextHint?: string;
	/**
	 * Empty standalone mux: paint default loading screen (logo + Bo idle)
	 * instead of the one-line empty→★ box. Pass frame/tickMs to animate.
	 */
	readonly loading?: LoadingScreenOptions | true;
}

/**
 * Human-facing multiplexer chrome. Box-drawn header, state glyphs, focus ▸,
 * ≤4-pane fold. Pure presentation — no side effects.
 */
export function renderStatusText(
	status: MultiplexerStatus,
	options: StatusRenderOptions = {},
): string {
	// Default state: no panes + standalone → console logo + Bo idle loading.
	// Embedded / title override keep compact empty cue (parent owns chrome).
	if (
		status.panes.length === 0 &&
		options.title === undefined &&
		options.embedded !== true
	) {
		const loadOpts: LoadingScreenOptions =
			options.loading === true || options.loading === undefined
				? {}
				: options.loading;
		// Offline-only mark on cue (⊙r product default omitted).
		const offline = status.remoteReady ? null : "○l";
		const cue =
			loadOpts.cue ??
			(offline !== null ? `hobo-code·idle·${offline}` : undefined);
		return renderDefaultLoadingScreen({
			...loadOpts,
			...(cue !== undefined ? { cue } : {}),
		});
	}
	const counts = countStates(status.panes);
	const n = status.panes.length;
	const busy = counts.working + counts.blocked;
	// ⊙r is product default remote-ready — only show ○l when offline.
	const remote = status.remoteReady ? null : "○l";
	// Health-first strip: glyphs glued (no spaces) — match ultra chip.
	const health = [
		counts.working > 0 ? `●${counts.working}` : null,
		counts.blocked > 0 ? `▲${counts.blocked}` : null,
		counts.idle > 0 ? `○${counts.idle}` : null,
		counts.done > 0 ? `✓${counts.done}` : null,
	]
		.filter((x): x is string => x !== null)
		.join("");
	// One header line for both modes (embedded parent already brands product).
	// Health glyphs sum to N — omit Np twin when any glyph present.
	const healthLine = health.length > 0 ? health : n > 0 ? `${n}p` : "—";
	const subtitle =
		options.subtitle ??
		(options.embedded
			? healthLine
			: remote !== null
				? `${healthLine}·${remote}`
				: healthLine);
	// Ultra-short agent labels in fold (full ids in data/json).
	// Avoid "st" — that is the status next-verb tail.
	const shortAgent = (id: string): string => {
		if (id === "coordinator" || id === "coord") return "co";
		if (id === "station") return "sn";
		if (id === "hive") return "hv";
		if (id === "worker") return "wk";
		if (id === "watcher") return "wch";
		// Keep short ids intact (agent-1); only trim long custom names.
		return id.length > 8 ? `${id.slice(0, 7)}…` : id;
	};
	// Busy → nodes (nd). Quiet: ★ dispatch is product default — omit next twin.
	const nextVerbs =
		options.nextHint?.replace(/^next\s+/, "") ??
		(busy > 0 ? "nd" : null);
	// Always fold panes into ≤4-wide groups (clipboard → ↳snippet on bit).
	const foldPane = (pane: (typeof status.panes)[number]): string => {
		const glyph = STATE_GLYPH[pane.semanticState];
		const focus = pane.semanticState === "working" ? "▸" : "";
		// Idle/done/working: glyph alone (focus▸ already marks working).
		// Blocked keeps short cue (why blocked matters).
		const showSummary = pane.semanticState === "blocked";
		const raw = showSummary ? pane.summary : "";
		// Ultra-short blocked cue (full text in data/logs).
		const summary =
			raw.length === 0
				? ""
				: raw.length > 6
					? `${raw.slice(0, 5)}…`
					: raw;
		const clip =
			pane.highlightBuffer.length > 0
				? `↳${
						pane.highlightBuffer.length > 12
							? `${pane.highlightBuffer.slice(0, 11)}…`
							: pane.highlightBuffer
					}`
				: "";
		// · before summary (not space) — denser, still scannable.
		const body = summary.length > 0 ? `·${summary}` : "";
		return `${focus}${glyph}${shortAgent(pane.agentId)}${body}${clip ? `·${clip}` : ""}`;
	};
	// Full title override (session) wins; else standalone folds next into title.
	// Empty: next is dispatch — fold cue, skip "…" twin.
	const titleBase =
		options.title ??
		(options.embedded
			? subtitle
			: `hobo-code·${subtitle}`);
	const emptyCue = "empty→★";
	// dcc (detach·click·copy) is product default — omit from chrome.
	// Next verb is last token (no "next" word) — matches panel chrome.
	const title =
		options.title !== undefined
			? options.title
			: status.panes.length === 0 && !options.embedded
				? `${titleBase}·${emptyCue}`
				: !options.embedded && nextVerbs !== null
					? `${titleBase}·${nextVerbs}`
					: titleBase;
	// Build fold lines first so width can track content (quiet denser than busy).
	const foldLines: string[] = [];
	if (status.panes.length > 0) {
		for (let i = 0; i < status.panes.length; i += 4) {
			const group = status.panes.slice(i, i + 4);
			foldLines.push(group.map(foldPane).join("·"));
		}
	} else if (options.title !== undefined) {
		// Custom title (session) with no panes still paints empty cue.
		foldLines.push(emptyCue);
	}
	const contentW = Math.max(
		title.length,
		...foldLines.map((l) => l.length),
		12,
	);
	// Adaptive width: hug content. Inner is ` ${line}` so +3 (space+borders).
	// Floor 16, cap busy 40.
	const width = Math.min(40, Math.max(16, contentW + 3));
	const top = `┌${"─".repeat(width - 2)}┐`;
	const bot = `└${"─".repeat(width - 2)}┘`;
	// Single-space pad inside box — denser than dual pad.
	const mid = (inner: string) => `│${pad(` ${inner}`, width - 2)}│`;
	// Folded groups: title · fold-lines · bot (no mid divider / next footer).
	const lines: string[] = [top, mid(title)];
	for (const fl of foldLines) lines.push(mid(fl));
	lines.push(bot);
	return lines.join("\n");
}

/** Compact one-line summary for status-bar chips. */
export function renderStatusChip(status: MultiplexerStatus): string {
	const counts = countStates(status.panes);
	// Prefer focus-first order on the chip too.
	const order: AgentSemanticState[] = ["working", "blocked", "idle", "done"];
	const parts = order
		.filter((k) => counts[k] > 0)
		.map((k) => `${STATE_GLYPH[k]}${counts[k]}`);
	// ⊙r product default — only show ○l when offline.
	const remote = status.remoteReady ? null : "○l";
	// herdr is product default theme — omit on happy path.
	const themeBit = status.theme === "herdr" ? "" : `·${status.theme}`;
	// Glyph counts already signal N — omit Np twin. Glued glyphs.
	const remoteBit = remote !== null ? `${remote}·` : "";
	const glyphStrip = parts.join("") || "—";
	return `hobo-code·${remoteBit}${glyphStrip}${themeBit}`;
}

/**
 * Frame status box + chip as one closed human surface.
 * Soft band labels the chip strip under the multiplexer box.
 */
export function renderStatusSurface(
	status: MultiplexerStatus,
	options: StatusRenderOptions = {},
): string {
	const box = renderStatusText(status, options);
	// Embedded: header already carries Np · glyphs — no twin chip strip.
	if (options.embedded) {
		return box;
	}
	const chip = renderStatusChip(status);
	// Soft band tracks box width (adaptive) — no "chip" word label.
	const firstLine = box.split("\n")[0] ?? "";
	const softW = Math.max(12, firstLine.length - 2);
	const soft = "·".repeat(softW);
	return `${box}\n${soft}\n  ${chip}`;
}
