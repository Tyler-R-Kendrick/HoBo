import assert from "node:assert/strict";
import { test } from "vitest";

import {
	assertAllHypothesesPresent,
	evaluateOpenUiPromotion,
	fixtures,
	readMetricsLedger,
	requiredColumnsPresent,
	runControlledVsEcosystemAblation,
	runFormalInteropTraining,
	runMismatchSuite,
	runMultiItpHarness,
	appendMetricsRow,
	makeTypedCertificate,
	replayFormalCertificate,
	beqOpenUi,
} from "../src/index.js";

test("fail-closed: missing formal package refuses promotion", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "no-pkg",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		formalPackagePresent: false,
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.includes("formal-package")));
});

test("fail-closed: missing generated/gold trees refuse OpenUI promotion", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "no-trees",
		artifactKind: "openui",
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.includes("missing")));
});

test("fail-closed: untyped certificate claim refuses", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "untyped",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		certificate: {
			claimId: "c",
			theoremName: "free form",
			irDigest: "",
			proofDigest: "",
			sourceItp: "llm",
			typed: false,
		},
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.includes("UNTYPED") || f.includes("certificate")));
});

test("metrics ledger covers H1–H7 with required columns after harness suite", () => {
	// Ensure each hypothesis has at least one row from shipped entry points.
	beqOpenUi(fixtures.gold, fixtures.gold);
	appendMetricsRow({
		hypothesis: "H4",
		tier: "controlled",
		method: "semantic-beq",
		pass_at_1: 1,
		pass_at_k: 1,
		beq_or_fidelity: 1,
		agentv_scores: { structure: 1 },
		preflight_reject_rate: 0,
		cost_usd: 0,
		latency_ms: 1,
		seed: "ledger",
		model: "n/a",
		prompt_digest: "h4",
	});

	runControlledVsEcosystemAblation([
		{
			tree: fixtures.controlled,
			gold: fixtures.controlled,
			agentvMeaningful: 0.9,
			formalPreflightOk: true,
		},
		{
			tree: fixtures.ecosystem,
			gold: fixtures.controlled,
			agentvMeaningful: 0.2,
			formalPreflightOk: false,
		},
	]);

	const cert = makeTypedCertificate({
		claimId: "ledger-cert",
		theoremName: "Forest.wf",
		sourceItp: "lean",
		irBody: "Forest.wf",
	});
	assert.equal(replayFormalCertificate(cert).ok, true);
	appendMetricsRow({
		hypothesis: "H3",
		tier: "controlled",
		method: "hybrid-ir",
		pass_at_1: 1,
		pass_at_k: 1,
		beq_or_fidelity: 1,
		agentv_scores: {},
		preflight_reject_rate: 0,
		cost_usd: 0.001,
		latency_ms: 5,
		seed: "ledger-h3",
		model: "hybrid",
		prompt_digest: cert.irDigest,
	});

	runMismatchSuite(fixtures.gold);
	runMultiItpHarness({ offline: true });
	runFormalInteropTraining({
		dataset: "in-repo-formal",
		mode: "offline-fixture",
	});

	const rows = readMetricsLedger();
	const coverage = assertAllHypothesesPresent(rows);
	assert.equal(
		coverage.ok,
		true,
		`missing hypotheses: ${coverage.missing.join(",")}`,
	);
	for (const row of rows) {
		assert.equal(requiredColumnsPresent(row), true, JSON.stringify(row));
	}
});
