import { createHash } from "node:crypto";
import { reviewError } from "./review-errors.js";
import type {
	ReviewDiffLine,
	ReviewFileStatus,
	ReviewFileSummary,
	ReviewHunk,
	ReviewLineKind,
} from "./review-ports.js";

export interface ReviewPatchSelection {
	readonly hunkId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface ReviewPatchFile {
	readonly file: ReviewFileSummary;
	readonly hunks: readonly ReviewHunk[];
}

export interface BuiltReviewPatch {
	readonly text: string;
	readonly hash: string;
	readonly path: string;
	readonly selectedHunkIds: readonly string[];
	readonly includeMode: boolean;
}

const NO_NEWLINE = "\\ No newline at end of file";

export function hashUtf8(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashBytes(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

export function assertSafeRepositoryRelPath(relPath: string): string {
	if (relPath.length === 0)
		throw reviewError("malformed-input", "patch path must be nonempty");
	if (
		relPath.includes("\0") ||
		relPath.includes("\n") ||
		relPath.includes("\r")
	)
		throw reviewError(
			"malformed-input",
			"patch path contains a forbidden character",
		);
	if (relPath.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(relPath))
		throw reviewError(
			"malformed-input",
			"patch path must be repository-relative",
			{
				path: relPath,
			},
		);
	const parts = relPath.split(/[/\\]/u);
	if (parts.some((part) => part === ".." || part === ""))
		throw reviewError(
			"malformed-input",
			"patch path cannot escape the repository",
			{
				path: relPath,
			},
		);
	return relPath;
}

export function assertSingleFileSelection(fileIds: readonly string[]): void {
	const unique = new Set(fileIds);
	if (unique.size > 1) {
		throw reviewError(
			"unsupported-capability",
			"cross-file ranges are not supported",
			{ files: unique.size },
		);
	}
}

export function createReviewDiffLine(input: {
	readonly lineId: string;
	readonly kind: ReviewLineKind;
	readonly rawText: string;
	readonly oldLine?: number;
	readonly newLine?: number;
}): ReviewDiffLine {
	return {
		lineId: input.lineId,
		kind: input.kind,
		rawTextHash: hashUtf8(input.rawText),
		displayText: input.rawText,
		...(input.oldLine === undefined ? {} : { oldLine: input.oldLine }),
		...(input.newLine === undefined ? {} : { newLine: input.newLine }),
	};
}

export function linePayload(line: ReviewDiffLine): string {
	return line.displayText;
}

export function parseUnifiedDiff(
	diff: string,
	fileIdPrefix = "file",
): readonly ReviewPatchFile[] {
	const records = splitPatchRecords(diff);
	return records.map((record, fileIndex) =>
		parseDiffRecord(record, `${fileIdPrefix}-${fileIndex + 1}`),
	);
}

export function buildReviewPatch(
	file: ReviewPatchFile,
	selection: ReviewPatchSelection,
): BuiltReviewPatch {
	assertSingleFileSelection([file.file.fileId]);
	if (file.file.binary)
		throw reviewError(
			"unsupported-capability",
			"binary patches are not supported",
		);
	const path = filePath(file.file);
	assertSafeRepositoryRelPath(path);
	const selected = selectHunks(file, selection);
	if (selected.hunks.length === 0)
		throw reviewError(
			"not-found",
			"selection does not match a generation hunk",
		);
	const includeMode = selected.allHunks;
	const text = formatUnifiedDiff(file.file, selected.hunks, includeMode);
	return {
		text,
		hash: hashUtf8(text),
		path,
		selectedHunkIds: selected.hunks.map((hunk) => hunk.hunkId),
		includeMode,
	};
}

function filePath(file: ReviewFileSummary): string {
	const path = file.pathAfter ?? file.pathBefore;
	if (!path)
		throw reviewError("malformed-input", "review file is missing a path");
	return path;
}

function selectHunks(
	file: ReviewPatchFile,
	selection: ReviewPatchSelection,
): { readonly hunks: readonly ReviewHunk[]; readonly allHunks: boolean } {
	if (
		selection.startLine !== undefined &&
		selection.endLine !== undefined &&
		selection.endLine < selection.startLine
	) {
		throw reviewError(
			"malformed-input",
			"line range end must be at or after start",
		);
	}
	const byId = selection.hunkId
		? file.hunks.filter((hunk) => hunk.hunkId === selection.hunkId)
		: file.hunks;
	if (selection.hunkId && byId.length === 0)
		throw reviewError("not-found", "generation hunk was not found", {
			hunkId: selection.hunkId,
		});
	if (selection.startLine === undefined && selection.endLine === undefined) {
		return {
			hunks: byId,
			allHunks: byId.length === file.hunks.length,
		};
	}
	const start = selection.startLine ?? selection.endLine;
	const end = selection.endLine ?? selection.startLine;
	if (start === undefined || end === undefined)
		throw reviewError("malformed-input", "line range is incomplete");
	const overlapping = byId.filter((hunk) => hunkTouchesRange(hunk, start, end));
	if (overlapping.length > 1) {
		throw reviewError(
			"unsupported-capability",
			"cross-hunk ranges are not supported",
			{ hunks: overlapping.length, startLine: start, endLine: end },
		);
	}
	const hunk = overlapping[0];
	if (!hunk)
		throw reviewError(
			"not-found",
			"line range is not inside a generation hunk",
			{
				startLine: start,
				endLine: end,
			},
		);
	const sliced = sliceHunk(hunk, start, end);
	return {
		hunks: [sliced],
		allHunks: file.hunks.length === 1 && hunkHasEntireRange(hunk, start, end),
	};
}

function hunkTouchesRange(
	hunk: ReviewHunk,
	start: number,
	end: number,
): boolean {
	const newEnd =
		hunk.newCount === 0 ? hunk.newStart : hunk.newStart + hunk.newCount - 1;
	const oldEnd =
		hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1;
	return (
		(start <= newEnd && end >= hunk.newStart) ||
		(start <= oldEnd && end >= hunk.oldStart)
	);
}

function hunkHasEntireRange(
	hunk: ReviewHunk,
	start: number,
	end: number,
): boolean {
	const first = firstSelectableLine(hunk);
	const last = lastSelectableLine(hunk);
	return (
		first !== undefined && last !== undefined && start <= first && end >= last
	);
}

function firstSelectableLine(hunk: ReviewHunk): number | undefined {
	for (const line of hunk.lines) {
		const value = line.newLine ?? line.oldLine;
		if (value !== undefined) return value;
	}
	return undefined;
}

function lastSelectableLine(hunk: ReviewHunk): number | undefined {
	for (let index = hunk.lines.length - 1; index >= 0; index -= 1) {
		const line = hunk.lines[index];
		const value = line?.newLine ?? line?.oldLine;
		if (value !== undefined) return value;
	}
	return undefined;
}

function sliceHunk(hunk: ReviewHunk, start: number, end: number): ReviewHunk {
	let oldCursor = hunk.oldStart;
	let newCursor = hunk.newStart;
	const rebuilt: ReviewDiffLine[] = [];
	let nextOld = hunk.oldStart;
	let nextNew = hunk.newStart;
	let started = false;
	for (let index = 0; index < hunk.lines.length; index += 1) {
		const line = hunk.lines[index];
		if (!line || line.kind === "no-newline-marker") continue;
		const marker =
			hunk.lines[index + 1]?.kind === "no-newline-marker"
				? hunk.lines[index + 1]
				: undefined;
		const selected = lineIsSelected(line, start, end);
		if (!started) {
			if (!selected) {
				if (line.kind !== "addition") oldCursor += 1;
				if (line.kind !== "deletion") newCursor += 1;
				continue;
			}
			started = true;
			nextOld = oldCursor;
			nextNew = newCursor;
		}
		if (selected) {
			rebuilt.push(line);
			if (marker) rebuilt.push(marker);
		} else if (line.kind === "deletion") {
			rebuilt.push(
				createReviewDiffLine({
					lineId: `${line.lineId}:context`,
					kind: "context",
					rawText: linePayload(line),
					newLine: newCursor,
					...(line.oldLine === undefined ? {} : { oldLine: line.oldLine }),
				}),
			);
			if (marker) rebuilt.push(marker);
		} else if (line.kind === "context") {
			rebuilt.push(line);
			if (marker) rebuilt.push(marker);
		}
		if (line.kind !== "addition") oldCursor += 1;
		if (line.kind !== "deletion") newCursor += 1;
	}
	if (
		rebuilt.every(
			(line) => line.kind === "no-newline-marker" || line.kind === "context",
		)
	)
		throw reviewError("malformed-input", "line range selects no changes");
	const oldCount = rebuilt.filter(
		(line) => line.kind === "context" || line.kind === "deletion",
	).length;
	const newCount = rebuilt.filter(
		(line) => line.kind === "context" || line.kind === "addition",
	).length;
	const header = `@@ -${formatHunkCount(nextOld, oldCount)} +${formatHunkCount(nextNew, newCount)} @@`;
	const text = rebuilt
		.map((line) => `${line.kind}:${linePayload(line)}`)
		.join("\n");
	return {
		hunkId: `${hunk.hunkId}:range:${start}-${end}`,
		header,
		oldStart: nextOld,
		oldCount,
		newStart: nextNew,
		newCount,
		fingerprint: hashUtf8(text),
		lines: rebuilt,
	};
}

function lineIsSelected(
	line: ReviewDiffLine,
	start: number,
	end: number,
): boolean {
	if (line.kind === "addition" || line.kind === "context")
		return (
			line.newLine !== undefined && line.newLine >= start && line.newLine <= end
		);
	if (line.kind === "deletion") {
		if (
			line.oldLine !== undefined &&
			line.oldLine >= start &&
			line.oldLine <= end
		)
			return true;
		if (
			line.newLine !== undefined &&
			line.newLine >= start &&
			line.newLine <= end
		)
			return true;
		return false;
	}
	return false;
}

function formatHunkCount(start: number, count: number): string {
	return count === 1 ? `${start}` : `${start},${count}`;
}

function formatUnifiedDiff(
	file: ReviewFileSummary,
	hunks: readonly ReviewHunk[],
	includeMode: boolean,
): string {
	const oldPath = file.pathBefore ?? file.pathAfter;
	const newPath = file.pathAfter ?? file.pathBefore;
	if (!oldPath || !newPath)
		throw reviewError("malformed-input", "review file is missing a path");
	assertSafeRepositoryRelPath(oldPath === "/dev/null" ? newPath : oldPath);
	assertSafeRepositoryRelPath(newPath === "/dev/null" ? oldPath : newPath);
	const lines: string[] = [
		`diff --git ${quoteGitPath(`a/${oldPath}`)} ${quoteGitPath(`b/${newPath}`)}`,
	];
	if (file.status === "added")
		lines.push(`new file mode ${file.newMode ?? "100644"}`);
	else if (file.status === "deleted")
		lines.push(`deleted file mode ${file.oldMode ?? "100644"}`);
	else if (
		includeMode &&
		file.oldMode &&
		file.newMode &&
		file.oldMode !== file.newMode
	) {
		lines.push(`old mode ${file.oldMode}`);
		lines.push(`new mode ${file.newMode}`);
	}
	if (file.status === "renamed") {
		lines.push(`rename from ${oldPath}`);
		lines.push(`rename to ${newPath}`);
	}
	if (file.status === "added") {
		lines.push("--- /dev/null");
		lines.push(`+++ ${quoteGitPath(`b/${newPath}`)}`);
	} else if (file.status === "deleted") {
		lines.push(`--- ${quoteGitPath(`a/${oldPath}`)}`);
		lines.push("+++ /dev/null");
	} else {
		lines.push(`--- ${quoteGitPath(`a/${oldPath}`)}`);
		lines.push(`+++ ${quoteGitPath(`b/${newPath}`)}`);
	}
	for (const hunk of hunks) {
		lines.push(rebuildHunkHeader(hunk));
		for (const line of hunk.lines) lines.push(formatDiffLine(line));
	}
	return `${lines.join("\n")}\n`;
}

function rebuildHunkHeader(hunk: ReviewHunk): string {
	return `@@ -${formatHunkCount(hunk.oldStart, hunk.oldCount)} +${formatHunkCount(hunk.newStart, hunk.newCount)} @@`;
}

function formatDiffLine(line: ReviewDiffLine): string {
	if (line.kind === "no-newline-marker") return NO_NEWLINE;
	const prefix =
		line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " ";
	return `${prefix}${linePayload(line)}`;
}

function splitPatchRecords(diff: string): string[] {
	if (diff.includes("GIT binary patch") || /Binary files /u.test(diff))
		throw reviewError(
			"unsupported-capability",
			"binary patches are not supported",
		);
	const records: string[] = [];
	const parts = diff.split(/^diff --git /mu);
	for (const part of parts) {
		if (!part.trim()) continue;
		records.push(part.startsWith("diff --git ") ? part : `diff --git ${part}`);
	}
	return records;
}

function parseDiffRecord(record: string, fileId: string): ReviewPatchFile {
	const rawLines = record.split("\n");
	const header = rawLines[0] ?? "";
	const paths = parseDiffGitHeader(header);
	let status: ReviewFileStatus = "modified";
	let oldMode: string | undefined;
	let newMode: string | undefined;
	let pathBefore = stripAbPrefix(paths.oldPath);
	let pathAfter = stripAbPrefix(paths.newPath);
	let hunkStart = -1;
	for (let index = 1; index < rawLines.length; index += 1) {
		const line = stripCr(rawLines[index] ?? "");
		if (line.startsWith("@@ ")) {
			hunkStart = index;
			break;
		}
		if (line.startsWith("new file mode ")) {
			status = "added";
			newMode = line.slice(14);
		} else if (line.startsWith("deleted file mode ")) {
			status = "deleted";
			oldMode = line.slice(18);
		} else if (line.startsWith("old mode ")) oldMode = line.slice(9);
		else if (line.startsWith("new mode ")) newMode = line.slice(9);
		else if (line.startsWith("rename from ")) {
			status = "renamed";
			pathBefore = line.slice(12);
		} else if (line.startsWith("rename to ")) {
			status = "renamed";
			pathAfter = line.slice(10);
		} else if (line.startsWith("copy from ")) status = "copied";
		else if (line.startsWith("--- ")) {
			const value = unquoteGitPath(line.slice(4).replace(/\t.*$/u, ""));
			if (value === "/dev/null")
				status = status === "modified" ? "added" : status;
			else pathBefore = stripAbPrefix(value);
		} else if (line.startsWith("+++ ")) {
			const value = unquoteGitPath(line.slice(4).replace(/\t.*$/u, ""));
			if (value === "/dev/null")
				status = status === "modified" ? "deleted" : status;
			else pathAfter = stripAbPrefix(value);
		}
	}
	const hunks =
		hunkStart < 0 ? [] : parseHunks(rawLines.slice(hunkStart), fileId);
	const file: ReviewFileSummary = {
		fileId,
		status,
		binary: false,
		tooLargeForInline: false,
		hunkCount: hunks.length,
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(oldMode === undefined ? {} : { oldMode }),
		...(newMode === undefined ? {} : { newMode }),
	};
	return { file, hunks };
}

function parseHunks(lines: readonly string[], fileId: string): ReviewHunk[] {
	const hunks: ReviewHunk[] = [];
	let current: string[] = [];
	const flush = (): void => {
		if (current.length === 0) return;
		hunks.push(parseHunk(current, fileId, hunks.length));
		current = [];
	};
	for (const line of lines) {
		if (line.startsWith("@@ ") && current.length > 0) flush();
		if (line.length === 0 && current.length === 0) continue;
		current.push(line);
	}
	flush();
	return hunks;
}

function parseHunk(
	lines: readonly string[],
	fileId: string,
	index: number,
): ReviewHunk {
	const header = stripCr(lines[0] ?? "");
	const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/u.exec(
		header,
	);
	if (!match)
		throw reviewError("malformed-input", "invalid hunk header", { header });
	const oldStart = Number(match[1]);
	const oldCount = match[2] === undefined ? 1 : Number(match[2]);
	const newStart = Number(match[3]);
	const newCount = match[4] === undefined ? 1 : Number(match[4]);
	let oldLine = oldStart;
	let newLine = newStart;
	const parsed: ReviewDiffLine[] = [];
	for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
		const raw = lines[lineIndex] ?? "";
		if (raw.length === 0) continue;
		if (raw.startsWith("\\") || raw.startsWith("\\\r")) {
			parsed.push(
				createReviewDiffLine({
					lineId: `${fileId}:h${index}:nl:${lineIndex}`,
					kind: "no-newline-marker",
					rawText: NO_NEWLINE,
				}),
			);
			continue;
		}
		const prefix = raw[0];
		const text = raw.slice(1);
		if (prefix === "+") {
			parsed.push(
				createReviewDiffLine({
					lineId: `${fileId}:h${index}:l${lineIndex}`,
					kind: "addition",
					rawText: text,
					newLine,
				}),
			);
			newLine += 1;
		} else if (prefix === "-") {
			parsed.push(
				createReviewDiffLine({
					lineId: `${fileId}:h${index}:l${lineIndex}`,
					kind: "deletion",
					rawText: text,
					oldLine,
				}),
			);
			oldLine += 1;
		} else if (prefix === " ") {
			parsed.push(
				createReviewDiffLine({
					lineId: `${fileId}:h${index}:l${lineIndex}`,
					kind: "context",
					rawText: text,
					oldLine,
					newLine,
				}),
			);
			oldLine += 1;
			newLine += 1;
		}
	}
	const hunkId = `hunk:${fileId}:${index}`;
	return {
		hunkId,
		header,
		oldStart,
		oldCount,
		newStart,
		newCount,
		fingerprint: hashUtf8(parsed.map((line) => line.displayText).join("\n")),
		lines: parsed,
	};
}

function parseDiffGitHeader(header: string): {
	readonly oldPath: string;
	readonly newPath: string;
} {
	const rest = header.replace(/^diff --git /u, "");
	const match = /^(a\/.+?) (b\/.+)$/u.exec(rest);
	if (match?.[1] && match[2] && !rest.startsWith('"'))
		return { oldPath: match[1], newPath: match[2] };
	const quoted = rest.match(/^("(?:\\.|[^"\\])*") ("(?:\\.|[^"\\])*")$/u);
	if (quoted?.[1] && quoted[2])
		return {
			oldPath: unquoteGitPath(quoted[1]),
			newPath: unquoteGitPath(quoted[2]),
		};
	const tokens = splitGitHeaderPaths(rest);
	if (tokens.length !== 2)
		throw reviewError("malformed-input", "invalid diff --git header", {
			header,
		});
	return { oldPath: tokens[0] ?? "", newPath: tokens[1] ?? "" };
}

function splitGitHeaderPaths(rest: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quoted = false;
	for (let index = 0; index < rest.length; index += 1) {
		const char = rest[index];
		if (char === '"' && rest[index - 1] !== "\\") {
			quoted = !quoted;
			current += char;
			continue;
		}
		if (char === " " && !quoted) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens.map((token) => unquoteGitPath(token));
}

function stripAbPrefix(path: string): string {
	return path.replace(/^[ab]\//u, "");
}

function stripCr(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function gitPathNeedsQuotes(path: string): boolean {
	for (const char of path) {
		const code = char.charCodeAt(0);
		if (char === '"' || char === "\\" || char === " " || char === "\t")
			return true;
		if (code < 32 || code === 127) return true;
	}
	return false;
}

export function quoteGitPath(path: string): string {
	if (!gitPathNeedsQuotes(path)) return path;
	const escaped = path
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("\n", "\\n")
		.replaceAll("\t", "\\t")
		.replaceAll("\r", "\\r");
	return `"${escaped}"`;
}

export function unquoteGitPath(path: string): string {
	if (!path.startsWith('"') || !path.endsWith('"')) return path;
	const inner = path.slice(1, -1);
	let out = "";
	for (let index = 0; index < inner.length; index += 1) {
		const char = inner[index];
		if (char !== "\\") {
			out += char;
			continue;
		}
		const next = inner[index + 1];
		index += 1;
		if (next === "n") out += "\n";
		else if (next === "t") out += "\t";
		else if (next === "r") out += "\r";
		else if (next === "\\" || next === '"') out += next;
		else if (next && /[0-7]/u.test(next)) {
			const oct = inner.slice(index, index + 3);
			if (/^[0-7]{3}$/u.test(oct)) {
				out += String.fromCharCode(Number.parseInt(oct, 8));
				index += 2;
			} else out += next;
		} else out += next ?? "";
	}
	return out;
}
