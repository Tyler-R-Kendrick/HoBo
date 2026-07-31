import assert from "node:assert/strict";
import { test } from "vitest";

import {
	CONTROLLED_LIBRARY,
	ECOSYSTEM_LIBRARY,
	appendMetricsRow,
	fixtures,
	makeTypedCertificate,
	replayFormalCertificate,
	runControlledVsEcosystemAblation,
	runMismatchSuite,
} from "../src/index.js";

test("controlled and ecosystem libraries are defined as data with measurable size gap", () => {
	assert.ok(CONTROLLED_LIBRARY.productions.length > 0);
	assert.ok(
		ECOSYSTEM_LIBRARY.productions.length > CONTROLLED_LIBRARY.productions.length,
	);
	assert.ok(ECOSYSTEM_LIBRARY.operators.length > 0);
	assert.equal(CONTROLLED_LIBRARY.operators.length, 0);
});

test("ablation yields controlled vs ecosystem gap on meaningful-rate / AgentV / semantic pass", () => {
	const result = runControlledVsEcosystemAblation([
		{
			tree: fixtures.controlled,
			gold: fixtures.controlled,
			agentvMeaningful: 0.9,
			formalPreflightOk: true,
		},
		{
			tree: fixtures.controlled,
			gold: fixtures.controlled,
			agentvMeaningful: 0.85,
			formalPreflightOk: true,
		},
		{
			tree: fixtures.ecosystem,
			gold: fixtures.controlled,
			agentvMeaningful: 0.2,
			formalPreflightOk: false,
		},
		{
			tree: fixtures.ecosystem,
			gold: fixtures.controlled,
			agentvMeaningful: 0.15,
			formalPreflightOk: false,
		},
	]);
	assert.ok(result.controlled.n >= 2);
	assert.ok(result.ecosystem.n >= 2);
	assert.ok(result.controlled.meaningfulRate > result.ecosystem.meaningfulRate);
	assert.ok(result.controlled.agentvMean > result.ecosystem.agentvMean);
	assert.ok(result.controlled.semanticPassRate > result.ecosystem.semanticPassRate);
	assert.ok(result.meaningfulRateGap > 0);
	assert.equal(result.rows.length, 2);
	assert.equal(result.rows[0]!.hypothesis, "H2");
});

test("mismatch injector rejects rename/role-swap/style-skew early", () => {
	const suite = runMismatchSuite(fixtures.gold);
	assert.equal(suite.length, 3);
	for (const item of suite) {
		assert.equal(item.rejected, true, `${item.kind} should reject`);
		assert.ok(item.reasons.length > 0);
		assert.equal(item.row.hypothesis, "H7");
		assert.equal(item.row.preflight_reject_rate, 1);
	}
});

test("typed FormalCertificate replays green; free-form untyped fails", () => {
	const typed = makeTypedCertificate({
		claimId: "claim-1",
		theoremName: "Forest.wf",
		sourceItp: "lean",
		irBody: "theorem Forest.wf ...",
	});
	const ok = replayFormalCertificate(typed);
	assert.equal(ok.ok, true);
	assert.equal(ok.code, "REPLAY_OK");

	const untyped = replayFormalCertificate({
		claimId: "x",
		theoremName: "whatever the model said",
		irDigest: "",
		proofDigest: "",
		sourceItp: "llm",
		typed: false,
	});
	assert.equal(untyped.ok, false);
	assert.equal(untyped.code, "UNTYPED_CLAIM");

	appendMetricsRow({
		hypothesis: "H3",
		tier: "controlled",
		method: "certificate-replay",
		pass_at_1: 1,
		pass_at_k: 1,
		beq_or_fidelity: 1,
		agentv_scores: {},
		preflight_reject_rate: 0,
		cost_usd: 0,
		latency_ms: 2,
		seed: "w1-cert",
		model: "hybrid-ir",
		prompt_digest: typed.irDigest,
	});
});
