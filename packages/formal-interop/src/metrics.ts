import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HypothesisId, MetricsLedgerRow } from "./types.js";

const HYPOTHESES: readonly HypothesisId[] = [
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"H7",
];

/** Default in-repo ledger path under docs/plans/formal-interop-runs/. */
export function defaultLedgerPath(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	// packages/formal-interop/src -> repo root
	return join(here, "../../../docs/plans/formal-interop-runs/ledger.jsonl");
}

export function appendMetricsRow(
	row: MetricsLedgerRow,
	ledgerPath = defaultLedgerPath(),
): MetricsLedgerRow {
	const frozen = freezeRow(row);
	mkdirSync(dirname(ledgerPath), { recursive: true });
	appendFileSync(ledgerPath, `${JSON.stringify(frozen)}\n`, "utf8");
	return frozen;
}

export function freezeRow(row: MetricsLedgerRow): MetricsLedgerRow {
	return Object.freeze({
		...row,
		agentv_scores: Object.freeze({ ...row.agentv_scores }),
	});
}

export function readMetricsLedger(
	ledgerPath = defaultLedgerPath(),
): MetricsLedgerRow[] {
	if (!existsSync(ledgerPath)) return [];
	const text = readFileSync(ledgerPath, "utf8");
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as MetricsLedgerRow);
}

export function hypothesesCovered(
	rows: readonly MetricsLedgerRow[],
): readonly HypothesisId[] {
	const set = new Set(rows.map((r) => r.hypothesis));
	return HYPOTHESES.filter((h) => set.has(h));
}

export function assertAllHypothesesPresent(
	rows: readonly MetricsLedgerRow[],
): { ok: boolean; missing: readonly HypothesisId[] } {
	const covered = new Set(rows.map((r) => r.hypothesis));
	const missing = HYPOTHESES.filter((h) => !covered.has(h));
	return { ok: missing.length === 0, missing };
}

export function requiredColumnsPresent(row: MetricsLedgerRow): boolean {
	return (
		typeof row.hypothesis === "string" &&
		typeof row.tier === "string" &&
		typeof row.method === "string" &&
		typeof row.pass_at_1 === "number" &&
		typeof row.pass_at_k === "number" &&
		typeof row.beq_or_fidelity === "number" &&
		typeof row.preflight_reject_rate === "number" &&
		typeof row.seed === "string" &&
		typeof row.model === "string" &&
		typeof row.prompt_digest === "string" &&
		row.agentv_scores !== undefined
	);
}

/** Seed a clean ledger file (tests). */
export function resetLedger(ledgerPath = defaultLedgerPath()): void {
	mkdirSync(dirname(ledgerPath), { recursive: true });
	writeFileSync(ledgerPath, "", "utf8");
}

export { HYPOTHESES };
