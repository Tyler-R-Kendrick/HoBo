import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { reviewError } from "./review-errors.js";
import {
	assertSafeRepositoryRelPath,
	hashUtf8,
	quoteGitPath,
} from "./review-patch.js";
import type { ReviewFileSummary, ReviewHunk } from "./review-ports.js";

export interface ParsedGitHubSuggestion {
	readonly replacement: string;
}

export interface SuggestionPreview {
	readonly next: string;
	readonly preimage: string;
	readonly eol: string;
	readonly trailingNewline: boolean;
}

const FENCE =
	/^(?<fence>`{3,}|~{3,})suggestion[ \t]*\r?\n([\s\S]*?)\r?\n\k<fence>[ \t]*$/mu;

export function parseGitHubSuggestion(body: string): ParsedGitHubSuggestion {
	if (typeof body !== "string" || body.trim().length === 0)
		throw reviewError("malformed-input", "suggestion body is empty");
	const empty = [
		...body.matchAll(
			/^(?<fence>`{3,}|~{3,})suggestion[ \t]*\r?\n\k<fence>[ \t]*$/gmu,
		),
	];
	const matches = [...body.matchAll(new RegExp(FENCE.source, "gmu"))];
	const blocks = matches.length > 0 ? matches : empty;
	if (blocks.length === 0) {
		if (/^(```|~~~)/mu.test(body))
			throw reviewError(
				"malformed-input",
				"fenced block is not a supported GitHub suggestion",
			);
		throw reviewError(
			"malformed-input",
			"comment does not contain a supported GitHub suggestion block",
		);
	}
	if (blocks.length > 1)
		throw reviewError(
			"malformed-input",
			"comment contains multiple suggestion blocks",
			{ blocks: blocks.length },
		);
	return { replacement: blocks[0]?.[2] ?? "" };
}

export function assertSafeRepositoryPath(
	repositoryRoot: string,
	relPath: string,
): string {
	const safe = assertSafeRepositoryRelPath(relPath);
	if (isAbsolute(safe))
		throw reviewError(
			"malformed-input",
			"suggestion path must be repository-relative",
			{
				path: relPath,
			},
		);
	const root = resolveRealRoot(repositoryRoot);
	const resolved = normalize(resolve(root, safe));
	const rel = relative(root, resolved);
	if (rel.startsWith("..") || isAbsolute(rel))
		throw reviewError(
			"malformed-input",
			"suggestion path cannot escape the repository",
			{
				path: relPath,
			},
		);
	try {
		const real = realpathSync(resolved);
		const realRel = relative(root, real);
		if (realRel.startsWith("..") || isAbsolute(realRel))
			throw reviewError(
				"malformed-input",
				"suggestion path cannot escape the repository",
				{ path: relPath },
			);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		const parent = resolve(resolved, "..");
		try {
			const realParent = realpathSync(parent);
			const parentRel = relative(root, realParent);
			if (parentRel.startsWith("..") || isAbsolute(parentRel))
				throw reviewError(
					"malformed-input",
					"suggestion path cannot escape the repository",
					{ path: relPath },
				);
		} catch (parentError) {
			if ((parentError as NodeJS.ErrnoException).code !== "ENOENT")
				throw parentError;
		}
	}
	return safe.split(/[/\\]/u).join("/");
}

export function previewSuggestion(input: {
	readonly original: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly replacement: string;
}): SuggestionPreview {
	if (input.startLine < 1 || input.endLine < input.startLine)
		throw reviewError("malformed-input", "suggestion range is invalid", {
			startLine: input.startLine,
			endLine: input.endLine,
		});
	const split = splitFileText(input.original);
	if (input.endLine > split.lines.length)
		throw reviewError("anchor-stale", "suggestion range is outside the file", {
			endLine: input.endLine,
			lines: split.lines.length,
		});
	const preimage = joinRange(
		split.lines,
		input.startLine,
		input.endLine,
		split.eol,
	);
	const replacementLines = splitReplacement(input.replacement);
	const nextLines = [
		...split.lines.slice(0, input.startLine - 1),
		...replacementLines,
		...split.lines.slice(input.endLine),
	];
	return {
		next: joinFileText(nextLines, split.eol, split.trailingNewline),
		preimage,
		eol: split.eol,
		trailingNewline: split.trailingNewline,
	};
}

export function validateSuggestionPreimage(input: {
	readonly actual: string;
	readonly expected?: string;
}): void {
	if (input.expected === undefined) return;
	if (input.actual !== input.expected)
		throw reviewError("anchor-stale", "suggestion preimage is outdated", {
			expected: hashUtf8(input.expected),
			actual: hashUtf8(input.actual),
		});
}

export function buildSuggestionPatch(input: {
	readonly file: ReviewFileSummary;
	readonly original: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly replacement: string;
	readonly expectedPreimage?: string;
}): { readonly text: string; readonly preview: SuggestionPreview } {
	const path = assertSafeRepositoryRelPath(
		input.file.pathAfter ?? input.file.pathBefore ?? "",
	);
	const preview = previewSuggestion({
		original: input.original,
		startLine: input.startLine,
		endLine: input.endLine,
		replacement: input.replacement,
	});
	validateSuggestionPreimage({
		actual: preview.preimage,
		...(input.expectedPreimage === undefined
			? {}
			: { expected: input.expectedPreimage }),
	});
	const split = splitFileText(input.original);
	const oldCount = input.endLine - input.startLine + 1;
	const newLines = splitReplacement(input.replacement);
	const contextBefore = split.lines[input.startLine - 2];
	const contextAfter = split.lines[input.endLine];
	const oldStart =
		contextBefore === undefined ? input.startLine : input.startLine - 1;
	const lines: string[] = [];
	if (contextBefore !== undefined) lines.push(` ${contextBefore}`);
	for (let index = input.startLine; index <= input.endLine; index += 1)
		lines.push(`-${split.lines[index - 1] ?? ""}`);
	for (const line of newLines) lines.push(`+${line}`);
	if (contextAfter !== undefined) lines.push(` ${contextAfter}`);
	const oldLines =
		(contextBefore === undefined ? 0 : 1) +
		oldCount +
		(contextAfter === undefined ? 0 : 1);
	const newCount =
		(contextBefore === undefined ? 0 : 1) +
		newLines.length +
		(contextAfter === undefined ? 0 : 1);
	const header = `@@ -${formatCount(oldStart, oldLines)} +${formatCount(oldStart, newCount)} @@`;
	const quoted = quoteGitPath(`a/${path}`);
	const quotedNew = quoteGitPath(`b/${path}`);
	const text = [
		`diff --git ${quoted} ${quotedNew}`,
		`--- ${quoted}`,
		`+++ ${quotedNew}`,
		header,
		...lines,
		"",
	].join("\n");
	return { text, preview };
}

export function expectedPreimageFromHunks(
	hunks: readonly ReviewHunk[],
	startLine: number,
	endLine: number,
	eol: string,
): string | undefined {
	const captured: string[] = [];
	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (line.kind === "deletion" || line.kind === "no-newline-marker")
				continue;
			if (line.newLine === undefined) continue;
			if (line.newLine >= startLine && line.newLine <= endLine)
				captured.push(line.displayText.replace(/\r$/u, ""));
		}
	}
	if (captured.length === 0) return undefined;
	return captured.join(eol);
}

function resolveRealRoot(repositoryRoot: string): string {
	try {
		const stat = statSync(repositoryRoot);
		if (!stat.isDirectory())
			throw reviewError(
				"malformed-input",
				"repository root is not a directory",
			);
		return realpathSync(repositoryRoot);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			throw reviewError("not-found", "repository root does not exist");
		throw error;
	}
}

function splitFileText(text: string): {
	readonly lines: string[];
	readonly eol: string;
	readonly trailingNewline: boolean;
} {
	const eol = text.includes("\r\n")
		? "\r\n"
		: text.includes("\r")
			? "\r"
			: "\n";
	const trailingNewline = text.endsWith("\n") || text.endsWith("\r");
	const stripped = trailingNewline
		? text.endsWith("\r\n")
			? text.slice(0, -2)
			: text.slice(0, -1)
		: text;
	if (stripped.length === 0 && !trailingNewline)
		return { lines: [""], eol, trailingNewline };
	if (stripped.length === 0) return { lines: [], eol, trailingNewline };
	return { lines: stripped.split(eol), eol, trailingNewline };
}

function splitReplacement(replacement: string): string[] {
	if (replacement.length === 0) return [];
	const eol = replacement.includes("\r\n") ? "\r\n" : "\n";
	const stripped = replacement.endsWith("\n")
		? replacement.endsWith("\r\n")
			? replacement.slice(0, -2)
			: replacement.slice(0, -1)
		: replacement;
	return stripped.split(eol);
}

function joinRange(
	lines: readonly string[],
	startLine: number,
	endLine: number,
	eol: string,
): string {
	return lines.slice(startLine - 1, endLine).join(eol);
}

function joinFileText(
	lines: readonly string[],
	eol: string,
	trailingNewline: boolean,
): string {
	const body = lines.join(eol);
	if (lines.length === 0) return trailingNewline ? eol : "";
	return trailingNewline ? `${body}${eol}` : body;
}

function formatCount(start: number, count: number): string {
	return count === 1 ? `${start}` : `${start},${count}`;
}

export function worktreeJoin(repositoryRoot: string, relPath: string): string {
	const safe = assertSafeRepositoryPath(repositoryRoot, relPath);
	return join(resolve(repositoryRoot), ...safe.split("/"));
}

export function normalizeRelPath(relPath: string): string {
	return relPath.split(/[/\\]/u).join(sep);
}
