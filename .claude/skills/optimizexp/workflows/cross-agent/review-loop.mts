#!/usr/bin/env node
/**
 * OptimizeXP cross-agent deterministic helpers.
 * Agents still write persona feelings; this validates bus shape, aggregates scores, detects plateau.
 *
 * Run with (any of):
 *   node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts ...
 *   node --experimental-strip-types .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts ...
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
	validateComparison,
	validateScorecard,
	isParetoAdmissible,
	type MetricScorecard,
	type PrimaryScores,
	type PositiveScores,
} from "../../harness/lib/scorecard.mts";

/** Invocation terminals only — never "plateau" / "metrics-zero" alone. */
const INVOCATION_STOP_REASONS = new Set([
	"pareto-equilibrium",
	"inverted-u-peak",
	"delight-ceiling",
	"delight-passes-cap",
	"passes-cap",
	"harm-only-floor",
	"blocked",
	"user",
	"safety",
]);

const FORBIDDEN_STOP_REASONS = new Set([
	"plateau",
	"metrics-zero",
	"irreducible",
	"tests-pass",
	"wired",
	"product-green",
	"",
]);

type Experiences = "ux" | "dx" | "ax";

type ScoreCell = {
	persona: string;
	surface: string;
	harms: number;
	friction: number;
	uncertainty: number;
};

type ScoresFile = {
	iteration: number;
	cells: ScoreCell[];
	metric_total: number;
	metric_max: number;
};

function repoRoot(explicit?: string): string {
	if (explicit && explicit.length > 0) {
		return path.resolve(explicit);
	}
	let dir = process.cwd();
	for (;;) {
		if (existsSync(path.join(dir, ".optimizexp"))) return dir;
		if (existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return process.cwd();
		dir = parent;
	}
}

function parseArgs(argv: string[]) {
	const out: Record<string, string | boolean> = { mode: "help" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") out.mode = "help";
		else if (a === "--mode") out.mode = argv[++i] ?? "help";
		else if (a === "--root") out.root = argv[++i] ?? "";
		else if (a === "--run") out.run = argv[++i] ?? "";
		else if (a === "--experiences") out.experiences = argv[++i] ?? "";
		else if (a === "--personas") out.personas = argv[++i] ?? "";
		else if (a === "--persona") out.persona = argv[++i] ?? "";
		else if (a === "--feature") out.feature = argv[++i] ?? "";
		else if (a === "--scores") out.scores = argv[++i] ?? "";
		else if (a === "--prev-scores") out.prevScores = argv[++i] ?? "";
		else if (a === "--run-id") out.run = argv[++i] ?? "";
		else if (a === "--report-only" || a === "--no-reduce")
			out.reportOnly = "1";
		else if (a === "--passes") out.passes = argv[++i] ?? "1";
		else if (a === "--iteration") out.iteration = argv[++i] ?? "0";
		else if (
			a === "--implementable-findings" ||
			a === "--implementable-findings-remaining"
		)
			out.implementableFindings = argv[++i] ?? "0";
		else if (a === "--implementable-harm") out.implementableHarm = argv[++i] ?? "0";
		else if (a === "--implementable-uplift")
			out.implementableUplift = argv[++i] ?? "0";
		else if (a === "--harm-regressed") out.harmRegressed = argv[++i] ?? "false";
		else if (a === "--cognitive-breach")
			out.cognitiveBreach = argv[++i] ?? "false";
		else if (a === "--regime") out.regime = argv[++i] ?? "";
		else if (a === "--limit") out.limit = argv[++i] ?? "20";
		else if (a === "--mismatches-only") out.mismatchesOnly = "1";
		else if (a === "--no-delight" || a === "--harm-only") out.noDelight = "1";
		else if (a === "--no-survey") out.noSurvey = "1";
		else if (a === "--delight-passes") out.delightPasses = argv[++i] ?? "infinite";
		else if (a === "--stop-reason") out.stopReason = argv[++i] ?? "";
		else if (a === "--features") out.features = argv[++i] ?? "";
		else if (a === "--projects") out.projects = argv[++i] ?? "";
		else if (a === "--force") out.force = "1";
		else if (!a.startsWith("-") && out.mode === "help") out.mode = a;
	}
	return out;
}

function help() {
	console.log(`optimizexp review-loop

Usage:
  review-loop.mts --mode init --run <id> [--experiences ux,dx,ax] [--personas a,b]
      [--passes infinite|N] [--no-delight] [--no-survey] [--delight-passes infinite|N]
      [--features id1,id2] [--projects a,b]
  review-loop.mts --mode status --run <id>
  review-loop.mts --mode assert-complete --run <id>
  review-loop.mts --mode mark-complete --run <id> --stop-reason <reason>
  review-loop.mts --mode validate-bus
  review-loop.mts --mode read-bus [--run <runId>] [--limit N] [--mismatches-only]
      [--persona id] [--feature id]
  review-loop.mts --mode score --scores <cells.json>
  review-loop.mts --mode aggregate-bus [--run <runId>]
  review-loop.mts --mode plateau --scores <curr.json> --prev-scores <prev.json>
  review-loop.mts --mode should-stop --run <id> --iteration N --scores c.json --prev-scores p.json
      [--implementable-findings N]
  review-loop.mts --mode equilibrium --run <id> --scores c.json --prev-scores p.json \\
      --implementable-harm N --implementable-uplift N \\
      [--harm-regressed false] [--cognitive-breach false] [--regime delight_maximize]

COMPLETION CONTRACT (mandatory):
  Product tests green / feature wired / one evidence capture ≠ optimizexp complete.
  Only --mode assert-complete exit 0 authorizes claiming the skill finished.
  should-stop plateau is a HARM CYCLE stop only (cycleStop) — not invocation complete.
  Default infinite: harm floor switches to delight_maximize until pareto-equilibrium.

--passes infinite (default) = both regimes until Pareto equilibrium.
--passes N = cap harm_reduce cycles; still enter delight unless --no-delight.
--no-delight / --harm-only = early exit at harm floor (opt-out of equilibrium).
--implementable-findings N = open S/M findings (omit defaults to 1 = continue).
--implementable-harm / --implementable-uplift: omit = undeclared → cannot equilibrium-stop.
--report-only / --no-reduce = measure only (no experiments).

Modes are deterministic file/JSON helpers. Persona judgment stays in the agent.
Every expect/act/outcome bus entry must include a formal metric scorecard.
Agents MUST apply a reduce experiment each pass unless report-only.
Survey/backlog: harness/survey.mts (template|validate|aggregate|rank-backlog).
`);
}

/**
 * Outer completion cycles. Default infinite.
 * Finite N (>=1) caps max outer cycles. Infinite: null.
 * Accepts: infinite|inf|∞|-1|0|null|undefined|"" → null
 */
function parsePasses(raw: unknown): number | null {
	if (raw === undefined || raw === null || raw === "") return null;
	if (typeof raw === "boolean") return null;
	const s = String(raw).trim().toLowerCase();
	if (
		s === "infinite" ||
		s === "inf" ||
		s === "infinity" ||
		s === "∞" ||
		s === "-1" ||
		s === "0"
	) {
		return null;
	}
	const n = Number(s);
	if (!Number.isFinite(n) || n < 1) return null;
	return Math.floor(n);
}

function passesLabel(passes: number | null): string {
	return passes === null ? "infinite" : String(passes);
}

function runDirOf(root: string, runId: string): string {
	return path.join(root, ".optimizexp", "runs", runId);
}

function readScope(
	root: string,
	runId: string,
): Record<string, unknown> | null {
	const p = path.join(runDirOf(root, runId), "scope.json");
	if (!existsSync(p)) return null;
	return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

function writeScope(root: string, runId: string, scope: Record<string, unknown>) {
	const runDir = runDirOf(root, runId);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(
		path.join(runDir, "scope.json"),
		`${JSON.stringify(scope, null, 2)}\n`,
	);
}

function writeIncompleteMarker(runDir: string, runId: string) {
	writeFileSync(
		path.join(runDir, "INCOMPLETE.md"),
		`# Incomplete optimizexp run: \`${runId}\`

This run is **not** complete. Do not claim optimizexp finished.

Legal completion requires:

1. Dual-regime loop (harm_reduce → delight_maximize unless \`--no-delight\`)
2. Write-ahead bus expect→act→outcome with scores
3. \`review-loop.mts --mode assert-complete --run ${runId}\` exit 0
4. \`summary.md\` + \`mark-complete\`

Product tests green / feature wired / one evidence capture is **not** enough.
`,
	);
}

function initRun(
	root: string,
	runId: string,
	experiences: string[],
	personas: string[],
	opts: {
		reportOnly: boolean;
		passes?: number | null | string;
		noDelight?: boolean;
		noSurvey?: boolean;
		delightPasses?: number | null | string;
		features?: string[];
		projects?: string[];
	},
) {
	const runDir = runDirOf(root, runId);
	mkdirSync(path.join(runDir, "iterations"), { recursive: true });
	mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
	mkdirSync(path.join(root, ".optimizexp", "bus", "entries"), {
		recursive: true,
	});
	const passes = parsePasses(opts.passes);
	const delightPasses = parsePasses(opts.delightPasses ?? "infinite");
	const noDelight = Boolean(opts.noDelight);
	const noSurvey = Boolean(opts.noSurvey);
	const stopPolicy = noDelight
		? passes === null
			? "infinite-until-harm-floor"
			: "finite-harm-cycles-then-floor"
		: passes === null
			? "infinite-until-pareto-equilibrium"
			: "finite-harm-cycles-then-delight-to-equilibrium";
	const scope = {
		runId,
		experiences,
		personas,
		features: opts.features ?? [],
		projects: opts.projects ?? [],
		surfaces: [] as string[],
		reportOnly: opts.reportOnly,
		/** Outer harm cycles: null = infinite until harm floor then delight (unless noDelight). */
		passes,
		passesLabel: passesLabel(passes),
		cyclesCompleted: 0,
		passesCompleted: 0,
		status: "running" as const,
		regime: "harm_reduce" as const,
		regimesEntered: ["harm_reduce"] as string[],
		stopPolicy,
		stopReason: null as string | null,
		noDelight,
		noSurvey,
		delightPasses,
		delightPassesLabel: passesLabel(delightPasses),
		delightCyclesCompleted: 0,
		surveyCompleted: false,
		equilibrium: null as Record<string, unknown> | null,
		lastShouldStop: null as Record<string, unknown> | null,
		lastEquilibrium: null as Record<string, unknown> | null,
		outerCycles: "passes",
		hostAgent: "cross-agent",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	writeScope(root, runId, scope);
	writeIncompleteMarker(runDir, runId);
	console.log(JSON.stringify({ ok: true, runDir, scope }, null, 2));
}

type BusEntry = {
	kind?: string;
	id?: string;
	runId?: string;
	persona?: string;
	featureId?: string;
	expects?: string;
	actId?: string;
	correctedFrom?: string;
	lessons?: string[];
	scores?: MetricScorecard;
	comparison?: {
		matchedExpectation?: boolean;
		deltaFromExpect?: {
			harms?: number;
			friction?: number;
			uncertainty?: number;
			total?: number;
			max?: number;
		};
	};
	feelings?: { summary?: string };
	file?: string;
};

function modeReadBus(args: Record<string, string | boolean>, root: string) {
	const dir = path.join(root, ".optimizexp", "bus", "entries");
	if (!existsSync(dir)) {
		console.log(
			JSON.stringify({ ok: true, entries: 0, mismatches: 0, lessons: [] }, null, 2),
		);
		return;
	}
	const runId = String(args.run || "");
	const persona = String(args.persona || "");
	const feature = String(args.feature || "");
	const limit = Math.max(1, Number(args.limit || 20));
	const mismatchesOnly = args.mismatchesOnly === "1" || args.mismatchesOnly === true;

	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort();
	const entries: BusEntry[] = [];
	for (const f of files) {
		try {
			const body = JSON.parse(
				readFileSync(path.join(dir, f), "utf8"),
			) as BusEntry;
			body.file = f;
			entries.push(body);
		} catch {
			/* skip bad */
		}
	}

	let filtered = entries;
	if (runId) filtered = filtered.filter((e) => e.runId === runId);
	if (persona) filtered = filtered.filter((e) => e.persona === persona);
	if (feature) filtered = filtered.filter((e) => e.featureId === feature);

	const outcomes = filtered.filter((e) => e.kind === "outcome");
	const lessons: unknown[] = [];
	let mismatchCount = 0;
	for (const o of outcomes) {
		const delta = o.comparison?.deltaFromExpect;
		const matched = o.comparison?.matchedExpectation;
		const isMismatch =
			matched === false ||
			(typeof delta?.total === "number" && delta.total > 0);
		if (isMismatch) mismatchCount++;
		if (mismatchesOnly && !isMismatch) continue;
		const judged = o.scores?.primary;
		lessons.push({
			outcomeId: o.id,
			expectId: o.expects,
			actId: o.actId,
			persona: o.persona,
			featureId: o.featureId,
			runId: o.runId,
			file: o.file,
			matchedExpectation: matched ?? null,
			deltaFromExpect: delta ?? null,
			judged: judged
				? {
						harms: judged.harms,
						friction: judged.friction,
						uncertainty: judged.uncertainty,
						total: judged.total,
						max: judged.max,
					}
				: null,
			feelingsSummary: o.feelings?.summary ?? null,
			suggestedPredict: judged
				? {
						harms: judged.harms,
						friction: judged.friction,
						uncertainty: judged.uncertainty,
					}
				: null,
		});
	}

	// chronological; last N
	const sliced = lessons.slice(-limit);
	const correctedExpects = filtered.filter(
		(e) => e.kind === "expect" && e.correctedFrom,
	).length;

	console.log(
		JSON.stringify(
			{
				ok: true,
				entries: filtered.length,
				outcomes: outcomes.length,
				mismatches: mismatchCount,
				correctedExpects,
				filters: {
					runId: runId || null,
					persona: persona || null,
					feature: feature || null,
					mismatchesOnly,
					limit,
				},
				lessons: sliced,
				guidance:
					"Before next expect: if any lesson has matchedExpectation false, set correctedFrom to that outcomeId, copy suggestedPredict into scores.primary unless a real reduction landed, and add lessons[].",
			},
			null,
			2,
		),
	);
}

function modeShouldStop(args: Record<string, string | boolean>, root: string) {
	const runId = String(args.run || "");
	const iteration = Number(args.iteration || 0);
	const scoresPath = String(args.scores || "");
	const prevPath = String(args.prevScores || "");
	if (!runId || !iteration || !scoresPath || !prevPath) {
		console.error(
			"--run, --iteration, --scores, --prev-scores required for should-stop",
		);
		process.exit(2);
	}

	// Strict plateau: flat scores AND zero implementable findings.
	// Default implementableFindings to 1 (continue) when omitted so agents cannot
	// accidentally plateau without declaring an empty backlog.
	const implementableFindings =
		args.implementableFindings === undefined ||
		args.implementableFindings === ""
			? 1
			: Math.max(0, Number(args.implementableFindings));
	const backlogEmpty = implementableFindings === 0;

	const curr = JSON.parse(readFileSync(scoresPath, "utf8")) as ScoresFile;
	const prev = JSON.parse(readFileSync(prevPath, "utf8")) as ScoresFile;
	const scoresFlat =
		curr.metric_total >= prev.metric_total &&
		curr.metric_max >= prev.metric_max;
	const plateau = scoresFlat && backlogEmpty;

	const scope = readScope(root, runId) ?? {};
	const noDelight = Boolean(scope.noDelight);
	const stopPolicy = String(
		scope.stopPolicy || "infinite-until-pareto-equilibrium",
	);
	const regime = String(scope.regime || "harm_reduce");

	// cycleStop = end of harm (or current) cycle. Never means invocation complete
	// under infinite-until-pareto unless noDelight opt-out.
	let cycleStop = false;
	let reason = "continue";
	let nextRegime = regime;
	let invocationStop = false;

	if (plateau) {
		cycleStop = true;
		if (!noDelight && stopPolicy.includes("pareto")) {
			reason = "harm-floor-switch-to-delight";
			nextRegime = "delight_maximize";
			invocationStop = false;
			// Record regime switch intent on scope
			scope.regime = "delight_maximize";
			const entered = Array.isArray(scope.regimesEntered)
				? (scope.regimesEntered as string[])
				: ["harm_reduce"];
			if (!entered.includes("delight_maximize")) {
				entered.push("delight_maximize");
			}
			scope.regimesEntered = entered;
		} else if (noDelight || stopPolicy.includes("harm-floor")) {
			reason = "harm-only-floor";
			nextRegime = regime;
			// Still not invocation-complete until assert-complete + mark-complete
			invocationStop = false;
		} else {
			reason = "cycle-plateau";
			invocationStop = false;
		}
	} else if (scoresFlat && !backlogEmpty) {
		cycleStop = false;
		reason = "continue-implementable-backlog";
	}

	// Deprecated alias: stop === cycleStop (NOT invocation complete)
	const stop = cycleStop;

	const lastShouldStop = {
		at: new Date().toISOString(),
		cycleStop,
		invocationStop,
		stop, // deprecated alias of cycleStop
		reason,
		nextRegime,
		pass: iteration,
		scoresFlat,
		implementableFindings,
		backlogEmpty,
		plateau,
		curr: {
			metric_total: curr.metric_total,
			metric_max: curr.metric_max,
		},
		prev: {
			metric_total: prev.metric_total,
			metric_max: prev.metric_max,
		},
	};

	scope.passesCompleted = iteration;
	scope.lastImplementableFindings = implementableFindings;
	scope.lastShouldStop = lastShouldStop;
	scope.updatedAt = new Date().toISOString();
	if (existsSync(runDirOf(root, runId)) || Object.keys(scope).length > 0) {
		if (!scope.runId) scope.runId = runId;
		if (!scope.status) scope.status = "running";
		writeScope(root, runId, scope);
	}

	const guidance = !plateau
		? implementableFindings > 0
			? "Open implementable findings remain — apply next reduction; do not stop."
			: "Scores still improving — continue."
		: invocationStop
			? "Cycle plateau (check assert-complete for invocation)."
			: noDelight
				? "Harm floor under --no-delight. Write summary + assert-complete/mark-complete with stopReason harm-only-floor. NOT complete until assert-complete ok."
				: "HARM CYCLE plateau only (cycleStop=true, invocationStop=false). Enter delight_maximize; survey+backlog; do NOT claim optimizexp complete.";

	console.log(
		JSON.stringify(
			{
				ok: true,
				cycleStop,
				invocationStop,
				/** @deprecated Use cycleStop. Never means skill complete. */
				stop,
				reason,
				nextRegime,
				pass: iteration,
				scoresFlat,
				implementableFindings,
				backlogEmpty,
				plateau,
				curr: lastShouldStop.curr,
				prev: lastShouldStop.prev,
				guidance,
			},
			null,
			2,
		),
	);
	// Exit 0 = cycleStop ok for scripts; invocation requires assert-complete.
	process.exitCode = cycleStop ? 0 : 1;
}

function aggregate(cells: ScoreCell[]): ScoresFile {
	let metric_total = 0;
	let metric_max = 0;
	for (const c of cells) {
		for (const k of ["harms", "friction", "uncertainty"] as const) {
			const v = c[k];
			if (!Number.isInteger(v) || v < 0 || v > 5) {
				throw new Error(
					`invalid score ${k}=${v} for ${c.persona}/${c.surface}`,
				);
			}
			metric_total += v;
			metric_max = Math.max(metric_max, v);
		}
	}
	return { iteration: 0, cells, metric_total, metric_max };
}

function modeScore(scoresPath: string) {
	const raw = JSON.parse(readFileSync(scoresPath, "utf8")) as {
		iteration?: number;
		cells: ScoreCell[];
	};
	const result = aggregate(raw.cells ?? []);
	result.iteration = raw.iteration ?? 0;
	console.log(JSON.stringify(result, null, 2));
}

function modePlateau(currPath: string, prevPath: string) {
	const curr = JSON.parse(readFileSync(currPath, "utf8")) as ScoresFile;
	const prev = JSON.parse(readFileSync(prevPath, "utf8")) as ScoresFile;
	const plateau =
		curr.metric_total >= prev.metric_total &&
		curr.metric_max >= prev.metric_max;
	console.log(
		JSON.stringify(
			{
				plateau,
				prev: {
					metric_total: prev.metric_total,
					metric_max: prev.metric_max,
				},
				curr: {
					metric_total: curr.metric_total,
					metric_max: curr.metric_max,
				},
			},
			null,
			2,
		),
	);
	process.exitCode = plateau ? 0 : 1; // 0 = stop ok; 1 = keep iterating (also ok for scripts)
}

type BusBody = {
	kind?: string;
	id?: string;
	expects?: string;
	actId?: string;
	runId?: string;
	scores?: MetricScorecard;
	comparison?: unknown;
	persona?: string;
	surface?: { name?: string } | string;
};

function modeValidateBus(root: string) {
	const dir = path.join(root, ".optimizexp", "bus", "entries");
	if (!existsSync(dir)) {
		console.log(JSON.stringify({ ok: true, entries: 0, problems: [] }));
		return;
	}
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort();
	const problems: string[] = [];
	const expects = new Map<string, BusBody>();
	const acts = new Map<string, BusBody>();
	const outcomes: BusBody[] = [];
	for (const f of files) {
		const p = path.join(dir, f);
		let body: BusBody;
		try {
			body = JSON.parse(readFileSync(p, "utf8")) as BusBody;
		} catch {
			problems.push(`${f}: invalid JSON`);
			continue;
		}
		if (!body.id) problems.push(`${f}: missing id`);
		const kind = body.kind;
		// Optional end-of-run survey bus mirror (no expect/act scorecard required).
		if (kind === "survey") {
			if (!body.runId) problems.push(`${f}: survey missing runId`);
			continue;
		}
		if (kind !== "expect" && kind !== "act" && kind !== "outcome") {
			problems.push(`${f}: kind must be expect|act|outcome|survey`);
			continue;
		}
		problems.push(
			...validateScorecard(body.scores, kind).map((msg) => `${f}: ${msg}`),
		);
		if (kind === "expect") {
			if (body.id) expects.set(body.id, body);
		} else if (kind === "act") {
			if (!body.expects) problems.push(`${f}: act missing expects`);
			if (body.id) acts.set(body.id, body);
		} else {
			outcomes.push(body);
			if (!body.expects) problems.push(`${f}: outcome missing expects`);
		}
	}
	// Second pass: comparison against full maps (file order independent)
	const comparisonProblems: string[] = [];
	for (const f of files) {
		const body = JSON.parse(
			readFileSync(path.join(dir, f), "utf8"),
		) as BusBody;
		if (body.kind !== "outcome") continue;
		const expectPrimary = body.expects
			? (expects.get(body.expects)?.scores?.primary as PrimaryScores | undefined)
			: undefined;
		const actPrimary = body.actId
			? (acts.get(body.actId)?.scores?.primary as PrimaryScores | undefined)
			: undefined;
		if (body.expects && !expects.has(body.expects)) {
			comparisonProblems.push(
				`${f}: outcome expects unknown ${body.expects}`,
			);
		}
		if (body.actId && !acts.has(body.actId)) {
			comparisonProblems.push(`${f}: outcome actId unknown ${body.actId}`);
		}
		comparisonProblems.push(
			...validateComparison(
				body.comparison,
				expectPrimary,
				actPrimary,
				body.scores?.primary as PrimaryScores | undefined,
			).map((msg) => `${f}: ${msg}`),
		);
	}
	const allProblems = [...problems, ...comparisonProblems];

	for (const [id, act] of acts) {
		if (act.expects && !expects.has(act.expects)) {
			allProblems.push(`act ${id} expects unknown ${act.expects}`);
		}
	}

	const matched = new Set(
		outcomes.map((o) => o.expects).filter(Boolean) as string[],
	);
	const open = [...expects.keys()].filter((id) => !matched.has(id));
	const ok = allProblems.length === 0;
	console.log(
		JSON.stringify(
			{
				ok,
				entries: files.length,
				expects: expects.size,
				acts: acts.size,
				outcomes: outcomes.length,
				openExpects: open,
				problems: allProblems,
			},
			null,
			2,
		),
	);
	if (!ok) process.exitCode = 1;
}

/**
 * Pareto equilibrium helper for the infinite dual-regime loop.
 * Does not replace should-stop for harm-only cycles.
 * Omitted --implementable-harm / --implementable-uplift ⇒ undeclared ⇒ cannot stop.
 * stop=true is a *candidate* terminal; invocation complete requires assert-complete.
 */
function modeEquilibrium(
	args: Record<string, string | boolean>,
	root: string,
) {
	const scoresPath = String(args.scores || "");
	const prevPath = String(args.prevScores || "");
	if (!scoresPath || !prevPath) {
		console.error("--scores and --prev-scores required for equilibrium");
		process.exit(2);
	}
	const runId = String(args.run || "");
	const curr = JSON.parse(readFileSync(scoresPath, "utf8")) as ScoresFile & {
		delight_total?: number;
		delight_min?: number;
		gap_max?: number;
		positive?: PositiveScores;
		primary?: PrimaryScores;
		cells?: ScoreCell[];
	};
	const prev = JSON.parse(readFileSync(prevPath, "utf8")) as typeof curr;

	const harmDeclared =
		args.implementableHarm !== undefined && args.implementableHarm !== "";
	const upliftDeclared =
		args.implementableUplift !== undefined && args.implementableUplift !== "";
	// Undeclared counts continue (cannot equilibrium-stop without explicit 0).
	const harmN = harmDeclared ? Math.max(0, Number(args.implementableHarm)) : 1;
	const upliftN = upliftDeclared
		? Math.max(0, Number(args.implementableUplift))
		: 1;
	const harmRegressed =
		String(args.harmRegressed || "false").toLowerCase() === "true";
	const cognitiveBreach =
		String(args.cognitiveBreach || "false").toLowerCase() === "true";

	const scope = runId ? readScope(root, runId) : null;
	const regime = String(
		args.regime || scope?.regime || "delight_maximize",
	);

	const scoresFlat =
		curr.metric_total >= prev.metric_total &&
		curr.metric_max >= prev.metric_max;

	const delightFlat =
		(curr.gap_max ?? 0) >= (prev.gap_max ?? 0) &&
		(curr.delight_total ?? 0) <= (prev.delight_total ?? 0);

	let pareto: { ok: boolean; reasons: string[] } | null = null;
	if (curr.positive && prev.positive && curr.primary && prev.primary) {
		pareto = isParetoAdmissible({
			prevHarm: prev.primary,
			currHarm: curr.primary,
			prevPositive: prev.positive,
			currPositive: curr.positive,
			cognitiveBreaches: cognitiveBreach ? ["breach"] : [],
		});
	}

	const atHarmFloor = harmDeclared && harmN === 0;
	const noUplift = upliftDeclared && upliftN === 0;
	const equilibrium =
		atHarmFloor &&
		noUplift &&
		!harmRegressed &&
		!cognitiveBreach &&
		scoresFlat &&
		(regime === "harm_reduce" || delightFlat || pareto?.ok === false);

	let stop = false;
	let reason = "continue";
	let nextRegime = regime;
	let invocationStopCandidate = false;

	if (!harmDeclared || !upliftDeclared) {
		reason = "continue-undeclared-implementable-counts";
		stop = false;
	} else if (regime === "harm_reduce" || regime === "") {
		if (atHarmFloor && scoresFlat) {
			nextRegime = "delight_maximize";
			reason = "switch-to-delight";
			stop = false;
		} else {
			reason = harmN > 0 ? "continue-harm-reduce" : "continue-harm-not-flat";
			stop = false;
		}
	} else if (regime === "delight_maximize") {
		if (harmRegressed || curr.metric_total > prev.metric_total) {
			nextRegime = "harm_reduce";
			reason = "harm-regressed-return";
			stop = false;
		} else if (equilibrium) {
			stop = true;
			reason = "pareto-equilibrium";
			invocationStopCandidate = true;
		} else if (upliftN > 0) {
			reason = "continue-delight-uplift";
			stop = false;
		} else {
			reason = delightFlat
				? "continue-re-survey-uplift"
				: "continue-delight-scores";
			stop = false;
		}
	}

	const result = {
		ok: true,
		/** Candidate equilibrium stop — NOT skill complete until assert-complete. */
		stop,
		invocationStopCandidate,
		cycleStop: false,
		reason,
		regime,
		nextRegime,
		equilibrium,
		implementableHarm: harmDeclared ? harmN : null,
		implementableUplift: upliftDeclared ? upliftN : null,
		harmDeclared,
		upliftDeclared,
		harmRegressed,
		cognitiveBreach,
		scoresFlat,
		delightFlat,
		pareto,
		curr: {
			metric_total: curr.metric_total,
			metric_max: curr.metric_max,
			delight_total: curr.delight_total ?? null,
			gap_max: curr.gap_max ?? null,
		},
		prev: {
			metric_total: prev.metric_total,
			metric_max: prev.metric_max,
			delight_total: prev.delight_total ?? null,
			gap_max: prev.gap_max ?? null,
		},
		guidance: stop
			? "Candidate pareto-equilibrium. Write summary.md, then assert-complete + mark-complete. Do not claim done without assert-complete ok."
			: !harmDeclared || !upliftDeclared
				? "Pass explicit --implementable-harm N and --implementable-uplift N (use 0 only when S/M backlog empty)."
				: nextRegime === "delight_maximize" && regime !== "delight_maximize"
					? "Harm floor reached — switch regime to delight_maximize; keep measuring harm/cognitive."
					: nextRegime === "harm_reduce" && regime === "delight_maximize"
						? "Harm regressed during delight — return to harm_reduce."
						: "Continue regime; apply next admissible experiment.",
	};

	if (runId && scope) {
		scope.lastEquilibrium = { ...result, at: new Date().toISOString() };
		scope.regime = nextRegime;
		const entered = Array.isArray(scope.regimesEntered)
			? (scope.regimesEntered as string[])
			: ["harm_reduce"];
		if (!entered.includes(nextRegime)) entered.push(nextRegime);
		scope.regimesEntered = entered;
		if (stop) {
			scope.equilibrium = {
				kind: "pareto",
				reason: result.reason,
				at: new Date().toISOString(),
			};
			scope.candidateStopReason = "pareto-equilibrium";
		}
		scope.updatedAt = new Date().toISOString();
		writeScope(root, runId, scope);
	}

	console.log(JSON.stringify(result, null, 2));
	process.exitCode = stop ? 0 : 1;
}

function listIterationDirs(runDir: string): string[] {
	const iterRoot = path.join(runDir, "iterations");
	if (!existsSync(iterRoot)) return [];
	return readdirSync(iterRoot, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
}

function countBusTriples(root: string, runId: string): {
	expects: number;
	acts: number;
	outcomes: number;
	completeTriples: number;
} {
	const dir = path.join(root, ".optimizexp", "bus", "entries");
	if (!existsSync(dir)) {
		return { expects: 0, acts: 0, outcomes: 0, completeTriples: 0 };
	}
	const expects = new Set<string>();
	const actsByExpect = new Map<string, string>();
	const outcomesByAct = new Set<string>();
	for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
		let body: BusBody;
		try {
			body = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as BusBody;
		} catch {
			continue;
		}
		if (body.runId && body.runId !== runId) continue;
		if (body.kind === "expect" && body.id) expects.add(body.id);
		if (body.kind === "act" && body.expects && body.id) {
			actsByExpect.set(body.expects, body.id);
		}
		if (body.kind === "outcome" && body.actId) {
			outcomesByAct.add(body.actId);
		}
	}
	let completeTriples = 0;
	for (const expId of expects) {
		const actId = actsByExpect.get(expId);
		if (actId && outcomesByAct.has(actId)) completeTriples++;
	}
	return {
		expects: expects.size,
		acts: actsByExpect.size,
		outcomes: outcomesByAct.size,
		completeTriples,
	};
}

function modeStatus(args: Record<string, string | boolean>, root: string) {
	const runId = String(args.run || "");
	if (!runId) {
		console.error("--run required for status");
		process.exit(2);
	}
	const runDir = runDirOf(root, runId);
	const scope = readScope(root, runId);
	if (!scope) {
		console.log(
			JSON.stringify(
				{
					ok: false,
					runId,
					status: "missing",
					missing: ["scope.json"],
					guidance: "Run --mode init --run " + runId + " first.",
				},
				null,
				2,
			),
		);
		process.exitCode = 1;
		return;
	}
	const iters = listIterationDirs(runDir);
	const bus = countBusTriples(root, runId);
	const hasSummary = existsSync(path.join(runDir, "summary.md"));
	const incomplete = existsSync(path.join(runDir, "INCOMPLETE.md"));
	const out = {
		ok: true,
		runId,
		status: scope.status ?? "running",
		regime: scope.regime ?? "harm_reduce",
		regimesEntered: scope.regimesEntered ?? [],
		stopPolicy: scope.stopPolicy,
		stopReason: scope.stopReason ?? null,
		noDelight: Boolean(scope.noDelight),
		noSurvey: Boolean(scope.noSurvey),
		iterations: iters,
		bus,
		hasSummary,
		incompleteMarker: incomplete,
		lastShouldStop: scope.lastShouldStop ?? null,
		lastEquilibrium: scope.lastEquilibrium ?? null,
		guidance:
			scope.status === "complete"
				? "Run marked complete."
				: "Run still open. Continue loop or assert-complete when ready.",
	};
	console.log(JSON.stringify(out, null, 2));
	process.exitCode = scope.status === "complete" ? 0 : 1;
}

/**
 * Fail-closed completion certificate. Only legal way to claim optimizexp done.
 */
function modeAssertComplete(
	args: Record<string, string | boolean>,
	root: string,
) {
	const runId = String(args.run || "");
	if (!runId) {
		console.error("--run required for assert-complete");
		process.exit(2);
	}
	const runDir = runDirOf(root, runId);
	const missing: string[] = [];
	const scope = readScope(root, runId);
	if (!scope) {
		console.log(
			JSON.stringify(
				{
					ok: false,
					runId,
					status: "missing",
					missing: ["scope.json"],
					guidance:
						"No run. Product work alone is never optimizexp complete. Init a run and execute the dual-regime loop.",
				},
				null,
				2,
			),
		);
		process.exitCode = 1;
		return;
	}

	const noDelight = Boolean(scope.noDelight);
	const noSurvey = Boolean(scope.noSurvey);
	const stopPolicy = String(scope.stopPolicy || "");
	const status = String(scope.status || "running");
	const regimesEntered = Array.isArray(scope.regimesEntered)
		? (scope.regimesEntered as string[])
		: [];

	if (
		!stopPolicy.includes("pareto") &&
		!stopPolicy.includes("harm-floor") &&
		!stopPolicy.includes("finite")
	) {
		missing.push("stopPolicy_not_recognized");
	}
	// Stale policies that encode old terminal
	if (stopPolicy === "infinite-until-zero-or-irreducible") {
		missing.push("stale_stopPolicy_metrics_zero_terminal");
	}

	const iters = listIterationDirs(runDir);
	if (iters.length === 0) missing.push("no_iterations");
	else {
		const last = iters[iters.length - 1]!;
		const scores = path.join(runDir, "iterations", last, "scores.json");
		const findings = path.join(runDir, "iterations", last, "findings.md");
		if (!existsSync(scores)) missing.push(`iterations/${last}/scores.json`);
		if (!existsSync(findings)) missing.push(`iterations/${last}/findings.md`);
	}

	const bus = countBusTriples(root, runId);
	if (bus.completeTriples < 1) {
		missing.push("bus_complete_triples_lt_1");
	}

	if (!scope.lastShouldStop) {
		missing.push("lastShouldStop_missing");
	}

	if (!noDelight) {
		if (!regimesEntered.includes("delight_maximize")) {
			missing.push("delight_regime_never_entered");
		}
		const lastEq = scope.lastEquilibrium as
			| { stop?: boolean; reason?: string }
			| null
			| undefined;
		const candidate = String(
			scope.candidateStopReason || scope.stopReason || "",
		);
		if (!lastEq?.stop && !scope.equilibrium) {
			missing.push("no_equilibrium_stop");
		} else if (
			candidate &&
			FORBIDDEN_STOP_REASONS.has(candidate)
		) {
			missing.push(`forbidden_stopReason:${candidate}`);
		} else if (
			candidate &&
			!INVOCATION_STOP_REASONS.has(candidate) &&
			lastEq?.reason &&
			!INVOCATION_STOP_REASONS.has(String(lastEq.reason))
		) {
			missing.push(`invalid_stopReason:${candidate || lastEq?.reason}`);
		}
	} else {
		// harm-only path still needs harm floor marker
		const lastSs = scope.lastShouldStop as
			| { plateau?: boolean; reason?: string }
			| null
			| undefined;
		if (!lastSs?.plateau && String(scope.stopReason) !== "harm-only-floor") {
			missing.push("harm_only_floor_not_reached");
		}
	}

	if (!noSurvey) {
		const surveyDir = path.join(runDir, "survey");
		const runBacklog = path.join(runDir, "backlog.json");
		const globalBacklog = path.join(
			root,
			".optimizexp",
			"backlog",
			"experiments.json",
		);
		const hasSurvey =
			existsSync(surveyDir) &&
			readdirSync(surveyDir).some((f) => f.endsWith(".json") || f.endsWith(".md"));
		if (!hasSurvey && !scope.surveyCompleted) {
			missing.push("survey_missing");
		}
		if (!existsSync(runBacklog) && !existsSync(globalBacklog)) {
			missing.push("backlog_missing");
		}
	}

	const summaryPath = path.join(runDir, "summary.md");
	if (!existsSync(summaryPath)) {
		missing.push("summary_md");
	} else {
		const summary = readFileSync(summaryPath, "utf8");
		const reason =
			String(scope.stopReason || scope.candidateStopReason || "") ||
			(scope.lastEquilibrium as { reason?: string } | null)?.reason ||
			"";
		if (noDelight) {
			if (
				!/harm-only-floor|stopReason|stop reason/i.test(summary) &&
				reason !== "harm-only-floor"
			) {
				// require either explicit stopReason in scope or summary mention
				if (!scope.stopReason) missing.push("summary_or_scope_stopReason");
			}
		} else {
			const okReason =
				(reason && INVOCATION_STOP_REASONS.has(reason)) ||
				/pareto-equilibrium|inverted-u-peak|delight-ceiling/i.test(summary);
			if (!okReason) missing.push("summary_missing_valid_stopReason");
		}
		if (/tests pass|feature wired|product green/i.test(summary) &&
			!/pareto|equilibrium|harm-only-floor|assert-complete/i.test(summary)
		) {
			missing.push("summary_looks_like_product_only_completion");
		}
	}

	// Prefer mark-complete to set status complete; assert can pass while still running
	// if all artifacts present (ready-to-mark). status complete is not required for ok.
	const ready = missing.length === 0;
	const result = {
		ok: ready,
		runId,
		status,
		readyToMarkComplete: ready,
		stopPolicy,
		regime: scope.regime,
		regimesEntered,
		candidateStopReason:
			scope.stopReason ||
			scope.candidateStopReason ||
			(scope.lastEquilibrium as { reason?: string } | null)?.reason ||
			null,
		bus,
		iterations: iters,
		missing,
		guidance: ready
			? "assert-complete OK. Run mark-complete --stop-reason <reason>, then paste this JSON when claiming optimizexp done."
			: "Not complete. Product tests / one evidence / harm plateau alone are insufficient. Fix missing[] and continue the loop.",
	};
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = ready ? 0 : 1;
}

function modeMarkComplete(
	args: Record<string, string | boolean>,
	root: string,
) {
	const runId = String(args.run || "");
	const stopReason = String(args.stopReason || "");
	const force = args.force === "1" || args.force === true;
	if (!runId) {
		console.error("--run required for mark-complete");
		process.exit(2);
	}
	if (!stopReason) {
		console.error("--stop-reason required for mark-complete");
		process.exit(2);
	}
	if (FORBIDDEN_STOP_REASONS.has(stopReason)) {
		console.error(`forbidden stop reason: ${stopReason}`);
		process.exit(2);
	}
	if (!INVOCATION_STOP_REASONS.has(stopReason)) {
		console.error(
			`invalid stop reason: ${stopReason}. Allowed: ${[...INVOCATION_STOP_REASONS].join(", ")}`,
		);
		process.exit(2);
	}

	// Re-run assert unless --force (force is for true external terminals only)
	if (!force) {
		// inline assert by calling logic via process would recurse; re-check core
		const prevExit = process.exitCode;
		modeAssertComplete({ run: runId }, root);
		if (process.exitCode !== 0 && process.exitCode !== undefined) {
			console.error(
				"mark-complete refused: assert-complete failed (use only after artifacts ready)",
			);
			return;
		}
		process.exitCode = prevExit ?? 0;
	}

	const scope = readScope(root, runId);
	if (!scope) {
		console.error("scope.json missing");
		process.exit(2);
	}
	const noDelight = Boolean(scope.noDelight);
	if (stopReason === "harm-only-floor" && !noDelight) {
		console.error(
			"harm-only-floor requires scope.noDelight=true (--no-delight)",
		);
		process.exit(2);
	}
	if (
		!noDelight &&
		stopReason === "pareto-equilibrium" &&
		!(scope.regimesEntered as string[] | undefined)?.includes(
			"delight_maximize",
		)
	) {
		console.error("pareto-equilibrium requires delight_maximize was entered");
		process.exit(2);
	}

	scope.status = "complete";
	scope.stopReason = stopReason;
	scope.completedAt = new Date().toISOString();
	scope.updatedAt = scope.completedAt;
	writeScope(root, runId, scope);

	const incomplete = path.join(runDirOf(root, runId), "INCOMPLETE.md");
	if (existsSync(incomplete)) {
		try {
			unlinkSync(incomplete);
		} catch {
			// ignore
		}
	}
	writeFileSync(
		path.join(runDirOf(root, runId), "COMPLETE.md"),
		`# Complete: \`${runId}\`

stopReason: **${stopReason}**
completedAt: ${scope.completedAt}

Certified via mark-complete after assert-complete.
`,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				runId,
				status: "complete",
				stopReason,
				guidance:
					"Invocation complete. Paste assert-complete + this mark-complete result when reporting optimizexp done.",
			},
			null,
			2,
		),
	);
	process.exitCode = 0;
}

/** Aggregate judged outcome scorecards into run cells. */
function modeAggregateBus(root: string, runId: string) {
	const dir = path.join(root, ".optimizexp", "bus", "entries");
	if (!existsSync(dir)) {
		console.log(JSON.stringify({ ok: true, cells: [], metric_total: 0, metric_max: 0 }));
		return;
	}
	const cells: ScoreCell[] = [];
	for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
		const body = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as BusBody;
		if (body.kind !== "outcome") continue;
		if (runId && body.runId && body.runId !== runId) continue;
		const primary = body.scores?.primary;
		if (!primary) continue;
		const surface =
			typeof body.surface === "string"
				? body.surface
				: body.surface?.name || body.scores?.surface || "unknown";
		cells.push({
			persona: body.persona || body.scores?.persona || "unknown",
			surface,
			harms: primary.harms,
			friction: primary.friction,
			uncertainty: primary.uncertainty,
		});
	}
	const result = aggregate(cells);
	console.log(JSON.stringify({ ok: true, runId: runId || null, ...result }, null, 2));
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const root = repoRoot(
		typeof args.root === "string" ? args.root : undefined,
	);
	const mode = String(args.mode ?? "help");
	if (mode === "help") {
		help();
		return;
	}
	if (mode === "init") {
		const run = String(args.run || "");
		if (!run) {
			console.error("--run required");
			process.exit(2);
		}
		const experiences = String(args.experiences || "ux,dx,ax")
			.split(/[,\s]+/)
			.filter(Boolean) as Experiences[];
		const personas = String(args.personas || "")
			.split(/[,\s]+/)
			.filter(Boolean);
		const features = String(args.features || "")
			.split(/[,\s]+/)
			.filter(Boolean);
		const projects = String(args.projects || "")
			.split(/[,\s]+/)
			.filter(Boolean);
		const reportOnly =
			args.reportOnly === "1" ||
			args.reportOnly === true ||
			process.env.OPTIMIZEXP_REPORT_ONLY === "1";
		const noDelight =
			args.noDelight === "1" ||
			args.noDelight === true ||
			process.env.OPTIMIZEXP_NO_DELIGHT === "1";
		const noSurvey =
			args.noSurvey === "1" ||
			args.noSurvey === true ||
			process.env.OPTIMIZEXP_NO_SURVEY === "1";
		const passes = parsePasses(
			args.passes ?? process.env.OPTIMIZEXP_PASSES ?? "infinite",
		);
		const delightPasses = parsePasses(
			args.delightPasses ?? process.env.OPTIMIZEXP_DELIGHT_PASSES ?? "infinite",
		);
		initRun(root, run, experiences, personas, {
			reportOnly,
			passes,
			noDelight,
			noSurvey,
			delightPasses,
			features,
			projects,
		});
		return;
	}
	if (mode === "validate-bus") {
		modeValidateBus(root);
		return;
	}
	if (mode === "read-bus") {
		modeReadBus(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "should-stop") {
		modeShouldStop(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "equilibrium") {
		modeEquilibrium(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "status") {
		modeStatus(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "assert-complete") {
		modeAssertComplete(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "mark-complete") {
		modeMarkComplete(args as Record<string, string | boolean>, root);
		return;
	}
	if (mode === "aggregate-bus") {
		modeAggregateBus(root, String(args.run || ""));
		return;
	}
	if (mode === "score") {
		const scores = String(args.scores || "");
		if (!scores) {
			console.error("--scores required");
			process.exit(2);
		}
		modeScore(scores);
		return;
	}
	if (mode === "plateau") {
		const scores = String(args.scores || "");
		const prev = String(args.prevScores || "");
		if (!scores || !prev) {
			console.error("--scores and --prev-scores required");
			process.exit(2);
		}
		modePlateau(scores, prev);
		return;
	}
	console.error(`unknown mode: ${mode}`);
	help();
	process.exit(2);
}

main();
