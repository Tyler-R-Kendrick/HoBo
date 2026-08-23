/**
 * Reading git's own machine output into the workbench snapshot.
 *
 * Everything the workbench shows — which files changed, which are staged,
 * which branch is current, how far ahead of upstream — is parsed out of
 * porcelain v2 and a handful of `--format` strings. The parsing is where the
 * failures are quiet, and two of them are load-bearing:
 *
 * **A rename record spans two NUL fields.** Porcelain v2 writes a `2 ` record
 * followed by the *previous* path as its own field. A parser that treated
 * that second field as another file entry would invent a change to a path
 * that no longer exists — and the workbench would offer to stage it. So the
 * rename case deliberately consumes the following record.
 *
 * **Staged and unstaged are two independent flags, read from two columns.**
 * `git` reports `XY` where either half may be `.`. Collapsing them would make
 * a file that is staged *and* further modified look like one or the other,
 * and the workbench's whole job is telling those apart.
 *
 * Beyond that: a detached HEAD has no branch name (reporting the literal
 * "(detached)" as a branch would send a later command to a ref that does not
 * exist), every list is bounded with the truncation reported rather than
 * silently dropped, and the current branch is kept in view even when it sorts
 * past the cap — a branch list that omits the branch you are on is worse than
 * a shorter one.
 *
 * `readGitWorkbenchSnapshot` takes its process runner as a parameter, so all
 * of this runs against recorded git output with no repository involved.
 */
import { describe, expect, it } from "vitest";

import {
	type GitWorkbenchSnapshot,
	readGitWorkbenchSnapshot,
} from "../src/git-workbench.js";
import type { SessionProcessRunner } from "../src/session-orchestrator.js";

const NUL = "\0";
const RS = "";

interface GitOutput {
	readonly status?: string;
	readonly branches?: string;
	readonly commits?: string;
	readonly stashes?: string;
	readonly diff?: string;
	readonly statusCode?: number;
	readonly statusStderr?: string;
}

/** A runner that replays recorded output for each git subcommand. */
function recorded(output: GitOutput): SessionProcessRunner {
	return {
		async run(_command, args) {
			const ok = (stdout: string) => ({ code: 0, stdout, stderr: "" });
			if (args[0] === "status")
				return {
					code: output.statusCode ?? 0,
					stdout: output.status ?? "",
					stderr: output.statusStderr ?? "",
				};
			if (args[0] === "for-each-ref") return ok(output.branches ?? "");
			if (args[0] === "log") return ok(output.commits ?? "");
			if (args[0] === "stash") return ok(output.stashes ?? "");
			if (args[0] === "diff") return ok(output.diff ?? "");
			return ok("");
		},
	};
}

const snapshot = (
	output: GitOutput,
	selection?: string,
): Promise<GitWorkbenchSnapshot> =>
	readGitWorkbenchSnapshot("/repo", recorded(output), selection);

/** Porcelain v2 records joined the way git writes them. */
const status = (...records: readonly string[]) => records.join(NUL);

/** A `1 ` (ordinary change) record with the given XY columns and path. */
const ordinary = (xy: string, path: string) =>
	`1 ${xy} N... 100644 100644 100644 aaaa bbbb ${path}`;

describe("the branch line", () => {
	it("reports the branch it is on", async () => {
		expect(
			(await snapshot({ status: status("# branch.head main") })).branch,
		).toBe("main");
	});

	it("reports no branch at all on a detached HEAD", async () => {
		// git writes the literal "(detached)" here. Passing that through as a
		// branch name would send a later checkout or push at a ref that does
		// not exist.
		expect(
			(await snapshot({ status: status("# branch.head (detached)") })).branch,
		).toBeUndefined();
	});

	it("reports the upstream it tracks", async () => {
		expect(
			(
				await snapshot({
					status: status("# branch.head main", "# branch.upstream origin/main"),
				})
			).upstream,
		).toBe("origin/main");
	});

	it("leaves upstream unset for a branch that tracks nothing", async () => {
		// "no upstream" and "upstream is empty" are different states; a blank
		// string would render as a tracking branch with no name.
		expect(
			(await snapshot({ status: status("# branch.head main") })).upstream,
		).toBeUndefined();
	});

	it("reads how far ahead the branch is", async () => {
		expect(
			(
				await snapshot({
					status: status("# branch.head main", "# branch.ab +3 -0"),
				})
			).ahead,
		).toBe(3);
	});

	it("reads how far behind the branch is", async () => {
		expect(
			(
				await snapshot({
					status: status("# branch.head main", "# branch.ab +0 -7"),
				})
			).behind,
		).toBe(7);
	});

	it("reads both directions of a diverged branch", async () => {
		// Diverged is the state that actually needs the number; ahead-or-behind
		// alone cannot describe it.
		const result = await snapshot({
			status: status("# branch.head main", "# branch.ab +2 -5"),
		});
		expect([result.ahead, result.behind]).toStrictEqual([2, 5]);
	});

	it("treats a malformed ab line as zero rather than NaN", async () => {
		// NaN propagates into the rendered count and shows up as "NaN commits
		// ahead", which tells the reader nothing about what went wrong.
		const result = await snapshot({
			status: status("# branch.head main", "# branch.ab garbage"),
		});
		expect([result.ahead, result.behind]).toStrictEqual([0, 0]);
	});

	it("defaults to zero ahead and behind with no ab line", async () => {
		const result = await snapshot({ status: status("# branch.head main") });
		expect([result.ahead, result.behind]).toStrictEqual([0, 0]);
	});
});

describe("the changed files", () => {
	const filesFor = async (...records: readonly string[]) =>
		(await snapshot({ status: status("# branch.head main", ...records) }))
			.files;

	it("lists an untracked file", async () => {
		expect(await filesFor("? new.txt")).toStrictEqual([
			{ path: "new.txt", staged: false, unstaged: false, untracked: true },
		]);
	});

	it("marks a staged-only change as staged and not unstaged", async () => {
		// `M.` — staged, nothing further in the worktree.
		expect((await filesFor(ordinary("M.", "a.txt")))[0]).toMatchObject({
			staged: true,
			unstaged: false,
		});
	});

	it("marks an unstaged-only change as unstaged and not staged", async () => {
		expect((await filesFor(ordinary(".M", "a.txt")))[0]).toMatchObject({
			staged: false,
			unstaged: true,
		});
	});

	it("marks a file that is both staged and further modified as both", async () => {
		// This is the state the two flags exist for. Collapsing them would hide
		// that committing now lands something other than what the diff shows.
		expect((await filesFor(ordinary("MM", "a.txt")))[0]).toMatchObject({
			staged: true,
			unstaged: true,
		});
	});

	it("reads the path out of an ordinary record", async () => {
		expect((await filesFor(ordinary("M.", "src/deep/a.txt")))[0]?.path).toBe(
			"src/deep/a.txt",
		);
	});

	it("keeps a path containing spaces intact", async () => {
		// Porcelain v2 with -z does not quote; a parser that split on spaces
		// would truncate the name and then act on the wrong file.
		expect((await filesFor(ordinary("M.", "my file.txt")))[0]?.path).toBe(
			"my file.txt",
		);
	});

	it("does not mark a tracked change as untracked", async () => {
		expect((await filesFor(ordinary("M.", "a.txt")))[0]?.untracked).toBe(false);
	});

	it("reads an unmerged record", async () => {
		// A `u ` record is a conflict; omitting it would leave the workbench
		// showing a clean tree in the middle of a merge.
		const files = await filesFor(
			"u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.txt",
		);
		expect(files[0]?.path).toBe("conflict.txt");
	});

	it("lists several files in the order git reported them", async () => {
		const files = await filesFor(
			ordinary("M.", "first.txt"),
			ordinary(".M", "second.txt"),
			"? third.txt",
		);
		expect(files.map((file) => file.path)).toStrictEqual([
			"first.txt",
			"second.txt",
			"third.txt",
		]);
	});

	it("reports a clean tree as no files rather than one empty entry", async () => {
		expect(await filesFor()).toStrictEqual([]);
	});
});

describe("a renamed file", () => {
	// A `2 ` record is followed by the previous path as its own NUL field.
	const rename = `2 R. N... 100644 100644 100644 aaaa bbbb R100 new-name.txt`;

	const renameFiles = async () =>
		(
			await snapshot({
				status: status("# branch.head main", rename, "old-name.txt"),
			})
		).files;

	it("reports the new path as the file", async () => {
		expect((await renameFiles())[0]?.path).toBe("new-name.txt");
	});

	it("carries the previous path alongside it", async () => {
		// Without it the workbench shows a new file and a deletion, which is
		// the same bytes but a much worse diff to read.
		expect((await renameFiles())[0]).toMatchObject({
			previousPath: "old-name.txt",
		});
	});

	it("does not report the previous path as a second changed file", async () => {
		// The failure this consumes-the-next-record behaviour prevents: an
		// invented change to a path that no longer exists, which the workbench
		// would then offer to stage.
		expect(await renameFiles()).toHaveLength(1);
	});

	it("keeps parsing correctly after a rename record", async () => {
		// The index advance has to be right, or every file after a rename is
		// read one field out of step.
		const files = (
			await snapshot({
				status: status(
					"# branch.head main",
					rename,
					"old-name.txt",
					ordinary("M.", "after.txt"),
				),
			})
		).files;
		expect(files.map((file) => file.path)).toStrictEqual([
			"new-name.txt",
			"after.txt",
		]);
	});

	it("does not attach a previous path to an ordinary change", async () => {
		const files = (
			await snapshot({
				status: status("# branch.head main", ordinary("M.", "a.txt")),
			})
		).files;
		expect(files[0]).not.toHaveProperty("previousPath");
	});
});

describe("bounding what the workbench renders", () => {
	it("caps the file list at two hundred", async () => {
		// The list is rendered into a terminal pane; an unbounded one on a
		// generated tree makes the workbench unusable rather than informative.
		const many = Array.from({ length: 260 }, (_unused, index) =>
			ordinary("M.", `file-${index}.txt`),
		);
		const result = await snapshot({
			status: status("# branch.head main", ...many),
		});
		expect(result.files).toHaveLength(200);
	});

	it("says the file list was truncated rather than dropping quietly", async () => {
		// A silently short list reads as "that is all of it", which is the one
		// thing it is not.
		const many = Array.from({ length: 260 }, (_unused, index) =>
			ordinary("M.", `file-${index}.txt`),
		);
		const result = await snapshot({
			status: status("# branch.head main", ...many),
		});
		expect(result.truncated.files).toBe(true);
	});

	it("does not claim truncation for a list that fits", async () => {
		const result = await snapshot({
			status: status("# branch.head main", ordinary("M.", "a.txt")),
		});
		expect(result.truncated.files).toBe(false);
	});

	it("caps the branch list at fifty", async () => {
		const many = Array.from(
			{ length: 60 },
			(_unused, index) => `branch-${index}${NUL}aaaa${NUL}${NUL}${NUL}subject`,
		).join("\n");
		expect((await snapshot({ branches: many })).branches).toHaveLength(50);
	});

	it("keeps the current branch in view even when it sorts past the cap", async () => {
		// A branch list that omits the branch you are on is worse than a
		// shorter one — it reads as "you are not on any of these".
		const rows = Array.from(
			{ length: 60 },
			(_unused, index) => `branch-${index}${NUL}aaaa${NUL}${NUL}${NUL}subject`,
		);
		rows.push(`current-branch${NUL}bbbb${NUL}${NUL}*${NUL}subject`);
		const result = await snapshot({
			status: status("# branch.head current-branch"),
			branches: rows.join("\n"),
		});
		expect(result.branches.map((branch) => branch.name)).toContain(
			"current-branch",
		);
	});

	it("caps the commit list at one hundred", async () => {
		const many = Array.from(
			{ length: 130 },
			(_unused, index) =>
				`*${RS}oid${index}${NUL}short${index}${NUL}${NUL}${NUL}subject${NUL}author${NUL}2026-01-01`,
		).join("\n");
		expect((await snapshot({ commits: many })).commits).toHaveLength(100);
	});
});

describe("reading the branch list", () => {
	const one = (row: string) => snapshot({ branches: row });

	it("reads the name and object id", async () => {
		const branch = (
			await one(`main${NUL}abc1234${NUL}${NUL}${NUL}initial commit`)
		).branches[0];
		expect(branch).toMatchObject({ name: "main", oid: "abc1234" });
	});

	it("reads the upstream when there is one", async () => {
		const branch = (
			await one(`main${NUL}abc1234${NUL}origin/main${NUL}${NUL}subject`)
		).branches[0];
		expect(branch?.upstream).toBe("origin/main");
	});

	it("leaves upstream unset rather than empty for an untracked branch", async () => {
		const branch = (await one(`main${NUL}abc1234${NUL}${NUL}${NUL}subject`))
			.branches[0];
		expect(branch?.upstream).toBeUndefined();
	});

	it("marks the current branch from git's own HEAD column", async () => {
		// Comparing names would go wrong on a detached HEAD; the column is what
		// git itself considers current.
		const branch = (await one(`main${NUL}abc1234${NUL}${NUL}*${NUL}subject`))
			.branches[0];
		expect(branch?.current).toBe(true);
	});

	it("does not mark a non-current branch", async () => {
		const branch = (await one(`other${NUL}abc1234${NUL}${NUL}${NUL}subject`))
			.branches[0];
		expect(branch?.current).toBe(false);
	});

	it("carries the subject so the list says what each branch is", async () => {
		const branch = (
			await one(`main${NUL}abc1234${NUL}${NUL}${NUL}add the thing`)
		).branches[0];
		expect(branch?.subject).toBe("add the thing");
	});

	it("reads no branches from empty output", async () => {
		expect((await snapshot({ branches: "" })).branches).toStrictEqual([]);
	});

	it("skips blank lines rather than producing empty branches", async () => {
		expect(
			(await snapshot({ branches: `\n\nmain${NUL}abc${NUL}${NUL}${NUL}s\n\n` }))
				.branches,
		).toHaveLength(1);
	});
});

describe("reading the commit list", () => {
	const commit = (row: string) => snapshot({ commits: row });

	it("reads the object id and its short form", async () => {
		const entry = (
			await commit(
				`*${RS}abcdef0123${NUL}abcdef0${NUL}${NUL}${NUL}subject${NUL}author${NUL}2026-01-01`,
			)
		).commits[0];
		expect(entry).toMatchObject({ oid: "abcdef0123", shortOid: "abcdef0" });
	});

	it("splits multiple parents into a list", async () => {
		// A merge commit has two; keeping the raw string would make the graph
		// renderer treat it as one long parent id.
		const entry = (
			await commit(
				`*${RS}oid${NUL}short${NUL}p1 p2${NUL}${NUL}subject${NUL}author${NUL}2026-01-01`,
			)
		).commits[0];
		expect(entry?.parents).toStrictEqual(["p1", "p2"]);
	});

	it("reads no parents as an empty list, not a list holding an empty string", async () => {
		// The root commit. A `[""]` here would render as a parent that cannot
		// be looked up.
		const entry = (
			await commit(
				`*${RS}oid${NUL}short${NUL}${NUL}${NUL}subject${NUL}author${NUL}2026-01-01`,
			)
		).commits[0];
		expect(entry?.parents).toStrictEqual([]);
	});

	it("keeps the graph prefix that precedes the record separator", async () => {
		// The ASCII art is what makes the log readable as a shape; it lives
		// before the separator precisely so it survives the field split.
		const entry = (
			await commit(
				`| * ${RS}oid${NUL}short${NUL}${NUL}${NUL}subject${NUL}author${NUL}2026-01-01`,
			)
		).commits[0];
		expect(entry?.graph).toBe("| * ");
	});

	it("carries the subject, author and date", async () => {
		const entry = (
			await commit(
				`*${RS}oid${NUL}short${NUL}${NUL}${NUL}fix the thing${NUL}Ada${NUL}2026-01-01`,
			)
		).commits[0];
		expect(entry).toMatchObject({
			subject: "fix the thing",
			author: "Ada",
			authoredAt: "2026-01-01",
		});
	});

	it("ignores a line carrying no record separator", async () => {
		// `--graph` emits connector-only lines with no commit on them; parsing
		// one would produce a commit with no id.
		expect(
			(await commit(`| \\\n*${RS}oid${NUL}s${NUL}${NUL}${NUL}m${NUL}a${NUL}d`))
				.commits,
		).toHaveLength(1);
	});

	it("reads no commits from empty output", async () => {
		expect((await snapshot({ commits: "" })).commits).toStrictEqual([]);
	});
});

describe("when git itself fails", () => {
	it("refuses rather than reporting a clean tree", async () => {
		// A failed status rendered as "no changes" is the worst possible
		// outcome: the user commits nothing and believes there was nothing.
		await expect(
			snapshot({ statusCode: 128, statusStderr: "not a git repository" }),
		).rejects.toThrow(/git status failed/);
	});

	it("carries git's own message so the reader knows why", async () => {
		await expect(
			snapshot({ statusCode: 128, statusStderr: "not a git repository" }),
		).rejects.toThrow(/not a git repository/);
	});

	it("still names the command when git said nothing on stderr", async () => {
		await expect(snapshot({ statusCode: 1 })).rejects.toThrow(
			/git status failed/,
		);
	});
});

describe("selecting a file to diff", () => {
	it("refuses a path that is not among the changed files", async () => {
		// The selection came from an earlier snapshot; by now the file may have
		// been reverted. Diffing it anyway would show an empty diff that reads
		// as "no changes here" rather than "that file is gone".
		await expect(
			snapshot({ status: status("# branch.head main") }, "gone.txt"),
		).rejects.toThrow(/selected path is not changed/);
	});

	it("names the path it could not find", async () => {
		await expect(
			snapshot({ status: status("# branch.head main") }, "gone.txt"),
		).rejects.toThrow(/gone\.txt/);
	});

	it("accepts a path that is genuinely changed", async () => {
		const result = await snapshot(
			{
				status: status("# branch.head main", ordinary("M.", "a.txt")),
				diff: "diff --git a/a.txt b/a.txt\n",
			},
			"a.txt",
		);
		expect(result.files.map((file) => file.path)).toContain("a.txt");
	});
});
