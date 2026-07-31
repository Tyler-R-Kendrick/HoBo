import assert from "node:assert/strict";
import { test } from "vitest";

import {
	evaluateClaimClassGate,
	evaluateOpenUiPromotion,
	fixtures,
	runAntiE237Validation,
	validateAntiE237Card,
} from "../src/index.js";

test("claim_class missing fails closed for cold-start claims", () => {
	const gate = evaluateClaimClassGate({
		claimClass: undefined,
		coldStartClaim: true,
	});
	assert.equal(gate.ok, false);
	assert.equal(gate.code, "MISSING_CLAIM_CLASS");
});

test("claim_class fixture_or_scratch fails closed for cold-start", () => {
	const gate = evaluateClaimClassGate({
		claimClass: "fixture_or_scratch",
		coldStartClaim: true,
	});
	assert.equal(gate.ok, false);
	assert.equal(gate.code, "NON_PROMOTABLE_CLAIM_CLASS");
});

test("request_local_memo_reuse fails as cold-start evidence", () => {
	const gate = evaluateClaimClassGate({
		claimClass: "request_local_memo_reuse",
		coldStartClaim: true,
	});
	assert.equal(gate.ok, false);
	assert.equal(gate.code, "MEMO_LABELED_AS_COLD");
});

test("executor_parity claim_class accepted for cold-start", () => {
	const gate = evaluateClaimClassGate({
		claimClass: "executor_parity",
		coldStartClaim: true,
	});
	assert.equal(gate.ok, true);
});

test("promotion refuses cold-start with fixture_or_scratch", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "scratch-cold",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
		coldStartClaim: true,
		claimClass: "fixture_or_scratch",
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.includes("claim_class")));
});

test("promotion refuses cold-start with missing claim_class", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "missing-class",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
		coldStartClaim: true,
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.includes("claim_class")));
});

test("promotion accepts cold-start with executor_parity claim_class", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "ok-cold",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
		coldStartClaim: true,
		claimClass: "executor_parity",
	});
	assert.equal(decision.ok, true);
});

const completeCard = {
	arms: ["control", "train_on_decode_off", "train_on_decode_on"],
	kill_if: [
		"no_learning_delta",
		"applications_gt_0_and_choice_changes_eq_0",
		"choice_changes_gt_0_and_quality_down",
		"train_on_decode_off_damages_primary",
	],
	report: {
		head_acc_by_candidate_count: true,
		meaningful_not_syntax_only: true,
		held_out: true,
		adversarial: true,
		n: 24,
	},
	success_bar: {
		held_out_meaningful: ">= control + 0.10",
		causal_decode: "not_harmful",
		train_interference: "none",
	},
	n: 24,
};

test("anti-E237 complete card accepted", () => {
	const v = validateAntiE237Card(completeCard);
	assert.equal(v.ok, true, v.failures.join("; "));
	const row = runAntiE237Validation(completeCard);
	assert.equal(row.pass, true);
	assert.equal(row.experiment, "anti_e237");
});

test("anti-E237 incomplete card rejected (missing arms)", () => {
	const v = validateAntiE237Card({
		arms: ["control"],
		kill_if: completeCard.kill_if,
		report: completeCard.report,
		success_bar: completeCard.success_bar,
		n: 24,
	});
	assert.equal(v.ok, false);
	assert.ok(v.failures.some((f) => f.includes("arms")));
});

test("anti-E237 incomplete card rejected (n < 20)", () => {
	const v = validateAntiE237Card({
		...completeCard,
		n: 5,
		report: { ...completeCard.report, n: 5 },
	});
	assert.equal(v.ok, false);
	assert.ok(v.failures.some((f) => f.includes("n:")));
});

test("anti-E237 empty card rejected", () => {
	const v = validateAntiE237Card({});
	assert.equal(v.ok, false);
	assert.ok(v.failures.length > 0);
});
