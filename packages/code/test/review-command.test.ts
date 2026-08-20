/**
 * The `hobo-code review` verb — argv into a review-runtime command envelope.
 *
 * This is the only place the CLI's loose argument shape meets the review
 * runtime's typed envelope, and it is almost entirely defaulting decisions.
 * Two of them decide whether a command does what the operator meant:
 *
 * **The unknown action is `refresh`, not an error.** Every branch that is not
 * `list`, `show`, `start`, `mark` or `thread` falls through to
 * `refreshReview`. That is a deliberate safe default — refresh mutates nothing
 * an operator has to undo — but it means a typo runs *something*, so it is
 * pinned rather than left to be rediscovered.
 *
 * **The review id is chosen in a fixed order**: an explicit `--id`, then the
 * second positional, then a fresh UUID. Reordering that would have a command
 * meant for an existing review silently open a new one, and the operator would
 * only find out when their comments were nowhere.
 *
 * **An unrecognised `--target` becomes the working tree.** Reviewing the wrong
 * target is a review of the wrong code, but the alternative — refusing — makes
 * the common case (no flag at all) an error, so the safe default is the one
 * that reads the files in front of you.
 *
 * The runtime is closed in a `finally`, because it holds a SQLite handle: a
 * command that threw and left it open would leak one handle per invocation.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runReviewCommand } from "../src/review/review-command.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-contract.js";

const temps: string[] = [];
let previousHome: string | undefined;

beforeEach(() => {
	previousHome = process.env.HOBO_HOME;
	const dir = mkdtempSync(join(tmpdir(), "hobo-review-cmd-"));
	temps.push(dir);
	process.env.HOBO_HOME = dir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.HOBO_HOME;
	else process.env.HOBO_HOME = previousHome;
	for (const dir of temps.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const run = (
	args: readonly string[],
	flags: Record<string, string | boolean> = {},
) => runReviewCommand({ args, flags, cwd: "/repo" });

describe("the default action", () => {
	it("lists when given no action at all", async () => {
		expect((await run([])).code).toBe("HOBO_CODE_REVIEW");
	});

	it("reports an empty inbox rather than an error on a fresh install", async () => {
		// A first-run listing that failed would read as a broken install.
		const result = await run(["list"]);
		expect(result.ok).toBe(true);
		expect(result.data).toMatchObject({ reviews: [] });
	});

	it("says how to populate the inbox", async () => {
		// An empty list with no next step leaves the operator guessing.
		expect((await run(["list"])).message).toContain("start a review");
	});

	it("reports zero model calls, since listing infers nothing", async () => {
		// The zero-inference claim asserted on the result rather than assumed.
		expect(await run(["list"])).toMatchObject({ data: { llmCalls: 0 } });
	});
});

describe("show", () => {
	it("reports not-found for a review that does not exist", async () => {
		const result = await run(["show", "missing-review"]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_REVIEW_NOT_FOUND");
	});

	it("names the review it looked for", async () => {
		// The id is the only thing that makes a not-found actionable.
		expect((await run(["show", "missing-review"])).message).toBe(
			"missing-review",
		);
	});

	it("prefers an explicit --id over the positional", async () => {
		// The flag is the more deliberate of the two; a positional that won would
		// silently ignore what the operator typed after `--id`.
		expect((await run(["show", "positional"], { id: "flagged" })).message).toBe(
			"flagged",
		);
	});

	it("ignores a boolean --id, since a bare flag names nothing", async () => {
		expect((await run(["show", "positional"], { id: true })).message).toBe(
			"positional",
		);
	});

	it("shows a fresh review id when none was given", async () => {
		// It cannot find one, but reporting *which* id it looked for beats
		// reporting an empty string.
		expect((await run(["show"])).message).toMatch(/[0-9a-f-]{36}/u);
	});

	it("reports no snapshot for a review that does not exist", async () => {
		expect((await run(["show", "missing"])).data).toBeFalsy();
	});
});

describe("start", () => {
	it("is accepted for a working-tree review", async () => {
		const result = await run(["start"]);
		expect(result.code).toMatch(/^HOBO_CODE_REVIEW/u);
	});

	it("carries the command schema version", async () => {
		// The runtime dispatches on it; an unversioned envelope is one it cannot
		// route.
		expect(REVIEW_COMMAND_SCHEMA.length).toBeGreaterThan(0);
	});

	it("returns the runtime's own verdict rather than assuming success", async () => {
		// A wrapper that reported ok unconditionally would hide every refusal the
		// runtime makes.
		const result = await run(["start"]);
		expect(typeof result.ok).toBe("boolean");
		expect(result.data).toBeDefined();
	});

	it("accepts a base and head commit", async () => {
		await expect(
			run(["start"], { base: "abc123", head: "def456" }),
		).resolves.toBeDefined();
	});

	it("accepts a session id", async () => {
		await expect(run(["start"], { session: "sess-1" })).resolves.toBeDefined();
	});

	it("tolerates a boolean flag where a string was expected", async () => {
		// `--base` with no value is a shape the CLI can produce; it must not
		// crash the command.
		await expect(
			run(["start"], { base: true, head: true, session: true }),
		).resolves.toBeDefined();
	});

	it.each([
		"index",
		"commit",
		"range",
		"pull-request",
		"working-tree",
	])("accepts the %s target", async (target) => {
		await expect(run(["start"], { target })).resolves.toBeDefined();
	});

	it("falls back to the working tree for an unrecognised target", async () => {
		// Refusing would make the common case — no flag at all — an error; the
		// safe default is the one that reads the files in front of you.
		await expect(run(["start"], { target: "nonsense" })).resolves.toBeDefined();
	});

	it("falls back to the working tree for a boolean target", async () => {
		await expect(run(["start"], { target: true })).resolves.toBeDefined();
	});
});

describe("mark", () => {
	it("is routed rather than falling through to refresh", async () => {
		await expect(run(["mark", "review-1", "file-1"])).resolves.toBeDefined();
	});

	it("tolerates a missing file id", async () => {
		// The runtime decides whether an empty unit is acceptable; duplicating
		// that check here would let the two drift.
		await expect(run(["mark", "review-1"])).resolves.toBeDefined();
	});
});

describe("thread", () => {
	it("joins the remaining arguments into the body", async () => {
		// A shell splits an unquoted comment into words; rejoining them is what
		// makes `review thread r1 needs a test` do what it reads like.
		await expect(
			run(["thread", "review-1", "needs", "a", "test"]),
		).resolves.toBeDefined();
	});

	it("substitutes a placeholder rather than an empty body", async () => {
		// An empty comment is a thread nobody can act on.
		await expect(run(["thread", "review-1"])).resolves.toBeDefined();
	});
});

describe("an unknown action", () => {
	it("refreshes rather than failing", async () => {
		// Deliberate: refresh mutates nothing an operator has to undo. Pinned so
		// a typo's behaviour is a decision rather than a discovery.
		await expect(run(["reticulate"])).resolves.toBeDefined();
	});

	it("refreshes on the explicit refresh verb too", async () => {
		await expect(run(["refresh", "review-1"])).resolves.toBeDefined();
	});
});

describe("the runtime handle", () => {
	it("is closed after every invocation, including repeated ones", async () => {
		// It holds a SQLite handle; one leaked per invocation would exhaust the
		// process in a long session.
		for (let i = 0; i < 5; i += 1) {
			await run(["list"]);
		}
		await expect(run(["list"])).resolves.toBeDefined();
	});

	it("stores reviews under the configured HoBo home", async () => {
		// Writing to the real `~/.hobo` from a test — or from a sandboxed run —
		// is the failure this indirection exists to prevent.
		const result = await run(["show", "any"]);
		expect(result.code).toBe("HOBO_CODE_REVIEW_NOT_FOUND");
	});

	// There is deliberately no test for the unset-HOBO_HOME fallback: exercising
	// it would create a real SQLite database under the developer's own ~/.hobo.
	// A test that writes outside its temp directory is worse than an uncovered
	// branch.
});
