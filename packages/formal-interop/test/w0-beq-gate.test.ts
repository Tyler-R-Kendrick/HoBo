import assert from "node:assert/strict";
import { test } from "vitest";

import {
	appendMetricsRow,
	beqOpenUi,
	evaluateOpenUiPromotion,
	fixtures,
	parseOpenUiTree,
} from "../src/index.js";

test("BEq: gold tree matches itself", () => {
	const result = beqOpenUi(fixtures.gold, fixtures.gold);
	assert.equal(result.ok, true);
	assert.equal(result.score, 1);
	assert.equal(result.failures.length, 0);
});

test("BEq: hierarchy/binder-broken fails closed", () => {
	const result = beqOpenUi(fixtures.hierarchyBroken, fixtures.gold);
	assert.equal(result.ok, false);
	assert.ok(result.failures.length > 0);
	assert.ok(
		result.failures.some(
			(f) => f.path.includes("children") || f.path.includes("binder") || f.path.includes("role"),
		),
	);
});

test("BEq: syntax-perfect meaning-zero fails closed", () => {
	const result = beqOpenUi(fixtures.meaningZero, fixtures.gold);
	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some((f) => f.reason.includes("meaning") || f.path.includes("role")),
	);
});

test("parseOpenUiTree round-trips gold fixture shape", () => {
	const raw = {
		id: "parsed",
		libraryTier: "controlled",
		root: {
			kind: "form",
			role: "main",
			binder: "session.form",
			meaningBearing: true,
			attrs: { testid: "primary" },
			children: [
				{
					kind: "heading",
					role: "title",
					binder: "session.title",
					meaningBearing: true,
					attrs: {},
					children: [],
				},
			],
		},
	};
	const tree = parseOpenUiTree(raw);
	assert.equal(tree.root.kind, "form");
	assert.equal(tree.root.children.length, 1);
});

test("promotion: gold OpenUI passes semantic gate (default on)", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "cand-gold",
		artifactKind: "openui",
		generated: fixtures.gold,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, true);
	assert.equal(decision.beq?.ok, true);
});

test("promotion: meaning-zero OpenUI denied", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "cand-mz",
		artifactKind: "openui",
		generated: fixtures.meaningZero,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, false);
	assert.ok(decision.failures.some((f) => f.startsWith("semantic:")));
});

test("promotion: hierarchy-broken OpenUI denied", () => {
	const decision = evaluateOpenUiPromotion({
		candidateId: "cand-hb",
		artifactKind: "openui",
		generated: fixtures.hierarchyBroken,
		goldOrIntent: fixtures.gold,
		conformance: true,
		policy: true,
	});
	assert.equal(decision.ok, false);
});

test("H4 metrics row recorded", () => {
	const beq = beqOpenUi(fixtures.gold, fixtures.gold);
	const row = appendMetricsRow({
		hypothesis: "H4",
		tier: "controlled",
		method: "semantic-beq",
		pass_at_1: beq.ok ? 1 : 0,
		pass_at_k: beq.ok ? 1 : 0,
		beq_or_fidelity: beq.score,
		agentv_scores: { structure: beq.score },
		preflight_reject_rate: beq.ok ? 0 : 1,
		cost_usd: 0,
		latency_ms: 1,
		seed: "w0",
		model: "n/a",
		prompt_digest: "gold-self",
	});
	assert.equal(row.hypothesis, "H4");
	assert.equal(row.beq_or_fidelity, 1);
});
