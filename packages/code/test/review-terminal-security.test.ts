import { describe, expect, it } from "vitest";
import {
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewDiffLine,
	type ReviewFileSummary,
	type ReviewHunk,
	type ReviewInboxItem,
	type ReviewMessage,
	type ReviewThread,
} from "../src/review/review-ports.js";
import {
	createInitialReviewTerminalState,
	type ReviewTerminalDocument,
} from "../src/review/review-terminal-model.js";
import { renderReviewTerminalPane } from "../src/review/review-terminal-pane.js";
import {
	containsUnsafeTerminalControl,
	sanitizeReviewTerminalMultiline,
	sanitizeReviewTerminalText,
} from "../src/review/review-terminal-sanitize.js";

const TITLE = "\u001b]0;HACKED-TITLE\u0007";
const TITLE_ST = "\u001b]2;also-hacked\u001b\\";
const CLIPBOARD = "\u001b]52;c;Y2xpcGJvYXJk\u0007";
const ERASE = "\u001b[2J\u001b[H\u001b[31m";
const DCS = "\u001bP+q544e\u001b\\";
const BEL = "\u0007";
const CR = "safe\rHACK";
const BIDI = "\u202E\u2066secret\u2069";

function line(
	id: string,
	kind: ReviewDiffLine["kind"],
	text: string,
	oldLine?: number,
	newLine?: number,
): ReviewDiffLine {
	return {
		lineId: id,
		kind,
		displayText: text,
		rawTextHash: id,
		...(oldLine === undefined ? {} : { oldLine }),
		...(newLine === undefined ? {} : { newLine }),
	};
}

function file(
	path: string,
	overrides: Partial<ReviewFileSummary> = {},
): ReviewFileSummary {
	return {
		fileId: `file:${path}`,
		pathAfter: path,
		status: "modified",
		binary: false,
		tooLargeForInline: false,
		hunkCount: 1,
		additions: 1,
		deletions: 0,
		...overrides,
	};
}

function hunk(fileId: string, lines: readonly ReviewDiffLine[]): ReviewHunk {
	return {
		hunkId: `${fileId}:h0`,
		header: "@@ -1,1 +1,2 @@",
		oldStart: 1,
		oldCount: 1,
		newStart: 1,
		newCount: lines.filter((item) => item.kind !== "deletion").length,
		fingerprint: `${fileId}-fp`,
		lines,
	};
}

function inbox(): ReviewInboxItem {
	return {
		itemId: "inbox-1",
		reviewId: "review-1",
		targetLabel: "feature → main",
		manualDisposition: "active",
		derivedState: "needs-review",
		attentionReasons: ["unreviewed"],
		progress: {
			reviewedFiles: 0,
			totalFiles: 1,
			reviewedHunks: 0,
			totalHunks: 1,
			staleUnits: 0,
			excludedUnits: 0,
		},
		lastUpdatedAt: "2026-08-12T00:00:00.000Z",
	};
}

function documentWithHostileText(hostile: string): ReviewTerminalDocument {
	const summary = file(`${hostile}notes.ts`);
	const thread: ReviewThread = {
		threadId: "thread-1",
		reviewId: "review-1",
		origin: "local-human",
		visibility: "session",
		resolution: "open",
		anchorHealth: "current",
		messageIds: ["msg-1"],
		createdAt: "2026-08-12T00:00:00.000Z",
		updatedAt: "2026-08-12T00:00:00.000Z",
		anchor: {
			anchorId: "anchor-1",
			generationId: "gen-1",
			fileId: summary.fileId,
			pathAfter: summary.pathAfter,
			side: "new",
			startLine: 2,
			endLine: 2,
			hunkId: `${summary.fileId}:h0`,
			contextBeforeHashes: [],
			contextAfterHashes: [],
		},
	};
	const message: ReviewMessage = {
		messageId: "msg-1",
		threadId: "thread-1",
		authorId: "actor-1",
		authorKind: "human",
		origin: "local",
		bodyHash: "body-1",
		createdAt: "2026-08-12T00:00:00.000Z",
		editRevision: 0,
		publicationState: "private",
	};
	return {
		inbox: [inbox()],
		snapshot: {
			schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
			reviewId: "review-1",
			revision: 1n,
			threadIds: ["thread-1"],
			coverageIds: [],
			inboxDisposition: "active",
			closed: false,
			updatedAt: "2026-08-12T00:00:00.000Z",
			currentGenerationId: "gen-1",
			target: {
				kind: "range",
				repositoryId: "repo",
				repositoryRoot: "/tmp/repo",
				requestedBaseRef: "main",
				requestedHeadRef: "feature",
				mergeBaseOid: "1".repeat(40),
				baseCommitOid: "2".repeat(40),
				headCommitOid: "3".repeat(40),
			},
		},
		generation: {
			id: "gen-1",
			reviewId: "review-1",
			ordinal: 1,
			target: {
				kind: "range",
				repositoryId: "repo",
				repositoryRoot: "/tmp/repo",
				requestedBaseRef: "main",
				requestedHeadRef: "feature",
				mergeBaseOid: "1".repeat(40),
				baseCommitOid: "2".repeat(40),
				headCommitOid: "3".repeat(40),
			},
			createdAt: "2026-08-12T00:00:00.000Z",
			createdBy: "actor-1",
			manifestHash: "mh",
			diffOptionsHash: "dh",
		},
		manifest: {
			generationId: "gen-1",
			manifestHash: "mh",
			files: [summary],
			totalFiles: 1,
			totalAdditions: 1,
			totalDeletions: 0,
			binaryFiles: 0,
			pages: { limit: 32, truncated: false },
		},
		chunks: [
			{
				generationId: "gen-1",
				fileId: summary.fileId,
				chunkId: "chunk-1",
				hunks: [
					hunk(summary.fileId, [
						line("l1", "context", "keep", 1, 1),
						line("l2", "addition", hostile, undefined, 2),
					]),
				],
			},
		],
		threads: [thread],
		messages: [message],
		coverage: [],
		routedAgents: {},
		messageBodies: { "msg-1": `draft ${hostile}` },
	};
}

function assertNoHijack(frame: string): void {
	expect(frame).not.toContain("\u001b]0;");
	expect(frame).not.toContain("\u001b]2;");
	expect(frame).not.toContain("\u001b]52;");
	expect(frame).not.toContain("\u001b]");
	expect(frame).not.toContain("\u001bP");
	expect(frame).not.toContain("\u0007");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting leftover cursor/erase CSI
	expect(frame).not.toMatch(/\u001b\[[0-9;]*[ABCDEFGHJKfsu]/u);
	expect(frame).not.toContain("\u202E");
	expect(frame).not.toContain("\u2066");
}

describe("review terminal sanitizer", () => {
	it("strips OSC title and clipboard, DCS, CSI, BEL, CR, and bidi", () => {
		const raw = `path${TITLE}${TITLE_ST}${CLIPBOARD}${ERASE}${DCS}${BEL}${CR}${BIDI}.ts`;
		expect(containsUnsafeTerminalControl(raw)).toBe(true);
		const clean = sanitizeReviewTerminalText(raw);
		expect(containsUnsafeTerminalControl(clean)).toBe(false);
		expect(clean).not.toContain("\u001b");
		expect(clean).not.toContain("\u0007");
		expect(clean).not.toContain("\r");
		expect(clean).not.toContain("\u202E");
		expect(clean).toContain("path");
		expect(clean).toContain("safe");
		expect(clean).toContain(".ts");
		expect(sanitizeReviewTerminalMultiline(`${ERASE}one\r\ntwo${BEL}`)).toBe(
			"one\ntwo",
		);
	});

	it("does not let hostile review text change title or clipboard through the pane", () => {
		const hostile = `${TITLE}${CLIPBOARD}${ERASE}${DCS}${BEL}${CR}${BIDI}`;
		const painted = renderReviewTerminalPane(
			documentWithHostileText(hostile),
			{
				...createInitialReviewTerminalState(),
				surface: "diff",
				selectedFile: 0,
				selectedHunk: 0,
				selectedLine: 1,
			},
			80,
			24,
		);
		assertNoHijack(painted.frame);
		expect(painted.frame).toContain("hobo-code");
	});
});
