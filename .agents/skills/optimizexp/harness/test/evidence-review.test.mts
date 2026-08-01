import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { validateEvidenceReview } from "../lib/evidence-review.mts";

function seed(dir: string, review: Record<string, unknown>) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "primary.cast"), "cast");
	writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
		driver: "tui",
		degraded: false,
		claims: [{ id: "claim-1", text: "When I start the product" }],
		primary: { file: "primary.cast", kind: "recording", sha256: "abc", bytes: 4 },
	}));
	writeFileSync(path.join(dir, "review.json"), JSON.stringify(review));
}

describe("evidence review gate", () => {
	it("accepts reviewed, complete, hash-matched replay evidence", () => {
		const root = mkdtempSync(path.join(tmpdir(), "oxp-review-"));
		try {
			seed(root, {
				status: "accepted", reviewer: "qa", relevance: "relevant",
				completeness: "complete", coverageMode: "full-journey",
				coveredClaims: ["claim-1"], artifactSha256: "abc",
				notes: "Playback covers the complete command and visible outcome.",
			});
			assert.deepEqual(validateEvidenceReview(root), []);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("rejects evidence that exists but is pending or incomplete", () => {
		const root = mkdtempSync(path.join(tmpdir(), "oxp-review-"));
		try {
			seed(root, {
				status: "pending", reviewer: "", relevance: "pending",
				completeness: "partial", coverageMode: "single-state",
				coveredClaims: [], artifactSha256: "wrong",
			});
			const problems = validateEvidenceReview(root);
			assert.ok(problems.includes("evidence_review_not_accepted"));
			assert.ok(problems.includes("evidence_not_marked_complete_full_journey"));
			assert.ok(problems.includes("review_artifact_hash_mismatch"));
			assert.ok(problems.includes("evidence_claim_uncovered:claim-1"));
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
