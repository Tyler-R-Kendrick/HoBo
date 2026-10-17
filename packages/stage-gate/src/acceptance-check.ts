/**
 * The release gate's three ai-bdd commands, one step at a time (ADR-0172).
 * `scripts/check-acceptance.mts` is the entry the gate's checks run.
 *
 * - `plans-fresh`: `ai-bdd compile --check` (exit 4 when a plan is stale; no
 *   model call).
 * - `replay`: `ai-bdd run --frozen --no-agent --reporter json,junit`. The exit
 *   code is read first: only 0 and 1 write `.ai-bdd/report/report.json`, so
 *   only then is it opened, parsed into `AcceptanceEvidence`, and held to the
 *   process's own exit code. After 2 or 4 a stale report from an earlier run
 *   can still be on disk; after 3 the run said nothing about the product.
 * - `evidence-intact`: `ai-bdd verify-run .ai-bdd/runs/<runId>` for the run the
 *   report names, after checking that the run directory holds the same report.
 *
 * An exit code of 3, a command that cannot be started, or one ended by a
 * signal, is `not_run` (this process exits 3): never `failed`, never `passed`.
 * Configuration that cannot be used (HOBO_AI_BDD_CMD, HOBO_AI_BDD_PROJECT) is a
 * failure with exit 2, like ai-bdd's own usage errors.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
	type AcceptanceEvidence,
	isAiBddRunId,
	isReportDigest,
	parseAiBddRunReport,
	reportDigestOf,
} from "./acceptance.js";
import {
	type AcceptanceConfig,
	acceptanceConfigOf,
} from "./acceptance-config.js";
import { REQUIRED_EVIDENCE_ENV } from "./gate-status.js";
import { isJsonObject, isJsonString, parseJsonText } from "./json.js";
import type { CheckEvidence } from "./types.js";

export const ACCEPTANCE_STEPS = [
	"plans-fresh",
	"replay",
	"evidence-intact",
] as const;
export type AcceptanceStep = (typeof ACCEPTANCE_STEPS)[number];
export type AcceptanceOutcome = "passed" | "failed" | "not_run";

export interface AcceptanceResult {
	readonly outcome: AcceptanceOutcome;
	/** 0 passed; ai-bdd's own code (1, 2, 4) or 1 for a refused report when failed; 3 not run. */
	readonly exitCode: number;
	/** One flat JSON object: the line the stage-gate runner keeps as the check's evidence. */
	readonly evidence: CheckEvidence;
	/** What ai-bdd printed, for a person reading the log; never part of the evidence beyond its tail. */
	readonly transcript: string;
}

const NOT_RUN = 3;
const USAGE = 2;
const TAIL_CHARS = 2000;

interface AiBddRun {
	readonly args: readonly string[];
	readonly status: number | null;
	readonly unstartable: string;
	readonly output: string;
}

function runAiBdd(config: AcceptanceConfig, args: readonly string[]): AiBddRun {
	const [executable = "", ...prefix] = config.command;
	const result = spawnSync(executable, [...prefix, ...args], {
		cwd: config.project,
		env: config.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	});
	let unstartable = "";
	if (result.error) {
		unstartable = `${result.error.name}: ${result.error.message}`;
	} else if (result.signal) {
		unstartable = `ended by ${result.signal}`;
	}
	return {
		args,
		status: result.status,
		unstartable,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

function result(
	outcome: AcceptanceOutcome,
	exitCode: number,
	evidence: CheckEvidence,
	transcript = "",
): AcceptanceResult {
	return { outcome, exitCode, evidence: { outcome, ...evidence }, transcript };
}

/** How one ai-bdd command ended, when its exit code is all there is to read. */
function commandResult(
	step: AcceptanceStep,
	run: AiBddRun,
	extra: CheckEvidence,
): AcceptanceResult {
	const command = `ai-bdd ${run.args.join(" ")}`;
	const base = { step, command, ...extra };
	if (run.unstartable !== "" || run.status === null) {
		return result(
			"not_run",
			NOT_RUN,
			{ ...base, reason: `${command} did not run: ${run.unstartable}` },
			run.output,
		);
	}
	if (run.status === 0) {
		return result("passed", 0, { ...base, exit_code: "0" }, run.output);
	}
	const evidence = {
		...base,
		exit_code: String(run.status),
		output_tail: run.output.slice(-TAIL_CHARS),
	};
	if (run.status === NOT_RUN) {
		return result(
			"not_run",
			NOT_RUN,
			{ ...evidence, reason: `${command} exited 3: infrastructure` },
			run.output,
		);
	}
	return result("failed", run.status, evidence, run.output);
}

function evidenceFields(evidence: AcceptanceEvidence): CheckEvidence {
	return {
		run_id: evidence.runId,
		report_digest: evidence.reportDigest,
		scenarios_total: String(evidence.scenariosTotal),
		scenarios_passed: String(evidence.passed),
		scenarios_healed: String(evidence.healed),
		scenarios_failed: String(evidence.failed),
		scenarios_inconclusive: String(evidence.inconclusive),
		scenarios_blocked: String(evidence.blocked),
		scenarios_error: String(evidence.error),
		scenarios_skipped: String(evidence.skipped),
		fuzzy_steps: String(evidence.fuzzySteps),
		model_calls: String(evidence.modelCalls),
		frozen: String(evidence.frozen),
		no_agent: String(evidence.noAgent),
		report_exit_code: String(evidence.exitCode),
		report_started_at: evidence.startedAt,
	};
}

type ReportRead =
	| { readonly bytes: Buffer; readonly evidence: AcceptanceEvidence }
	| { readonly refused: string };

function readReport(config: AcceptanceConfig): ReportRead {
	let bytes: Buffer;
	try {
		bytes = readFileSync(config.reportFile);
	} catch {
		return { refused: `${shown(config, config.reportFile)} is missing` };
	}
	try {
		return { bytes, evidence: parseAiBddRunReport(bytes) };
	} catch (cause) {
		return { refused: cause instanceof Error ? cause.message : String(cause) };
	}
}

/** A path as a person reads it in a message: relative to the project when inside it. */
function shown(config: AcceptanceConfig, path: string): string {
	const rel = relative(config.project, path);
	return rel === "" || rel.startsWith("..") ? path : rel.split(sep).join("/");
}

/** The run directories that exist now; none when the runs directory does not. */
function runIds(config: AcceptanceConfig): ReadonlySet<string> {
	try {
		return new Set(readdirSync(config.runsDir));
	} catch {
		return new Set();
	}
}

/** Allowed difference between this machine's clock and the one that stamped `startedAt`. */
const CLOCK_SKEW_MS = 5000;

/**
 * Whether the report on disk is the one the run just spawned wrote: its run
 * directory is new, and it started no earlier than the spawn (less skew). An
 * old report survives exit 2 and 4, a moved runsDir, a wrapper that swallows
 * ai-bdd's failure, and a CLI that never loaded; none of those is this run.
 */
function staleBecause(
	config: AcceptanceConfig,
	evidence: AcceptanceEvidence,
	before: ReadonlySet<string>,
	spawnedAt: number,
): string | undefined {
	const runs = shown(config, config.runsDir);
	const stale = "it is not this run's report";
	if (before.has(evidence.runId)) {
		return `report.json names run ${evidence.runId}, which was already in ${runs} before this run started: ${stale}`;
	}
	if (!runIds(config).has(evidence.runId)) {
		return `report.json names run ${evidence.runId}, which ${runs} does not hold: ${stale}`;
	}
	if (Date.parse(evidence.startedAt) < spawnedAt - CLOCK_SKEW_MS) {
		const spawned = new Date(spawnedAt).toISOString();
		return `report.json for run ${evidence.runId} started at ${evidence.startedAt}, before this run was started at ${spawned} (5 s of clock skew allowed): ${stale}`;
	}
	return undefined;
}

function plansFresh(config: AcceptanceConfig): AcceptanceResult {
	return commandResult(
		"plans-fresh",
		runAiBdd(config, ["compile", "--check"]),
		{},
	);
}

function replay(config: AcceptanceConfig): AcceptanceResult {
	const before = runIds(config);
	const spawnedAt = Date.now();
	const run = runAiBdd(config, [
		"run",
		"--frozen",
		"--no-agent",
		"--reporter",
		"json,junit",
	]);
	if (run.unstartable !== "" || (run.status !== 0 && run.status !== 1)) {
		// Exit 2 and 4 write no report; exit 3 writes one that says nothing about the product. None is read.
		return commandResult("replay", run, { report: "not read" });
	}
	const step = { step: "replay", exit_code: String(run.status) };
	const read = readReport(config);
	if ("refused" in read) {
		return result("failed", 1, { ...step, reason: read.refused }, run.output);
	}
	const stale = staleBecause(config, read.evidence, before, spawnedAt);
	if (stale !== undefined) {
		// Nothing of an earlier run goes into this run's evidence.
		return result("failed", 1, { ...step, reason: stale }, run.output);
	}
	const fields = { ...step, ...evidenceFields(read.evidence) };
	if (read.evidence.exitCode !== run.status) {
		const reason = `report.json says exit ${read.evidence.exitCode} but ai-bdd exited ${run.status}`;
		return result("failed", 1, { ...fields, reason }, run.output);
	}
	if (run.status === 0) return result("passed", 0, fields, run.output);
	const tail = run.output.slice(-TAIL_CHARS);
	return result("failed", 1, { ...fields, output_tail: tail }, run.output);
}

/** What one step is handed: the evidence of the steps before it, by check id. */
type Handed = ReadonlyMap<string, CheckEvidence>;

interface JudgedRun {
	readonly runId: string;
	readonly reportDigest: string;
}

function judgedRunOf(
	evidence: CheckEvidence | undefined,
): JudgedRun | undefined {
	const runId = evidence?.run_id ?? "";
	const reportDigest = evidence?.report_digest ?? "";
	return isAiBddRunId(runId) && isReportDigest(reportDigest)
		? { runId, reportDigest }
		: undefined;
}

/**
 * verify-run on the run acceptance-replay judged, named by the replay's own
 * evidence (run id and report digest), not by whatever report.json says now:
 * another run in the project may have replaced it between the two checks.
 */
function evidenceIntact(
	config: AcceptanceConfig,
	handed: Handed,
): AcceptanceResult {
	const step = { step: "evidence-intact" };
	const judged = judgedRunOf(handed.get("acceptance-replay"));
	if (judged === undefined) {
		const reason = `evidence-intact needs the evidence of acceptance-replay (its run_id and report_digest): run it as the release gate's check, which hands it over in ${REQUIRED_EVIDENCE_ENV}, or with \`all\``;
		return result("failed", USAGE, { ...step, reason });
	}
	const runDir = join(config.runsDir, judged.runId);
	const copyPath = join(runDir, "report.json");
	const fields = {
		...step,
		run_id: judged.runId,
		report_digest: judged.reportDigest,
	};
	let copy: Buffer;
	try {
		copy = readFileSync(copyPath);
	} catch {
		const reason = `${shown(config, copyPath)} is missing`;
		return result("failed", 1, { ...fields, reason });
	}
	const digest = reportDigestOf(copy);
	if (digest !== judged.reportDigest) {
		const reason = `${shown(config, copyPath)} is not the report acceptance-replay judged (${digest}, not ${judged.reportDigest})`;
		return result("failed", 1, { ...fields, reason });
	}
	return commandResult(
		"evidence-intact",
		runAiBdd(config, ["verify-run", runDir]),
		fields,
	);
}

const STEPS = {
	"plans-fresh": plansFresh,
	replay,
	"evidence-intact": evidenceIntact,
} satisfies Record<
	AcceptanceStep,
	(config: AcceptanceConfig, handed: Handed) => AcceptanceResult
>;

/** The evidence the stage-gate runner hands a check that requires others (gate-status.ts). */
function handedOf(env: NodeJS.ProcessEnv): Map<string, CheckEvidence> {
	const handed = new Map<string, CheckEvidence>();
	const parsed = parseJsonText(env[REQUIRED_EVIDENCE_ENV] ?? "");
	if (!isJsonObject(parsed)) return handed;
	for (const [checkId, evidence] of Object.entries(parsed)) {
		if (!isJsonObject(evidence)) continue;
		const strings: Record<string, string> = {};
		for (const [key, value] of Object.entries(evidence)) {
			if (isJsonString(value)) strings[key] = value;
		}
		handed.set(checkId, strings);
	}
	return handed;
}

function stepsOf(
	argv: readonly string[],
): readonly AcceptanceStep[] | undefined {
	const [name, ...rest] = argv;
	if (rest.length > 0) return undefined;
	if (name === undefined || name === "all") return ACCEPTANCE_STEPS;
	const step = ACCEPTANCE_STEPS.find((entry) => entry === name);
	return step === undefined ? undefined : [step];
}

/**
 * Run one step, or all three in order (stopping at the first that does not
 * pass, since the next one's input then does not exist).
 */
export function checkAcceptance(
	argv: readonly string[],
	env: NodeJS.ProcessEnv,
	cwd: string,
): AcceptanceResult {
	const steps = stepsOf(argv);
	if (steps === undefined) {
		const reason = `usage: check-acceptance [${ACCEPTANCE_STEPS.join("|")}|all]`;
		return result("failed", USAGE, { reason });
	}
	const config = acceptanceConfigOf(env, cwd);
	if (isJsonString(config)) {
		return result("failed", USAGE, { reason: config });
	}
	const handed = handedOf(env);
	let evidence: CheckEvidence = {};
	let transcript = "";
	let last = result("failed", USAGE, { reason: "no step ran" });
	for (const step of steps) {
		last = STEPS[step](config, handed);
		// `all` hands each step's evidence to the next in process, as the runner does across processes.
		handed.set(`acceptance-${step}`, last.evidence);
		evidence = { ...evidence, ...last.evidence };
		transcript += last.transcript;
		if (last.outcome !== "passed") break;
	}
	return { ...last, evidence, transcript };
}
