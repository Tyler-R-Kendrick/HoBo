import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "vitest";

import {
	runFormalInteropTraining,
} from "../src/index.js";

test("specialized formal-interop training runs behind training-engine port only", () => {
	const result = runFormalInteropTraining({
		dataset: "in-repo-formal",
		heldOutFraction: 0.5,
		mode: "offline-fixture",
	});
	assert.equal(result.ok, true);
	assert.equal(result.enginePort, "training-engine");
	assert.equal(result.publicSdkExport, false);
	assert.ok(result.specialized.length > 0);
	assert.ok(result.frontierBaseline.length > 0);

	const specMean =
		result.specialized.reduce((a, r) => a + r.pass_at_k, 0) /
		result.specialized.length;
	const frontMean =
		result.frontierBaseline.reduce((a, r) => a + r.pass_at_k, 0) /
		result.frontierBaseline.length;
	const specCost =
		result.specialized.reduce((a, r) => a + r.cost_usd, 0) /
		result.specialized.length;
	const frontCost =
		result.frontierBaseline.reduce((a, r) => a + r.cost_usd, 0) /
		result.frontierBaseline.length;

	assert.ok(specMean >= frontMean);
	assert.ok(specCost < frontCost);
	assert.ok(result.ecosystemLimitNote.toLowerCase().includes("ecosystem"));
	assert.ok(result.rows.some((r) => r.hypothesis === "H6"));
	assert.ok(result.rows.some((r) => r.method === "specialized-slm"));
	assert.ok(result.rows.some((r) => r.method === "zero-shot-frontier"));
});

test("fresh consumer import of shipped module (not reimplementation)", () => {
	const require = createRequire(import.meta.url);
	// ESM package: dynamic import of package entry is the consumer path under test.
	return import("../src/index.js").then((mod) => {
		assert.equal(typeof mod.runFormalInteropTraining, "function");
		const r = mod.runFormalInteropTraining({
			dataset: "itpeval-controlled",
			mode: "offline-fixture",
		});
		assert.equal(r.enginePort, "training-engine");
		void require;
	});
});
