import assert from "node:assert/strict";
import { test } from "vitest";

import {
	CONTROLLED_THEOREMS,
	checkFormalPackage,
	inspectFormalPackage,
	runMultiItpHarness,
	targetItps,
	translateTheorem,
} from "../src/index.js";

test("controlled formal package present with Forest/LeanTrace/Metrics/Recurrence and no Mathlib on controlled path", () => {
	const status = inspectFormalPackage();
	assert.equal(status.present, true);
	assert.ok(status.leanFiles.some((f) => f.includes("Forest")));
	assert.ok(status.leanFiles.some((f) => f.includes("LeanTrace")));
	assert.ok(status.leanFiles.some((f) => f.includes("Metrics")));
	assert.ok(status.leanFiles.some((f) => f.includes("Recurrence")));
	assert.equal(status.hasMathlibOnControlledPath, false);
	assert.equal(status.mathlibContrastPresent, true);
	for (const t of CONTROLLED_THEOREMS) {
		assert.ok(
			status.controlledTheoremsDeclared.includes(t),
			`missing theorem declaration material for ${t}`,
		);
	}
});

test("checkFormalPackage succeeds in live or offline-fixture mode", () => {
	const result = checkFormalPackage();
	assert.equal(result.ok, true);
	assert.ok(result.mode === "live" || result.mode === "offline-fixture");
});

test("multi-ITP harness reports pass@1 and beq_or_fidelity for all three ITPs and both methods", () => {
	const harness = runMultiItpHarness({ offline: true });
	assert.ok(harness.results.length > 0);

	for (const target of targetItps()) {
		for (const method of ["zero-shot-frontier", "constrained-slm"] as const) {
			const hit = harness.results.find(
				(r) =>
					r.attempt.target === target &&
					r.attempt.method === method &&
					r.attempt.tier === "controlled",
			);
			assert.ok(hit, `missing ${target} ${method}`);
			assert.equal(typeof hit.pass_at_1, "number");
			assert.equal(typeof hit.beq_or_fidelity, "number");
			assert.ok(hit.row.hypothesis === "H1" || hit.row.hypothesis === "H5");
		}
	}

	// multi-ITP context vs single-prover rows present
	assert.ok(
		harness.results.some((r) => r.attempt.context === "multi-itp-context"),
	);
	assert.ok(harness.results.some((r) => r.attempt.context === "single-prover"));
	assert.ok(harness.multiItpLift > 0);

	// controlled vs Mathlib-dependent drop
	assert.ok(harness.controlledMeanPass > harness.mathlibMeanPass);
});

test("translateTheorem certificate replay works for a controlled theorem", () => {
	const r = translateTheorem({
		theorem: "Forest.wf",
		target: "rocq",
		method: "constrained-slm",
		context: "multi-itp-context",
		tier: "controlled",
		offline: true,
	});
	assert.equal(r.certificateReplayOk, true);
	assert.ok(r.pass_at_1 > 0.5);
});
