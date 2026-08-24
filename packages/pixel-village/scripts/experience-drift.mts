/**
 * HYX score-drift watch.
 *
 * Reads `docs/validation/scores/agent-history.jsonl` (appended by
 * `review-experience.mts`) and reports any rubric item whose latest median
 * dropped >= DROP_THRESHOLD versus the median of its trailing 5 runs.
 *
 * Advisory by default (always exit 0). `--strict` makes a real drop non-zero,
 * so a milestone gate can opt in without breaking day-to-day runs.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isJsonNumber } from "../src/json.js";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY = join(ROOT, "docs/validation/scores/agent-history.jsonl");

/** A drop of a full rubric point is a real regression, not sampling noise. */
const DROP_THRESHOLD = 1.0;
const TRAILING = 5;

type Row = Readonly<{
	date?: string;
	sha?: string;
	model?: string;
	medians?: Record<string, number>;
}>;

function median(values: readonly number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const hi = sorted[mid] ?? Number.NaN;
	const lo = sorted[mid - 1] ?? Number.NaN;
	return sorted.length % 2 === 1 ? hi : (lo + hi) / 2;
}

function readRows(): Row[] {
	if (!existsSync(HISTORY)) return [];
	return readFileSync(HISTORY, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.flatMap((line) => {
			try {
				// SAFETY: `return [JSON.parse(line) as Row];` is required at this I/O or test boundary.
				return [JSON.parse(line) as Row];
			} catch {
				return [];
			}
		});
}

const strict = process.argv.includes("--strict");
const rows = readRows();

if (rows.length === 0) {
	console.log(`no HYX history yet (${HISTORY}) — nothing to compare.`);
	process.exit(0);
}
if (rows.length < 2) {
	console.log("only one HYX run recorded — drift needs at least two.");
	process.exit(0);
}

// SAFETY: `const latest = rows[rows.length - 1] as Row;` is required at this I/O or test boundary.
const latest = rows[rows.length - 1] as Row;
const prior = rows.slice(
	Math.max(0, rows.length - 1 - TRAILING),
	rows.length - 1,
);

const regressions: string[] = [];
const summary: string[] = [];

for (const [id, current] of Object.entries(latest.medians ?? {})) {
	const history = prior
		.map((r) => r.medians?.[id])
		.filter((n): n is number => isJsonNumber(n) && Number.isFinite(n));
	if (history.length === 0 || !Number.isFinite(current)) continue;
	const baseline = median(history);
	const delta = current - baseline;
	summary.push(
		`${id}: ${current.toFixed(2)} (trailing-${history.length} median ${baseline.toFixed(2)}, ` +
			`${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`,
	);
	if (baseline - current >= DROP_THRESHOLD) {
		regressions.push(
			`${id} dropped ${(baseline - current).toFixed(2)} ` +
				`(${baseline.toFixed(2)} → ${current.toFixed(2)})`,
		);
	}
}

console.log(
	`HYX drift — latest run ${latest.sha ?? "?"} (${latest.date ?? "?"})`,
);
for (const line of summary) console.log(`  ${line}`);

if (regressions.length === 0) {
	console.log("no item dropped by >= 1.0 versus its trailing-5 median.");
	process.exit(0);
}

console.error(`\nHYX REGRESSION (${regressions.length}):`);
for (const line of regressions) console.error(`  - ${line}`);
if (strict) {
	console.error("\n--strict: failing.");
	process.exit(1);
}
console.error("\nadvisory only (pass --strict to fail the build).");
process.exit(0);
