/**
 * Stop / closeout gate tests for optimizexp review-loop.
 * Run: node --import tsx --test .agents/skills/optimizexp/harness/test/review-loop-stop-gate.test.mts
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// harness/test → harness → optimizexp → skills → .agents → repo root
const REPO = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	"../../../../..",
);
const RL = path.join(
	REPO,
	".agents/skills/optimizexp/workflows/cross-agent/review-loop.mts",
);

function runRl(
	root: string,
	args: string[],
): { code: number | null; json: Record<string, unknown>; stdout: string } {
	const r = spawnSync(
		process.execPath,
		["--import", "tsx", RL, "--root", root, ...args],
		{ cwd: REPO, encoding: "utf8", env: process.env },
	);
	const stdout = r.stdout || "";
	const stderr = r.stderr || "";
	let json: Record<string, unknown> = {};
	try {
		// Parse last top-level JSON object via brace balance (stdout only)
		let depth = 0;
		let start = -1;
		let last: string | null = null;
		for (let i = 0; i < stdout.length; i++) {
			const ch = stdout[i]!;
			if (ch === "{") {
				if (depth === 0) start = i;
				depth++;
			} else if (ch === "}") {
				depth--;
				if (depth === 0 && start >= 0) {
					last = stdout.slice(start, i + 1);
					start = -1;
				}
			}
		}
		if (last) json = JSON.parse(last);
	} catch {
		// leave empty; assertions will surface stdout
	}
	return { code: r.status, json, stdout: stdout + stderr };
}

function seedRepo(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "oxp-stop-"));
	mkdirSync(path.join(dir, ".optimizexp", "bus", "entries"), {
		recursive: true,
	});
	mkdirSync(path.join(dir, ".git"), { recursive: true });
	return dir;
}

function writeScores(
	dir: string,
	name: string,
	metric_total: number,
	metric_max: number,
	extra: Record<string, number> = {},
) {
	const p = path.join(dir, name);
	writeFileSync(
		p,
		JSON.stringify({
			iteration: 1,
			cells: [],
			metric_total,
			metric_max,
			...extra,
		}) + "\n",
	);
	return p;
}

describe("optimizexp stop gate", () => {
	it("init writes infinite-until-pareto-equilibrium and status running", () => {
		const dir = seedRepo();
		try {
			const { code, json } = runRl(dir, [
				"--mode",
				"init",
				"--run",
				"t-init",
				"--experiences",
				"dx",
			]);
			assert.equal(code, 0);
			const scope = (json.scope ?? json) as Record<string, unknown>;
			// when nested under scope key
			const s =
				(json.scope as Record<string, unknown> | undefined) ??
				JSON.parse(
					readFileSync(
						path.join(dir, ".optimizexp/runs/t-init/scope.json"),
						"utf8",
					),
				);
			assert.equal(s.stopPolicy, "infinite-until-pareto-equilibrium");
			assert.equal(s.status, "running");
			assert.equal(s.regime, "harm_reduce");
			assert.ok(existsSync(path.join(dir, ".optimizexp/runs/t-init/INCOMPLETE.md")));
			assert.notEqual(s.stopPolicy, "infinite-until-zero-or-irreducible");
			void scope;
			void code;
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("should-stop plateau is cycleStop not invocationStop", () => {
		const dir = seedRepo();
		try {
			runRl(dir, ["--mode", "init", "--run", "t-ss", "--experiences", "dx"]);
			const prev = writeScores(dir, "prev.json", 3, 2);
			const curr = writeScores(dir, "curr.json", 3, 2);
			const { code, json } = runRl(dir, [
				"--mode",
				"should-stop",
				"--run",
				"t-ss",
				"--iteration",
				"1",
				"--scores",
				curr,
				"--prev-scores",
				prev,
				"--implementable-findings",
				"0",
			]);
			assert.equal(code, 0);
			assert.equal(json.cycleStop, true);
			assert.equal(json.invocationStop, false);
			assert.equal(json.reason, "harm-floor-switch-to-delight");
			assert.equal(json.nextRegime, "delight_maximize");
			const scope = JSON.parse(
				readFileSync(path.join(dir, ".optimizexp/runs/t-ss/scope.json"), "utf8"),
			);
			assert.equal(scope.regime, "delight_maximize");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("assert-complete fails on empty / product-only run", () => {
		const dir = seedRepo();
		try {
			runRl(dir, ["--mode", "init", "--run", "t-empty", "--experiences", "dx"]);
			const { code, json } = runRl(dir, [
				"--mode",
				"assert-complete",
				"--run",
				"t-empty",
			]);
			assert.notEqual(code, 0);
			assert.equal(json.ok, false);
			const missing = json.missing as string[];
			assert.ok(missing.includes("no_iterations"));
			assert.ok(missing.includes("bus_complete_triples_lt_1"));
			assert.ok(missing.includes("delight_regime_never_entered"));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("assert-complete fails after harm plateau alone", () => {
		const dir = seedRepo();
		try {
			runRl(dir, ["--mode", "init", "--run", "t-harm", "--experiences", "dx"]);
			const prev = writeScores(dir, "prev.json", 1, 1);
			const curr = writeScores(dir, "curr.json", 1, 1);
			runRl(dir, [
				"--mode",
				"should-stop",
				"--run",
				"t-harm",
				"--iteration",
				"1",
				"--scores",
				curr,
				"--prev-scores",
				prev,
				"--implementable-findings",
				"0",
			]);
			const { code, json } = runRl(dir, [
				"--mode",
				"assert-complete",
				"--run",
				"t-harm",
			]);
			assert.notEqual(code, 0);
			assert.equal(json.ok, false);
			const missing = json.missing as string[];
			// delight entered via should-stop, but still no equilibrium/bus/etc
			assert.ok(missing.includes("no_equilibrium_stop") || missing.includes("bus_complete_triples_lt_1"));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("equilibrium omit implementable counts cannot stop", () => {
		const dir = seedRepo();
		try {
			runRl(dir, ["--mode", "init", "--run", "t-eq", "--experiences", "dx"]);
			const prev = writeScores(dir, "prev.json", 0, 0, {
				delight_total: 12,
				gap_max: 1,
			});
			const curr = writeScores(dir, "curr.json", 0, 0, {
				delight_total: 12,
				gap_max: 1,
			});
			const { code, json } = runRl(dir, [
				"--mode",
				"equilibrium",
				"--run",
				"t-eq",
				"--scores",
				curr,
				"--prev-scores",
				prev,
				"--regime",
				"delight_maximize",
			]);
			assert.notEqual(code, 0);
			assert.equal(json.stop, false);
			assert.equal(json.reason, "continue-undeclared-implementable-counts");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("full legal closeout: assert-complete + mark-complete", () => {
		const dir = seedRepo();
		const run = "t-full";
		try {
			runRl(dir, [
				"--mode",
				"init",
				"--run",
				run,
				"--experiences",
				"dx,ux",
				"--personas",
				"dev",
			]);
			const runDir = path.join(dir, ".optimizexp/runs", run);
			mkdirSync(path.join(runDir, "iterations/001"), { recursive: true });
			mkdirSync(path.join(runDir, "survey"), { recursive: true });
			writeFileSync(
				path.join(runDir, "iterations/001/scores.json"),
				JSON.stringify({
					iteration: 1,
					cells: [
						{
							persona: "dev",
							surface: "cli",
							harms: 0,
							friction: 0,
							uncertainty: 0,
						},
					],
					metric_total: 0,
					metric_max: 0,
					delight_total: 12,
					gap_max: 1,
				}) + "\n",
			);
			writeFileSync(
				path.join(runDir, "iterations/001/findings.md"),
				"# Findings\n\nNo S/M left.\n",
			);
			writeFileSync(
				path.join(runDir, "summary.md"),
				"# Summary\n\nstopReason: **pareto-equilibrium**\n",
			);
			writeFileSync(path.join(runDir, "survey/r.json"), "{}\n");
			writeFileSync(path.join(runDir, "backlog.json"), '{"items":[]}\n');

			const bus = path.join(dir, ".optimizexp/bus/entries");
			writeFileSync(
				path.join(bus, "e.json"),
				JSON.stringify({
					kind: "expect",
					id: "e1",
					runId: run,
					persona: "dev",
				}) + "\n",
			);
			writeFileSync(
				path.join(bus, "a.json"),
				JSON.stringify({
					kind: "act",
					id: "a1",
					expects: "e1",
					runId: run,
				}) + "\n",
			);
			writeFileSync(
				path.join(bus, "o.json"),
				JSON.stringify({
					kind: "outcome",
					id: "o1",
					expects: "e1",
					actId: "a1",
					runId: run,
				}) + "\n",
			);

			const prev = writeScores(dir, "prev.json", 0, 0, {
				delight_total: 12,
				gap_max: 1,
			});
			const curr = writeScores(dir, "curr.json", 0, 0, {
				delight_total: 12,
				gap_max: 1,
			});
			// enter delight via should-stop
			runRl(dir, [
				"--mode",
				"should-stop",
				"--run",
				run,
				"--iteration",
				"1",
				"--scores",
				curr,
				"--prev-scores",
				prev,
				"--implementable-findings",
				"0",
			]);
			const eq = runRl(dir, [
				"--mode",
				"equilibrium",
				"--run",
				run,
				"--scores",
				curr,
				"--prev-scores",
				prev,
				"--implementable-harm",
				"0",
				"--implementable-uplift",
				"0",
				"--regime",
				"delight_maximize",
			]);
			assert.equal(eq.json.stop, true);

			const ac = runRl(dir, ["--mode", "assert-complete", "--run", run]);
			assert.equal(ac.code, 0, ac.stdout);
			assert.equal(ac.json.ok, true);

			const mc = runRl(dir, [
				"--mode",
				"mark-complete",
				"--run",
				run,
				"--stop-reason",
				"pareto-equilibrium",
			]);
			assert.equal(mc.code, 0, mc.stdout);
			const scope = JSON.parse(
				readFileSync(path.join(runDir, "scope.json"), "utf8"),
			);
			assert.equal(scope.status, "complete");
			assert.equal(scope.stopReason, "pareto-equilibrium");
			assert.ok(!existsSync(path.join(runDir, "INCOMPLETE.md")));
			assert.ok(existsSync(path.join(runDir, "COMPLETE.md")));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
