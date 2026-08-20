/**
 * Staging and unstaging a reviewed file.
 *
 * `applyHunkPatch` is small and almost entirely made of refusals, which is
 * correct for something that runs `git` against a live worktree on behalf of a
 * review UI. Three of them matter:
 *
 * **The path comes from the manifest, never from the request.** The caller
 * names a `fileId`; the path is looked up. A request that could carry its own
 * path would let a review action write outside the files under review.
 *
 * **The looked-up path is still checked.** A manifest is data, and data can be
 * wrong or hostile — so a NUL byte or a `..` segment is refused even though it
 * came from "our own" manifest. Trusting a value because of where it was
 * stored, rather than what it contains, is how traversal bugs survive review.
 *
 * **The tree is written before and after.** Both `write-tree` calls exist to
 * turn a silent index corruption into a reported `PATCH_CONFLICT`; the
 * pre-image one in particular fails *before* anything is staged, so a broken
 * index is reported rather than half-modified.
 *
 * The rename case is why the path resolves `pathAfter` first: staging a rename
 * under its old name stages nothing and reports success.
 */
import { describe, expect, it } from "vitest";

import { REVIEW_ERROR, ReviewError } from "../src/review/review-errors.js";
import { applyHunkPatch } from "../src/review/review-patch.js";
import type { SessionProcessRunner } from "../src/session-orchestrator.js";

type Call = { command: string; args: readonly string[]; cwd: string };

/** A runner that records its calls and answers from a scripted code table. */
function runner(codes: Record<string, { code: number; stderr?: string }> = {}) {
	const calls: Call[] = [];
	const impl: SessionProcessRunner = {
		run: async (command, args, cwd) => {
			calls.push({ command, args, cwd });
			const key = args[0] ?? "";
			const scripted = codes[key];
			return {
				code: scripted?.code ?? 0,
				stdout: "",
				stderr: scripted?.stderr ?? "",
			} as never;
		},
	};
	return { impl, calls };
}

const files = [
	{ fileId: "f1", pathBefore: "src/a.ts", pathAfter: "src/a.ts" },
	{ fileId: "renamed", pathBefore: "src/old.ts", pathAfter: "src/new.ts" },
	{ fileId: "deleted", pathBefore: "src/gone.ts", pathAfter: "" },
] as never;

const apply = (
	impl: SessionProcessRunner,
	overrides: Record<string, unknown> = {},
) =>
	applyHunkPatch(impl, "/repo", {
		fileId: "f1",
		hunkId: "h1",
		unstage: false,
		files,
		...overrides,
	} as never);

describe("applyHunkPatch", () => {
	it("stages the file named by the manifest entry", async () => {
		const { impl, calls } = runner();
		await apply(impl);
		expect(calls.at(-2)?.args).toEqual(["add", "--", "src/a.ts"]);
	});

	it("runs in the working directory it was given", async () => {
		const { impl, calls } = runner();
		await apply(impl);
		expect(calls.every((call) => call.cwd === "/repo")).toBe(true);
	});

	it("brackets the change with a pre- and post-image tree", async () => {
		// Both exist to turn a silent index corruption into a reported conflict.
		const { impl, calls } = runner();
		await apply(impl);
		expect(calls[0]?.args).toEqual(["write-tree"]);
		expect(calls.at(-1)?.args).toEqual(["write-tree"]);
	});

	it("unstages with an explicit source, not a bare restore", async () => {
		// `--source=HEAD` with both `--staged` and `--worktree` is what makes the
		// undo reach the same state the reviewer saw before staging.
		const { impl, calls } = runner();
		await apply(impl, { unstage: true });
		expect(calls.at(-2)?.args).toEqual([
			"restore",
			"--staged",
			"--worktree",
			"--source=HEAD",
			"--",
			"src/a.ts",
		]);
	});

	it("stages a rename under its new name", async () => {
		// Staging it under the old name stages nothing and reports success.
		const { impl, calls } = runner();
		await apply(impl, { fileId: "renamed" });
		expect(calls.at(-2)?.args).toContain("src/new.ts");
	});

	it("falls back to the old path for a deleted file", async () => {
		// A deletion has no path after; the path before is the only name git can
		// be given.
		const { impl, calls } = runner();
		await apply(impl, { fileId: "deleted" });
		expect(calls.at(-2)?.args).toContain("src/gone.ts");
	});

	it("separates the path from the flags with `--`", async () => {
		// Without it a file named `--staged` would be read as an option.
		const { impl, calls } = runner();
		await apply(impl);
		expect(calls.at(-2)?.args).toContain("--");
	});

	it("refuses a file id the manifest does not list", async () => {
		// The path is looked up rather than supplied, so an unknown id is the
		// only way this can be asked to touch something unreviewed.
		const { impl, calls } = runner();
		await expect(apply(impl, { fileId: "nope" })).rejects.toThrow(ReviewError);
		expect(calls).toHaveLength(0);
	});

	it("reports a missing file as not-found", async () => {
		const error = await apply(runner().impl, { fileId: "nope" }).catch(
			(err: unknown) => err as ReviewError,
		);
		expect(error.code).toBe(REVIEW_ERROR.NOT_FOUND);
	});

	it("refuses a traversal segment even though it came from the manifest", async () => {
		// A manifest is data; trusting a value for where it was stored rather
		// than what it contains is how traversal bugs survive review.
		const { impl, calls } = runner();
		await expect(
			apply(impl, {
				fileId: "x",
				files: [{ fileId: "x", pathBefore: "", pathAfter: "../etc/passwd" }],
			}),
		).rejects.toThrow(/unsafe patch path/u);
		expect(calls).toHaveLength(0);
	});

	it("refuses a traversal buried mid-path", async () => {
		await expect(
			apply(runner().impl, {
				fileId: "x",
				files: [{ fileId: "x", pathBefore: "", pathAfter: "src/../../out.ts" }],
			}),
		).rejects.toThrow(/unsafe patch path/u);
	});

	it("refuses a NUL byte in the path", async () => {
		// A NUL truncates the path at the syscall boundary, so the file git
		// touches is not the file that was checked.
		await expect(
			apply(runner().impl, {
				fileId: "x",
				files: [{ fileId: "x", pathBefore: "", pathAfter: "src/a.ts\0.png" }],
			}),
		).rejects.toThrow(/unsafe patch path/u);
	});

	it("reports an unsafe path as malformed rather than not-found", async () => {
		// The distinction matters to the UI: one is a stale manifest, the other
		// is a request that must never be retried.
		const error = await apply(runner().impl, {
			fileId: "x",
			files: [{ fileId: "x", pathBefore: "", pathAfter: "../x" }],
		}).catch((err: unknown) => err as ReviewError);
		expect(error.code).toBe(REVIEW_ERROR.MALFORMED);
	});

	it("allows an ordinary nested path", async () => {
		await expect(
			apply(runner().impl, {
				fileId: "x",
				files: [{ fileId: "x", pathBefore: "", pathAfter: "src/deep/a.ts" }],
			}),
		).resolves.toBeUndefined();
	});

	it("stops before staging when the pre-image tree fails", async () => {
		// Reporting a broken index beats half-modifying it.
		const { impl, calls } = runner({ "write-tree": { code: 128 } });
		await expect(apply(impl)).rejects.toThrow(/preimage write-tree failed/u);
		expect(calls).toHaveLength(1);
	});

	it("reports a staging failure with git's own message", async () => {
		// The reviewer needs git's reason, not a generic one this module made up.
		const { impl } = runner({
			add: { code: 1, stderr: "fatal: pathspec did not match" },
		});
		await expect(apply(impl)).rejects.toThrow(/pathspec did not match/u);
	});

	it("falls back to a generic message when git said nothing", async () => {
		const { impl } = runner({ add: { code: 1, stderr: "" } });
		await expect(apply(impl)).rejects.toThrow(/patch apply failed/u);
	});

	it("reports a post-image tree failure", async () => {
		// The change is applied by this point, so the conflict is real state the
		// caller has to reconcile — silence here would hide it.
		let seen = 0;
		const impl: SessionProcessRunner = {
			run: async (_command, args) => {
				const isTree = args[0] === "write-tree";
				if (isTree) seen += 1;
				return {
					code: isTree && seen === 2 ? 128 : 0,
					stdout: "",
					stderr: "",
				} as never;
			},
		};
		await expect(apply(impl)).rejects.toThrow(/postimage write-tree failed/u);
	});

	it.each([
		"add",
		"restore",
	])("reports a %s failure as a patch conflict", async (verb) => {
		const { impl } = runner({ [verb]: { code: 1 } });
		const error = await apply(impl, {
			unstage: verb === "restore",
		}).catch((err: unknown) => err as ReviewError);
		expect(error.code).toBe(REVIEW_ERROR.PATCH_CONFLICT);
	});

	it("resolves with nothing on success", async () => {
		// It is an effect, not a query; returning a status would invite a caller
		// to branch on it instead of on the thrown error.
		await expect(apply(runner().impl)).resolves.toBeUndefined();
	});
});
