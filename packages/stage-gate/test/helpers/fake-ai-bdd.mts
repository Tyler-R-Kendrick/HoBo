// A stand-in `ai-bdd` for the release-gate tests: the process boundary of
// contracts/pacts/stage-gate-ai-bdd-report.pact.json, played back from a plan.
// It answers the three commands the gate runs with the exit codes and files
// the real CLI documents (docs/cli.md of ai-bdd, "Exit codes of a gate"):
// `run` writes .ai-bdd/report/report.json and .ai-bdd/runs/<runId>/report.json
// on exit 0, 1 and 3, and nothing on 2 or 4, and then prints
// `Run: .ai-bdd/runs/<runId>`, as ai-bdd prints it. Every call is appended to
// FAKE_AI_BDD_LOG so a test can tell which commands were never started.
//
// Like a real run, each report it writes gets a run id of its own and starts
// now (`startedAt` overrides the start, for a report older than its run); the
// report goes to join(dirname(runsDir), "report"), as ai-bdd writes it.
//
// FAKE_AI_BDD (JSON): { compileCheck: <exit>, run: { exit, report?: <file>,
// runCopy?: "same" | "different" | "none", startedAt?: <ISO>, runsDir?: <dir>,
// sleepMs?, pidFile?, detachedPidFile?, outputBytes?, printedRun? },
// verifyRun: <exit> }

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

interface RunPlan {
	readonly exit: number;
	readonly report?: string;
	readonly runCopy?: "same" | "different" | "none";
	readonly startedAt?: string;
	readonly runsDir?: string;
	/** Hang this long (a child of its own process group first, its pid written to pidFile). */
	readonly sleepMs?: number;
	readonly pidFile?: string;
	/**
	 * While hanging, also hold a child in a process group of its own, as
	 * Playwright launches a browser, and end it on SIGTERM or SIGINT, as
	 * Playwright does, then exit. Its pid is written here.
	 */
	readonly detachedPidFile?: string;
	/** Print this many bytes of output before finishing. */
	readonly outputBytes?: number;
	/**
	 * The `Run: <dir>` line ai-bdd prints on stdout for a run that wrote a
	 * report: this run's directory (unset), another new run's ("other", as when
	 * a concurrent run in the project wrote the latest report), or none.
	 */
	readonly printedRun?: "other" | "none";
}

interface Plan {
	readonly compileCheck: number;
	readonly run: RunPlan;
	readonly verifyRun: number;
}

// SAFETY: the plan is written by the test that spawns this process, from the Plan interface.
const plan = JSON.parse(process.env.FAKE_AI_BDD ?? "{}") as Plan;
const [command = "", ...rest] = process.argv.slice(2);
appendFileSync(
	process.env.FAKE_AI_BDD_LOG ?? join(process.cwd(), "fake-ai-bdd.log"),
	`${JSON.stringify([command, ...rest])}\n`,
);

/** The run directory the report names, relative to the project; undefined when no report is written. */
function writeReport(run: RunPlan): string | undefined {
	if (run.report === undefined) return undefined;
	// SAFETY: the plan names one of the committed report fixtures, or a test's edit of one.
	const report = JSON.parse(readFileSync(run.report, "utf8")) as {
		runId: string;
		startedAt: string;
		finishedAt: string;
	};
	report.runId = randomUUID();
	report.startedAt = run.startedAt ?? new Date().toISOString();
	report.finishedAt = new Date().toISOString();
	const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
	const runsDir = run.runsDir ?? join(".ai-bdd", "runs");
	const latest = join(dirname(runsDir), "report");
	mkdirSync(latest, { recursive: true });
	writeFileSync(join(latest, "report.json"), bytes);
	const runDir = join(runsDir, report.runId);
	mkdirSync(runDir, { recursive: true });
	if (run.runCopy === "none") return runDir;
	writeFileSync(
		join(runDir, "report.json"),
		run.runCopy === "different"
			? Buffer.concat([bytes, Buffer.from(" ")])
			: bytes,
	);
	return runDir;
}

/** What ai-bdd prints after the summary: `relative(cwd, join(runsDir, runId))`. */
function printedRunLine(run: RunPlan, runDir: string | undefined): string {
	if (runDir === undefined || run.printedRun === "none") return "";
	if (run.printedRun !== "other") return `Run: ${runDir}\n`;
	const other = join(dirname(runDir), randomUUID());
	mkdirSync(other, { recursive: true });
	return `Run: ${other}\n`;
}

if (command === "compile" && rest[0] === "--check") {
	if (plan.compileCheck === 4) {
		process.stdout.write(
			"PLAN_STALE docs/release-notes.md: the plan does not describe the doc\nExit code: 4\n",
		);
	}
	process.exitCode = plan.compileCheck;
} else if (command === "run") {
	if (plan.run.sleepMs !== undefined) {
		// A hung driver: a child (a browser, say) and the CLI itself, both waiting.
		const child = spawn(
			process.execPath,
			["-e", "setTimeout(() => {}, 60000)"],
			{ stdio: "ignore" },
		);
		// The CLI does not wait for it: only a kill of the group ends it early.
		child.unref();
		if (plan.run.pidFile !== undefined) {
			writeFileSync(plan.run.pidFile, String(child.pid));
		}
		if (plan.run.detachedPidFile !== undefined) {
			const browser = spawn(
				process.execPath,
				["-e", "setTimeout(() => {}, 60000)"],
				{ stdio: "ignore", detached: true },
			);
			browser.unref();
			writeFileSync(plan.run.detachedPidFile, String(browser.pid));
			for (const [signal, code] of [
				["SIGTERM", 143],
				["SIGINT", 130],
			] as const) {
				process.once(signal, () => {
					try {
						process.kill(-(browser.pid ?? 0), "SIGTERM");
					} catch {
						// Already gone.
					}
					process.exit(code);
				});
			}
		}
		await new Promise((done) => setTimeout(done, plan.run.sleepMs));
	}
	const chunk = `${"x".repeat(1023)}\n`;
	for (
		let written = 0;
		written < (plan.run.outputBytes ?? 0);
		written += 1024
	) {
		process.stdout.write(chunk);
	}
	const runDir =
		plan.run.exit === 0 || plan.run.exit === 1 || plan.run.exit === 3
			? writeReport(plan.run)
			: undefined;
	process.stdout.write(
		`Model calls: 0\n${printedRunLine(plan.run, runDir)}Exit code: ${plan.run.exit}\n`,
	);
	process.exitCode = plan.run.exit;
} else if (command === "verify-run") {
	process.stdout.write(
		plan.verifyRun === 0 ? "OK\n" : "modified: artifacts/0.png\n",
	);
	process.exitCode = plan.verifyRun;
} else {
	process.stderr.write(`USAGE: unknown command ${command}\n`);
	process.exitCode = 2;
}
