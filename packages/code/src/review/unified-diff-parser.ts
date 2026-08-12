import { createHash } from "node:crypto";

import type { ReviewDiffLine, ReviewHunk } from "./review-ports.js";

export type ReviewPatchState =
	| { readonly kind: "complete" }
	| {
			readonly kind: "truncated";
			readonly reason: "provider-limit" | "incomplete-hunk" | "byte-limit";
	  }
	| { readonly kind: "binary" }
	| { readonly kind: "empty" };

export interface UnifiedDiffFile {
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly hunks: readonly ReviewHunk[];
	readonly patchState: ReviewPatchState;
	readonly binary: boolean;
}

export interface UnifiedDiffParseResult {
	readonly files: readonly UnifiedDiffFile[];
	readonly patchState: ReviewPatchState;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (!trimmed.startsWith('"')) return trimmed;
	let out = "";
	for (let index = 1; index < trimmed.length; index += 1) {
		const char = trimmed[index];
		if (char === '"') break;
		if (char === "\\" && index + 1 < trimmed.length) {
			const next = trimmed[index + 1] ?? "";
			if (next === "n") out += "\n";
			else if (next === "t") out += "\t";
			else if (next === "r") out += "\r";
			else out += next;
			index += 1;
			continue;
		}
		out += char ?? "";
	}
	return out;
}

function stripDiffPrefix(path: string): string {
	if (path === "/dev/null") return path;
	if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
	return path;
}

function splitGitDiffPaths(rest: string): readonly [string, string] {
	const match = /^("(?:\\.|[^"\\])*"|[^\s]+) ("(?:\\.|[^"\\])*"|[^\s]+)$/u.exec(
		rest.trim(),
	);
	if (!match) return [rest.trim(), rest.trim()];
	return [unquote(match[1] ?? ""), unquote(match[2] ?? "")];
}

function parseHunkHeader(line: string):
	| {
			readonly header: string;
			readonly oldStart: number;
			readonly oldCount: number;
			readonly newStart: number;
			readonly newCount: number;
	  }
	| undefined {
	const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/u.exec(line);
	if (!match) return undefined;
	return {
		header: line,
		oldStart: Number(match[1]),
		oldCount: match[2] === undefined ? 1 : Number(match[2]),
		newStart: Number(match[3]),
		newCount: match[4] === undefined ? 1 : Number(match[4]),
	};
}

function lineKind(prefix: string): ReviewDiffLine["kind"] | undefined {
	if (prefix === " ") return "context";
	if (prefix === "+") return "addition";
	if (prefix === "-") return "deletion";
	if (prefix === "\\") return "no-newline-marker";
	return undefined;
}

function finishHunk(
	header: NonNullable<ReturnType<typeof parseHunkHeader>>,
	lines: ReviewDiffLine[],
	seenOld: number,
	seenNew: number,
): { readonly hunk: ReviewHunk; readonly incomplete: boolean } {
	const fingerprint = sha256Hex(
		`${header.header}\n${lines.map((line) => line.rawTextHash).join("\n")}`,
	);
	const hunkId = `hunk-${fingerprint.slice(0, 16)}`;
	return {
		hunk: {
			hunkId,
			header: header.header,
			oldStart: header.oldStart,
			oldCount: header.oldCount,
			newStart: header.newStart,
			newCount: header.newCount,
			fingerprint,
			lines,
		},
		incomplete: seenOld !== header.oldCount || seenNew !== header.newCount,
	};
}

export function parseUnifiedDiff(
	text: string,
	options?: {
		readonly providerTruncated?: boolean;
		readonly maxBytes?: number;
		readonly maxLineBytes?: number;
	},
): UnifiedDiffParseResult {
	const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
	if (Buffer.byteLength(text) > maxBytes) {
		return {
			files: [],
			patchState: { kind: "truncated", reason: "byte-limit" },
		};
	}
	const rawLines = text.split("\n");
	const files: UnifiedDiffFile[] = [];
	let pathBefore: string | undefined;
	let pathAfter: string | undefined;
	let binary = false;
	let hunks: ReviewHunk[] = [];
	let incomplete = false;
	let currentHeader: ReturnType<typeof parseHunkHeader>;
	let currentLines: ReviewDiffLine[] = [];
	let oldLine = 0;
	let newLine = 0;
	let seenOld = 0;
	let seenNew = 0;

	const pushFile = (): void => {
		if (
			pathBefore === undefined &&
			pathAfter === undefined &&
			hunks.length === 0 &&
			!binary
		) {
			return;
		}
		const patchState: ReviewPatchState = options?.providerTruncated
			? { kind: "truncated", reason: "provider-limit" }
			: binary
				? { kind: "binary" }
				: incomplete
					? { kind: "truncated", reason: "incomplete-hunk" }
					: hunks.length === 0 && !binary
						? { kind: "empty" }
						: { kind: "complete" };
		files.push({
			...(pathBefore === undefined ? {} : { pathBefore }),
			...(pathAfter === undefined ? {} : { pathAfter }),
			hunks,
			patchState,
			binary,
		});
		pathBefore = undefined;
		pathAfter = undefined;
		binary = false;
		hunks = [];
		incomplete = false;
	};

	const closeHunk = (): void => {
		if (!currentHeader) return;
		const closed = finishHunk(currentHeader, currentLines, seenOld, seenNew);
		hunks.push(closed.hunk);
		if (closed.incomplete) incomplete = true;
		currentHeader = undefined;
		currentLines = [];
		seenOld = 0;
		seenNew = 0;
	};

	for (const raw of rawLines) {
		const crlf = raw.endsWith("\r");
		const line = crlf ? raw.slice(0, -1) : raw;
		if (line.startsWith("diff --git ")) {
			closeHunk();
			pushFile();
			const [left, right] = splitGitDiffPaths(line.slice(11));
			pathBefore = stripDiffPrefix(left);
			pathAfter = stripDiffPrefix(right);
			continue;
		}
		if (
			line.startsWith("Binary files ") ||
			line.startsWith("GIT binary patch")
		) {
			binary = true;
			continue;
		}
		if (line.startsWith("--- ")) {
			const value = stripDiffPrefix(unquote(line.slice(4)));
			pathBefore = value === "/dev/null" ? undefined : value;
			continue;
		}
		if (line.startsWith("+++ ")) {
			const value = stripDiffPrefix(unquote(line.slice(4)));
			pathAfter = value === "/dev/null" ? undefined : value;
			continue;
		}
		const header = parseHunkHeader(line);
		if (header) {
			closeHunk();
			currentHeader = header;
			oldLine = header.oldStart;
			newLine = header.newStart;
			continue;
		}
		if (line.startsWith("@")) {
			incomplete = true;
			continue;
		}
		if (!currentHeader) continue;
		const kind = lineKind(line[0] ?? "");
		if (!kind) {
			if (
				seenOld >= currentHeader.oldCount &&
				seenNew >= currentHeader.newCount
			) {
				closeHunk();
				continue;
			}
			incomplete = true;
			continue;
		}
		const body =
			kind === "no-newline-marker" ? line.slice(2).trimStart() : line.slice(1);
		if (
			options?.maxLineBytes !== undefined &&
			Buffer.byteLength(body) > options.maxLineBytes
		) {
			return {
				files: [],
				patchState: { kind: "truncated", reason: "byte-limit" },
			};
		}
		const hashed = `${body}${crlf ? "\r" : ""}`;
		const rawTextHash = sha256Hex(hashed);
		const lineId = sha256Hex(
			`${currentHeader.header}:${kind}:${oldLine}:${newLine}:${rawTextHash}`,
		);
		const record: ReviewDiffLine = {
			lineId,
			kind,
			rawTextHash,
			displayText: kind === "no-newline-marker" ? body : body,
			...(kind === "addition" || kind === "no-newline-marker"
				? {}
				: { oldLine }),
			...(kind === "deletion" || kind === "no-newline-marker"
				? {}
				: { newLine }),
		};
		currentLines.push(record);
		if (kind === "context" || kind === "deletion") {
			oldLine += 1;
			seenOld += 1;
		}
		if (kind === "context" || kind === "addition") {
			newLine += 1;
			seenNew += 1;
		}
	}
	if (currentHeader) {
		if (text !== "" && !text.endsWith("\n") && !text.endsWith("\r\n"))
			incomplete = true;
		closeHunk();
	}
	pushFile();
	if (options?.providerTruncated) {
		return {
			files: files.map((file) => ({
				...file,
				patchState: { kind: "truncated", reason: "provider-limit" },
			})),
			patchState: { kind: "truncated", reason: "provider-limit" },
		};
	}
	if (files.some((file) => file.binary) && files.every((file) => file.binary)) {
		return { files, patchState: { kind: "binary" } };
	}
	if (files.some((file) => file.patchState.kind === "truncated")) {
		const first = files.find(
			(file) => file.patchState.kind === "truncated",
		)?.patchState;
		return {
			files,
			patchState: first ?? { kind: "truncated", reason: "incomplete-hunk" },
		};
	}
	if (files.length === 0) return { files, patchState: { kind: "empty" } };
	return { files, patchState: { kind: "complete" } };
}
