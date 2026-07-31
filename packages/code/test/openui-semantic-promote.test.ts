import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fixtures } from "@hobo/formal-interop";

import {
	openUiSemanticPromotionGate,
	promoteIsolation,
	type PromotionGate,
} from "../src/sandbox-promote.js";

const requiredGates: PromotionGate[] = [
	{ name: "architecture:guard", pass: true, detail: "ok" },
	{ name: "standards:check", pass: true, detail: "ok" },
	{ name: "agent:check", pass: true, detail: "ok" },
	{ name: "docs:freshness", pass: true, detail: "ok" },
];

describe("OpenUI semantic promotion gate", () => {
	it("openUiSemanticPromotionGate passes gold trees", () => {
		const gate = openUiSemanticPromotionGate({
			candidateId: "g1",
			artifactKind: "openui",
			generated: fixtures.gold,
			goldOrIntent: fixtures.gold,
		});
		expect(gate.pass).toBe(true);
		expect(gate.name).toBe("openui:semantic-beq");
	});

	it("openUiSemanticPromotionGate rejects meaning-zero", () => {
		const gate = openUiSemanticPromotionGate({
			candidateId: "mz",
			artifactKind: "openui",
			generated: fixtures.meaningZero,
			goldOrIntent: fixtures.gold,
		});
		expect(gate.pass).toBe(false);
	});

	it("promoteIsolation refuses OpenUI meaning-zero via default-on semantic gate", () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-sem-"));
		const result = promoteIsolation(
			{
				runId: "run-mz",
				targetProject: hoboHome,
				isolationRoot: join(hoboHome, "iso"),
				squashOnly: true,
				gateResults: requiredGates.map((g) => `${g.name}:pass`),
			},
			{
				hoboHome,
				gates: requiredGates,
				openUi: {
					generated: fixtures.meaningZero,
					goldOrIntent: fixtures.gold,
				},
			},
		);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_PROMOTE_SEMANTIC_BEQ_FAILED");
	});

	it("promoteIsolation accepts gold OpenUI when semantic gate passes", () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-sem-ok-"));
		const result = promoteIsolation(
			{
				runId: "run-gold",
				targetProject: hoboHome,
				isolationRoot: join(hoboHome, "iso"),
				squashOnly: true,
				gateResults: requiredGates.map((g) => `${g.name}:pass`),
			},
			{
				hoboHome,
				gates: requiredGates,
				openUi: {
					generated: fixtures.gold,
					goldOrIntent: fixtures.gold,
				},
			},
		);
		// may fail cleanup if isolation missing; semantic gate itself must not refuse
		expect(result.code).not.toBe("HOBO_CODE_PROMOTE_SEMANTIC_BEQ_FAILED");
	});
});
