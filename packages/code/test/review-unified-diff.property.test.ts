import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
	parseUnifiedDiff,
	type ReviewPatchState,
} from "../src/review/unified-diff-parser.js";

type ModelKind = "context" | "addition" | "deletion";

interface ModelLine {
	readonly kind: ModelKind;
	readonly text: string;
	readonly crlf: boolean;
}

interface ModelHunk {
	readonly oldStart: number;
	readonly newStart: number;
	readonly lines: readonly ModelLine[];
	readonly noNewline: boolean;
}

interface ModelFile {
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly binary: boolean;
	readonly hunks: readonly ModelHunk[];
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let next = Math.imul(state ^ (state >>> 15), 1 | state);
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(rng: () => number, values: readonly T[]): T {
	const value = values[Math.floor(rng() * values.length)];
	if (value === undefined) throw new Error("empty pick");
	return value;
}

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function quotePath(path: string): string {
	if (!/[ \t"\\]/u.test(path)) return path;
	return `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function renderLine(line: ModelLine): string {
	const prefix =
		line.kind === "context" ? " " : line.kind === "addition" ? "+" : "-";
	return `${prefix}${line.text}${line.crlf ? "\r" : ""}`;
}

function renderHunk(hunk: ModelHunk): string {
	const oldCount = hunk.lines.filter((line) => line.kind !== "addition").length;
	const newCount = hunk.lines.filter((line) => line.kind !== "deletion").length;
	const rows = hunk.lines.map(renderLine);
	if (hunk.noNewline) rows.push("\\ No newline at end of file");
	return `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@\n${rows.join("\n")}\n`;
}

function renderFile(file: ModelFile): string {
	const before = file.pathBefore ?? "/dev/null";
	const after = file.pathAfter ?? "/dev/null";
	const header = [
		`diff --git ${quotePath(`a/${file.pathBefore ?? file.pathAfter ?? "file"}`)} ${quotePath(`b/${file.pathAfter ?? file.pathBefore ?? "file"}`)}`,
	];
	if (file.binary) {
		header.push(`Binary files ${before} and ${after} differ`, "");
		return header.join("\n");
	}
	header.push(`--- ${before === "/dev/null" ? before : `a/${before}`}`);
	header.push(`+++ ${after === "/dev/null" ? after : `b/${after}`}`);
	return `${header.join("\n")}\n${file.hunks.map(renderHunk).join("")}`;
}

function randomPath(rng: () => number): string {
	const tokens = [
		"src",
		"weird $file&(1).txt",
		"path with spaces.md",
		'quote"here.ts',
		"nested/dir/file",
		"tab\tname",
	];
	return pick(rng, tokens);
}

function randomLine(rng: () => number): ModelLine {
	const alphabet = "abcdef xyz012[]{}";
	const length = 1 + Math.floor(rng() * 24);
	let text = "";
	for (let index = 0; index < length; index += 1)
		text += alphabet[Math.floor(rng() * alphabet.length)] ?? "a";
	return {
		kind: pick(rng, ["context", "addition", "deletion"] as const),
		text,
		crlf: rng() < 0.3,
	};
}

function randomFile(rng: () => number): ModelFile {
	if (rng() < 0.12) {
		const path = randomPath(rng);
		return { pathBefore: path, pathAfter: path, binary: true, hunks: [] };
	}
	const renamed = rng() < 0.2;
	const pathAfter = randomPath(rng);
	const pathBefore = renamed ? `${pathAfter}.old` : pathAfter;
	const hunks: ModelHunk[] = [];
	const hunkCount = 1 + Math.floor(rng() * 3);
	let oldStart = 1;
	let newStart = 1;
	for (let index = 0; index < hunkCount; index += 1) {
		const lines = Array.from({ length: 2 + Math.floor(rng() * 6) }, () =>
			randomLine(rng),
		);
		if (!lines.some((line) => line.kind !== "context")) {
			const first = lines[0] ?? {
				kind: "addition" as const,
				text: "x",
				crlf: false,
			};
			lines[0] = { ...first, kind: "addition" };
		}
		hunks.push({
			oldStart,
			newStart,
			lines,
			noNewline: index === hunkCount - 1 && rng() < 0.25,
		});
		oldStart += lines.filter((line) => line.kind !== "addition").length + 3;
		newStart += lines.filter((line) => line.kind !== "deletion").length + 3;
	}
	return { pathBefore, pathAfter, binary: false, hunks };
}

function expectComplete(state: ReviewPatchState): void {
	expect(state.kind).toBe("complete");
}

describe("unified diff parser properties", () => {
	it("round-trips generated hunks, hashes, CRLF, no-newline, and metacharacter paths", () => {
		for (let seed = 1; seed <= 80; seed += 1) {
			const rng = mulberry32(seed * 997);
			const file = randomFile(rng);
			const text = renderFile(file);
			const parsed = parseUnifiedDiff(text);
			if (file.binary) {
				expect(parsed.patchState.kind).toBe("binary");
				expect(parsed.files[0]?.binary).toBe(true);
				expect(parsed.files[0]?.hunks).toEqual([]);
				continue;
			}
			expectComplete(parsed.patchState);
			const parsedFile = parsed.files[0];
			expect(parsedFile).toBeTruthy();
			expect(parsedFile?.pathAfter ?? parsedFile?.pathBefore).toBeDefined();
			expect(parsedFile?.hunks).toHaveLength(file.hunks.length);
			parsedFile?.hunks.forEach((hunk, hunkIndex) => {
				const model = file.hunks[hunkIndex];
				if (!model) throw new Error("missing model hunk");
				const body = hunk.lines.filter(
					(line) => line.kind !== "no-newline-marker",
				);
				expect(body.map((line) => line.kind)).toEqual(
					model.lines.map((line) => line.kind),
				);
				body.forEach((line, lineIndex) => {
					const expected = model.lines[lineIndex];
					if (!expected) throw new Error("missing model line");
					expect(line.displayText).toBe(expected.text);
					expect(line.rawTextHash).toBe(
						hash(`${expected.text}${expected.crlf ? "\r" : ""}`),
					);
				});
				if (model.noNewline)
					expect(hunk.lines.at(-1)?.kind).toBe("no-newline-marker");
				const oldCount = model.lines.filter(
					(line) => line.kind !== "addition",
				).length;
				const newCount = model.lines.filter(
					(line) => line.kind !== "deletion",
				).length;
				expect(hunk.oldCount).toBe(oldCount);
				expect(hunk.newCount).toBe(newCount);
			});
			expect(parseUnifiedDiff(text).files[0]?.hunks[0]?.fingerprint).toBe(
				parsedFile?.hunks[0]?.fingerprint,
			);
		}
	});

	it("keeps CRLF and LF content identities distinct", () => {
		const lf = parseUnifiedDiff(
			[
				"diff --git a/a.txt b/a.txt",
				"--- a/a.txt",
				"+++ b/a.txt",
				"@@ -1 +1 @@",
				"-old",
				"+new",
				"",
			].join("\n"),
		);
		const crlf = parseUnifiedDiff(
			[
				"diff --git a/a.txt b/a.txt",
				"--- a/a.txt",
				"+++ b/a.txt",
				"@@ -1 +1 @@",
				"-old\r",
				"+new\r",
				"",
			].join("\n"),
		);
		const lfHash = lf.files[0]?.hunks[0]?.lines.find(
			(line) => line.kind === "addition",
		)?.rawTextHash;
		const crlfHash = crlf.files[0]?.hunks[0]?.lines.find(
			(line) => line.kind === "addition",
		)?.rawTextHash;
		expect(lfHash).toBe(hash("new"));
		expect(crlfHash).toBe(hash("new\r"));
		expect(lfHash).not.toBe(crlfHash);
	});

	it("parses a long line without dropping the hash identity", () => {
		const payload = "q".repeat(90_000);
		const parsed = parseUnifiedDiff(
			[
				"diff --git a/long.txt b/long.txt",
				"--- a/long.txt",
				"+++ b/long.txt",
				"@@ -0,0 +1 @@",
				`+${payload}`,
				"",
			].join("\n"),
		);
		const line = parsed.files[0]?.hunks[0]?.lines[0];
		expect(line?.displayText).toHaveLength(90_000);
		expect(line?.rawTextHash).toBe(hash(payload));
	});

	it("makes provider and incomplete truncation an explicit typed state", () => {
		const complete = [
			"diff --git a/cut.ts b/cut.ts",
			"--- a/cut.ts",
			"+++ b/cut.ts",
			"@@ -1,3 +1,3 @@",
			" keep",
			"-old",
			"+new",
			" tail",
			"",
		].join("\n");
		expect(parseUnifiedDiff(complete).patchState).toEqual({ kind: "complete" });
		const sliced = parseUnifiedDiff(complete.slice(0, 70));
		expect(sliced.patchState.kind).toBe("truncated");
		if (sliced.patchState.kind !== "truncated")
			throw new Error("expected truncated state");
		expect(sliced.patchState.reason).toMatch(/incomplete-hunk|byte-limit/u);
		const marked = parseUnifiedDiff(complete, { providerTruncated: true });
		expect(marked.patchState).toEqual({
			kind: "truncated",
			reason: "provider-limit",
		});
		expect(marked.files[0]?.patchState.kind).toBe("truncated");
	});
});
