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
import { type AiBddRun, runAiBdd as spawnAiBdd } from "./ai-bdd-process.js";
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
}

/** Where ai-bdd's own output goes, as it comes (bounded, see ai-bdd-process.ts). */
export type OutputSink = (chunk: Buffer) => void;

function runAiBdd(
	config: AcceptanceConfig,
	relay: OutputSink,
	args: readonly string[],
): Promise<AiBddRun> {
	return spawnAiBdd(
		{
			command: config.command,
			cwd: config.project,
			env: config.env,
			timeoutMs: config.timeoutMs,
			relay,
		},
		args,
	);
}

const NOT_RUN = 3;
const USAGE = 2;

function result(
	outcome: AcceptanceOutcome,
	exitCode: number,
	evidence: CheckEvidence,
): AcceptanceResult {
	return { outcome, exitCode, evidence: { outcome, ...evidence } };
}

/** How one ai-bdd command ended, when its exit code is all there is to read. */
function commandResult(
	step: AcceptanceStep,
	run: AiBddRun,
	extra: CheckEvidence,
	timeoutMs: number,
): AcceptanceResult {
	const command = `ai-bdd ${run.args.join(" ")}`;
	const base = { step, command, ...extra };
	if (run.timedOut) {
		const reason = `${command} did not finish within ${timeoutMs} ms (HOBO_AI_BDD_TIMEOUT_MS): its process group was killed`;
		return result("not_run", NOT_RUN, {
			...base,
			reason,
			output_tail: run.tail,
		});
	}
	if (run.unstartable !== "" || run.status === null) {
		const reason = `${command} did not run: ${run.unstartable}`;
		return result("not_run", NOT_RUN, { ...base, reason });
	}
	if (run.status === 0) {
		return result("passed", 0, { ...base, exit_code: "0" });
	}
	const evidence = {
		...base,
		exit_code: String(run.status),
		output_tail: run.tail,
	};
	if (run.status === NOT_RUN) {
		const reason = `${command} exited 3: infrastructure`;
		return result("not_run", NOT_RUN, { ...evidence, reason });
	}
	return result("failed", run.status, evidence);
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

async function plansFresh(
	config: AcceptanceConfig,
	relay: OutputSink,
): Promise<AcceptanceResult> {
	const run = await runAiBdd(config, relay, ["compile", "--check"]);
	return commandResult("plans-fresh", run, {}, config.timeoutMs);
}

async function replay(
	config: AcceptanceConfig,
	relay: OutputSink,
): Promise<AcceptanceResult> {
	const before = runIds(config);
	const spawnedAt = Date.now();
	const run = await runAiBdd(config, relay, [
		"run",
		"--frozen",
		"--no-agent",
		"--reporter",
		"json,junit",
	]);
	if (run.unstartable !== "" || (run.status !== 0 && run.status !== 1)) {
		// Exit 2 and 4 write no report; exit 3 writes one that says nothing about the product. None is read.
		return commandResult(
			"replay",
			run,
			{ report: "not read" },
			config.timeoutMs,
		);
	}
	const step = { step: "replay", exit_code: String(run.status) };
	const read = readReport(config);
	if ("refused" in read) {
		return result("failed", 1, { ...step, reason: read.refused });
	}
	const stale = staleBecause(config, read.evidence, before, spawnedAt);
	if (stale !== undefined) {
		// Nothing of an earlier run goes into this run's evidence.
		return result("failed", 1, { ...step, reason: stale });
	}
	const fields = { ...step, ...evidenceFields(read.evidence) };
	if (read.evidence.exitCode !== run.status) {
		const reason = `report.json says exit ${read.evidence.exitCode} but ai-bdd exited ${run.status}`;
		return result("failed", 1, { ...fields, reason });
	}
	if (run.status === 0) return result("passed", 0, fields);
	return result("failed", 1, { ...fields, output_tail: run.tail });
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
async function evidenceIntact(
	config: AcceptanceConfig,
	relay: OutputSink,
	handed: Handed,
): Promise<AcceptanceResult> {
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
	const run = await runAiBdd(config, relay, ["verify-run", runDir]);
	return commandResult("evidence-intact", run, fields, config.timeoutMs);
}

const STEPS = {
	"plans-fresh": plansFresh,
	replay,
	"evidence-intact": evidenceIntact,
} satisfies Record<
	AcceptanceStep,
	(
		config: AcceptanceConfig,
		relay: OutputSink,
		handed: Handed,
	) => Promise<AcceptanceResult>
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
export async function checkAcceptance(
	argv: readonly string[],
	env: NodeJS.ProcessEnv,
	cwd: string,
	relay: OutputSink = (chunk) => process.stderr.write(chunk),
): Promise<AcceptanceResult> {
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
	let last = result("failed", USAGE, { reason: "no step ran" });
	for (const step of steps) {
		last = await STEPS[step](config, relay, handed);
		// `all` hands each step's evidence to the next in process, as the runner does across processes.
		handed.set(`acceptance-${step}`, last.evidence);
		evidence = { ...evidence, ...last.evidence };
		if (last.outcome !== "passed") break;
	}
	return { ...last, evidence };
}
