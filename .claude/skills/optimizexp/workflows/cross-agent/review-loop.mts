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
	writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
	validateComparison,
	validateScorecard,
	type MetricScorecard,
	type PrimaryScores,
} from "../../harness/lib/scorecard.mts";

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

function repoRoot(): string {
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
		else if (a === "--limit") out.limit = argv[++i] ?? "20";
		else if (a === "--mismatches-only") out.mismatchesOnly = "1";
		else if (!a.startsWith("-") && out.mode === "help") out.mode = a;
	}
	return out;
}

function help() {
	console.log(`optimizexp review-loop

Usage:
  review-loop.mts --mode init --run <id> [--experiences ux,dx,ax] [--personas a,b] [--passes N]
  review-loop.mts --mode validate-bus
  review-loop.mts --mode read-bus [--run <runId>] [--limit N] [--mismatches-only]
      [--persona id] [--feature id]
  review-loop.mts --mode score --scores <cells.json>
  review-loop.mts --mode aggregate-bus [--run <runId>]
  review-loop.mts --mode plateau --scores <curr.json> --prev-scores <prev.json>
  review-loop.mts --mode should-stop --run <id> --iteration N --scores c.json --prev-scores p.json
      [--implementable-findings N]

Stop a cycle only on true plateau: scores flat AND implementableFindings=0.
--passes infinite (default) = outer cycles until metrics all 0 OR irreducible (true plateau after re-survey).
--passes N (finite) = at most N outer completion cycles (each cycle to full plateau).
There is no --iterations flag and no review-iteration cap inside a cycle.
--report-only / --no-reduce = measure only (no experiments).
--implementable-findings N = open S/M findings still unapplied (omit defaults to 1 = continue).
--iteration N on should-stop is the current review-iteration index (bookkeeping only).

Modes are deterministic file/JSON helpers. Persona judgment stays in the agent.
Every expect/act/outcome bus entry must include a formal metric scorecard.
Agents MUST apply a reduce experiment each pass unless report-only.
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

function initRun(
	root: string,
	runId: string,
	experiences: string[],
	personas: string[],
	opts: {
		reportOnly: boolean;
		passes?: number | null | string;
	},
) {
	const runDir = path.join(root, ".optimizexp", "runs", runId);
	mkdirSync(path.join(runDir, "iterations"), { recursive: true });
	mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
	mkdirSync(path.join(root, ".optimizexp", "bus", "entries"), {
		recursive: true,
	});
	const passes = parsePasses(opts.passes);
	const scope = {
		runId,
		experiences,
		personas,
		surfaces: [] as string[],
		reportOnly: opts.reportOnly,
		/** Outer completion cycles: null = infinite until metrics=0 or irreducible. */
		passes,
		passesLabel: passesLabel(passes),
		cyclesCompleted: 0,
		passesCompleted: 0,
		stopPolicy:
			passes === null
				? "infinite-until-zero-or-irreducible"
				: "finite-outer-cycles-to-plateau",
		outerCycles: "passes",
		hostAgent: "cross-agent",
		createdAt: new Date().toISOString(),
	};
	writeFileSync(
		path.join(runDir, "scope.json"),
		`${JSON.stringify(scope, null, 2)}\n`,
	);
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
	const scopePath = path.join(root, ".optimizexp", "runs", runId, "scope.json");

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

	let stop = false;
	let reason = "continue";
	if (plateau) {
		stop = true;
		reason = "plateau";
	} else if (scoresFlat && !backlogEmpty) {
		stop = false;
		reason = "continue-implementable-backlog";
	}

	if (existsSync(scopePath)) {
		const scope = JSON.parse(readFileSync(scopePath, "utf8")) as Record<
			string,
			unknown
		>;
		scope.passesCompleted = iteration;
		scope.lastImplementableFindings = implementableFindings;
		writeFileSync(scopePath, `${JSON.stringify(scope, null, 2)}\n`);
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				stop,
				reason,
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
				guidance:
					implementableFindings > 0
						? "Open implementable findings remain — apply next reduction; do not stop."
						: scoresFlat
							? "Scores flat and backlog empty — true plateau."
							: "Scores still improving — continue.",
			},
			null,
			2,
		),
	);
	process.exitCode = stop ? 0 : 1;
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
		if (kind !== "expect" && kind !== "act" && kind !== "outcome") {
			problems.push(`${f}: kind must be expect|act|outcome`);
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
	const root = repoRoot();
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
		const reportOnly =
			args.reportOnly === "1" ||
			args.reportOnly === true ||
			process.env.OPTIMIZEXP_REPORT_ONLY === "1";
		const passes = parsePasses(
			args.passes ?? process.env.OPTIMIZEXP_PASSES ?? "infinite",
		);
		initRun(root, run, experiences, personas, {
			reportOnly,
			passes,
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
