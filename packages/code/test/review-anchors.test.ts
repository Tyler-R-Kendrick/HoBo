/**
 * Re-anchoring a review comment onto a changed diff.
 *
 * A review comment points at a hunk in one generation of a diff. When the
 * branch moves, that generation is gone and the comment has to be placed again
 * — and the cost of getting it wrong is asymmetric in a way that shapes the
 * whole cascade.
 *
 * **A wrongly-placed comment is worse than a lost one.** A comment that lands
 * on unrelated code reads as a reviewer's considered objection to code they
 * never saw. A comment marked stale reads as what it is. So every step of the
 * cascade refuses rather than guesses: two candidate hunks produce `ambiguous`,
 * not "pick the first".
 *
 * **The cascade is ordered by how much it proves.** Same generation and file is
 * identity — nothing moved. A unique fingerprint match is the same hunk under a
 * new generation. A unique *content* match is weaker: the hunk was rewritten
 * but the selected text survives somewhere, which is why it returns
 * `unique-context` rather than `exact`. Only when all three fail is the comment
 * stale. Tests here pin the order as well as each step, because a cascade that
 * checked content before fingerprint would downgrade exact matches to
 * contextual ones and quietly lose confidence it had.
 *
 * **`deleted` and `no-match` are different answers.** An empty hunk list means
 * the file is gone; a non-empty one that matches nothing means the code moved
 * out from under the comment. A reviewer can act on the second and not the
 * first.
 */
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
	type ReviewAnchor,
	ReviewAnchorSchema,
	type ReviewHunk,
	ReviewHunkSchema,
} from "../src/_generated/code_review_pb.js";
import { coverageIdentity, reanchor } from "../src/review/review-anchors.js";

function anchor(): ReviewAnchor {
	return create(ReviewAnchorSchema, {
		anchorId: "anchor-1",
		generationId: "gen-1",
		fileId: "file-1",
		hunkId: "hunk-1",
		hunkFingerprint: "fp-1",
		selectedContentHash: "hash-1",
		side: 2,
		contextBeforeHashes: [],
		contextAfterHashes: [],
	});
}

function hunk(
	hunkId: string,
	fingerprint: string,
	lineHashes: readonly string[] = [],
): ReviewHunk {
	return create(ReviewHunkSchema, {
		hunkId,
		fingerprint,
		lines: lineHashes.map((rawTextHash) => ({ rawTextHash })),
	});
}

describe("nothing moved", () => {
	it("keeps the anchor as-is for the same generation and file", () => {
		// Identity, not a match: re-deriving an anchor that did not need to move
		// risks changing it.
		const outcome = reanchor(anchor(), [], "gen-1", "file-1");
		expect(outcome.kind).toBe("exact");
		expect(outcome.kind === "exact" && outcome.method).toBe("same-generation");
	});

	it("hands back the very same anchor object", () => {
		const original = anchor();
		const outcome = reanchor(original, [], "gen-1", "file-1");
		expect(outcome.kind === "exact" && outcome.newAnchor).toBe(original);
	});

	it("does not take the shortcut when only the generation matches", () => {
		// The same generation in a different file is a different location. Both
		// halves of the condition matter.
		expect(reanchor(anchor(), [], "gen-1", "other-file").kind).toBe("stale");
	});

	it("does not take the shortcut when only the file matches", () => {
		expect(reanchor(anchor(), [], "gen-2", "file-1").kind).toBe("stale");
	});
});

describe("matching by hunk fingerprint", () => {
	it("re-anchors onto the one hunk carrying the fingerprint", () => {
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-1"), hunk("hunk-8", "fp-other")],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("exact");
		expect(outcome.kind === "exact" && outcome.method).toBe("unique-hunk");
	});

	it("moves the anchor to the new generation, file and hunk", () => {
		// All three, because the anchor is stored and re-read: leaving the old
		// generation on it would make the next re-anchor take the identity
		// shortcut against a generation that no longer exists.
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-1")],
			"gen-2",
			"file-2",
		);
		if (outcome.kind !== "exact") throw new Error("expected an exact match");
		expect(outcome.newAnchor.generationId).toBe("gen-2");
		expect(outcome.newAnchor.fileId).toBe("file-2");
		expect(outcome.newAnchor.hunkId).toBe("hunk-9");
	});

	it("carries the rest of the anchor through unchanged", () => {
		// The selection and its context are what the comment is *about*; only the
		// location is being updated.
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-1")],
			"gen-2",
			"file-2",
		);
		if (outcome.kind !== "exact") throw new Error("expected an exact match");
		expect(outcome.newAnchor.anchorId).toBe("anchor-1");
		expect(outcome.newAnchor.selectedContentHash).toBe("hash-1");
	});

	it("does not mutate the anchor it was given", () => {
		// Callers re-anchor against several candidate generations; mutation would
		// make the second attempt depend on the first.
		const original = anchor();
		reanchor(original, [hunk("hunk-9", "fp-1")], "gen-2", "file-2");
		expect(original.generationId).toBe("gen-1");
	});

	it("refuses rather than choosing when two hunks share the fingerprint", () => {
		// The whole point. Picking the first would land a reviewer's objection on
		// whichever duplicate happened to be earlier in the list.
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-1"), hunk("hunk-8", "fp-1")],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("ambiguous");
		expect(outcome.kind === "ambiguous" && outcome.reason).toBe(
			"multiple-matches",
		);
	});

	it("reports every candidate it could not choose between", () => {
		// So the caller can show a reviewer what the collision was.
		const outcome = reanchor(
			anchor(),
			[hunk("a", "fp-1"), hunk("b", "fp-1"), hunk("c", "fp-1")],
			"gen-2",
			"file-2",
		);
		expect(outcome.evidence).toHaveLength(3);
	});
});

describe("matching by selected content", () => {
	it("re-anchors onto the one hunk containing the selected text", () => {
		// Weaker than a fingerprint match: the hunk was rewritten, but the text
		// the comment selected is still in exactly one place.
		const outcome = reanchor(
			anchor(),
			[
				hunk("hunk-9", "fp-changed", ["hash-1"]),
				hunk("hunk-8", "fp-other", []),
			],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("unique-context");
		expect(outcome.kind === "unique-context" && outcome.method).toBe(
			"selected-content-and-context",
		);
	});

	it("moves the anchor the same way an exact match does", () => {
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-changed", ["hash-1"])],
			"gen-2",
			"file-2",
		);
		if (outcome.kind !== "unique-context") throw new Error("expected context");
		expect(outcome.newAnchor.hunkId).toBe("hunk-9");
		expect(outcome.newAnchor.generationId).toBe("gen-2");
	});

	it("finds the hash anywhere in the hunk, not only on its first line", () => {
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-changed", ["other", "other-2", "hash-1"])],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("unique-context");
	});

	it("refuses when the selected text survives in more than one hunk", () => {
		// Common with a moved or duplicated block, and exactly the case where
		// guessing puts the comment on the wrong copy.
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-a", ["hash-1"]), hunk("hunk-8", "fp-b", ["hash-1"])],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("ambiguous");
	});
});

describe("the order the cascade tries things in", () => {
	it("prefers a fingerprint match over a content match", () => {
		// A hunk whose fingerprint still matches is the same hunk; one that only
		// shares the selected text is a weaker claim. Checking content first
		// would downgrade an exact match to a contextual one and quietly lose
		// confidence the cascade had.
		const outcome = reanchor(
			anchor(),
			[
				hunk("by-fingerprint", "fp-1", []),
				hunk("by-content", "fp-other", ["hash-1"]),
			],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("exact");
		expect(outcome.kind === "exact" && outcome.newAnchor.hunkId).toBe(
			"by-fingerprint",
		);
	});

	it("reports a fingerprint collision even when the content would be unique", () => {
		// The ambiguity is real regardless of what a later, weaker step would
		// have said; falling through to it would resolve a collision by using
		// less evidence.
		const outcome = reanchor(
			anchor(),
			[
				hunk("a", "fp-1", []),
				hunk("b", "fp-1", []),
				hunk("c", "fp-x", ["hash-1"]),
			],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("ambiguous");
	});
});

describe("when the comment can no longer be placed", () => {
	it("calls it deleted when there are no hunks at all", () => {
		// The file is gone. Distinct from no-match because a reviewer cannot act
		// on it the same way.
		const outcome = reanchor(anchor(), [], "gen-2", "file-2");
		expect(outcome.kind).toBe("stale");
		expect(outcome.kind === "stale" && outcome.reason).toBe("deleted");
	});

	it("calls it no-match when hunks exist but none fit", () => {
		const outcome = reanchor(
			anchor(),
			[hunk("hunk-9", "fp-other", ["other-hash"])],
			"gen-2",
			"file-2",
		);
		expect(outcome.kind).toBe("stale");
		expect(outcome.kind === "stale" && outcome.reason).toBe("no-match");
	});

	it("names the fingerprint it was looking for", () => {
		// The evidence is what makes a stale marker reviewable rather than just
		// a disappearance.
		expect(reanchor(anchor(), [], "gen-2", "file-2").evidence).toEqual([
			"fp-1",
		]);
	});
});

describe("identifying what a comment covers", () => {
	it("qualifies the file with the hunk when there is one", () => {
		expect(coverageIdentity("file-1", "hunk-1")).toBe("file-1:hunk-1");
	});

	it("falls back to the file alone", () => {
		// A file-level comment covers the file, not a hunk within it; appending a
		// separator would make it collide with a hunk id of "".
		expect(coverageIdentity("file-1")).toBe("file-1");
		expect(coverageIdentity("file-1", "")).toBe("file-1");
	});
});
