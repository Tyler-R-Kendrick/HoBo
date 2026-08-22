/**
 * The dense dispatch panel — the opt-in glyph form.
 *
 * `cli-dispatch-panel.test.ts` covers the plain default and the reason it is
 * the default. This covers the form a user has to ask for, which is built on a
 * different principle: **every glyph that repeats something already on screen
 * is dropped.**
 *
 * That rule is what makes the dense form readable, and it is stated all over
 * the source as pairs of "twins" to omit:
 *
 * - the title glyph already marks done, so the body pipeline is dropped there;
 * - `◆empty` already says the prompt was empty, so the echoed prompt is
 *   dropped;
 * - the row is labelled `task ·`, so the `task-` prefix is stripped from the
 *   id;
 * - `local · station` is the happy path, so the node row is dropped when a
 *   finished task ran there;
 * - `default` is the default pool, so the pool row only appears otherwise —
 *   though in practice the single-row collapse below gets there first, and a
 *   named pool is dropped too. That is recorded as a finding rather than
 *   changed.
 *
 * The result is that anything still printed is a departure from normal. A
 * dense panel that printed every field would be the same information in less
 * legible form, which is the failure mode this design is avoiding.
 *
 * The status glyphs themselves carry the state: `✓` done, `✕` failed, `●`
 * in flight, with a pipeline trail on the two that are not finished.
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
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-dispatch-dense-"));
	homes.push(hoboHome);
	return await runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...options.env },
		json: false,
		...(options.dense ? { dense: true } : undefined),
	});
}

const dense = (argv: readonly string[]) =>
	run(argv, { dense: true }).then((result) =>
		formatHoboCodeResult(result, { dense: true }),
	);

const taskOf = (result: HoboCodeCliResult) =>
	// SAFETY: the dispatch payload carries the task it recorded.
	(result.data as { task?: Record<string, unknown> } | undefined)?.task ?? {};

describe("choosing between the two forms", () => {
	it("gives plain English without --dense", async () => {
		// The help promises plain by default, and a glyph-only panel is
		// actively wrong for someone meeting the model for the first time.
		const text = formatHoboCodeResult(await run(["dispatch", "refactor auth"]));
		expect(text).toMatch(/Recorded a compute task/);
	});

	it("gives the glyph form with --dense", async () => {
		expect(await dense(["dispatch", "refactor auth"])).not.toMatch(
			/Recorded a compute task/,
		);
	});

	it("still marks the outcome in the dense title", async () => {
		expect(await dense(["dispatch", "refactor auth"])).toMatch(/[✓✕●]/u);
	});

	it("drops the task id from a finished dense panel", async () => {
		// The id is a correlation handle, and a task that finished needs no
		// correlating -- the full id is in the payload for anything that does.
		// In flight or failed it is kept, because then it is how you find the
		// thing again.
		const result = await run(["dispatch", "refactor auth"], { dense: true });
		const id = String(taskOf(result).taskId ?? "");
		expect(id.length).toBeGreaterThan(0);
		expect(formatHoboCodeResult(result, { dense: true })).not.toContain(id);
	});

	it("keeps the full id in the payload", async () => {
		const result = await run(["dispatch", "refactor auth"], { dense: true });
		expect(String(taskOf(result).taskId ?? "")).toMatch(/^task-/u);
	});
});

describe("what the dense panel drops", () => {
	it("strips the task- prefix from the id", async () => {
		// The row is already labelled; repeating the word in the value is the
		// twin this design exists to remove.
		const text = await dense(["dispatch", "refactor auth"]);
		expect(text).not.toContain("task-task");
	});

	it("omits the pool row on the default pool", async () => {
		expect(await dense(["dispatch", "refactor auth"])).not.toContain("pool ·");
	});

	it("collapses a finished local task to a single row", async () => {
		// The strongest form of the rule: when a task is done, on the default
		// pool, on the local station, there is nothing to report but the row
		// itself. Everything else would be a field whose value a reader could
		// have assumed.
		const body = (await dense(["dispatch", "refactor auth"]))
			.split("\n")
			.filter((line) => line.trim().length > 0);
		// title, the one row, the rule
		expect(body).toHaveLength(3);
	});

	it("drops even a named pool once the task has finished locally", async () => {
		// FINDING, pinned rather than changed: the single-row collapse is
		// decided before the pool row is considered, so a task queued into a
		// non-default pool shows no pool anywhere in the dense panel once it
		// reaches done on the local station. The plain form and the payload
		// both still name it. Whether the pool should survive the collapse is
		// a presentation decision, not a test's to make.
		expect(
			await dense(["dispatch", "--pool", "review", "refactor auth"]),
		).not.toContain("review");
	});

	it("still names that pool in the payload", async () => {
		const result = await run(
			["dispatch", "--pool", "review", "refactor auth"],
			{
				dense: true,
			},
		);
		// SAFETY: the dispatch payload carries the pool it queued into.
		expect((result.data as { pool?: { poolId?: string } }).pool?.poolId).toBe(
			"review",
		);
	});

	it("omits the node row for a finished local task", async () => {
		// `local · station` is the happy path; printing it says nothing.
		expect(await dense(["dispatch", "refactor auth"])).not.toContain(
			"node · local · station",
		);
	});

	it("does not print an empty node placeholder either", async () => {
		expect(await dense(["dispatch", "refactor auth"])).not.toContain(
			"node · —",
		);
	});
});

describe("the dense panel's own content", () => {
	it("echoes a short form of the prompt", async () => {
		// Eight characters including the ellipsis -- enough to tell two
		// dispatches apart in a scrollback without the panel becoming a
		// transcript.
		expect(await dense(["dispatch", "refactor auth"])).toContain("refacto…");
	});

	it("truncates a long prompt rather than wrapping the panel", async () => {
		const text = await dense([
			"dispatch",
			"refactor the authentication middleware and its tests",
		]);
		expect(text).toContain("…");
		expect(text).not.toContain("middleware");
	});

	it("keeps a prompt that already fits", async () => {
		expect(await dense(["dispatch", "fix"])).toContain("fix");
	});

	it("points at another command to run next", async () => {
		// A recorded task nobody looks at again is the same as no task.
		expect(await dense(["dispatch", "refactor auth"])).toContain("st");
	});

	it("marks the panel as the dispatch verb", async () => {
		expect(await dense(["dispatch", "refactor auth"])).toMatch(/[✓✕●] d/u);
	});

	it("closes with a rule rather than a box", async () => {
		// The dense panel is a title, its rows, and a rule. A drawn box would
		// spend two columns and two rows on chrome, which is the opposite of
		// what the dense form is for.
		expect((await dense(["dispatch", "refactor auth"])).trimEnd()).toMatch(
			/─+$/u,
		);
	});
});

describe("the pool the task lands in", () => {
	it("queues into the named pool", async () => {
		const result = await run(["dispatch", "--pool", "review", "refactor auth"]);
		// SAFETY: the dispatch payload carries the pool it queued into.
		const pool = (result.data as { pool?: { poolId?: string } }).pool;
		expect(pool?.poolId).toBe("review");
	});

	it("accepts --hive as the legacy spelling", async () => {
		// Kept as an alias so an older script does not silently land in the
		// default queue instead of the one it named.
		const result = await run(["dispatch", "--hive", "review", "refactor auth"]);
		// SAFETY: the dispatch payload carries the pool it queued into.
		const pool = (result.data as { pool?: { poolId?: string } }).pool;
		expect(pool?.poolId).toBe("review");
	});

	it("uses the default pool when none is named", async () => {
		const result = await run(["dispatch", "refactor auth"]);
		// SAFETY: the dispatch payload carries the pool it queued into.
		const pool = (result.data as { pool?: { poolId?: string } }).pool;
		expect(pool?.poolId).toBe("default");
	});
});

describe("the json form", () => {
	it("carries the rendered text alongside the record", async () => {
		// A caller reading JSON should not have to re-render the panel to know
		// what a human was shown.
		const result = await run(["dispatch", "refactor auth"], { dense: true });
		// SAFETY: the dispatch payload carries the text it rendered.
		expect((result.data as { text?: string }).text).toBeTypeOf("string");
	});

	it("says whether the verb was defaulted", async () => {
		const result = await run(["dispatch", "refactor auth"]);
		// SAFETY: the dispatch payload records how the verb was reached.
		expect((result.data as { defaultVerb?: boolean }).defaultVerb).toBe(false);
	});

	it("reports the dispatch code", async () => {
		expect((await run(["dispatch", "refactor auth"])).code).toBe(
			"HOBO_CODE_DISPATCH",
		);
	});

	it("exits zero on a recorded task", async () => {
		expect((await run(["dispatch", "refactor auth"])).exitCode).toBe(0);
	});

	it("describes the distributed compute setting", async () => {
		// The panel cannot explain why a task went where it did; the payload
		// carries the configuration that decided it.
		const result = await run(["dispatch", "refactor auth"]);
		// SAFETY: the dispatch payload carries the distributed-compute view.
		expect(
			(result.data as { distributed?: unknown }).distributed,
		).toBeDefined();
	});
});
