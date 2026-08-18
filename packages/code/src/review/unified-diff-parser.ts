import { createHash } from "node:crypto";

import { create } from "@bufbuild/protobuf";

import {
	type ReviewDiffLine,
	ReviewDiffLineSchema,
	type ReviewHunk,
	ReviewHunkSchema,
	ReviewLineKind,
} from "../_generated/code_review_pb.js";

export function sanitizeDisplay(text: string): string {
	return text.replace(
		/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,
		"\uFFFD",
	);
}

export function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

export function parseUnifiedDiff(text: string): ReviewHunk[] {
	const hunks: ReviewHunk[] = [];
	const lines = text.split(/\n/u);
	let current:
		| {
				header: string;
				oldStart: number;
				oldCount: number;
				newStart: number;
				newCount: number;
				body: ReviewDiffLine[];
		  }
		| undefined;
	const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/u;
	const flush = () => {
		if (!current) return;
		const fingerprint = hashText(
			current.body.map((line) => `${line.kind}:${line.rawTextHash}`).join("\n"),
		);
		hunks.push(
			create(ReviewHunkSchema, {
				hunkId: fingerprint.slice(0, 16),
				header: current.header,
				oldStart: current.oldStart,
				oldCount: current.oldCount,
				newStart: current.newStart,
				newCount: current.newCount,
				fingerprint,
				lines: current.body,
			}),
		);
		current = undefined;
	};
	let oldLine = 0;
	let newLine = 0;
	for (const raw of lines) {
		const match = hunkHeader.exec(raw);
		if (match) {
			flush();
			oldLine = Number(match[1]);
			newLine = Number(match[3]);
			current = {
				header: raw,
				oldStart: oldLine,
				oldCount: Number(match[2] ?? "1"),
				newStart: newLine,
				newCount: Number(match[4] ?? "1"),
				body: [],
			};
			continue;
		}
		if (!current) continue;
		if (
			raw.startsWith("diff ") ||
			raw.startsWith("index ") ||
			raw.startsWith("--- ") ||
			raw.startsWith("+++ ")
		) {
			continue;
		}
		let kind = ReviewLineKind.CONTEXT;
		let payload = raw;
		if (raw.startsWith("+")) {
			kind = ReviewLineKind.ADDITION;
			payload = raw.slice(1);
		} else if (raw.startsWith("-")) {
			kind = ReviewLineKind.DELETION;
			payload = raw.slice(1);
		} else if (raw.startsWith("\\")) {
			kind = ReviewLineKind.NO_NEWLINE;
			payload = raw.slice(1).trim();
		} else if (raw.startsWith(" ")) {
			payload = raw.slice(1);
		}
		const line = create(ReviewDiffLineSchema, {
			lineId: hashText(`${kind}:${oldLine}:${newLine}:${payload}`).slice(0, 16),
			kind,
			oldLine: kind === ReviewLineKind.ADDITION ? 0 : oldLine,
			newLine: kind === ReviewLineKind.DELETION ? 0 : newLine,
			rawTextHash: hashText(payload),
			displayText: sanitizeDisplay(payload),
		});
		current.body.push(line);
		if (kind === ReviewLineKind.ADDITION) newLine += 1;
		else if (kind === ReviewLineKind.DELETION) oldLine += 1;
		else if (kind === ReviewLineKind.CONTEXT) {
			oldLine += 1;
			newLine += 1;
		}
	}
	flush();
	return hunks;
}
