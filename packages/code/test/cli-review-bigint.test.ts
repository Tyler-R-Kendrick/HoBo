/**
 * `hobo-code review start` used to crash with a stack trace.
 *
 * The review runtime returns a result carrying a revision, and revisions are
 * bigints. `runReviewCommand` hands that result to `cloneAsJson` on the way
 * out to the CLI payload, and `JSON.stringify` throws a bare
 * `TypeError: Do not know how to serialize a BigInt` on a bigint — so the verb
 * died with an unhandled exception rather than answering.
 *
 * That is the single worst failure mode this CLI has. Every other verb refuses
 * with a code and a remediation line; a stack trace reads as a broken install
 * rather than as anything the user did, and there is nothing in it to act on.
 * `cli-verb-sweep.test.ts` states the rule the rest of the surface already
 * keeps — "a verb answers rather than throwing" — and this is the one place it
 * was not kept.
 *
 * The fix is in `cloneAsJson`, not here: bigints serialize as strings, which
 * is the same replacer three call sites (`session-orchestrator` twice,
 * `session-control-server` once) already carried inline. A default that three
 * places work around is a missing default.
 *
 * A string rather than a `Number` cast on purpose — revisions and sequence
 * numbers are compared for equality and round-tripped, never arithmetic'd, and
 * `Number` silently loses precision above 2^53.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHoboCodeCli } from "../src/cli.js";
import { cloneAsJson } from "../src/json.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

async function run(argv: readonly string[]) {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-review-"));
	homes.push(hoboHome);
	return await runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
		json: false,
	});
}

describe("starting a review", () => {
	it("answers rather than throwing", async () => {
		// The regression this file exists for. Before the cloneAsJson fix this
		// threw TypeError out of the CLI entirely.
		await expect(run(["review", "start"])).resolves.toBeDefined();
	});

	it("carries a machine-readable code like every other verb", async () => {
		expect((await run(["review", "start"])).code).toMatch(/^HOBO_CODE_/);
	});

	it("says something a reader can act on", async () => {
		expect((await run(["review", "start"])).message.length).toBeGreaterThan(0);
	});

	it("reports an exit status that agrees with its own ok flag", async () => {
		const result = await run(["review", "start"]);
		expect(result.exitCode === 0).toBe(result.ok);
	});
});

describe("cloning a value that carries a bigint", () => {
	it("does not throw on a bare bigint", () => {
		expect(() => cloneAsJson(1n)).not.toThrow();
	});

	it("renders a bigint as a string", () => {
		// Not a number: `Number` silently loses precision above 2^53, and these
		// are revisions and sequence numbers -- compared for equality and
		// round-tripped, never arithmetic'd.
		expect(cloneAsJson(1n)).toBe("1");
	});

	it("renders a bigint nested in an object", () => {
		// The realistic shape: a domain result with one bigint field among
		// ordinary ones. Before the fix, that one field took the whole payload
		// down.
		expect(cloneAsJson({ revision: 42n, name: "x" })).toStrictEqual({
			revision: "42",
			name: "x",
		});
	});

	it("renders a bigint nested in an array", () => {
		expect(cloneAsJson([1n, 2n])).toStrictEqual(["1", "2"]);
	});

	it("renders a bigint nested several levels down", () => {
		// The replacer has to be a replacer rather than a top-level check --
		// a guard that only looked at the root would miss every realistic case.
		expect(cloneAsJson({ a: { b: [{ c: 7n }] } })).toStrictEqual({
			a: { b: [{ c: "7" }] },
		});
	});

	it("keeps a bigint's full precision", () => {
		// The reason for a string rather than a Number cast, stated as a test.
		const big = 9_007_199_254_740_993n;
		expect(cloneAsJson({ seq: big })).toStrictEqual({
			seq: "9007199254740993",
		});
	});

	it("leaves ordinary numbers as numbers", () => {
		// The fix must not turn every number into a string on its way past.
		expect(cloneAsJson({ count: 3 })).toStrictEqual({ count: 3 });
	});

	it("leaves strings, booleans and null alone", () => {
		expect(cloneAsJson({ s: "x", b: true, n: null })).toStrictEqual({
			s: "x",
			b: true,
			n: null,
		});
	});

	it("still maps undefined to null", () => {
		// Pre-existing behaviour the fix had to preserve: `undefined` is not a
		// JSON value, and the boundary picks null over dropping the field.
		expect(cloneAsJson(undefined)).toBeNull();
	});

	it("still drops an undefined property, as JSON does", () => {
		expect(cloneAsJson({ a: 1, b: undefined })).toStrictEqual({ a: 1 });
	});

	it("clones rather than aliasing", () => {
		// It is a document boundary: the caller must not be able to mutate the
		// original through the returned value.
		const source = { nested: { value: 1 } };
		const cloned = cloneAsJson(source) as { nested: { value: number } };
		cloned.nested.value = 2;
		expect(source.nested.value).toBe(1);
	});
});
