/**
 * The record side of the release gate (ADR-0172): what a `release` record
 * must hold to claim `passed`, the `not_run` status, and how the runner turns
 * check exit codes into statuses when a check `requires` another or lists
 * `notRunExitCodes`. Checks here run `node -e`, so nothing depends on ai-bdd.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	checkStatusOf,
	recordStatusOf,
	runnerExitCodeOf,
} from "../src/gate-status.js";
import { parseStageGateRecord } from "../src/parse.js";
import { runStageGate } from "../src/runner.js";
import type {
	CheckResult,
	CheckStatus,
	StageGateCheck,
	StageGateRecordJson,
} from "../src/types.js";
import { StageGateParseError } from "../src/types.js";

const DIGEST = `sha256:${"e".repeat(64)}`;

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function check(
	checkId: string,
	status: CheckStatus = "passed",
	evidence: Readonly<Record<string, string>> = {},
): StageGateRecordJson["checks"][number] {
	return {
		check_id: checkId,
		command: ["node"],
		exit_code: status === "passed" ? 0 : 1,
		status,
		evidence,
	};
}

const RELEASE_CHECKS = [
	check("acceptance-plans-fresh"),
	check("acceptance-replay", "passed", { report_digest: DIGEST }),
	check("acceptance-evidence-intact"),
];

/** A passed release record as the runner writes it: no signature, a zero artifact. */
function releaseRecord(
	overrides: Partial<StageGateRecordJson> = {},
): StageGateRecordJson {
	return {
		gate_id: "release",
		status: "passed",
		repo_commit: "abc",
		ci_run_url: "",
		started_at: "2026-10-17T00:00:00.000Z",
		finished_at: "2026-10-17T00:01:00.000Z",
		checks: RELEASE_CHECKS,
		artifact: {
			digest_sha256: `sha256:${"0".repeat(64)}`,
			byte_length: 0,
			media_type: "application/octet-stream",
		},
		signature: {
			verified: false,
			signer_identity: "",
			provenance_tier: "",
			conformance_report_digest: "",
		},
		...overrides,
	};
}

function issuesOf(record: StageGateRecordJson): readonly string[] {
	try {
		parseStageGateRecord(record);
	} catch (error) {
		if (error instanceof StageGateParseError) return error.issues;
		throw error;
	}
	throw new Error("expected the record to be refused");
}

describe("a passed release record", () => {
	it("needs no signature or artifact, only its three checks and the report digest", () => {
		const record = parseStageGateRecord(releaseRecord());
		expect(record.gateId).toBe("release");
		expect(record.status).toBe("passed");
		expect(record.signature.verified).toBe(false);
	});

	it.each([
		["one missing", RELEASE_CHECKS.slice(0, 2)],
		["reordered", [RELEASE_CHECKS[1], RELEASE_CHECKS[0], RELEASE_CHECKS[2]]],
		["none at all", []],
	])("is refused with its checks %s", (_label, checks) => {
		const issues = issuesOf(
			releaseRecord({ checks: checks.filter((c) => c !== undefined) }),
		);
		expect(issues.join("\n")).toContain(
			"passed release record requires exactly the checks acceptance-plans-fresh, acceptance-replay, acceptance-evidence-intact in that order",
		);
	});

	it("is refused without the replay's report digest", () => {
		const issues = issuesOf(
			releaseRecord({
				checks: [
					check("acceptance-plans-fresh"),
					check("acceptance-replay"),
					check("acceptance-evidence-intact"),
				],
			}),
		);
		expect(issues).toEqual([
			"passed release record requires acceptance-replay evidence report_digest",
		]);
	});

	it("is refused with a check that was not run", () => {
		const issues = issuesOf(
			releaseRecord({
				checks: [
					check("acceptance-plans-fresh", "not_run"),
					...RELEASE_CHECKS.slice(1),
				],
			}),
		);
		expect(issues).toContain(
			"passed record requires every check passed (acceptance-plans-fresh)",
		);
	});
});

describe("the not_run status", () => {
	it("parses on a record and on a check", () => {
		const record = parseStageGateRecord(
			releaseRecord({
				status: "not_run",
				checks: [
					check("acceptance-plans-fresh", "not_run"),
					check("acceptance-replay", "skipped"),
					check("acceptance-evidence-intact", "skipped"),
				],
			}),
		);
		expect(record.status).toBe("not_run");
		expect(record.checks.map((c) => c.status)).toEqual([
			"not_run",
			"skipped",
			"skipped",
		]);
	});

	it("is a check status only where the definition lists the exit code", () => {
		const s0: StageGateCheck = { checkId: "a", kind: "lint", command: [] };
		const acceptance: StageGateCheck = { ...s0, notRunExitCodes: [3] };
		expect(checkStatusOf(s0, 3)).toBe("failed");
		expect(checkStatusOf(acceptance, 3)).toBe("not_run");
		expect(checkStatusOf(acceptance, 4)).toBe("failed");
		expect(checkStatusOf(acceptance, 0)).toBe("passed");
	});

	it("makes the record not_run only when nothing failed", () => {
		const of = (...statuses: CheckStatus[]): CheckResult[] =>
			statuses.map((status, index) => ({
				checkId: String(index),
				command: [],
				exitCode: 0,
				status,
				evidence: {},
			}));
		expect(recordStatusOf(of("passed", "not_run", "skipped"))).toBe("not_run");
		expect(recordStatusOf(of("not_run", "failed"))).toBe("failed");
		expect(recordStatusOf(of("passed", "passed"))).toBe("passed");
		// A skipped check beside no failure cannot make a pass.
		expect(recordStatusOf(of("passed", "skipped"))).toBe("failed");
		expect(recordStatusOf([])).toBe("passed");
		expect(runnerExitCodeOf("not_run")).toBe(3);
		expect(runnerExitCodeOf("failed")).toBe(1);
		expect(runnerExitCodeOf("passed")).toBe(0);
	});
});

describe("runStageGate with requires and notRunExitCodes", () => {
	function nodeCheck(
		checkId: string,
		script: string,
		extra: Partial<StageGateCheck> = {},
	): StageGateCheck {
		return {
			checkId,
			kind: "acceptance",
			command: [process.execPath, "-e", script],
			...extra,
		};
	}

	it("does not start a check whose requirement did not pass, and exits 3 when infrastructure stopped the run", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "hobo-release-record-"));
		dirs.push(cwd);
		const marker = join(cwd, "second-ran");
		const result = await runStageGate(
			{
				gateId: "release",
				checks: [
					nodeCheck("first", "process.exit(3)", { notRunExitCodes: [3] }),
					nodeCheck(
						"second",
						`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`,
						{ requires: ["first"] },
					),
				],
			},
			{ cwd },
		);
		expect(result.record.checks.map((c) => [c.status, c.exitCode])).toEqual([
			["not_run", 3],
			["skipped", -1],
		]);
		expect(result.record.checks[1]?.evidence.skipped_because).toBe(
			"first did not pass",
		);
		expect(result.record.status).toBe("not_run");
		expect(result.exitCode).toBe(3);
		expect(existsSync(marker)).toBe(false);
	});
});
