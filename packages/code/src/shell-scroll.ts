/**
 * Pure scroll algebra for the InteractiveShell.
 *
 * Conventions (competitor-hardened):
 * - follow live only when chatScroll === 0 (chat) or paneScroll === 0 (Agents)
 * - Agents use end-origin like chat (0 = newest capture); status/resources/approval use start-origin
 * - always clamp offsets to content
 * - page = half viewport (Claude fullscreen); half-page = ceil(viewport/2)
 */
import {
	BROADCAST_CHROME_ROWS,
	BROADCAST_INNER_INSET,
} from "./tui-broadcast.js";
import { wrapMessage } from "./tui-layout.js";

export type ScrollMessage = {
	readonly role: "system" | "user" | "assistant" | "product";
	readonly text: string;
};

export type ScrollShellState = {
	readonly width: number;
	readonly height: number;
	readonly inputRows: number;
	readonly chatScroll: number;
	readonly paneScroll: number;
	readonly focus: string;
	readonly pendingApproval: unknown | null;
	readonly messages: readonly ScrollMessage[];
	readonly statusPlain: string;
	readonly resourcesPlain: string;
	/**
	 * Line count of the Agents body (formatHarnessSessionLines). When set,
	 * pane scroll clamps against real capture height instead of a fake
	 * viewport×3 stand-in.
	 */
	readonly agentsBodyLines?: number;
	readonly transcriptMode?: { readonly offset: number } | null;
	/** When set, chatScroll pages the btw aside, not the parent transcript. */
	readonly btw?: {
		readonly turns: readonly { readonly text: string }[];
	} | null;
};

export function shellViewportRows(state: ScrollShellState): number {
	const bodyRows = Math.max(3, state.height - 1 - state.inputRows);
	return Math.max(1, bodyRows - (BROADCAST_CHROME_ROWS + 1));
}

export function pageStep(viewport: number): number {
	return Math.max(1, Math.floor(Math.max(1, viewport) / 2));
}

export function halfPageStep(viewport: number): number {
	return Math.max(1, Math.ceil(Math.max(1, viewport) / 2));
}

/** Chat or Agents following the live end (newest). */
export function followingLive(state: ScrollShellState): boolean {
	if (state.focus === "agents" && state.pendingApproval == null) {
		return state.paneScroll === 0;
	}
	return state.chatScroll === 0;
}

export function chatTranscriptLineCount(state: ScrollShellState): number {
	const innerWidth = Math.max(8, state.width - BROADCAST_INNER_INSET);
	let lines = 0;
	for (const message of state.messages) {
		lines += wrapMessage(message, innerWidth).length;
		lines += 1; // blank spacer after each message
	}
	return lines;
}

export function maxChatScroll(state: ScrollShellState): number {
	const viewport = shellViewportRows(state);
	if (state.btw && state.btw.turns.length > 0) {
		// Aside: kicker + optional parent line + one line per turn (matches BtwAside).
		const lines = 1 + state.btw.turns.length + 2;
		return Math.max(0, lines - viewport);
	}
	return Math.max(0, chatTranscriptLineCount(state) - viewport);
}

function documentLineCount(state: ScrollShellState): number {
	if (state.pendingApproval) {
		const pending = state.pendingApproval as {
			readonly changes?: readonly string[];
		};
		return Math.max(8, 6 + (pending.changes?.length ?? 0) * 2);
	}
	if (state.focus === "status") {
		return Math.max(1, state.statusPlain.split("\n").length);
	}
	if (state.focus === "resources") {
		return Math.max(1, state.resourcesPlain.split("\n").length);
	}
	if (state.focus === "agents") {
		const counted = state.agentsBodyLines;
		if (typeof counted === "number" && counted > 0) {
			return counted;
		}
		return Math.max(12, shellViewportRows(state) * 3);
	}
	return shellViewportRows(state);
}

export function maxPaneScroll(state: ScrollShellState): number {
	return Math.max(0, documentLineCount(state) - shellViewportRows(state));
}

export function maxTranscriptOffset(state: ScrollShellState): number {
	return Math.max(0, chatTranscriptLineCount(state) - shellViewportRows(state));
}

function isDocumentPane(state: ScrollShellState): boolean {
	return (
		state.pendingApproval !== null ||
		state.focus === "agents" ||
		state.focus === "status" ||
		state.focus === "resources"
	);
}

/** Agents capture is end-origin (like chat). Status/resources/approval are start-origin. */
function agentsEndOrigin(state: ScrollShellState): boolean {
	return state.focus === "agents" && state.pendingApproval == null;
}

export function clampScrollState<T extends ScrollShellState>(state: T): T {
	const chatScroll = Math.max(
		0,
		Math.min(state.chatScroll, maxChatScroll(state)),
	);
	const paneScroll = Math.max(
		0,
		Math.min(state.paneScroll, maxPaneScroll(state)),
	);
	const mode = state.transcriptMode;
	if (
		chatScroll === state.chatScroll &&
		paneScroll === state.paneScroll &&
		(mode == null ||
			mode.offset ===
				Math.max(0, Math.min(mode.offset, maxTranscriptOffset(state))))
	) {
		return state;
	}
	const nextMode =
		mode == null
			? mode
			: {
					offset: Math.max(
						0,
						Math.min(mode.offset, maxTranscriptOffset(state)),
					),
				};
	return {
		...state,
		chatScroll,
		paneScroll,
		...(state.transcriptMode !== undefined ? { transcriptMode: nextMode } : {}),
	};
}

/**
 * Scroll the focused scene.
 * Chat + Agents: up = older (away from live end).
 * Status/resources/approval: down = toward bottom (start-origin).
 */
export function scrollFocused<T extends ScrollShellState>(
	state: T,
	intent: "up" | "down",
	amount: number,
): T {
	const step = Math.max(0, amount);
	if (agentsEndOrigin(state)) {
		const delta = intent === "up" ? step : -step;
		return clampScrollState({
			...state,
			paneScroll: Math.max(0, state.paneScroll + delta),
		});
	}
	if (isDocumentPane(state)) {
		const delta = intent === "down" ? step : -step;
		return clampScrollState({
			...state,
			paneScroll: Math.max(0, state.paneScroll + delta),
		});
	}
	const delta = intent === "up" ? step : -step;
	return clampScrollState({
		...state,
		chatScroll: Math.max(0, state.chatScroll + delta),
	});
}

/** Positive scrolls back through the transcript, negative returns toward now. */
export function scrollChat<T extends ScrollShellState>(
	state: T,
	delta: number,
): T {
	return scrollFocused(state, delta >= 0 ? "up" : "down", Math.abs(delta));
}

export function scrollToLive<T extends ScrollShellState>(state: T): T {
	if (agentsEndOrigin(state)) {
		return clampScrollState({ ...state, paneScroll: 0 });
	}
	if (isDocumentPane(state)) {
		return clampScrollState({ ...state, paneScroll: maxPaneScroll(state) });
	}
	return clampScrollState({ ...state, chatScroll: 0 });
}

export function scrollToHome<T extends ScrollShellState>(state: T): T {
	if (agentsEndOrigin(state)) {
		return clampScrollState({
			...state,
			paneScroll: maxPaneScroll(state),
		});
	}
	if (isDocumentPane(state)) {
		return clampScrollState({ ...state, paneScroll: 0 });
	}
	return clampScrollState({
		...state,
		chatScroll: maxChatScroll(state),
	});
}

/** Keep offset when reviewing; pin to live only when already following. */
export function withFollowPreservedScroll<T extends ScrollShellState>(
	state: T,
	patch: Partial<T> & { readonly chatScroll?: number },
): T {
	const nextChat =
		patch.chatScroll !== undefined
			? patch.chatScroll
			: followingLive(state) && state.focus !== "agents"
				? 0
				: state.chatScroll;
	return clampScrollState({
		...state,
		...patch,
		chatScroll: nextChat,
	});
}

export function scrollHistoryFooterHint(
	state: ScrollShellState,
): string | null {
	if (state.transcriptMode != null) return "less · q exit · j/k scroll";
	if (agentsEndOrigin(state) && state.paneScroll > 0) {
		return "history · End live";
	}
	if (!followingLive(state) && !isDocumentPane(state)) {
		return "history · End live";
	}
	if (
		isDocumentPane(state) &&
		!agentsEndOrigin(state) &&
		state.paneScroll > 0
	) {
		return "scrolled · Home top";
	}
	return null;
}
