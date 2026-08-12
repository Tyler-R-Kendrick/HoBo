import type {
	ReviewDiffLine,
	ReviewFileSummary,
	ReviewHunk,
} from "./review-ports.js";
import {
	chunkForFile,
	coverageStateFor,
	type ReviewDiffLayout,
	type ReviewTerminalDocument,
	type ReviewTerminalState,
	type ReviewWidthBand,
	reviewFilePathLabel,
} from "./review-terminal-model.js";
import { sanitizeReviewTerminalText } from "./review-terminal-sanitize.js";

export type ReviewDocumentRowKind =
	| "file-header"
	| "hunk-header"
	| "diff-line"
	| "split-line"
	| "binary"
	| "too-large"
	| "thread"
	| "comment"
	| "draft"
	| "stack-member"
	| "generation"
	| "coverage"
	| "blank";

export interface ReviewDocumentRow {
	readonly kind: ReviewDocumentRowKind;
	readonly text: string;
	readonly fileId?: string;
	readonly hunkId?: string;
	readonly lineId?: string;
	readonly threadId?: string;
	readonly messageId?: string;
	readonly fileIndex?: number;
	readonly hunkIndex?: number;
	readonly lineIndex?: number;
	readonly oldLine?: number;
	readonly newLine?: number;
	readonly commentChars?: number;
	readonly highlightable: boolean;
}

export interface ReviewLayoutOptions {
	readonly layout: ReviewDiffLayout;
	readonly width: number;
}

export function classifyReviewWidth(width: number): ReviewWidthBand {
	if (width < 72) return "narrow";
	if (width < 120) return "medium";
	return "wide";
}

function row(
	kind: ReviewDocumentRowKind,
	text: string,
	extra: Partial<ReviewDocumentRow> = {},
): ReviewDocumentRow {
	return {
		kind,
		text: sanitizeReviewTerminalText(text),
		highlightable: extra.highlightable === true,
		...extra,
		...(extra.text === undefined
			? {}
			: { text: sanitizeReviewTerminalText(extra.text) }),
	};
}

function linePrefix(line: ReviewDiffLine): string {
	if (line.kind === "addition") return "+";
	if (line.kind === "deletion") return "-";
	if (line.kind === "no-newline-marker") return "\\";
	return " ";
}

function lineNumber(value: number | undefined): string {
	return value === undefined ? "    " : String(value).padStart(4, " ");
}

function threadsForLine(
	document: ReviewTerminalDocument,
	fileId: string,
	line: ReviewDiffLine,
) {
	return document.threads.filter((thread) => {
		const anchor = thread.anchor;
		if (!anchor || anchor.fileId !== fileId) return false;
		const target = line.newLine ?? line.oldLine;
		if (target === undefined) return false;
		const start = anchor.startLine ?? target;
		const end = anchor.endLine ?? start;
		return target >= start && target <= end;
	});
}

function commentRows(
	document: ReviewTerminalDocument,
	threadId: string,
): ReviewDocumentRow[] {
	const thread = document.threads.find((item) => item.threadId === threadId);
	if (!thread) return [];
	const agent = document.routedAgents[threadId];
	const out: ReviewDocumentRow[] = [
		row(
			"thread",
			`thread ${thread.threadId} · ${thread.resolution}${agent ? ` → ${agent}` : ""}`,
			{ threadId, highlightable: false },
		),
	];
	for (const messageId of thread.messageIds) {
		const message = document.messages.find(
			(item) => item.messageId === messageId,
		);
		if (!message) continue;
		const body = document.messageBodies[messageId] ?? "";
		const draft = message.publicationState === "private";
		out.push(
			row(draft ? "draft" : "comment", draft ? "draft" : "comment", {
				threadId,
				messageId,
				commentChars: body.length,
				highlightable: true,
			}),
		);
	}
	return out;
}

function paintLine(
	layout: ReviewDiffLayout,
	line: ReviewDiffLine,
	fileId: string,
	fileIndex: number,
	hunkId: string,
	hunkIndex: number,
	lineIndex: number,
): ReviewDocumentRow {
	const unified = `${lineNumber(line.oldLine)} ${lineNumber(line.newLine)} ${linePrefix(line)}${line.displayText}`;
	const split = `${lineNumber(line.oldLine)} ${line.kind === "addition" ? " " : line.displayText} │ ${lineNumber(line.newLine)} ${line.kind === "deletion" ? " " : line.displayText}`;
	return row(
		layout === "split" ? "split-line" : "diff-line",
		layout === "split" ? split : unified,
		{
			fileId,
			hunkId,
			lineId: line.lineId,
			fileIndex,
			hunkIndex,
			lineIndex,
			...(line.oldLine === undefined ? {} : { oldLine: line.oldLine }),
			...(line.newLine === undefined ? {} : { newLine: line.newLine }),
		},
	);
}

function hunkRows(
	document: ReviewTerminalDocument,
	file: ReviewFileSummary,
	fileIndex: number,
	hunk: ReviewHunk,
	hunkIndex: number,
	layout: ReviewDiffLayout,
): ReviewDocumentRow[] {
	const state = coverageStateFor(document, file.fileId, hunk.hunkId);
	const out: ReviewDocumentRow[] = [
		row("hunk-header", `${hunk.header} · ${state ?? "unreviewed"}`, {
			fileId: file.fileId,
			hunkId: hunk.hunkId,
			fileIndex,
			hunkIndex,
		}),
		row("coverage", `coverage ${state ?? "unreviewed"}`, {
			fileId: file.fileId,
			hunkId: hunk.hunkId,
			fileIndex,
			hunkIndex,
		}),
	];
	hunk.lines.forEach((line, lineIndex) => {
		out.push(
			paintLine(
				layout,
				line,
				file.fileId,
				fileIndex,
				hunk.hunkId,
				hunkIndex,
				lineIndex,
			),
		);
		for (const thread of threadsForLine(document, file.fileId, line)) {
			out.push(...commentRows(document, thread.threadId));
		}
	});
	return out;
}

function fileRows(
	document: ReviewTerminalDocument,
	file: ReviewFileSummary,
	fileIndex: number,
	layout: ReviewDiffLayout,
): ReviewDocumentRow[] {
	const path = reviewFilePathLabel(file.pathAfter, file.pathBefore);
	const header = row("file-header", path, {
		fileId: file.fileId,
		fileIndex,
	});
	if (file.binary) {
		return [
			header,
			row("binary", "binary file — not shown inline", {
				fileId: file.fileId,
				fileIndex,
			}),
		];
	}
	if (file.tooLargeForInline) {
		return [
			header,
			row("too-large", "too large for inline review", {
				fileId: file.fileId,
				fileIndex,
			}),
		];
	}
	const chunk = chunkForFile(document, file.fileId);
	const hunks = chunk?.hunks ?? [];
	const body = hunks.flatMap((hunk, hunkIndex) =>
		hunkRows(document, file, fileIndex, hunk, hunkIndex, layout),
	);
	return [header, ...body];
}

export function buildReviewDocumentRows(
	document: ReviewTerminalDocument,
	options: ReviewLayoutOptions,
): readonly ReviewDocumentRow[] {
	const rows: ReviewDocumentRow[] = [];
	if (document.generation) {
		const count = (document.generations?.length ?? 0) + 1;
		rows.push(
			row(
				"generation",
				`gen ${document.generation.ordinal}/${Math.max(count, document.generation.ordinal)} · ${document.generation.id}`,
			),
		);
	}
	const target = document.snapshot?.target;
	if (target?.kind === "stack") {
		for (const member of target.members) {
			rows.push(
				row("stack-member", `stack ${target.stackId} · ${member.memberId}`, {}),
			);
		}
	}
	const files = document.manifest?.files ?? [];
	for (const [fileIndex, file] of files.entries()) {
		rows.push(...fileRows(document, file, fileIndex, options.layout));
	}
	return rows;
}

export function visibleReviewRows(
	rows: readonly ReviewDocumentRow[],
	scroll: number,
	height: number,
): readonly ReviewDocumentRow[] {
	const start = Math.max(0, Math.min(scroll, Math.max(0, rows.length - 1)));
	return rows.slice(start, start + Math.max(0, height));
}

export function stickyHeadersFor(
	rows: readonly ReviewDocumentRow[],
	scroll: number,
): readonly string[] {
	let fileHeader: string | undefined;
	let hunkHeader: string | undefined;
	const limit = Math.max(0, Math.min(scroll, rows.length));
	for (let index = 0; index < limit; index += 1) {
		const item = rows[index];
		if (item?.kind === "file-header") fileHeader = item.text;
		if (item?.kind === "hunk-header") hunkHeader = item.text;
	}
	const first = rows[limit];
	if (first?.kind === "file-header") return [];
	return [fileHeader, hunkHeader].filter(
		(item): item is string => item !== undefined && item.length > 0,
	);
}

function fileCount(document: ReviewTerminalDocument): number {
	return document.manifest?.files.length ?? 0;
}

function hunkCount(
	document: ReviewTerminalDocument,
	fileIndex: number,
): number {
	const file = document.manifest?.files[fileIndex];
	if (!file) return 0;
	return chunkForFile(document, file.fileId)?.hunks.length ?? 0;
}

function lineCount(
	document: ReviewTerminalDocument,
	fileIndex: number,
	hunkIndex: number,
): number {
	const file = document.manifest?.files[fileIndex];
	if (!file) return 0;
	return (
		chunkForFile(document, file.fileId)?.hunks[hunkIndex]?.lines.length ?? 0
	);
}

export function clampReviewTerminalState(
	state: ReviewTerminalState,
	document: ReviewTerminalDocument,
): ReviewTerminalState {
	const inboxMax = Math.max(0, document.inbox.length - 1);
	const fileMax = Math.max(0, fileCount(document) - 1);
	const selectedFile = Math.min(state.selectedFile, fileMax);
	const hunkMax = Math.max(0, hunkCount(document, selectedFile) - 1);
	const selectedHunk = Math.min(state.selectedHunk, hunkMax);
	const lineMax = Math.max(
		0,
		lineCount(document, selectedFile, selectedHunk) - 1,
	);
	const rows = buildReviewDocumentRows(document, {
		layout: state.layout,
		width: 80,
	});
	const scrollMax = Math.max(0, rows.length - 1);
	return {
		...state,
		selectedInbox: Math.min(Math.max(0, state.selectedInbox), inboxMax),
		selectedFile,
		selectedHunk,
		selectedLine: Math.min(state.selectedLine, lineMax),
		scroll: Math.min(Math.max(0, state.scroll), scrollMax),
	};
}

export function nextUnreviewedAnchor(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
): { readonly fileIndex: number; readonly hunkIndex: number } | undefined {
	const files = document.manifest?.files ?? [];
	for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
		const file = files[fileIndex];
		if (!file) continue;
		const hunks = chunkForFile(document, file.fileId)?.hunks ?? [];
		for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
			const hunk = hunks[hunkIndex];
			if (!hunk) continue;
			if (coverageStateFor(document, file.fileId, hunk.hunkId) === "reviewed") {
				continue;
			}
			if (
				fileIndex > state.selectedFile ||
				(fileIndex === state.selectedFile && hunkIndex > state.selectedHunk)
			) {
				return { fileIndex, hunkIndex };
			}
		}
	}
	for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
		const file = files[fileIndex];
		if (!file) continue;
		const hunks = chunkForFile(document, file.fileId)?.hunks ?? [];
		for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
			const hunk = hunks[hunkIndex];
			if (!hunk) continue;
			if (coverageStateFor(document, file.fileId, hunk.hunkId) !== "reviewed") {
				return { fileIndex, hunkIndex };
			}
		}
	}
	return undefined;
}

export function highlightVisibleComment(text: string): {
	readonly painted: string;
	readonly chars: number;
} {
	return { painted: sanitizeReviewTerminalText(text), chars: text.length };
}
