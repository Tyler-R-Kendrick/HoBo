import type {
	PendingReview,
	ReviewCommand,
	ReviewCoverageRecord,
	ReviewDiffChunk,
	ReviewDiffManifest,
	ReviewExactEffect,
	ReviewGeneration,
	ReviewInboxItem,
	ReviewMessage,
	ReviewSnapshot,
	ReviewThread,
} from "./review-ports.js";

export type ReviewTerminalSurface =
	| "inbox"
	| "files"
	| "diff"
	| "threads"
	| "approval";

export type ReviewDiffLayout = "unified" | "split" | "stacked";

export type ReviewWidthBand = "narrow" | "medium" | "wide";

export interface ReviewLineAnchor {
	readonly fileIndex: number;
	readonly hunkIndex: number;
	readonly lineIndex: number;
}

export interface ReviewTerminalDocument {
	readonly inbox: readonly ReviewInboxItem[];
	readonly snapshot?: ReviewSnapshot;
	readonly generation?: ReviewGeneration;
	readonly generations?: readonly ReviewGeneration[];
	readonly manifest?: ReviewDiffManifest;
	readonly chunks: readonly ReviewDiffChunk[];
	readonly threads: readonly ReviewThread[];
	readonly messages: readonly ReviewMessage[];
	readonly coverage: readonly ReviewCoverageRecord[];
	readonly routedAgents: Readonly<Record<string, string>>;
	readonly messageBodies: Readonly<Record<string, string>>;
	readonly pending?: PendingReview;
	readonly pendingSummary?: string;
	readonly pendingEffect?: ReviewExactEffect;
}

export interface ReviewTerminalState {
	readonly surface: ReviewTerminalSurface;
	readonly layout: ReviewDiffLayout;
	readonly selectedInbox: number;
	readonly selectedFile: number;
	readonly selectedHunk: number;
	readonly selectedLine: number;
	readonly scroll: number;
	readonly draftOpen: boolean;
	readonly draftBody: string;
	readonly prompt: string;
	readonly activeReviewId?: string;
	readonly rangeStart?: ReviewLineAnchor;
	readonly message?: string;
}

export const INITIAL_REVIEW_TERMINAL_STATE: ReviewTerminalState = {
	surface: "inbox",
	layout: "unified",
	selectedInbox: 0,
	selectedFile: 0,
	selectedHunk: 0,
	selectedLine: 0,
	scroll: 0,
	draftOpen: false,
	draftBody: "",
	prompt: "",
};

export function createInitialReviewTerminalState(): ReviewTerminalState {
	return { ...INITIAL_REVIEW_TERMINAL_STATE };
}

export function reviewFilePathLabel(
	pathAfter?: string,
	pathBefore?: string,
): string {
	if (pathAfter && pathBefore && pathAfter !== pathBefore) {
		return `${pathBefore} → ${pathAfter}`;
	}
	return pathAfter ?? pathBefore ?? "(unknown path)";
}

export function chunkForFile(
	document: ReviewTerminalDocument,
	fileId: string,
): ReviewDiffChunk | undefined {
	return document.chunks.find((chunk) => chunk.fileId === fileId);
}

export function coverageStateFor(
	document: ReviewTerminalDocument,
	fileId: string,
	hunkId?: string,
): ReviewCoverageRecord["state"] | undefined {
	const exact = document.coverage.find((record) => {
		if (record.unit.kind === "hunk" && hunkId !== undefined) {
			return record.unit.fileId === fileId && record.unit.hunkId === hunkId;
		}
		return record.unit.kind === "file" && record.unit.fileId === fileId;
	});
	return exact?.state;
}

export type ReviewTerminalIntent =
	| { readonly kind: "ui" }
	| { readonly kind: "quit" }
	| { readonly kind: "command"; readonly command: ReviewCommand };
