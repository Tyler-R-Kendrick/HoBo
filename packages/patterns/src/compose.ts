import { createHash } from "node:crypto";
import { create } from "@bufbuild/protobuf";

import {
	type PatternCompositionReceipt,
	PatternCompositionReceiptSchema,
	ReceiptStatus,
	SearchDecision,
} from "./_generated/patterns_pb.js";
import type { PatternCatalog } from "./catalog.js";
import { renderPattern } from "./render.js";
import { searchPatterns } from "./retrieve.js";
import type { HoboVocabulary } from "./vocabulary.js";

export function composePatterns(input: {
	readonly catalog: PatternCatalog;
	readonly vocabulary: HoboVocabulary;
	readonly query: string;
	readonly params?: Readonly<Record<string, unknown>>;
}): PatternCompositionReceipt {
	const search = searchPatterns({
		catalog: input.catalog,
		vocabulary: input.vocabulary,
		query: { query: input.query, topK: 12, compose: true },
	});
	const chosen = search.candidates
		.filter((item) => item.selectable)
		.map((item) =>
			input.catalog.patterns.find((pattern) => pattern.id === item.patternId),
		)
		.filter((item): item is NonNullable<typeof item> => item !== undefined);
	const provides = new Set(chosen.flatMap((item) => item.provides));
	const unsatisfied = chosen.flatMap((item) =>
		item.requires.filter((req) => !provides.has(req)),
	);
	const conflicts = chosen.flatMap((item) =>
		item.conflicts.filter((id) => chosen.some((other) => other.id === id)),
	);
	if (unsatisfied.length > 0 || conflicts.length > 0 || chosen.length === 0) {
		return create(PatternCompositionReceiptSchema, {
			requestedFeatures: [],
			chosenIds: chosen.map((item) => item.id),
			rejectedIds: [],
			unsatisfied,
			conflicts,
			effectOrder: [],
			outputDigest: "",
			decision: SearchDecision.INCOMPATIBLE,
			reasonCode: conflicts.length > 0 ? "conflict" : "unsatisfied",
			llmCalls: 0,
			llmInputTokens: 0,
			llmOutputTokens: 0,
			status: ReceiptStatus.REJECTED,
		});
	}
	const remaining = [...chosen];
	const ordered: typeof chosen = [];
	while (remaining.length > 0) {
		const next = remaining.find((item) =>
			item.requires.every((req) =>
				ordered.some((have) => have.provides.includes(req)),
			),
		);
		if (!next) {
			return create(PatternCompositionReceiptSchema, {
				requestedFeatures: [],
				chosenIds: chosen.map((item) => item.id),
				rejectedIds: [],
				unsatisfied: remaining.map((item) => item.id),
				conflicts: ["cycle"],
				effectOrder: [],
				outputDigest: "",
				decision: SearchDecision.INCOMPATIBLE,
				reasonCode: "cycle",
				llmCalls: 0,
				llmInputTokens: 0,
				llmOutputTokens: 0,
				status: ReceiptStatus.REJECTED,
			});
		}
		ordered.push(next);
		remaining.splice(remaining.indexOf(next), 1);
	}
	const bodies = ordered.map(
		(pattern) =>
			renderPattern({
				catalog: input.catalog,
				pattern,
				...(input.params ? { params: input.params } : {}),
			}).files[0]?.contents ?? "",
	);
	const digest = createHash("sha256").update(bodies.join("\n")).digest("hex");
	return create(PatternCompositionReceiptSchema, {
		requestedFeatures: [],
		chosenIds: ordered.map((item) => item.id),
		rejectedIds: [],
		unsatisfied: [],
		conflicts: [],
		effectOrder: ordered.flatMap((item) =>
			item.effects.map((effect) => effect.id),
		),
		outputDigest: digest,
		decision: SearchDecision.SELECTED,
		reasonCode: "covered",
		llmCalls: 0,
		llmInputTokens: 0,
		llmOutputTokens: 0,
		status: ReceiptStatus.ACCEPTED,
	});
}
