// A stand-in `ai-bdd` for the release-gate tests: the process boundary of
// contracts/pacts/stage-gate-ai-bdd-report.pact.json, played back from a plan.
// It answers the three commands the gate runs with the exit codes and files
// the real CLI documents (docs/cli.md of ai-bdd, "Exit codes of a gate"):
// `run` writes .ai-bdd/report/report.json and .ai-bdd/runs/<runId>/report.json
// on exit 0, 1 and 3, and nothing on 2 or 4. Every call is appended to
// FAKE_AI_BDD_LOG so a test can tell which commands were never started.
//
// Like a real run, each report it writes gets a run id of its own and starts
// now (`startedAt` overrides the start, for a report older than its run); the
// report goes to join(dirname(runsDir), "report"), as ai-bdd writes it.
//
// FAKE_AI_BDD (JSON): { compileCheck: <exit>, run: { exit, report?: <file>,
// runCopy?: "same" | "different" | "none", startedAt?: <ISO>, runsDir?: <dir> },
// verifyRun: <exit> }

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

function writeReport(run: RunPlan): void {
	if (run.report === undefined) return;
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
	if (run.runCopy === "none") return;
	writeFileSync(
		join(runDir, "report.json"),
		run.runCopy === "different"
			? Buffer.concat([bytes, Buffer.from(" ")])
			: bytes,
	);
}

if (command === "compile" && rest[0] === "--check") {
	if (plan.compileCheck === 4) {
		process.stdout.write(
			"PLAN_STALE docs/release-notes.md: the plan does not describe the doc\nExit code: 4\n",
		);
	}
	process.exitCode = plan.compileCheck;
} else if (command === "run") {
	if (plan.run.exit === 0 || plan.run.exit === 1 || plan.run.exit === 3) {
		writeReport(plan.run);
	}
	process.stdout.write(`Model calls: 0\nExit code: ${plan.run.exit}\n`);
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
