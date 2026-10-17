/**
 * The release gate end to end through real processes (ADR-0172):
 * runStageGate(defineReleaseGate()) spawns `node --import tsx
 * scripts/check-acceptance.mts <step>`, which spawns HOBO_AI_BDD_CMD in
 * HOBO_AI_BDD_PROJECT. Here that command is test/helpers/fake-ai-bdd.mts,
 * which plays back the exit codes and files of the pact's interactions and
 * writes the committed report fixtures as a run's report. The real ai-bdd is
 * the env-gated lane in acceptance-real.test.ts.
 */
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { checkAcceptance } from "../src/acceptance-check.js";
import { defineReleaseGate } from "../src/definition.js";
import { isJsonObject, isJsonString, parseJsonText } from "../src/json.js";
import {
	parseStageGateRecord,
	serializeStageGateRecord,
} from "../src/parse.js";
import { runStageGate } from "../src/runner.js";
import type { CheckResult, RunStageGateResult } from "../src/types.js";
import {
	bytesOf,
	docAt,
	FIXTURE_DIR,
	fixtureDoc,
	scenarioAt,
} from "./helpers/ai-bdd-report.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const FAKE = join(HERE, "helpers", "fake-ai-bdd.mts");
const FAKE_COMMAND = [
	process.execPath,
	"--experimental-strip-types",
	"--no-warnings",
	FAKE,
];
const PASSED = join(FIXTURE_DIR, "report.v1.passed.json");
const FAILED_WITH_AGENT = join(FIXTURE_DIR, "report.v1.failed.json");
const TIMEOUT = 60_000;

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

interface FakePlan {
	readonly compileCheck: number;
	readonly run: {
		readonly exit: number;
		readonly report?: string;
		readonly runCopy?: "same" | "different" | "none";
		readonly startedAt?: string;
		readonly runsDir?: string;
	};
	readonly verifyRun: number;
}

interface GateRun {
	readonly result: RunStageGateResult;
	readonly project: string;
	readonly calls: readonly string[];
}

function newDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-release-gate-"));
	dirs.push(dir);
	return dir;
}

function checkOf(run: GateRun, checkId: string): CheckResult {
	const found = run.result.record.checks.find((c) => c.checkId === checkId);
	if (found === undefined) throw new Error(`no check ${checkId}`);
	return found;
}

async function runGate(
	plan: FakePlan,
	command: readonly string[] = FAKE_COMMAND,
	project = newDir(),
	extraEnv: Readonly<Record<string, string>> = {},
): Promise<GateRun> {
	const log = join(newDir(), "calls.log");
	writeFileSync(log, "");
	const result = await runStageGate(defineReleaseGate(), {
		cwd: REPO_ROOT,
		env: {
			HOBO_AI_BDD_CMD: JSON.stringify(command),
			HOBO_AI_BDD_PROJECT: project,
			FAKE_AI_BDD: JSON.stringify(plan),
			FAKE_AI_BDD_LOG: log,
			...extraEnv,
		},
	});
	const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
	return { result, project, calls };
}

function runIdOf(reportPath: string): string {
	const runId = parseJsonText(readFileSync(reportPath, "utf8"));
	const id = isJsonObject(runId) ? runId.runId : undefined;
	if (!isJsonString(id)) throw new Error(`${reportPath} has no runId`);
	return id;
}

/** A project that already holds the passed fixture as its latest report and its run directory: a run that happened before. */
function earlierRun(project: string): string {
	const runId = "01a132d2-fe9a-7d3a-a7d8-157d681d6417";
	for (const dir of [
		join(project, ".ai-bdd", "report"),
		join(project, ".ai-bdd", "runs", runId),
	]) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "report.json"), readFileSync(PASSED));
	}
	return runId;
}

function sha256Of(path: string): string {
	const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
	return `sha256:${digest}`;
}

/** The passed fixture with one scenario failed: a frozen no-agent replay that found a regression. */
function failedReplayReport(): string {
	const doc = fixtureDoc("passed");
	scenarioAt(doc, 0).status = "failed";
	doc.totals = { ...docAt(doc, "totals"), passed: 4, failed: 1 };
	doc.exitCode = 1;
	const path = join(newDir(), "failed-replay.json");
	writeFileSync(path, bytesOf(doc));
	return path;
}

/** A report left on disk by an earlier run, which the gate must not read. */
function stalePassedReport(project: string): void {
	mkdirSync(join(project, ".ai-bdd", "report"), { recursive: true });
	writeFileSync(
		join(project, ".ai-bdd", "report", "report.json"),
		readFileSync(PASSED),
	);
}

const ALL_PASS: FakePlan = {
	compileCheck: 0,
	run: { exit: 0, report: PASSED },
	verifyRun: 0,
};

describe("defineReleaseGate", () => {
	it("defineReleaseGate lists the three checks in order", () => {
		const gate = defineReleaseGate();
		expect(gate.gateId).toBe("release");
		expect(
			gate.checks.map((c) => [
				c.checkId,
				c.kind,
				c.command.at(-1),
				c.requires ?? [],
				c.notRunExitCodes,
			]),
		).toEqual([
			["acceptance-plans-fresh", "acceptance", "plans-fresh", [], [3]],
			[
				"acceptance-replay",
				"acceptance",
				"replay",
				["acceptance-plans-fresh"],
				[3],
			],
			[
				"acceptance-evidence-intact",
				"acceptance",
				"evidence-intact",
				["acceptance-replay"],
				[3],
			],
		]);
	});
});

describe("the release gate through real processes", () => {
	it(
		"a passing run records the report digest in evidence",
		async () => {
			const run = await runGate(ALL_PASS);
			expect(run.result.exitCode).toBe(0);
			expect(run.result.record.status).toBe("passed");
			const replay = checkOf(run, "acceptance-replay");
			const reportPath = join(run.project, ".ai-bdd", "report", "report.json");
			// The digest is of the file ai-bdd wrote: `sha256sum report.json` prints the same.
			expect(replay.evidence.report_digest).toBe(sha256Of(reportPath));
			const runId = runIdOf(reportPath);
			expect(runId).not.toBe("01a132d2-fe9a-7d3a-a7d8-157d681d6417");
			expect(replay.evidence).toMatchObject({
				run_id: runId,
				scenarios_total: "5",
				scenarios_passed: "5",
				model_calls: "0",
				frozen: "true",
				no_agent: "true",
				report_exit_code: "0",
			});
			expect(checkOf(run, "acceptance-evidence-intact").evidence).toMatchObject(
				{ report_digest: sha256Of(reportPath), run_id: runId, exit_code: "0" },
			);
			expect(run.calls).toEqual([
				'["compile","--check"]',
				'["run","--frozen","--no-agent","--reporter","json,junit"]',
				`["verify-run",${JSON.stringify(join(run.project, ".ai-bdd", "runs", runId))}]`,
			]);
			const reparsed = parseStageGateRecord(
				serializeStageGateRecord(run.result.record),
			);
			expect(reparsed.gateId).toBe("release");
			expect(reparsed.status).toBe("passed");
		},
		TIMEOUT,
	);

	it(
		"a stale plan (exit 4) fails the record with the evidence tail kept",
		async () => {
			const run = await runGate({ ...ALL_PASS, compileCheck: 4 });
			expect(run.result.exitCode).toBe(1);
			expect(run.result.record.status).toBe("failed");
			const plans = checkOf(run, "acceptance-plans-fresh");
			expect(plans.status).toBe("failed");
			expect(plans.exitCode).toBe(4);
			expect(plans.evidence.output_tail).toContain("PLAN_STALE");
			for (const id of ["acceptance-replay", "acceptance-evidence-intact"]) {
				expect(checkOf(run, id)).toMatchObject({
					status: "skipped",
					exitCode: -1,
				});
			}
			// Nothing after the stale plan was started.
			expect(run.calls).toEqual(['["compile","--check"]']);
		},
		TIMEOUT,
	);

	it.each([2, 4])(
		"the gate never reads report.json after run exits %i",
		async (exit) => {
			const project = newDir();
			stalePassedReport(project);
			const run = await runGate(
				{ ...ALL_PASS, run: { exit } },
				FAKE_COMMAND,
				project,
			);
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "failed", exitCode: exit });
			expect(replay.evidence.report).toBe("not read");
			expect(replay.evidence.report_digest).toBeUndefined();
			expect(checkOf(run, "acceptance-evidence-intact").status).toBe("skipped");
			expect(run.result.record.status).toBe("failed");
		},
		TIMEOUT,
	);

	it(
		"exit 3 (infrastructure) records the check as not run, never failed or passed",
		async () => {
			// ai-bdd writes a report on exit 3; the gate does not read it either.
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 3, report: PASSED },
			});
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "not_run", exitCode: 3 });
			expect(replay.evidence.report_digest).toBeUndefined();
			expect(run.result.record.status).toBe("not_run");
			expect(run.result.exitCode).toBe(3);
			expect(
				parseStageGateRecord(serializeStageGateRecord(run.result.record))
					.status,
			).toBe("not_run");
		},
		TIMEOUT,
	);

	it(
		"a command that cannot be started is not run, not failed",
		async () => {
			const run = await runGate(ALL_PASS, [join(newDir(), "no-such-ai-bdd")]);
			const plans = checkOf(run, "acceptance-plans-fresh");
			expect(plans).toMatchObject({ status: "not_run", exitCode: 3 });
			expect(plans.evidence.reason).toMatch(/did not run: .*ENOENT/u);
			expect(run.result.record.status).toBe("not_run");
		},
		TIMEOUT,
	);

	it(
		"a failed scenario (exit 1) fails the record with the counts kept",
		async () => {
			const report = failedReplayReport();
			const run = await runGate({ ...ALL_PASS, run: { exit: 1, report } });
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "failed", exitCode: 1 });
			expect(replay.evidence).toMatchObject({
				scenarios_failed: "1",
				scenarios_passed: "4",
				report_digest: sha256Of(
					join(run.project, ".ai-bdd", "report", "report.json"),
				),
				report_exit_code: "1",
			});
			expect(checkOf(run, "acceptance-evidence-intact").status).toBe("skipped");
		},
		TIMEOUT,
	);

	it(
		"a report that used the agent is refused although ai-bdd exited 0",
		async () => {
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 0, report: FAILED_WITH_AGENT },
			});
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "failed", exitCode: 1 });
			expect(replay.evidence.reason).toContain("options.noAgent is false");
		},
		TIMEOUT,
	);

	it(
		"a report whose exit code disagrees with the process is refused",
		async () => {
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 0, report: failedReplayReport() },
			});
			expect(checkOf(run, "acceptance-replay").evidence.reason).toBe(
				"report.json says exit 1 but ai-bdd exited 0",
			);
		},
		TIMEOUT,
	);

	it(
		"evidence-intact fails when the run directory holds another report",
		async () => {
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 0, report: PASSED, runCopy: "different" },
			});
			const intact = checkOf(run, "acceptance-evidence-intact");
			expect(intact.status).toBe("failed");
			expect(intact.evidence.reason).toContain(
				"is not the report acceptance-replay judged",
			);
			expect(run.calls).not.toContainEqual(
				expect.stringContaining("verify-run"),
			);
		},
		TIMEOUT,
	);

	it(
		"verify-run finding a modified artifact fails the record",
		async () => {
			const run = await runGate({ ...ALL_PASS, verifyRun: 1 });
			const intact = checkOf(run, "acceptance-evidence-intact");
			expect(intact).toMatchObject({ status: "failed", exitCode: 1 });
			expect(intact.evidence.output_tail).toContain("modified");
			expect(run.result.record.status).toBe("failed");
		},
		TIMEOUT,
	);

	it(
		"the reviewer's repro: a no-op command and an earlier run's report and run directory fail the record",
		async () => {
			const project = newDir();
			const runId = earlierRun(project);
			const run = await runGate(ALL_PASS, ["/bin/true"], project);
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "failed", exitCode: 1 });
			expect(replay.evidence.reason).toBe(
				`report.json names run ${runId}, which was already in .ai-bdd/runs before this run started: it is not this run's report`,
			);
			// Nothing of the earlier run is recorded as if this run had produced it.
			expect(replay.evidence.report_digest).toBeUndefined();
			expect(replay.evidence.scenarios_total).toBeUndefined();
			expect(checkOf(run, "acceptance-evidence-intact").status).toBe("skipped");
			expect(run.result.record.status).toBe("failed");
		},
		TIMEOUT,
	);

	it(
		"a report that started before the run was spawned is refused",
		async () => {
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 0, report: PASSED, startedAt: "2026-10-13T01:14:10.915Z" },
			});
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "failed", exitCode: 1 });
			expect(replay.evidence.reason).toMatch(
				/^report\.json for run [0-9a-f-]+ started at 2026-10-13T01:14:10\.915Z, before this run was started at .* \(5 s of clock skew allowed\): it is not this run's report$/u,
			);
		},
		TIMEOUT,
	);

	it(
		"a project that moved runsDir passes with HOBO_AI_BDD_RUNS_DIR, and fails on a stale default report without it",
		async () => {
			const moved = {
				...ALL_PASS,
				run: { exit: 0, report: PASSED, runsDir: "out/runs" },
			};
			const named = await runGate(moved, FAKE_COMMAND, newDir(), {
				HOBO_AI_BDD_RUNS_DIR: "out/runs",
			});
			expect(named.result.record.status).toBe("passed");
			const project = newDir();
			earlierRun(project);
			const unnamed = await runGate(moved, FAKE_COMMAND, project);
			expect(checkOf(unnamed, "acceptance-replay").evidence.reason).toContain(
				"which was already in .ai-bdd/runs before this run started",
			);
			expect(unnamed.result.record.status).toBe("failed");
		},
		TIMEOUT,
	);

	it("a run that fails to load (exit 1, no report) fails on freshness, not on the old run's data", () => {
		const project = newDir();
		const runId = earlierRun(project);
		// Node exits 1 when the CLI's entry cannot be loaded, before ai-bdd writes anything.
		const result = checkAcceptance(
			["replay"],
			{
				...process.env,
				HOBO_AI_BDD_CMD: JSON.stringify([
					process.execPath,
					join(newDir(), "missing-bin.js"),
				]),
				HOBO_AI_BDD_PROJECT: project,
			},
			project,
		);
		expect(result).toMatchObject({ outcome: "failed", exitCode: 1 });
		expect(result.evidence.reason).toBe(
			`report.json names run ${runId}, which was already in .ai-bdd/runs before this run started: it is not this run's report`,
		);
		expect(result.evidence.run_id).toBeUndefined();
		expect(result.evidence.report_digest).toBeUndefined();
		expect(result.evidence.scenarios_total).toBeUndefined();
	});

	it("evidence-intact verifies the run the replay judged, though report.json was replaced in between", () => {
		const project = newDir();
		const log = join(newDir(), "calls.log");
		const env = {
			...process.env,
			HOBO_AI_BDD_CMD: JSON.stringify(FAKE_COMMAND),
			HOBO_AI_BDD_PROJECT: project,
			FAKE_AI_BDD: JSON.stringify(ALL_PASS),
			FAKE_AI_BDD_LOG: log,
		};
		const replay = checkAcceptance(["replay"], env, project);
		expect(replay.outcome).toBe("passed");
		// Another run in the same project replaces the latest report.
		earlierRun(project);
		const intact = checkAcceptance(
			["evidence-intact"],
			{
				...env,
				HOBO_STAGE_GATE_REQUIRED_EVIDENCE: JSON.stringify({
					"acceptance-replay": replay.evidence,
				}),
			},
			project,
		);
		expect(intact.outcome).toBe("passed");
		expect(intact.evidence).toMatchObject({
			run_id: replay.evidence.run_id,
			report_digest: replay.evidence.report_digest,
		});
		const calls = readFileSync(log, "utf8").trim().split("\n");
		expect(calls.at(-1)).toBe(
			JSON.stringify([
				"verify-run",
				join(project, ".ai-bdd", "runs", replay.evidence.run_id ?? ""),
			]),
		);
	});

	it("evidence-intact refuses a run directory whose report is not the one the replay judged", () => {
		const project = newDir();
		const env = {
			...process.env,
			HOBO_AI_BDD_CMD: JSON.stringify(FAKE_COMMAND),
			HOBO_AI_BDD_PROJECT: project,
			FAKE_AI_BDD: JSON.stringify(ALL_PASS),
			FAKE_AI_BDD_LOG: join(newDir(), "calls.log"),
		};
		const replay = checkAcceptance(["replay"], env, project);
		const copy = join(
			project,
			".ai-bdd",
			"runs",
			replay.evidence.run_id ?? "",
			"report.json",
		);
		writeFileSync(copy, `${readFileSync(copy, "utf8")} `);
		const intact = checkAcceptance(
			["evidence-intact"],
			{
				...env,
				HOBO_STAGE_GATE_REQUIRED_EVIDENCE: JSON.stringify({
					"acceptance-replay": replay.evidence,
				}),
			},
			project,
		);
		expect(intact).toMatchObject({ outcome: "failed", exitCode: 1 });
		expect(intact.evidence.reason).toContain(
			"is not the report acceptance-replay judged",
		);
	});

	it("evidence-intact alone, without the replay's evidence, is a usage error", () => {
		const project = newDir();
		const result = checkAcceptance(
			["evidence-intact"],
			{
				...process.env,
				HOBO_AI_BDD_CMD: JSON.stringify(FAKE_COMMAND),
				HOBO_AI_BDD_PROJECT: project,
			},
			project,
		);
		expect(result).toMatchObject({ outcome: "failed", exitCode: 2 });
		expect(result.evidence.reason).toContain(
			"needs the evidence of acceptance-replay",
		);
	});

	it("all hands the replay's run to the verify step in process", () => {
		const project = newDir();
		const result = checkAcceptance(
			["all"],
			{
				...process.env,
				HOBO_AI_BDD_CMD: JSON.stringify(FAKE_COMMAND),
				HOBO_AI_BDD_PROJECT: project,
				FAKE_AI_BDD: JSON.stringify(ALL_PASS),
				FAKE_AI_BDD_LOG: join(newDir(), "calls.log"),
			},
			project,
		);
		expect(result).toMatchObject({ outcome: "passed", exitCode: 0 });
		expect(result.evidence.run_id).toBe(
			runIdOf(join(project, ".ai-bdd", "report", "report.json")),
		);
	});

	it(
		"a gate with no project configured fails with exit 2",
		async () => {
			const run = await runGate(ALL_PASS, FAKE_COMMAND, "");
			const plans = checkOf(run, "acceptance-plans-fresh");
			expect(plans).toMatchObject({ status: "failed", exitCode: 2 });
			expect(plans.evidence.reason).toContain("HOBO_AI_BDD_PROJECT");
		},
		TIMEOUT,
	);
});
