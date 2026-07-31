import assert from "node:assert/strict";
import { test } from "vitest";

import {
	candidateMultiset,
	enumerateExecutor,
	enumerateReference,
	kernelFixtureCorpus,
	multisetsEqual,
	runE1Parity,
	runE2Cold,
	runE3LoadCheck,
	runE4StaticMacros,
	runE8ZeroForward,
	runE9ClaimHygiene,
	runExperimentSuite,
	buildResidualArtifact,
	checkResidualArtifact,
} from "../src/index.js";

test("E1: residual executor multiset parity with reference on kernel corpus", () => {
	const report = runE1Parity();
	assert.equal(report.mode, "offline-residual");
	assert.equal(report.pass, true, `mismatches: ${report.mismatchCount}`);
	assert.equal(report.mismatchCount, 0);
	assert.equal(report.row.claim_class, "executor_parity");
	assert.equal(report.row.experiment, "E1");
});

test("E1: UNKNOWN is distinct from UNSUPPORTED (no silent collapse)", () => {
	const unknown = kernelFixtureCorpus().find((f) => f.id === "unknown-prefix");
	const corrupt = kernelFixtureCorpus().find((f) => f.id === "unsupported-corrupt");
	assert.ok(unknown && corrupt);
	const uRef = enumerateReference(unknown);
	const uExe = enumerateExecutor(unknown);
	const cRef = enumerateReference(corrupt);
	const cExe = enumerateExecutor(corrupt);
	assert.equal(uRef.stopReason, "unknown");
	assert.equal(uExe.stopReason, "unknown");
	assert.equal(cRef.stopReason, "unsupported");
	assert.equal(cExe.stopReason, "unsupported");
	assert.notEqual(uRef.stopReason, cRef.stopReason);
	assert.ok(
		multisetsEqual(candidateMultiset(uRef), candidateMultiset(uExe)),
	);
	assert.ok(
		multisetsEqual(candidateMultiset(cRef), candidateMultiset(cExe)),
	);
});

test("E2: illicit memo-as-cold fails; honest path records claim labels", () => {
	const illicit = runE2Cold({ illicitMemoAsCold: true });
	assert.equal(illicit.pass, false);
	assert.equal(illicit.claimClass, "request_local_memo_reuse");

	const honest = runE2Cold();
	assert.equal(honest.pass, true, honest.row.detail);
	assert.equal(honest.claimClass, "request_cold");
	assert.ok(honest.ratio <= 0.5);
	assert.equal(honest.row.metrics.memo_reuse, false);
});

test("E3: digest check catches corruption and load ratio ≥10×", () => {
	const art = buildResidualArtifact();
	assert.equal(checkResidualArtifact(art).ok, true);
	assert.equal(checkResidualArtifact(art, { corrupt: true }).ok, false);
	const report = runE3LoadCheck();
	assert.equal(report.corruptionCaught, true);
	assert.equal(report.pass, true, report.row.detail);
	assert.ok(report.loadRatio >= 10);
	assert.equal(report.row.experiment, "E3");
});

test("E4: static forced_closure matches dynamic; no literal compress; expansion cut", () => {
	const report = runE4StaticMacros();
	assert.equal(report.pass, true, report.row.detail);
	assert.ok(report.expansionReduction >= 0.3);
	assert.equal(report.row.claim_class, "static_macro_edges");
});

test("E8: singleton fixtures have forwards_count==0 on both backends", () => {
	const report = runE8ZeroForward();
	assert.equal(report.pass, true, report.row.detail);
	for (const fx of kernelFixtureCorpus().filter((f) => f.singleton)) {
		assert.equal(enumerateReference(fx).forwardsCount, 0);
		assert.equal(enumerateExecutor(fx).forwardsCount, 0);
	}
});

test("E9: honest memo label passes; AOT-cold marketing of 89.8× fails", () => {
	const honest = runE9ClaimHygiene(
		"warm path 89.8× is request_local_memo_reuse only; not AOT cold",
	);
	assert.equal(honest.pass, true);
	const illicit = runE9ClaimHygiene(
		"AOT cold-start achieves 89.8× speedup on card_open_comma",
	);
	assert.equal(illicit.pass, false);
});

test("runExperimentSuite: E1–E9 core pass; illicit E9 detected", () => {
	const suite = runExperimentSuite();
	assert.equal(suite.e1.pass, true);
	assert.equal(suite.e2.pass, true, suite.e2.row.detail);
	assert.equal(suite.e3.pass, true, suite.e3.row.detail);
	assert.equal(suite.e4.pass, true);
	assert.equal(suite.e8.pass, true);
	assert.equal(suite.e9Honest.pass, true);
	assert.equal(suite.e9Illicit.pass, false);
	assert.equal(suite.allCorePass, true);
	assert.ok(suite.rows.length >= 6);
	assert.ok(suite.rows.some((r) => r.experiment === "E1"));
	assert.ok(suite.rows.some((r) => r.experiment === "E9"));
});
