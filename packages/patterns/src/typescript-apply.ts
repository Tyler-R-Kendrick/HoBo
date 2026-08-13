import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { create } from "@bufbuild/protobuf";

import {
	type PatternApplicationPlan,
	PatternApplicationPlanSchema,
	type PatternApplicationReceipt,
	PatternApplicationReceiptSchema,
	ReceiptStatus,
} from "./_generated/patterns_pb.js";
import type { PatternCatalog } from "./catalog.js";
import { PatternParseError, parseApplicationRequest } from "./parse.js";
import { renderPattern } from "./render.js";

function assertSafe(root: string, rel: string): string {
	if (rel.startsWith("/") || rel.includes("..")) {
		throw new PatternParseError(`unsafe path ${rel}`);
	}
	const resolved = normalize(join(root, rel));
	if (!resolved.startsWith(normalize(root))) {
		throw new PatternParseError(`path escapes root: ${rel}`);
	}
	return resolved;
}

export function planPatternApplication(input: {
	readonly catalog: PatternCatalog;
	readonly patternId: string;
	readonly isolationRoot: string;
	readonly targetPath: string;
	readonly isolationRunId: string;
	readonly params?: Readonly<Record<string, unknown>>;
}): PatternApplicationPlan {
	const parsed = parseApplicationRequest({
		patternId: input.patternId,
		isolationRoot: input.isolationRoot,
		targetPath: input.targetPath,
		isolationRunId: input.isolationRunId,
		params: input.params ?? {},
	});
	assertSafe(parsed.isolationRoot, parsed.targetPath);
	const pattern = input.catalog.patterns.find(
		(item) => item.id === parsed.patternId,
	);
	if (!pattern) {
		throw new PatternParseError(`unknown pattern ${parsed.patternId}`);
	}
	return create(PatternApplicationPlanSchema, {
		isolationRunId: parsed.isolationRunId,
		sourceRoot: parsed.isolationRoot,
		targetPath: parsed.targetPath,
		expectedPreimage: [],
		effects: pattern.effects,
		promotionRequired: true,
	});
}

function applyStructural(previous: string, snippet: string): string {
	const trimmed = snippet.trim();
	if (previous.includes(trimmed)) return previous;
	if (previous.trim() === "") return snippet;
	if (
		!previous.includes("bindle(") &&
		!previous.includes('from "@hobo/bindles"')
	) {
		throw new PatternParseError("unsupported existing TypeScript shape");
	}
	return `${previous.trimEnd()}\n\n${snippet}`;
}

export function applyPatternPlan(input: {
	readonly catalog: PatternCatalog;
	readonly patternId: string;
	readonly isolationRoot: string;
	readonly targetPath: string;
	readonly isolationRunId: string;
	readonly params?: Readonly<Record<string, unknown>>;
}): PatternApplicationReceipt {
	const plan = planPatternApplication(input);
	const pattern = input.catalog.patterns.find(
		(item) => item.id === input.patternId,
	);
	if (!pattern) {
		throw new PatternParseError(`unknown pattern ${input.patternId}`);
	}
	const rendered = renderPattern({
		catalog: input.catalog,
		pattern,
		...(input.params ? { params: input.params } : {}),
	});
	const changed: string[] = [];
	const postimage: string[] = [];
	let allIdempotent = true;
	for (const [index, file] of rendered.files.entries()) {
		const rel =
			rendered.files.length === 1 ? input.targetPath || file.path : file.path;
		const target = assertSafe(input.isolationRoot, rel);
		mkdirSync(dirname(target), { recursive: true });
		let previous = "";
		try {
			previous = readFileSync(target, "utf8");
		} catch {
			previous = "";
		}
		const merged =
			index === 0 && rendered.files.length === 1
				? applyStructural(previous, file.contents)
				: previous.includes(file.contents.trim())
					? previous
					: previous.trim() === ""
						? file.contents
						: `${previous.trimEnd()}\n\n${file.contents}`;
		if (merged !== previous) {
			writeFileSync(target, merged);
			changed.push(rel);
			allIdempotent = false;
		}
		postimage.push(file.digest);
	}
	void plan;
	return create(PatternApplicationReceiptSchema, {
		isolationRunId: input.isolationRunId,
		changedFiles: changed,
		postimage,
		idempotent: allIdempotent,
		promotionRequired: true,
		promotionRef: "hobo-code promote",
		llmCalls: 0,
		llmInputTokens: 0,
		llmOutputTokens: 0,
		status: ReceiptStatus.ACCEPTED,
		reasonCode: allIdempotent ? "idempotent" : "applied-isolation",
	});
}
