import { describe, expect, it } from "vitest";
import { REVIEW_EFFECT_SCHEMA } from "../src/review/review-approval.js";
import {
	type PendingReview,
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewCoverageRecord,
	type ReviewDiffLine,
	type ReviewExactEffect,
	type ReviewFileSummary,
	type ReviewHunk,
	type ReviewInboxItem,
	type ReviewMessage,
	type ReviewThread,
} from "../src/review/review-ports.js";
import {
	REVIEW_TERMINAL_KEY_HELP,
	reduceReviewTerminalKey,
} from "../src/review/review-terminal-actions.js";
import {
	buildReviewDocumentRows,
	clampReviewTerminalState,
	classifyReviewWidth,
	visibleReviewRows,
} from "../src/review/review-terminal-layout.js";
import {
	createInitialReviewTerminalState,
	type ReviewTerminalDocument,
	type ReviewTerminalState,
} from "../src/review/review-terminal-model.js";
import { renderReviewTerminalPane } from "../src/review/review-terminal-pane.js";
import { cellWidth, INK } from "../src/rubberhose.js";

const WIDTHS = { narrow: 48, medium: 80, wide: 140 } as const;

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

function fileSummary(
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

function makeHunk(
	fileId: string,
	lines: readonly ReviewDiffLine[],
	index = 0,
): ReviewHunk {
	return {
		hunkId: `${fileId}:h${index}`,
		header: `@@ -1,1 +1,${lines.length} @@`,
		oldStart: 1,
		oldCount: 1,
		newStart: 1,
		newCount: lines.filter((item) => item.kind !== "deletion").length,
		fingerprint: `${fileId}-fp-${index}`,
		lines,
	};
}

function inboxItem(
	reviewId: string,
	label: string,
	overrides: Partial<ReviewInboxItem> = {},
): ReviewInboxItem {
	return {
		itemId: `inbox:${reviewId}`,
		reviewId,
		targetLabel: label,
		manualDisposition: "active",
		derivedState: "needs-review",
		attentionReasons: ["unreviewed"],
		progress: {
			reviewedFiles: 0,
			totalFiles: 2,
			reviewedHunks: 0,
			totalHunks: 2,
			staleUnits: 0,
			excludedUnits: 0,
		},
		lastUpdatedAt: "2026-08-12T00:00:00.000Z",
		...overrides,
	};
}

function coverage(
	fileId: string,
	hunkId: string,
	state: ReviewCoverageRecord["state"],
): ReviewCoverageRecord {
	return {
		coverageId: `cov:${fileId}:${hunkId}`,
		reviewId: "review-1",
		actorId: "actor-1",
		actorKind: "human",
		generationId: "gen-1",
		unit: {
			kind: "hunk",
			fileId,
			hunkId,
			contentIdentity: `${hunkId}-id`,
		},
		state,
	};
}

function threadOn(
	fileId: string,
	lineNo: number,
	threadId: string,
	messageIds: readonly string[],
): ReviewThread {
	return {
		threadId,
		reviewId: "review-1",
		origin: "local-human",
		visibility: "session",
		resolution: "open",
		anchorHealth: "current",
		messageIds,
		createdAt: "2026-08-12T00:00:00.000Z",
		updatedAt: "2026-08-12T00:00:00.000Z",
		anchor: {
			anchorId: `anchor:${threadId}`,
			generationId: "gen-1",
			fileId,
			pathAfter: fileId.replace("file:", ""),
			side: "new",
			startLine: lineNo,
			endLine: lineNo,
			hunkId: `${fileId}:h0`,
			contextBeforeHashes: [],
			contextAfterHashes: [],
		},
	};
}

function message(
	messageId: string,
	threadId: string,
	publicationState: ReviewMessage["publicationState"] = "private",
): ReviewMessage {
	return {
		messageId,
		threadId,
		authorId: "actor-1",
		authorKind: "human",
		origin: "local",
		bodyHash: messageId,
		createdAt: "2026-08-12T00:00:00.000Z",
		editRevision: 0,
		publicationState,
	};
}

function pending(): PendingReview {
	return {
		pendingReviewId: "pending-1",
		reviewId: "review-1",
		generationId: "gen-1",
		decision: "approve",
		summaryBodyHash: "sum-hash",
		selectedMessageIds: ["msg-draft"],
		selectedThreadOperations: [],
		orderedInlineComments: [],
		preparedBy: "actor-1",
		preparedAt: "2026-08-12T00:00:00.000Z",
		effectDigest: "digest-pending",
	};
}

function effect(): ReviewExactEffect {
	return {
		operation: "publish-review",
		schemaVersion: REVIEW_EFFECT_SCHEMA,
		commandId: "cmd-pub",
		actorId: "actor-1",
		reviewId: "review-1",
		expectedRevision: 4n,
		digest: "abc123def456",
		details: {
			decision: "approve",
			summaryBodyHash: "sum-hash",
			pendingReviewId: "pending-1",
		},
	};
}

function fixture(options: {
	readonly files?: readonly ReviewFileSummary[];
	readonly extraLines?: number;
	readonly hugeComment?: string;
	readonly includePending?: boolean;
	readonly includeStack?: boolean;
	readonly includeStale?: boolean;
}): ReviewTerminalDocument {
	const alpha = fileSummary("src/alpha.ts", { hunkCount: 1 });
	const beta = fileSummary("src/beta.ts", {
		hunkCount: 1,
		status: "added",
		additions: 2,
	});
	const blob = fileSummary("assets/photo.bin", {
		status: "binary",
		binary: true,
		hunkCount: 0,
		tooLargeForInline: false,
	});
	const huge = fileSummary("generated/bundle.js", {
		status: "modified",
		tooLargeForInline: true,
		binary: false,
		hunkCount: 0,
	});
	const files = options.files ?? [alpha, beta, blob, huge];
	const pad = options.extraLines ?? 0;
	const padLines = Array.from({ length: pad }, (_, index) =>
		line(`pad-${index}`, "context", `pad ${index}`, index + 3, index + 3),
	);
	const alphaHunk = makeHunk(alpha.fileId, [
		line("a1", "context", "export const a = 1;", 1, 1),
		line("a2", "addition", "export const a = 2;", undefined, 2),
		...padLines,
	]);
	const betaHunk = makeHunk(beta.fileId, [
		line("b1", "addition", "export const b = 1;", undefined, 1),
		line("b2", "addition", "export const b = 2;", undefined, 2),
	]);
	const hugeBody = options.hugeComment;
	const threads = [
		threadOn(alpha.fileId, 2, "thread-1", ["msg-draft"]),
		...(hugeBody
			? [threadOn(alpha.fileId, 2 + pad, "thread-huge", ["msg-huge"])]
			: []),
	];
	const messages = [
		message("msg-draft", "thread-1", "private"),
		...(hugeBody ? [message("msg-huge", "thread-huge", "published")] : []),
	];
	return {
		inbox: [
			inboxItem("review-1", "feature → main", {
				...(options.includeStack
					? {
							stack: {
								stackId: "stack-9",
								memberCount: 3,
								blockedBy: "review-0",
							},
						}
					: {}),
				progress: {
					reviewedFiles: 0,
					totalFiles: files.length,
					reviewedHunks: 0,
					totalHunks: 2,
					staleUnits: options.includeStale ? 1 : 0,
					excludedUnits: 0,
				},
			}),
			inboxItem("review-2", "hotfix → main", {
				derivedState: "in-progress",
			}),
		],
		snapshot: {
			schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
			reviewId: "review-1",
			revision: 4n,
			threadIds: threads.map((item) => item.threadId),
			coverageIds: options.includeStale ? ["cov-stale"] : [],
			inboxDisposition: "active",
			closed: false,
			updatedAt: "2026-08-12T00:00:00.000Z",
			currentGenerationId: "gen-1",
			sessionId: "session-1",
			...(options.includePending ? { pendingReviewId: "pending-1" } : {}),
			target: options.includeStack
				? {
						kind: "stack",
						stackId: "stack-9",
						repositoryId: "repo",
						aggregateBaseOid: "a".repeat(40),
						aggregateHeadOid: "b".repeat(40),
						members: [
							{
								memberId: "review-0",
								baseCommitOid: "a".repeat(40),
								headCommitOid: "c".repeat(40),
								mergeBaseOid: "a".repeat(40),
							},
							{
								memberId: "review-1",
								baseCommitOid: "c".repeat(40),
								headCommitOid: "b".repeat(40),
								mergeBaseOid: "c".repeat(40),
							},
						],
					}
				: {
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
			ordinal: 2,
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
		generations: [
			{
				id: "gen-0",
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
					headCommitOid: "2".repeat(40),
				},
				createdAt: "2026-08-11T00:00:00.000Z",
				createdBy: "actor-1",
				manifestHash: "mh0",
				diffOptionsHash: "dh",
			},
		],
		manifest: {
			generationId: "gen-1",
			manifestHash: "mh",
			files,
			totalFiles: files.length,
			totalAdditions: 3,
			totalDeletions: 0,
			binaryFiles: files.filter((item) => item.binary).length,
			pages: { limit: 32, truncated: false },
		},
		chunks: [
			{
				generationId: "gen-1",
				fileId: alpha.fileId,
				chunkId: "chunk-alpha",
				hunks: [alphaHunk],
			},
			{
				generationId: "gen-1",
				fileId: beta.fileId,
				chunkId: "chunk-beta",
				hunks: [betaHunk],
			},
		],
		threads,
		messages,
		coverage: [
			coverage(beta.fileId, betaHunk.hunkId, "reviewed"),
			...(options.includeStale
				? [coverage(alpha.fileId, alphaHunk.hunkId, "stale")]
				: []),
		],
		routedAgents: { "thread-1": "agent-7" },
		messageBodies: {
			"msg-draft": "please rename this export",
			...(hugeBody ? { "msg-huge": hugeBody } : {}),
		},
		...(options.includePending
			? {
					pending: pending(),
					pendingSummary: "Looks good after the rename.",
					pendingEffect: effect(),
				}
			: {}),
	};
}

const plain = (value: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: strip SGR for geometry checks
	value.replace(/\u001b\[[0-9;]*m/g, "");

function paint(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	width: number,
	height = 24,
) {
	return renderReviewTerminalPane(document, state, width, height);
}

describe("review terminal width bands", () => {
	it("classifies narrow, medium, and wide viewports", () => {
		expect(classifyReviewWidth(WIDTHS.narrow)).toBe("narrow");
		expect(classifyReviewWidth(WIDTHS.medium)).toBe("medium");
		expect(classifyReviewWidth(WIDTHS.wide)).toBe("wide");
	});

	it("keeps rubberhose geometry on narrow, medium, and wide", () => {
		const document = fixture({ includeStack: true, includeStale: true });
		const base = createInitialReviewTerminalState();
		for (const width of Object.values(WIDTHS)) {
			const painted = paint(
				document,
				{ ...base, surface: "diff", layout: "unified" },
				width,
				24,
			);
			expect(painted.lines).toHaveLength(24);
			for (const row of painted.lines) expect(cellWidth(row)).toBe(width);
			const text = plain(painted.frame);
			expect(text).toContain("hobo-code");
			expect(text).toContain("review");
			expect(text).toContain(INK.topLeft);
			expect(text).toContain(INK.horizontal);
			expect(text).not.toContain("───");
			expect(text).not.toContain("lazygit");
			expect(text).not.toContain("Files changed");
			expect(painted.stats.widthBand).toBe(classifyReviewWidth(width));
		}
	});

	it("shows inbox on wide, files on medium, and a single column on narrow", () => {
		const document = fixture({});
		const inbox = paint(
			document,
			{ ...createInitialReviewTerminalState(), surface: "inbox" },
			WIDTHS.wide,
		);
		expect(plain(inbox.frame)).toContain("feature → main");
		expect(plain(inbox.frame)).toContain("hotfix → main");

		const medium = paint(
			document,
			{ ...createInitialReviewTerminalState(), surface: "files" },
			WIDTHS.medium,
		);
		expect(plain(medium.frame)).toContain("src/alpha.ts");
		expect(plain(medium.frame)).toContain("src/beta.ts");

		const narrow = paint(
			document,
			{ ...createInitialReviewTerminalState(), surface: "inbox" },
			WIDTHS.narrow,
		);
		expect(plain(narrow.frame)).toContain("feature → main");
		expect(plain(narrow.frame)).not.toMatch(
			/src\/alpha\.ts[\s\S]*export const a/u,
		);
	});
});

describe("manifest-first continuous diff", () => {
	it("lists every manifest file and keeps binary/too-large explicit", () => {
		const document = fixture({});
		const painted = paint(
			document,
			{ ...createInitialReviewTerminalState(), surface: "files" },
			WIDTHS.medium,
		);
		const text = plain(painted.frame);
		expect(text).toContain("src/alpha.ts");
		expect(text).toContain("src/beta.ts");
		expect(text).toContain("assets/photo.bin");
		expect(text).toContain("generated/bundle.js");
		const rows = buildReviewDocumentRows(document, {
			layout: "unified",
			width: WIDTHS.medium,
		});
		expect(rows.some((row) => row.kind === "binary")).toBe(true);
		expect(rows.some((row) => row.kind === "too-large")).toBe(true);
		expect(text).toMatch(/binary|too large/i);
	});

	it("renders unified, split, and stacked layouts with sticky headers", () => {
		const document = fixture({ extraLines: 30 });
		for (const layout of ["unified", "split", "stacked"] as const) {
			const painted = paint(
				document,
				{
					...createInitialReviewTerminalState(),
					surface: "diff",
					layout,
					scroll: 12,
					selectedFile: 0,
					selectedHunk: 0,
					selectedLine: 8,
				},
				WIDTHS.medium,
				20,
			);
			expect(
				painted.stats.stickyHeaders.some((item) => item.includes("alpha")),
			).toBe(true);
			expect(plain(painted.frame)).toContain("src/alpha.ts");
			if (layout === "split") expect(plain(painted.frame)).toMatch(/│|\|/);
		}
	});

	it("shows coverage, stale, generations, threads, drafts, agent route, and stack", () => {
		const document = fixture({
			includeStack: true,
			includeStale: true,
			includePending: true,
		});
		const painted = paint(
			document,
			{ ...createInitialReviewTerminalState(), surface: "diff" },
			WIDTHS.wide,
			28,
		);
		const text = plain(painted.frame);
		expect(text).toMatch(/stale|reviewed/i);
		expect(text).toContain("gen 2");
		expect(text).toMatch(/draft/i);
		expect(text).toContain("agent-7");
		expect(text).toContain("stack-9");
		expect(text).toContain("review-0");
	});
});

describe("viewport-only highlight and clamp", () => {
	it("does not re-highlight 25k offscreen comment characters", () => {
		const huge = "q".repeat(25_000);
		const document = fixture({ extraLines: 40, hugeComment: huge });
		const rows = buildReviewDocumentRows(document, {
			layout: "unified",
			width: 80,
		});
		const comment = rows.find((row) => row.messageId === "msg-huge");
		expect(comment?.commentChars).toBe(25_000);
		const offscreen = paint(
			document,
			{
				...createInitialReviewTerminalState(),
				surface: "diff",
				scroll: 0,
				selectedFile: 0,
				selectedHunk: 0,
				selectedLine: 0,
			},
			80,
			8,
		);
		expect(offscreen.stats.highlightedCommentChars).toBe(0);
		expect(offscreen.stats.highlightedCommentIds).not.toContain("msg-huge");
		const commentIndex = rows.findIndex((row) => row.messageId === "msg-huge");
		const onscreen = paint(
			document,
			{
				...createInitialReviewTerminalState(),
				surface: "diff",
				scroll: Math.max(0, commentIndex - 1),
				selectedFile: 0,
				selectedHunk: 0,
				selectedLine: 0,
			},
			80,
			12,
		);
		expect(onscreen.stats.highlightedCommentChars).toBe(25_000);
		expect(
			visibleReviewRows(rows, 0, 8).every(
				(row) => row.messageId !== "msg-huge",
			),
		).toBe(true);
	});

	it("clamps selection and scroll after a shorter refresh", () => {
		const long = fixture({});
		const shortFiles = [fileSummary("src/alpha.ts")];
		const short = fixture({ files: shortFiles });
		const stale: ReviewTerminalState = {
			...createInitialReviewTerminalState(),
			surface: "files",
			selectedInbox: 9,
			selectedFile: 6,
			selectedHunk: 4,
			selectedLine: 20,
			scroll: 80,
		};
		const clamped = clampReviewTerminalState(stale, short);
		expect(clamped.selectedInbox).toBeLessThan(long.inbox.length);
		expect(clamped.selectedFile).toBe(0);
		expect(clamped.selectedHunk).toBe(0);
		expect(clamped.selectedLine).toBeLessThanOrEqual(1);
		expect(clamped.scroll).toBeLessThanOrEqual(
			Math.max(
				0,
				buildReviewDocumentRows(short, { layout: "unified", width: 80 })
					.length - 1,
			),
		);
	});
});

describe("keyboard-only review workflow", () => {
	it("walks inbox → file → next unreviewed → range → draft → stage → approval", () => {
		const document = fixture({ includePending: true });
		const state = createInitialReviewTerminalState();
		expect(state.surface).toBe("inbox");

		let result = reduceReviewTerminalKey(state, document, "j");
		expect(result.state.selectedInbox).toBe(1);
		result = reduceReviewTerminalKey(result.state, document, "k");
		expect(result.state.selectedInbox).toBe(0);

		result = reduceReviewTerminalKey(result.state, document, "\r");
		expect(result.state.surface).toBe("files");
		expect(result.state.activeReviewId).toBe("review-1");

		result = reduceReviewTerminalKey(result.state, document, "j");
		expect(result.state.selectedFile).toBe(1);
		result = reduceReviewTerminalKey(result.state, document, "n");
		expect(result.state.selectedFile).toBe(0);
		expect(result.command?.kind).toBeUndefined();

		result = reduceReviewTerminalKey(result.state, document, "l");
		expect(result.state.surface).toBe("diff");
		result = reduceReviewTerminalKey(result.state, document, " ");
		expect(result.state.rangeStart).toBeDefined();
		result = reduceReviewTerminalKey(result.state, document, "j");
		expect(result.state.selectedLine).toBeGreaterThan(0);

		result = reduceReviewTerminalKey(result.state, document, "c");
		expect(result.state.draftOpen).toBe(true);
		result = reduceReviewTerminalKey(result.state, document, "hello thread");
		result = reduceReviewTerminalKey(result.state, document, "\r");
		expect(result.command?.kind).toBe("create-thread");
		if (result.command?.kind === "create-thread") {
			expect(result.command.body).toBe("hello thread");
		}

		result = reduceReviewTerminalKey(
			{ ...result.state, draftOpen: false, draftBody: "" },
			document,
			"+",
		);
		expect(result.command?.kind).toBe("stage-selection");
		expect(
			result.command?.kind === "stage-selection" && "git" in result.command,
		).toBe(false);

		result = reduceReviewTerminalKey(result.state, document, "v");
		expect(["split", "stacked", "unified"]).toContain(result.state.layout);

		result = reduceReviewTerminalKey(result.state, document, "a");
		expect(result.state.surface).toBe("approval");
		const approval = paint(document, result.state, WIDTHS.medium, 24);
		expect(plain(approval.frame)).toContain("abc123def456");
		expect(plain(approval.frame)).toContain("Looks good after the rename.");
		expect(approval.frame).toContain("\u001b[38;5;160m");

		result = reduceReviewTerminalKey(result.state, document, "abc123def456");
		result = reduceReviewTerminalKey(result.state, document, "\r");
		expect(result.command?.kind).toBe("publish-submission");
		if (result.command?.kind === "publish-submission") {
			expect(result.command.approvalDigest).toBe("abc123def456");
		}

		result = reduceReviewTerminalKey(result.state, document, "r");
		expect(result.command?.kind).toBe("refresh-review");

		const quit = reduceReviewTerminalKey(result.state, document, "q");
		expect(quit.quit).toBe(true);
		expect(REVIEW_TERMINAL_KEY_HELP).toMatch(/keyboard/i);
	});

	it("never emits raw git for stage, unstage, or suggestion", () => {
		const document = fixture({});
		const state: ReviewTerminalState = {
			...createInitialReviewTerminalState(),
			surface: "diff",
			activeReviewId: "review-1",
		};
		expect(reduceReviewTerminalKey(state, document, "+").command?.kind).toBe(
			"stage-selection",
		);
		expect(reduceReviewTerminalKey(state, document, "-").command?.kind).toBe(
			"unstage-selection",
		);
		expect(reduceReviewTerminalKey(state, document, ".").command?.kind).toBe(
			"apply-suggestion",
		);
		for (const key of ["+", "-", "."]) {
			const command = reduceReviewTerminalKey(state, document, key).command;
			expect(JSON.stringify(command)).not.toMatch(/git\s+(add|restore|apply)/i);
		}
	});
});
