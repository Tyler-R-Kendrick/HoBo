/**
 * What the release gate does with an ai-bdd that hangs, prints without
 * end, or cannot be spawned (ADR-0172): HOBO_AI_BDD_TIMEOUT_MS bounds each
 * call, output is relayed but never held whole, and a command Node refuses
 * is not run. Through real processes, with test/helpers/fake-ai-bdd.mts as
 * HOBO_AI_BDD_CMD.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { checkAcceptance } from "../src/acceptance-check.js";
import {
	ALL_PASS,
	checkOf,
	FAKE_COMMAND,
	gone,
	newDir,
	PASSED,
	removeTempDirs,
	runGate,
	TIMEOUT,
} from "./helpers/release-gate.js";

afterEach(removeTempDirs);

describe("the release gate bounds ai-bdd", () => {
	it(
		"a hung ai-bdd is killed with its process group at HOBO_AI_BDD_TIMEOUT_MS, and the check is not run",
		async () => {
			const pidFile = join(newDir(), "child.pid");
			const sleepMs = 40_000;
			const started = Date.now();
			const run = await runGate(
				{
					...ALL_PASS,
					run: { exit: 0, report: PASSED, sleepMs, pidFile },
				},
				FAKE_COMMAND,
				newDir(),
				{ HOBO_AI_BDD_TIMEOUT_MS: "1500" },
			);
			// Killed at the bound, not ended by the stand-in waking up: a bound that only marked the run would wait the whole sleepMs.
			expect(Date.now() - started).toBeLessThan(sleepMs / 2);
			const replay = checkOf(run, "acceptance-replay");
			expect(replay).toMatchObject({ status: "not_run", exitCode: 3 });
			expect(replay.evidence.reason).toBe(
				"ai-bdd run --frozen --no-agent --reporter json,junit did not finish within 1500 ms (HOBO_AI_BDD_TIMEOUT_MS): its process group was killed",
			);
			expect(run.result.record.status).toBe("not_run");
			// The child it started (a browser, in a real run) went with it.
			const child = Number(readFileSync(pidFile, "utf8"));
			expect(await gone(child)).toBe(true);
		},
		TIMEOUT,
	);

	it.each(["0", "-5", "abc", "1.5", ""])(
		"HOBO_AI_BDD_TIMEOUT_MS=%j is a usage error",
		async (value) => {
			const run = await runGate(ALL_PASS, FAKE_COMMAND, newDir(), {
				HOBO_AI_BDD_TIMEOUT_MS: value,
			});
			const plans = checkOf(run, "acceptance-plans-fresh");
			expect(plans).toMatchObject({ status: "failed", exitCode: 2 });
			expect(plans.evidence.reason).toContain("HOBO_AI_BDD_TIMEOUT_MS");
		},
		TIMEOUT,
	);

	it(
		"a passing replay that prints more than 16 MiB is not killed for its output",
		async () => {
			const run = await runGate({
				...ALL_PASS,
				run: { exit: 0, report: PASSED, outputBytes: 20 * 1024 * 1024 },
			});
			expect(checkOf(run, "acceptance-replay").status).toBe("passed");
			expect(run.result.record.status).toBe("passed");
		},
		TIMEOUT,
	);

	it("a command Node refuses to spawn (as it refuses a .cmd shim on Windows) is not run", async () => {
		const project = newDir();
		// spawn() throws synchronously for an argument it will not pass to the OS.
		const result = await checkAcceptance(
			["plans-fresh"],
			{
				...process.env,
				HOBO_AI_BDD_CMD: JSON.stringify(["ai\u0000bdd"]),
				HOBO_AI_BDD_PROJECT: project,
			},
			project,
		);
		expect(result).toMatchObject({ outcome: "not_run", exitCode: 3 });
		expect(result.evidence.reason).toMatch(
			/^ai-bdd compile --check did not run: /u,
		);
	});
});
