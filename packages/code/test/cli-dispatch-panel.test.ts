/**
 * What the dispatch panel is allowed to claim.
 *
 * `dispatch` records a compute task. It does not run one, and it does not
 * touch the project. The source says so in its own words, and the whole panel
 * is built around not overstating it:
 *
 * > "✓" reads as "your request was carried out" when what happened is that a
 * > compute task was recorded.
 *
 * That is why the plain form leads with **"Recorded a compute task. No agent
 * has run it yet — dispatch queues work, it does not edit your project."** A
 * user who read "done" and went looking for changed files would find none, and
 * would reasonably conclude the tool was broken rather than that they had
 * misread a glyph.
 *
 * Two more decisions follow from it:
 *
 * **Plain is the default; dense is opt-in.** The help promises plain English,
 * and the dense form (`✓ ★ / hello·st`) says nothing about what dispatch did.
 * A glyph-only panel is fine for someone who already knows the model and
 * actively wrong for someone meeting it.
 *
 * **The panel points at where the work actually is.** The task id, the path it
 * was written to, and the next command to run — because a recorded task nobody
 * can find is the same as no task.
 *
 * Identity resolution feeds the same panel: `--pool` names the queue, with
 * `--hive` kept as a legacy alias so an older script does not silently land in
 * the default queue instead of the one it named.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	formatHoboCodeResult,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "../src/cli.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

async function run(
	argv: readonly string[],
	options: { dense?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<HoboCodeCliResult> {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-dispatch-"));
	homes.push(hoboHome);
	return await runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...options.env },
		json: false,
		...(options.dense ? { dense: true } : undefined),
	});
}

const plain = (argv: readonly string[], env?: NodeJS.ProcessEnv) =>
	run(argv, env ? { env } : {}).then((result) => formatHoboCodeResult(result));

const dense = (argv: readonly string[]) =>
	run(argv, { dense: true }).then((result) =>
		formatHoboCodeResult(result, { dense: true }),
	);

const taskOf = (result: HoboCodeCliResult) =>
	// SAFETY: the dispatch payload carries the task it recorded.
	(result.data as { task?: Record<string, unknown> } | undefined)?.task ?? {};

const poolOf = (result: HoboCodeCliResult) =>
	// SAFETY: the dispatch payload carries the pool it queued into.
	(result.data as { pool?: Record<string, unknown> } | undefined)?.pool ?? {};

describe("what the plain panel says happened", () => {
	it("says the task was recorded", async () => {
		expect(await plain(["dispatch", "refactor auth"])).toMatch(/recorded/i);
	});

	it("says no agent has run it yet", async () => {
		// The sentence the whole panel exists for. Without it "✓" reads as
		// "your request was carried out".
		expect(await plain(["dispatch", "refactor auth"])).toMatch(
			/No agent has run it yet/,
		);
	});

	it("says dispatch does not edit the project", async () => {
		// A user who went looking for changed files and found none would
		// conclude the tool was broken rather than that they misread a glyph.
		expect(await plain(["dispatch", "refactor auth"])).toMatch(
			/does not edit your project/,
		);
	});

	it("does not claim the work is done", async () => {
		const text = await plain(["dispatch", "refactor auth"]);
		expect(text).not.toMatch(/\bcompleted\b|\bfinished\b|\bapplied\b/i);
	});

	it("names the task it recorded", async () => {
		// A recorded task nobody can find is the same as no task.
		const result = await run(["dispatch", "refactor auth"]);
		expect(formatHoboCodeResult(result)).toContain(taskOf(result).taskId);
	});

	it("says where the task was written", async () => {
		expect(await plain(["dispatch", "refactor auth"])).toMatch(/at · /);
	});

	it("points at the board to see it", async () => {
		// The next command, not a description of one -- the reader is going to
		// paste it.
		expect(await plain(["dispatch", "refactor auth"])).toMatch(
			/hobo-code tasks/,
		);
	});

	it("points at status for this session", async () => {
		expect(await plain(["dispatch", "refactor auth"])).toMatch(
			/hobo-code status/,
		);
	});
});

describe("plain is the default", () => {
	it("uses plain English with no dense flag", async () => {
		// The help promises this. A glyph-only panel is fine for someone who
		// already knows the model and actively wrong for someone meeting it.
		expect(await plain(["dispatch", "refactor auth"])).toMatch(/compute task/);
	});

	it("uses the dense form when asked", async () => {
		// Shorter than the plain sentence by a wide margin -- that is the whole
		// point of the mode.
		const [plainText, denseText] = await Promise.all([
			plain(["dispatch", "refactor auth"]),
			dense(["dispatch", "refactor auth"]),
		]);
		expect(denseText.length).toBeLessThan(plainText.length);
	});

	it("keeps the same result code in either form", async () => {
		// The rendering changes; the outcome does not. A code that shifted
		// would make a script's behaviour depend on a display preference.
		const [plainResult, denseResult] = await Promise.all([
			run(["dispatch", "refactor auth"]),
			run(["dispatch", "refactor auth"], { dense: true }),
		]);
		expect(denseResult.code).toBe(plainResult.code);
	});

	it("records a task in either form", async () => {
		const result = await run(["dispatch", "refactor auth"], { dense: true });
		expect(String(taskOf(result).taskId ?? "")).toMatch(/^task-/);
	});

	it("still carries the full task id in the data even when dense", async () => {
		// The dense panel shortens the id for scanning; the payload must not,
		// or a script reading it cannot address the task.
		const result = await run(["dispatch", "refactor auth"], { dense: true });
		expect(String(taskOf(result).taskId ?? "").length).toBeGreaterThan(10);
	});
});

describe("the recorded task itself", () => {
	it("keeps the prompt it was given", async () => {
		// The task is what an agent will later read; a truncated prompt would
		// have it do a different job.
		const result = await run(["dispatch", "refactor the auth module please"]);
		expect(taskOf(result).prompt).toBe("refactor the auth module please");
	});

	it("keeps a long prompt whole in the payload", async () => {
		// The panel shortens for display. The record must not.
		const long = "a".repeat(400);
		const result = await run(["dispatch", long]);
		expect(taskOf(result).prompt).toBe(long);
	});

	it("joins multi-word argv into one prompt", async () => {
		const result = await run(["dispatch", "refactor", "the", "auth"]);
		expect(taskOf(result).prompt).toBe("refactor the auth");
	});

	it("stamps a schema version", async () => {
		// The task is written to disk and read back by another process; an
		// unversioned record cannot be migrated.
		expect(String(taskOf(await run(["dispatch", "x"])).schemaVersion)).toMatch(
			/compute\.task/,
		);
	});

	it("records when it was created", async () => {
		expect(taskOf(await run(["dispatch", "x"])).createdAt).toBeTypeOf("string");
	});

	it("names a handback path for the result to land in", async () => {
		// Where the agent will write back. Without it the task has no return
		// address.
		expect(taskOf(await run(["dispatch", "x"])).handbackPath).toBeTypeOf(
			"string",
		);
	});

	it("gives every dispatch its own task id", async () => {
		// Two dispatches sharing an id would have the second overwrite the
		// first's handback.
		const [first, second] = await Promise.all([
			run(["dispatch", "one"]),
			run(["dispatch", "two"]),
		]);
		expect(taskOf(first).taskId).not.toBe(taskOf(second).taskId);
	});
});

describe("choosing the queue", () => {
	it("uses the default pool when none is named", async () => {
		expect(poolOf(await run(["dispatch", "x"])).poolId ?? "default").toBe(
			"default",
		);
	});

	it("takes the pool from the flag", async () => {
		const result = await run(["dispatch", "x", "--pool", "hive-a"]);
		expect(JSON.stringify(result.data)).toContain("hive-a");
	});

	it("accepts the legacy hive alias", async () => {
		// An older script naming `--hive` must not silently land in the default
		// queue instead of the one it asked for.
		const result = await run(["dispatch", "x", "--hive", "hive-b"]);
		expect(JSON.stringify(result.data)).toContain("hive-b");
	});

	it("prefers the current flag over the legacy alias", async () => {
		// Both given is a script mid-migration. The current name wins, so the
		// migration is what takes effect rather than the thing being migrated
		// away from.
		const result = await run([
			"dispatch",
			"x",
			"--pool",
			"current",
			"--hive",
			"legacy",
		]);
		expect(JSON.stringify(result.data)).toContain("current");
	});

	it("shows a named pool in the plain panel", async () => {
		// Which queue the work went to is the difference between "nobody has
		// picked it up" and "it is in a queue nobody is watching".
		expect(await plain(["dispatch", "x", "--pool", "hive-a"])).toContain(
			"hive-a",
		);
	});

	it("omits the pool row for the default queue", async () => {
		// Noise on the happy path. Every dispatch is in `default` unless said
		// otherwise, so saying it every time carries no information.
		expect(await plain(["dispatch", "x"])).not.toMatch(/pool · default/);
	});

	it("does not show a named pool in the dense panel", async () => {
		// Recorded as observed, and worth flagging rather than only recording.
		// The dense renderer collapses a successful local dispatch to a single
		// row -- `input.status === "done" && omitNode ? [taskRow] : [...]` --
		// and the pool row is inside the branch that collapse skips. So a
		// dense user who passed `--pool hive-a` is shown nothing about which
		// queue the work went to, even though the plain panel deliberately
		// includes it for the same run.
		//
		// The information is still in `--json`, so nothing is lost that cannot
		// be recovered; but "which queue" is the difference between "nobody has
		// picked it up yet" and "it is in a queue nobody is watching", and the
		// collapse drops it precisely when the user asked for a non-default
		// one.
		expect(await dense(["dispatch", "x", "--pool", "hive-a"])).not.toContain(
			"hive-a",
		);
	});

	it("keeps the named pool in the dense payload even so", async () => {
		// The renderer drops it; the data must not, or the information is gone
		// rather than merely unshown.
		const result = await run(["dispatch", "x", "--pool", "hive-a"], {
			dense: true,
		});
		expect(JSON.stringify(result.data)).toContain("hive-a");
	});

	it("omits the default pool from the dense panel", async () => {
		expect(await dense(["dispatch", "x"])).not.toMatch(/pool · default/);
	});
});

describe("the bare-prompt shorthand", () => {
	it("records the same task as the explicit verb", async () => {
		const [bare, explicit] = await Promise.all([
			run(["refactor the auth module"]),
			run(["dispatch", "refactor the auth module"]),
		]);
		expect(taskOf(bare).prompt).toBe(taskOf(explicit).prompt);
	});

	it("answers with the same code", async () => {
		const [bare, explicit] = await Promise.all([
			run(["refactor the auth module"]),
			run(["dispatch", "refactor the auth module"]),
		]);
		expect(bare.code).toBe(explicit.code);
	});

	it("still says no agent has run it", async () => {
		// The shorthand is where a first-time user lands. If the honesty line
		// only appeared on the explicit verb it would be missing exactly where
		// it is needed.
		expect(await plain(["refactor the auth module"])).toMatch(
			/No agent has run it yet/,
		);
	});

	it("renders in dense mode too", async () => {
		expect((await dense(["refactor the auth module"])).length).toBeGreaterThan(
			0,
		);
	});
});
