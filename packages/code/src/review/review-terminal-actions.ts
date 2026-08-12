import type { ReviewCommand, ReviewFileSummary } from "./review-ports.js";
import {
	clampReviewTerminalState,
	nextUnreviewedAnchor,
} from "./review-terminal-layout.js";
import {
	chunkForFile,
	type ReviewDiffLayout,
	type ReviewTerminalDocument,
	type ReviewTerminalState,
	type ReviewTerminalSurface,
} from "./review-terminal-model.js";

// public-contract: keyboard-only legend shown on the review pane status strap.
export const REVIEW_TERMINAL_KEY_HELP =
	"keyboard-only · Tab surface · j/k move · n next unreviewed · v layout · c draft · +/- stage · a approve · r refresh · q quit";

const SURFACES: readonly ReviewTerminalSurface[] = [
	"inbox",
	"files",
	"diff",
	"threads",
];

const LAYOUTS: readonly ReviewDiffLayout[] = ["unified", "split", "stacked"];

export interface ReviewTerminalKeyResult {
	readonly state: ReviewTerminalState;
	readonly command?: ReviewCommand;
	readonly quit?: boolean;
}

function selectedFile(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
): ReviewFileSummary | undefined {
	return document.manifest?.files[state.selectedFile];
}

function selectedLine(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
) {
	const file = selectedFile(document, state);
	if (!file) return undefined;
	return chunkForFile(document, file.fileId)?.hunks[state.selectedHunk]?.lines[
		state.selectedLine
	];
}

function selectedThreadId(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
): string | undefined {
	const file = selectedFile(document, state);
	const line = selectedLine(document, state);
	if (!file || !line) return document.threads[0]?.threadId;
	const target = line.newLine ?? line.oldLine;
	return document.threads.find((thread) => {
		const start = thread.anchor?.startLine;
		return (
			thread.anchor?.fileId === file.fileId &&
			target !== undefined &&
			start === target
		);
	})?.threadId;
}

function selectedMessageId(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
): string | undefined {
	const threadId = selectedThreadId(document, state);
	if (!threadId) return document.messages[0]?.messageId;
	return document.messages.find((item) => item.threadId === threadId)
		?.messageId;
}

function selectionCommand(
	kind: "stage-selection" | "unstage-selection",
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
): ReviewCommand | undefined {
	const file = selectedFile(document, state);
	const generationId = document.snapshot?.currentGenerationId;
	if (!file || !generationId) return undefined;
	const hunk = chunkForFile(document, file.fileId)?.hunks[state.selectedHunk];
	const start = state.rangeStart?.lineIndex ?? state.selectedLine;
	const end = state.selectedLine;
	const line = hunk?.lines[end];
	return {
		kind,
		generationId,
		fileId: file.fileId,
		approvalDigest: "",
		...(hunk ? { hunkId: hunk.hunkId } : {}),
		...(line?.newLine === undefined && line?.oldLine === undefined
			? {}
			: {
					startLine: Math.min(
						hunk?.lines[start]?.newLine ??
							hunk?.lines[start]?.oldLine ??
							start + 1,
						line?.newLine ?? line?.oldLine ?? end + 1,
					),
					endLine: Math.max(
						hunk?.lines[start]?.newLine ??
							hunk?.lines[start]?.oldLine ??
							start + 1,
						line?.newLine ?? line?.oldLine ?? end + 1,
					),
				}),
	};
}

function cycle<T>(items: readonly T[], current: T, delta: number): T {
	const index = items.indexOf(current);
	const next = (index + delta + items.length) % items.length;
	return items[next] ?? current;
}

function moveSelection(
	state: ReviewTerminalState,
	document: ReviewTerminalDocument,
	delta: number,
): ReviewTerminalState {
	if (state.surface === "inbox") {
		return clampReviewTerminalState(
			{
				...state,
				selectedInbox: state.selectedInbox + delta,
			},
			document,
		);
	}
	if (state.surface === "files") {
		return clampReviewTerminalState(
			{
				...state,
				selectedFile: state.selectedFile + delta,
				selectedHunk: 0,
				selectedLine: 0,
			},
			document,
		);
	}
	if (state.surface === "threads") {
		const count = Math.max(1, document.threads.length);
		return {
			...state,
			selectedHunk: (state.selectedHunk + delta + count) % count,
		};
	}
	const file = selectedFile(document, state);
	const hunks = file ? (chunkForFile(document, file.fileId)?.hunks ?? []) : [];
	const lines = hunks[state.selectedHunk]?.lines ?? [];
	const nextLine = state.selectedLine + delta;
	if (nextLine >= 0 && nextLine < lines.length) {
		return { ...state, selectedLine: nextLine };
	}
	const nextHunk = state.selectedHunk + (delta > 0 ? 1 : -1);
	if (nextHunk >= 0 && nextHunk < hunks.length) {
		const hunkLines = hunks[nextHunk]?.lines.length ?? 1;
		return {
			...state,
			selectedHunk: nextHunk,
			selectedLine: delta > 0 ? 0 : Math.max(0, hunkLines - 1),
		};
	}
	return clampReviewTerminalState(
		{
			...state,
			selectedFile: state.selectedFile + (delta > 0 ? 1 : -1),
			selectedHunk: 0,
			selectedLine: 0,
		},
		document,
	);
}

function appendText(
	state: ReviewTerminalState,
	key: string,
): ReviewTerminalState {
	if (state.surface === "approval") {
		return { ...state, prompt: `${state.prompt}${key}` };
	}
	if (state.draftOpen) {
		return { ...state, draftBody: `${state.draftBody}${key}` };
	}
	return state;
}

export function reduceReviewTerminalKey(
	state: ReviewTerminalState,
	document: ReviewTerminalDocument,
	key: string,
): ReviewTerminalKeyResult {
	const current = clampReviewTerminalState(state, document);
	if (key === "q" || key === "\u0003") return { state: current, quit: true };
	if (key === "\u001b") {
		const { rangeStart: _rangeStart, ...rest } = current;
		return {
			state: {
				...rest,
				draftOpen: false,
				draftBody: "",
				prompt: "",
				surface: current.surface === "approval" ? "diff" : current.surface,
			},
		};
	}

	if (current.surface === "approval") {
		if (key === "\r") {
			const digest = current.prompt.trim();
			const pendingId = document.pending?.pendingReviewId;
			if (!pendingId || digest.length === 0) return { state: current };
			return {
				state: { ...current, prompt: "", surface: "diff" },
				command: {
					kind: "publish-submission",
					pendingReviewId: pendingId,
					approvalDigest: digest,
				},
			};
		}
		if (key === "\u007f" || key === "\b") {
			return { state: { ...current, prompt: current.prompt.slice(0, -1) } };
		}
		if (key.length === 1 && key >= " ") {
			return { state: appendText(current, key) };
		}
		if (key.length > 1 && !key.startsWith("\u001b")) {
			return { state: appendText(current, key) };
		}
		return { state: current };
	}

	if (current.draftOpen) {
		if (key === "\r") {
			const file = selectedFile(document, current);
			const line = selectedLine(document, current);
			return {
				state: { ...current, draftOpen: false, draftBody: "" },
				command: {
					kind: "create-thread",
					body: current.draftBody,
					visibility: "session",
					...(file
						? {
								anchor: {
									anchorId: `draft:${file.fileId}:${current.selectedLine}`,
									generationId: document.snapshot?.currentGenerationId ?? "",
									fileId: file.fileId,
									side: "new" as const,
									contextBeforeHashes: [],
									contextAfterHashes: [],
									...(file.pathAfter === undefined
										? {}
										: { pathAfter: file.pathAfter }),
									...(line?.newLine === undefined
										? {}
										: {
												startLine: line.newLine,
												endLine: line.newLine,
											}),
								},
							}
						: {}),
				},
			};
		}
		if (key === "\u007f" || key === "\b") {
			return {
				state: { ...current, draftBody: current.draftBody.slice(0, -1) },
			};
		}
		if (key.length >= 1 && !key.startsWith("\u001b")) {
			return { state: appendText(current, key) };
		}
		return { state: current };
	}

	if (key === "j" || key === "\u001b[B") {
		return { state: moveSelection(current, document, 1) };
	}
	if (key === "k" || key === "\u001b[A") {
		return { state: moveSelection(current, document, -1) };
	}
	if (key === "\t") {
		return {
			state: { ...current, surface: cycle(SURFACES, current.surface, 1) },
		};
	}
	if (key === "l" || key === "\u001b[C") {
		return {
			state: {
				...current,
				surface:
					current.surface === "inbox"
						? "files"
						: current.surface === "files"
							? "diff"
							: current.surface === "diff"
								? "threads"
								: current.surface,
			},
		};
	}
	if (key === "h" || key === "\u001b[D") {
		return {
			state: {
				...current,
				surface:
					current.surface === "threads"
						? "diff"
						: current.surface === "diff"
							? "files"
							: current.surface === "files"
								? "inbox"
								: current.surface,
			},
		};
	}
	if (key === "i") return { state: { ...current, surface: "inbox" } };
	if (key === "f") return { state: { ...current, surface: "files" } };
	if (key === "d") return { state: { ...current, surface: "diff" } };
	if (key === "t") return { state: { ...current, surface: "threads" } };
	if (key === "\r") {
		if (current.surface === "inbox") {
			const item = document.inbox[current.selectedInbox];
			return {
				state: {
					...current,
					surface: "files",
					...(item ? { activeReviewId: item.reviewId } : {}),
				},
			};
		}
		const file = selectedFile(document, current);
		const hunk = file
			? chunkForFile(document, file.fileId)?.hunks[current.selectedHunk]
			: undefined;
		const generationId = document.snapshot?.currentGenerationId;
		if (!file || !hunk || !generationId) return { state: current };
		return {
			state: current,
			command: {
				kind: "mark-coverage",
				generationId,
				unit: {
					kind: "hunk",
					fileId: file.fileId,
					hunkId: hunk.hunkId,
					contentIdentity: hunk.fingerprint,
				},
				state: "reviewed",
			},
		};
	}
	if (key === "n" || key === "]") {
		const next = nextUnreviewedAnchor(document, current);
		if (!next) return { state: current };
		return {
			state: {
				...current,
				surface: current.surface === "inbox" ? "files" : current.surface,
				selectedFile: next.fileIndex,
				selectedHunk: next.hunkIndex,
				selectedLine: 0,
			},
		};
	}
	if (key === " ") {
		return {
			state: {
				...current,
				rangeStart: current.rangeStart ?? {
					fileIndex: current.selectedFile,
					hunkIndex: current.selectedHunk,
					lineIndex: current.selectedLine,
				},
			},
		};
	}
	if (key === "c") {
		return { state: { ...current, draftOpen: true, draftBody: "" } };
	}
	if (key === "v") {
		return { state: { ...current, layout: cycle(LAYOUTS, current.layout, 1) } };
	}
	if (key === "u") return { state: { ...current, layout: "unified" } };
	if (key === "s") return { state: { ...current, layout: "split" } };
	if (key === "S") return { state: { ...current, layout: "stacked" } };
	if (key === "+") {
		const command = selectionCommand("stage-selection", document, current);
		return command ? { state: current, command } : { state: current };
	}
	if (key === "-") {
		const command = selectionCommand("unstage-selection", document, current);
		return command ? { state: current, command } : { state: current };
	}
	if (key === ".") {
		const messageId = selectedMessageId(document, current);
		if (!messageId) return { state: current };
		return {
			state: current,
			command: {
				kind: "apply-suggestion",
				messageId,
				approvalDigest: "",
			},
		};
	}
	if (key === "a") {
		return { state: { ...current, surface: "approval", prompt: "" } };
	}
	if (key === "r") {
		return { state: current, command: { kind: "refresh-review" } };
	}
	if (key === "R") {
		const threadId = selectedThreadId(document, current);
		if (!threadId) return { state: current };
		return {
			state: current,
			command: {
				kind: "route-thread-to-agent",
				threadId,
				agentId: document.routedAgents[threadId] ?? "agent-7",
			},
		};
	}
	if (key === "?") {
		return { state: { ...current, message: REVIEW_TERMINAL_KEY_HELP } };
	}
	if (key.length > 1 && !key.startsWith("\u001b")) {
		return { state: appendText(current, key) };
	}
	return { state: current };
}
