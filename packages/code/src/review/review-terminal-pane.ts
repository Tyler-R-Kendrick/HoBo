import {
	ACCENT,
	type AccentName,
	cellWidth,
	fitCells,
	inkCard,
	statusStripe,
} from "../rubberhose.js";
import { REVIEW_TERMINAL_KEY_HELP } from "./review-terminal-actions.js";
import {
	buildReviewDocumentRows,
	clampReviewTerminalState,
	classifyReviewWidth,
	highlightVisibleComment,
	stickyHeadersFor,
	visibleReviewRows,
} from "./review-terminal-layout.js";
import {
	coverageStateFor,
	type ReviewTerminalDocument,
	type ReviewTerminalState,
	reviewFilePathLabel,
} from "./review-terminal-model.js";
import { sanitizeReviewTerminalText } from "./review-terminal-sanitize.js";

export interface ReviewTerminalRenderStats {
	readonly width: number;
	readonly height: number;
	readonly widthBand: ReturnType<typeof classifyReviewWidth>;
	readonly documentRows: number;
	readonly renderedRows: number;
	readonly highlightedCommentChars: number;
	readonly highlightedCommentIds: readonly string[];
	readonly stickyHeaders: readonly string[];
}

export interface ReviewTerminalFrame {
	readonly frame: string;
	readonly lines: readonly string[];
	readonly stats: ReviewTerminalRenderStats;
}

function crop(value: string, width: number): string {
	return fitCells(sanitizeReviewTerminalText(value), width);
}

function joinColumns(
	left: readonly string[],
	right: readonly string[],
): string[] {
	const leftWidth = left[0]?.length ?? 0;
	const length = Math.max(left.length, right.length);
	return Array.from({ length }, (_, index) => {
		const l = left[index] ?? " ".repeat(leftWidth);
		const r = right[index] ?? "";
		return `${l}${l.length > 0 && r.length > 0 ? " " : ""}${r}`;
	});
}

function card(
	title: string,
	body: readonly string[],
	width: number,
	height: number,
	accent: AccentName = "none",
): string[] {
	const inner = Math.max(1, height - 3);
	const padded = [...body.slice(0, inner)];
	while (padded.length < inner) padded.push("");
	return inkCard(padded, { width, title, accent, flat: true }).slice(0, height);
}

function inboxLines(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	width: number,
	height: number,
): string[] {
	const inner = Math.max(1, width - 4);
	const rows = document.inbox.map((item, index) => {
		const mark = index === state.selectedInbox ? "▸" : " ";
		const stack = item.stack
			? ` · stack ${item.stack.stackId}${item.stack.blockedBy ? ` blocked ${item.stack.blockedBy}` : ""}`
			: "";
		const stale = item.progress.staleUnits > 0 ? " stale" : "";
		return crop(
			`${mark} ${item.targetLabel} · ${item.derivedState}${stale}${stack}`,
			inner,
		);
	});
	return card("inbox", rows.length > 0 ? rows : ["(empty)"], width, height);
}

function fileLines(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	width: number,
	height: number,
): string[] {
	const inner = Math.max(1, width - 4);
	const files = document.manifest?.files ?? [];
	const rows = files.map((file, index) => {
		const mark = index === state.selectedFile ? "▸" : " ";
		const hunk = document.chunks.find((chunk) => chunk.fileId === file.fileId)
			?.hunks[0];
		const cov =
			coverageStateFor(document, file.fileId, hunk?.hunkId) ?? "unreviewed";
		const flag = file.binary
			? "binary"
			: file.tooLargeForInline
				? "too large"
				: cov;
		return crop(
			`${mark} ${reviewFilePathLabel(file.pathAfter, file.pathBefore)} · ${flag}`,
			inner,
		);
	});
	return card(
		"files",
		rows.length > 0 ? rows : ["(no manifest)"],
		width,
		height,
	);
}

function paintDiffRows(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	width: number,
	height: number,
): {
	readonly lines: string[];
	readonly highlightedCommentChars: number;
	readonly highlightedCommentIds: string[];
	readonly stickyHeaders: readonly string[];
	readonly documentRows: number;
	readonly renderedRows: number;
} {
	const rows = buildReviewDocumentRows(document, {
		layout: state.layout,
		width,
	});
	const headers = stickyHeadersFor(rows, state.scroll);
	const headerBudget = Math.min(headers.length, Math.max(0, height - 4));
	const bodyHeight = Math.max(1, height - 3 - headerBudget);
	const visible = visibleReviewRows(rows, state.scroll, bodyHeight);
	const highlightedCommentIds: string[] = [];
	let highlightedCommentChars = 0;
	const inner = Math.max(1, width - 4);
	const painted = [
		...headers.slice(0, headerBudget).map((item) => crop(`▸ ${item}`, inner)),
		...visible.map((item) => {
			if (item.highlightable && item.messageId && item.commentChars) {
				const source = document.messageBodies[item.messageId] ?? item.text;
				const highlighted = highlightVisibleComment(source);
				highlightedCommentChars += highlighted.chars;
				highlightedCommentIds.push(item.messageId);
				const draft = item.kind === "draft" ? "draft " : "";
				return crop(`${draft}${highlighted.painted}`, inner);
			}
			return crop(item.text, inner);
		}),
	];
	const title =
		state.layout === "unified"
			? "diff"
			: state.layout === "split"
				? "diff split"
				: "diff stacked";
	return {
		lines: card(title, painted, width, height),
		highlightedCommentChars,
		highlightedCommentIds,
		stickyHeaders: headers,
		documentRows: rows.length,
		renderedRows: visible.length,
	};
}

function threadLines(
	document: ReviewTerminalDocument,
	width: number,
	height: number,
): string[] {
	const inner = Math.max(1, width - 4);
	const rows = document.threads.flatMap((thread) => {
		const agent = document.routedAgents[thread.threadId];
		const head = crop(
			`${thread.threadId} · ${thread.resolution}${agent ? ` → ${agent}` : ""}`,
			inner,
		);
		const bodies = thread.messageIds.map((messageId) => {
			const message = document.messages.find(
				(item) => item.messageId === messageId,
			);
			const draft = message?.publicationState === "private" ? "draft " : "";
			return crop(
				`  ${draft}${document.messageBodies[messageId] ?? ""}`,
				inner,
			);
		});
		return [head, ...bodies];
	});
	return card(
		"threads",
		rows.length > 0 ? rows : ["(no threads)"],
		width,
		height,
	);
}

function approvalLines(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	width: number,
	height: number,
): string[] {
	const inner = Math.max(1, width - 4);
	const effect = document.pendingEffect;
	const details = effect
		? Object.entries(effect.details).map(([key, value]) =>
				crop(`${key}: ${value}`, inner),
			)
		: [];
	const body = [
		crop("Exact effect — type the digest to publish.", inner),
		crop(document.pendingSummary ?? "(no pending summary)", inner),
		crop(`decision ${document.pending?.decision ?? "comment"}`, inner),
		`${ACCENT.spark}${crop(`digest ${effect?.digest ?? "(none)"}`, inner)}${ACCENT.reset}`,
		...details,
		crop(`> ${state.prompt}`, inner),
	];
	return card("approve?", body, width, height, "spark");
}

function headerLine(document: ReviewTerminalDocument, width: number): string {
	const gen = document.generation
		? `gen ${document.generation.ordinal}`
		: "no generation";
	const stack =
		document.snapshot?.target?.kind === "stack"
			? ` · ${document.snapshot.target.stackId}`
			: "";
	const pending = document.pending ? " · pending review" : "";
	return crop(`hobo-code · review · ${gen}${stack}${pending}`, width);
}

export function renderReviewTerminalPane(
	document: ReviewTerminalDocument,
	state: ReviewTerminalState,
	columns = 80,
	rows = 24,
): ReviewTerminalFrame {
	const width = Math.max(40, Math.trunc(columns));
	const height = Math.max(8, Math.trunc(rows));
	const band = classifyReviewWidth(width);
	const clamped = clampReviewTerminalState(state, document);
	const bodyHeight = Math.max(4, height - 2);
	let highlightedCommentChars = 0;
	let highlightedCommentIds: readonly string[] = [];
	let stickyHeaders: readonly string[] = [];
	let documentRows = 0;
	let renderedRows = 0;
	let body: string[] = [];

	if (clamped.surface === "approval") {
		body = approvalLines(document, clamped, width, bodyHeight);
	} else if (band === "narrow") {
		if (clamped.surface === "inbox")
			body = inboxLines(document, clamped, width, bodyHeight);
		else if (clamped.surface === "files")
			body = fileLines(document, clamped, width, bodyHeight);
		else if (clamped.surface === "threads")
			body = threadLines(document, width, bodyHeight);
		else {
			const painted = paintDiffRows(document, clamped, width, bodyHeight);
			body = painted.lines;
			highlightedCommentChars = painted.highlightedCommentChars;
			highlightedCommentIds = painted.highlightedCommentIds;
			stickyHeaders = painted.stickyHeaders;
			documentRows = painted.documentRows;
			renderedRows = painted.renderedRows;
		}
	} else if (band === "medium") {
		const leftWidth = Math.max(22, Math.floor(width * 0.34));
		const rightWidth = width - leftWidth - 1;
		const left =
			clamped.surface === "inbox"
				? inboxLines(document, clamped, leftWidth, bodyHeight)
				: fileLines(document, clamped, leftWidth, bodyHeight);
		const right =
			clamped.surface === "threads"
				? threadLines(document, rightWidth, bodyHeight)
				: paintDiffRows(document, clamped, rightWidth, bodyHeight);
		if ("lines" in right) {
			body = joinColumns(left, right.lines);
			highlightedCommentChars = right.highlightedCommentChars;
			highlightedCommentIds = right.highlightedCommentIds;
			stickyHeaders = right.stickyHeaders;
			documentRows = right.documentRows;
			renderedRows = right.renderedRows;
		} else {
			body = joinColumns(left, right);
		}
	} else {
		const inboxWidth = Math.max(24, Math.floor(width * 0.24));
		const fileWidth = Math.max(22, Math.floor(width * 0.24));
		const diffWidth = width - inboxWidth - fileWidth - 2;
		const painted = paintDiffRows(document, clamped, diffWidth, bodyHeight);
		const right =
			clamped.surface === "threads"
				? threadLines(document, diffWidth, bodyHeight)
				: painted.lines;
		body = joinColumns(
			joinColumns(
				inboxLines(document, clamped, inboxWidth, bodyHeight),
				fileLines(document, clamped, fileWidth, bodyHeight),
			),
			right,
		);
		if (clamped.surface !== "threads") {
			highlightedCommentChars = painted.highlightedCommentChars;
			highlightedCommentIds = painted.highlightedCommentIds;
			stickyHeaders = painted.stickyHeaders;
			documentRows = painted.documentRows;
			renderedRows = painted.renderedRows;
		}
	}

	const lines = [
		headerLine(document, width),
		...body.slice(0, bodyHeight).map((line) => {
			const pad = width - cellWidth(line);
			return pad > 0 ? `${line}${" ".repeat(pad)}` : fitCells(line, width);
		}),
		statusStripe(
			[
				clamped.surface,
				clamped.layout,
				clamped.message ?? REVIEW_TERMINAL_KEY_HELP,
			],
			width,
		),
	];
	while (lines.length < height) lines.push(crop("", width));
	const fitted = lines.slice(0, height).map((line) => fitCells(line, width));
	return {
		frame: fitted.join("\n"),
		lines: fitted,
		stats: {
			width,
			height,
			widthBand: band,
			documentRows,
			renderedRows,
			highlightedCommentChars,
			highlightedCommentIds,
			stickyHeaders,
		},
	};
}
