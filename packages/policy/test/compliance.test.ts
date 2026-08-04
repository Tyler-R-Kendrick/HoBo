// ADR-0146: the residency policy pack (eu-data-stays-in-eu made real) and
// control→evidence packs with coverage evaluation (ADR-0060 §4 realized).
import assert from "node:assert/strict";
import { test } from "vitest";

import {
	CONTROL_EVIDENCE_PACK_SCHEMA,
	evaluateControlCoverage,
	NIST_800_53_SEED_PACK,
	parseControlEvidencePack,
} from "../src/control-evidence-pack.js";
import { evaluateResidencyPolicy } from "../src/residency-policy-pack.js";

test("eu-data-stays-in-eu: pii landing in us-east-1 is denied with the rule named", () => {
	const decision = evaluateResidencyPolicy({
		classification: "pii",
		verdict: {
			ok: false,
			code: "jurisdiction-not-allowed",
			region: "us-east-1",
			regionJurisdictions: ["us"],
			remediation:
				"region us-east-1 (us) is outside allowed jurisdictions [eu, eea]",
		},
	});
	assert.equal(decision.allowed, false);
	assert.equal(decision.effect, "deny");
	assert.match(decision.reasons[0] ?? "", /'pii' data would land outside/u);
});

test("unregulated data in a mapped-but-disallowed region warns instead of denying", () => {
	const decision = evaluateResidencyPolicy({
		classification: "internal",
		verdict: {
			ok: false,
			code: "jurisdiction-not-allowed",
			region: "us-east-1",
			regionJurisdictions: ["us"],
		},
	});
	assert.equal(decision.allowed, true);
	assert.equal(decision.effect, "warn");
});

test("unmapped regions deny even for unregulated data (fail closed)", () => {
	const decision = evaluateResidencyPolicy({
		classification: "public",
		verdict: {
			ok: false,
			code: "region-unmapped",
			region: "mars-north-1",
			regionJurisdictions: [],
		},
	});
	assert.equal(decision.allowed, false);
});

test("a clean verdict allows and carries residency evidence obligations", () => {
	const decision = evaluateResidencyPolicy({
		classification: "phi",
		verdict: {
			ok: true,
			region: "eu-west-1",
			regionJurisdictions: ["eu", "eea"],
		},
	});
	assert.equal(decision.effect, "allow");
	const obligation = decision.obligations[0] as {
		kind: string;
		jurisdictions: string[];
	};
	assert.equal(obligation.kind, "residency-evidence");
	assert.deepEqual(obligation.jurisdictions, ["eu", "eea"]);
});

test("control-evidence pack parses fail closed", () => {
	assert.throws(
		() => parseControlEvidencePack({ schema: "wrong" }),
		/schema must be/u,
	);
	assert.throws(
		() =>
			parseControlEvidencePack({
				schema: CONTROL_EVIDENCE_PACK_SCHEMA,
				framework: "X",
				version: "1",
				controls: [
					{ controlId: "A", title: "a", status: "implemented", evidence: [] },
				],
			}),
		/at least one evidence ref/u,
	);
});

test("coverage: seed pack is fully covered by the real evidence set; planned controls never count", () => {
	const evidence = [
		"event-stream:policy.Decided",
		"gate:gatekeeper.Decided",
		"gate:capability-grants",
		"event-stream:journal-append-only",
		"retention:credential-audit-never-compact",
		"gate:can-deploy",
		"event-stream:gatekeeper.Decided",
		"artifact:conformance-report",
		"artifact:cyclonedx-sbom",
		"artifact:crypto-shred-erasure",
		"artifact:ocsf-export",
	];
	const report = evaluateControlCoverage(NIST_800_53_SEED_PACK, evidence);
	assert.equal(report.total, 9);
	// AU-6 is status:planned — evidence presence cannot satisfy it.
	assert.equal(report.satisfied, 8);
	assert.deepEqual(report.missing, [
		{ controlId: "AU-6", missingRefs: ["status:planned"] },
	]);
});

test("coverage: missing evidence is named per control", () => {
	const report = evaluateControlCoverage(NIST_800_53_SEED_PACK, [
		"event-stream:policy.Decided",
	]);
	const ac3 = report.missing.find((entry) => entry.controlId === "AC-3");
	assert.ok(ac3);
	assert.deepEqual(ac3.missingRefs, ["gate:gatekeeper.Decided"]);
	assert.ok(report.coverage < 0.2);
});
