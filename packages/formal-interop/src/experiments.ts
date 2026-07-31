/**
 * E1–E9 experiment runners (ADR-0141 · plan 0016).
 * Pure functions write metrics via appendExperimentRow.
 */

import { createHash } from "node:crypto";
import { mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAntiE237Card } from "./anti-e237.js";
import { evaluateClaimClassGate } from "./claim-class.js";
import {
	candidateMultiset,
	enumerateExecutor,
	enumerateReference,
	forcedClosureDynamic,
	forcedClosureStatic,
	kernelFixtureCorpus,
	multisetsEqual,
	type ResidualPrefix,
} from "./residual-kernel.js";

export type ExperimentId = "E1" | "E2" | "E3" | "E4" | "E8" | "E9";

export interface ExperimentRow {
	readonly experiment: ExperimentId | "anti_e237";
	readonly pass: boolean;
	readonly claim_class: string;
	readonly mode: string;
	readonly detail: string;
	readonly metrics: Readonly<Record<string, number | string | boolean>>;
	readonly seed: string;
}

export function defaultExperimentLedgerPath(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(
		here,
		"../../../docs/plans/formal-interop-runs/experiments-e1-e9.jsonl",
	);
}

export function appendExperimentRow(
	row: ExperimentRow,
	ledgerPath = defaultExperimentLedgerPath(),
): ExperimentRow {
	const frozen = Object.freeze({
		...row,
		metrics: Object.freeze({ ...row.metrics }),
	});
	mkdirSync(dirname(ledgerPath), { recursive: true });
	appendFileSync(ledgerPath, `${JSON.stringify(frozen)}\n`, "utf8");
	return frozen;
}

export function readExperimentLedger(
	ledgerPath = defaultExperimentLedgerPath(),
): ExperimentRow[] {
	if (!existsSync(ledgerPath)) return [];
	return readFileSync(ledgerPath, "utf8")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as ExperimentRow);
}

// ─── E1 ───────────────────────────────────────────────────────────────

export interface E1ParityReport {
	readonly pass: boolean;
	readonly mode: "offline-residual" | "live-kernel";
	readonly mismatchCount: number;
	readonly fixtures: readonly {
		readonly id: string;
		readonly match: boolean;
		readonly referenceStop: string;
		readonly executorStop: string;
		readonly unknownDistinct: boolean;
	}[];
	readonly row: ExperimentRow;
}

/**
 * E1: executor vs reference candidate multiset parity on kernel corpus.
 * Offline residual mode when no Lark kernel (this monorepo default).
 */
export function runE1Parity(
	corpus: readonly ResidualPrefix[] = kernelFixtureCorpus(),
): E1ParityReport {
	const fixtures = corpus.map((fx) => {
		const ref = enumerateReference(fx);
		const exe = enumerateExecutor(fx);
		const match = multisetsEqual(
			candidateMultiset(ref),
			candidateMultiset(exe),
		);
		// UNKNOWN must remain distinct from UNSUPPORTED
		const refUnknown = ref.stopReason === "unknown";
		const refUnsupported = ref.stopReason === "unsupported";
		const exeUnknown = exe.stopReason === "unknown";
		const exeUnsupported = exe.stopReason === "unsupported";
		const unknownDistinct =
			!(refUnknown && refUnsupported) &&
			!(exeUnknown && exeUnsupported) &&
			ref.stopReason === exe.stopReason;
		// Silent UNKNOWN→UNSUPPORTED collapse detection
		const collapsed =
			(refUnknown && exeUnsupported) || (refUnsupported && exeUnknown);
		return {
			id: fx.id,
			match: match && !collapsed && unknownDistinct,
			referenceStop: ref.stopReason,
			executorStop: exe.stopReason,
			unknownDistinct: !collapsed,
		};
	});

	const mismatchCount = fixtures.filter((f) => !f.match).length;
	const pass = mismatchCount === 0;
	const row = appendExperimentRow({
		experiment: "E1",
		pass,
		claim_class: "executor_parity",
		mode: "offline-residual",
		detail: pass
			? `parity ok on ${fixtures.length} fixtures`
			: `${mismatchCount} mismatches`,
		metrics: {
			mismatch_count: mismatchCount,
			fixture_count: fixtures.length,
			unknown_distinct: fixtures.every((f) => f.unknownDistinct),
		},
		seed: hashSeed("E1"),
	});

	return Object.freeze({
		pass,
		mode: "offline-residual",
		mismatchCount,
		fixtures: Object.freeze(fixtures),
		row,
	});
}

// ─── E2 ───────────────────────────────────────────────────────────────

export interface E2ColdReport {
	readonly pass: boolean;
	readonly claimClass: string;
	readonly ratio: number;
	readonly row: ExperimentRow;
}

/**
 * E2: cold p50 (process-warm pack, request-cold).
 * Fails if speedup only via request_local_memo_reuse labeled as cold.
 * Offline: measure residual enumerate cost baseline vs executor; require
 * honest labels and ratio ≤ 0.5 when claiming executor cold win, else
 * record offline measurement with request_cold label.
 */
export function runE2Cold(options?: {
	/** Illicit: claim memo reuse as cold */
	readonly illicitMemoAsCold?: boolean;
}): E2ColdReport {
	const illicit = options?.illicitMemoAsCold === true;
	const corpus = kernelFixtureCorpus();

	// Structural cost: forest expansions (not wall-clock cosplay).
	// process_warm_pack = artifact tables available; request_cold = no request-local memo.
	let baselineCost = 0;
	let executorCost = 0;
	for (const fx of corpus) {
		baselineCost += enumerateReference(fx).forestExpansions;
		executorCost += enumerateExecutor(fx).forestExpansions;
	}
	const ratio = baselineCost <= 0 ? 1 : executorCost / baselineCost;

	if (illicit) {
		const row = appendExperimentRow({
			experiment: "E2",
			pass: false,
			claim_class: "request_local_memo_reuse",
			mode: "request_local_memo_reuse",
			detail: "rejected: memo reuse marketed as cold",
			metrics: {
				ratio,
				baseline_expansions: baselineCost,
				executor_expansions: executorCost,
			},
			seed: hashSeed("E2-illicit"),
		});
		return Object.freeze({
			pass: false,
			claimClass: "request_local_memo_reuse",
			ratio,
			row,
		});
	}

	const e1 = runE1Parity(corpus);
	const meetsRatio = ratio <= 0.5;
	const pass = e1.pass && meetsRatio;
	const row = appendExperimentRow({
		experiment: "E2",
		pass,
		claim_class: "request_cold",
		mode: "process_warm_pack+request_cold",
		detail: pass
			? `executor/baseline expansion ratio ${ratio.toFixed(3)} ≤ 0.5 (request_cold, not memo)`
			: `expansion ratio ${ratio.toFixed(3)} > 0.5`,
		metrics: {
			ratio,
			baseline_expansions: baselineCost,
			executor_expansions: executorCost,
			e1_pass: e1.pass,
			meets_half_ratio: meetsRatio,
			// Explicit: not request_local_memo_reuse
			memo_reuse: false,
		},
		seed: hashSeed("E2"),
	});

	return Object.freeze({
		pass: row.pass,
		claimClass: "request_cold",
		ratio,
		row,
	});
}

// ─── E3 ───────────────────────────────────────────────────────────────

export interface E3LoadReport {
	readonly pass: boolean;
	readonly loadRatio: number;
	readonly corruptionCaught: boolean;
	readonly row: ExperimentRow;
}

/** Simple residual table blob for load/check tax. */
export function buildResidualArtifact(): {
	readonly digest: string;
	readonly body: string;
} {
	const body = JSON.stringify({
		version: 1,
		forced: Object.keys({ "root = Card([": 1, "root = Card([b1,": 1 }),
		productions: ["box", "form", "text", "field", "button", "heading"],
	});
	const digest = createHash("sha256").update(body).digest("hex");
	return Object.freeze({ digest, body });
}

export function checkResidualArtifact(
	artifact: { digest: string; body: string },
	opts?: { corrupt?: boolean },
): { ok: boolean; mode: "digest" | "full" } {
	const body = opts?.corrupt ? artifact.body + "X" : artifact.body;
	const dig = createHash("sha256").update(body).digest("hex");
	if (dig !== artifact.digest) {
		return { ok: false, mode: "digest" };
	}
	return { ok: true, mode: "digest" };
}

export function runE3LoadCheck(): E3LoadReport {
	const artifact = buildResidualArtifact();
	// Structural op counts (deterministic): digest check = 1 hash compare;
	// full reconstruct = re-parse + rehash + rebuild residual for every fixture.
	const digestOps = 1;
	const corpus = kernelFixtureCorpus();
	let fullOps = 2; // parse + rehash
	for (const fx of corpus) {
		fullOps += 1 + enumerateReference(fx).forestExpansions;
	}
	const loadRatio = fullOps / digestOps;
	const corruptionCaught = !checkResidualArtifact(artifact, { corrupt: true }).ok;
	const digestOk = checkResidualArtifact(artifact).ok;
	const pass = loadRatio >= 10 && corruptionCaught && digestOk;

	const row = appendExperimentRow({
		experiment: "E3",
		pass,
		claim_class: "process_warm_pack",
		mode: "digest_vs_full",
		detail: pass
			? `load ratio ${loadRatio.toFixed(1)}×; corruption caught`
			: `load ratio ${loadRatio.toFixed(1)}× (need ≥10) corruptionCaught=${corruptionCaught}`,
		metrics: {
			load_ratio: loadRatio,
			digest_ops: digestOps,
			full_ops: fullOps,
			corruption_caught: corruptionCaught,
		},
		seed: hashSeed("E3"),
	});

	return Object.freeze({ pass, loadRatio, corruptionCaught, row });
}

// ─── E4 ───────────────────────────────────────────────────────────────

export interface E4MacroReport {
	readonly pass: boolean;
	readonly expansionReduction: number;
	readonly row: ExperimentRow;
}

export function runE4StaticMacros(
	corpus: readonly ResidualPrefix[] = kernelFixtureCorpus(),
): E4MacroReport {
	let dynamicExp = 0;
	let staticExp = 0;
	let match = true;
	for (const fx of corpus) {
		const d = forcedClosureDynamic(fx);
		const s = forcedClosureStatic(fx);
		if (d.apply !== s.apply || d.stop !== s.stop) {
			// literal / incomplete must agree
			if (
				fx.gamma.inLiteral ||
				!fx.gamma.macroCoverageComplete ||
				d.stop === "literal_boundary" ||
				d.stop === "incomplete"
			) {
				if (d.stop !== s.stop) match = false;
			} else if (
				JSON.stringify(d.forcedTokens) !== JSON.stringify(s.forcedTokens)
			) {
				match = false;
			}
		}
		const ref = enumerateReference(fx);
		const exe = enumerateExecutor(fx);
		dynamicExp += ref.forestExpansions;
		staticExp += exe.forestExpansions;
	}
	const reduction =
		dynamicExp <= 0 ? 0 : (dynamicExp - staticExp) / dynamicExp;
	// Must not compress across literals: mid-literal fixture must not force-close
	const midLit = corpus.find((c) => c.id === "mid-literal");
	const noLiteralCompress = midLit
		? !forcedClosureStatic(midLit).apply
		: true;
	const pass =
		match && noLiteralCompress && reduction >= 0.3;

	const row = appendExperimentRow({
		experiment: "E4",
		pass,
		claim_class: "static_macro_edges",
		mode: "aot_forced_closure",
		detail: pass
			? `expansion reduction ${(reduction * 100).toFixed(1)}%`
			: `reduction ${(reduction * 100).toFixed(1)}% match=${match} noLiteralCompress=${noLiteralCompress}`,
		metrics: {
			expansion_reduction: reduction,
			dynamic_expansions: dynamicExp,
			static_expansions: staticExp,
			no_literal_compress: noLiteralCompress,
		},
		seed: hashSeed("E4"),
	});

	return Object.freeze({ pass, expansionReduction: reduction, row });
}

// ─── E8 ───────────────────────────────────────────────────────────────

export interface E8ZeroForwardReport {
	readonly pass: boolean;
	readonly row: ExperimentRow;
}

export function runE8ZeroForward(
	corpus: readonly ResidualPrefix[] = kernelFixtureCorpus(),
): E8ZeroForwardReport {
	const singletons = corpus.filter((c) => c.singleton);
	let pass = singletons.length > 0;
	const details: string[] = [];
	for (const fx of singletons) {
		const ref = enumerateReference(fx);
		const exe = enumerateExecutor(fx);
		if (ref.forwardsCount !== 0 || exe.forwardsCount !== 0) {
			pass = false;
			details.push(`${fx.id}: forwards>0`);
		}
	}
	const row = appendExperimentRow({
		experiment: "E8",
		pass,
		claim_class: "zero_forward",
		mode: "singleton_fixtures",
		detail: pass
			? `forwards_count==0 on ${singletons.length} singletons`
			: details.join("; "),
		metrics: {
			singleton_count: singletons.length,
			forwards_total: singletons.reduce(
				(a, fx) =>
					a +
					enumerateReference(fx).forwardsCount +
					enumerateExecutor(fx).forwardsCount,
				0,
			),
		},
		seed: hashSeed("E8"),
	});
	return Object.freeze({ pass, row });
}

// ─── E9 ───────────────────────────────────────────────────────────────

export interface E9HygieneReport {
	readonly pass: boolean;
	readonly row: ExperimentRow;
}

/**
 * E9: reject marketing warm 89.8× as AOT cold.
 */
export function runE9ClaimHygiene(claimText: string): E9HygieneReport {
	const lower = claimText.toLowerCase();
	const mentionsWarmSpeedup =
		/\b89\.8\b/.test(lower) || lower.includes("89.8x") || lower.includes("89.8×");

	// Honest: explicitly labels memo reuse and/or denies AOT cold attribution.
	const honestMemoLabel = lower.includes("request_local_memo_reuse");
	const deniesAotCold =
		/not\s+aot\s+cold/.test(lower) ||
		/not\s+an?\s+aot\s+cold/.test(lower) ||
		/memo\s+reuse\s+only/.test(lower);

	// Illicit: attributes warm speedup to AOT cold without memo-reuse honesty.
	const claimsAotCold =
		/\baot\s+cold\b/.test(lower) ||
		/\baot\s+cold-start\b/.test(lower) ||
		(/\bcold-start\b/.test(lower) && /\baot\b/.test(lower));

	const illicit =
		mentionsWarmSpeedup &&
		claimsAotCold &&
		!honestMemoLabel &&
		!deniesAotCold;

	// Also illicit: cites 89.8 as cold without memo label
	const illicitColdWithoutMemo =
		mentionsWarmSpeedup &&
		/\bcold\b/.test(lower) &&
		!honestMemoLabel &&
		!deniesAotCold &&
		claimsAotCold;

	const finalPass = !(illicit || illicitColdWithoutMemo);

	const row = appendExperimentRow({
		experiment: "E9",
		pass: finalPass,
		claim_class: "claim_hygiene",
		mode: "marketing_claim_scan",
		detail: finalPass
			? "claim hygiene ok"
			: "rejected: warm memo speedup marketed as AOT cold",
		metrics: {
			mentions_warm_speedup: mentionsWarmSpeedup,
			markets_as_aot_cold: illicit || illicitColdWithoutMemo,
			honest_memo_label: honestMemoLabel || deniesAotCold,
		},
		seed: hashSeed(`E9:${claimText.slice(0, 40)}`),
	});

	return Object.freeze({ pass: finalPass, row });
}

// ─── Suite ────────────────────────────────────────────────────────────

export interface ExperimentSuiteResult {
	readonly e1: E1ParityReport;
	readonly e2: E2ColdReport;
	readonly e3: E3LoadReport;
	readonly e4: E4MacroReport;
	readonly e8: E8ZeroForwardReport;
	readonly e9Honest: E9HygieneReport;
	readonly e9Illicit: E9HygieneReport;
	readonly allCorePass: boolean;
	readonly rows: readonly ExperimentRow[];
}

/**
 * Run E1–E9 core suite with honest E9 text and illicit E9 text.
 */
export function runExperimentSuite(): ExperimentSuiteResult {
	const e1 = runE1Parity();
	const e2 = runE2Cold();
	const e3 = runE3LoadCheck();
	const e4 = runE4StaticMacros();
	const e8 = runE8ZeroForward();
	const e9Honest = runE9ClaimHygiene(
		"warm path 89.8× is request_local_memo_reuse only; not AOT cold",
	);
	const e9Illicit = runE9ClaimHygiene(
		"AOT cold-start achieves 89.8× speedup on card_open_comma",
	);

	const allCorePass =
		e1.pass &&
		e2.pass &&
		e3.pass &&
		e4.pass &&
		e8.pass &&
		e9Honest.pass &&
		!e9Illicit.pass;

	const rows = Object.freeze([
		e1.row,
		e2.row,
		e3.row,
		e4.row,
		e8.row,
		e9Honest.row,
		e9Illicit.row,
	]);

	return Object.freeze({
		e1,
		e2,
		e3,
		e4,
		e8,
		e9Honest,
		e9Illicit,
		allCorePass,
		rows,
	});
}

export function runAntiE237Validation(card: unknown): ExperimentRow {
	const v = validateAntiE237Card(card);
	return appendExperimentRow({
		experiment: "anti_e237",
		pass: v.ok,
		claim_class: "anti_e237",
		mode: "card_schema",
		detail: v.ok ? "complete anti-E237 card" : v.failures.join("; "),
		metrics: {
			failure_count: v.failures.length,
		},
		seed: hashSeed(`anti-e237:${v.ok}`),
	});
}

function hashSeed(s: string): string {
	return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
