import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	GitWorkbenchBranch as GitWorkbenchBranchMessage,
	GitWorkbenchCommit as GitWorkbenchCommitMessage,
	GitWorkbenchDiff as GitWorkbenchDiffMessage,
	GitWorkbenchFile as GitWorkbenchFileMessage,
	GitWorkbenchSnapshot as GitWorkbenchSnapshotMessage,
	GitWorkbenchStash as GitWorkbenchStashMessage,
	GitWorkbenchTruncation as GitWorkbenchTruncationMessage,
} from "./_generated/code_harness_pb.js";
import type { SessionProcessRunner } from "./session-orchestrator.js";

const MAX_BRANCHES = 50;
const MAX_COMMITS = 100;
const MAX_FILES = 200;
const MAX_STASHES = 20;
const MAX_DIFF_BYTES = 128 * 1_024;

export type GitWorkbenchFile = Readonly<
	Omit<GitWorkbenchFileMessage, "$typeName">
>;
export type GitWorkbenchBranch = Readonly<
	Omit<GitWorkbenchBranchMessage, "$typeName">
>;
export type GitWorkbenchCommit = Readonly<
	Omit<GitWorkbenchCommitMessage, "$typeName">
>;
export type GitWorkbenchStash = Readonly<
	Omit<GitWorkbenchStashMessage, "$typeName">
>;
export type GitWorkbenchDiff = Readonly<
	Omit<GitWorkbenchDiffMessage, "$typeName">
>;

export interface GitSelection {
	readonly kind: "file" | "branch" | "commit" | "stash";
	readonly value: string;
}

export type GitWorkbenchAction =
	| { readonly action: "fetch" }
	| { readonly action: "pull" }
	| { readonly action: "branch-create"; readonly name: string }
	| {
			readonly action: "branch-checkout" | "branch-delete";
			readonly selection: GitSelection;
	  }
	| { readonly action: "stash-create"; readonly message: string }
	| {
			readonly action: "stash-apply" | "stash-pop" | "stash-drop";
			readonly selection: GitSelection;
	  }
	| {
			readonly action: "file-discard" | "file-ignore";
			readonly selection: GitSelection;
	  }
	| {
			readonly action: "commit-revert";
			readonly selection: GitSelection;
	  };

export type GitWorkbenchSnapshot = Readonly<
	Omit<
		GitWorkbenchSnapshotMessage,
		| "$typeName"
		| "files"
		| "branches"
		| "commits"
		| "stashes"
		| "selectedDiff"
		| "truncated"
	> & {
		readonly files: readonly GitWorkbenchFile[];
		readonly branches: readonly GitWorkbenchBranch[];
		readonly commits: readonly GitWorkbenchCommit[];
		readonly stashes: readonly GitWorkbenchStash[];
		readonly selectedDiff?: GitWorkbenchDiff;
		readonly truncated: Readonly<
			Omit<GitWorkbenchTruncationMessage, "$typeName">
		>;
	}
>;

function pathAfter(record: string, fields: number): string {
	let offset = 0;
	for (let field = 0; field < fields; field += 1) {
		offset = record.indexOf(" ", offset) + 1;
		if (offset === 0) return "";
	}
	return record.slice(offset);
}

function parseStatus(
	stdout: string,
): Pick<
	GitWorkbenchSnapshot,
	"branch" | "upstream" | "ahead" | "behind" | "files"
> & { readonly filesTruncated: boolean } {
	let branch: string | undefined;
	let upstream: string | undefined;
	let ahead = 0;
	let behind = 0;
	let filesTruncated = false;
	const files: GitWorkbenchFile[] = [];
	const addFile = (file: GitWorkbenchFile): void => {
		if (files.length < MAX_FILES) files.push(file);
		else filesTruncated = true;
	};
	const records = stdout.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index] ?? "";
		if (record.startsWith("# branch.head ")) {
			const head = record.slice(14);
			branch = head === "(detached)" ? undefined : head;
		} else if (record.startsWith("# branch.upstream ")) {
			upstream = record.slice(18);
		} else if (record.startsWith("# branch.ab ")) {
			const match = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(record);
			if (match) {
				ahead = Number(match[1]);
				behind = Number(match[2]);
			}
		} else if (record.startsWith("? ")) {
			addFile({
				path: record.slice(2),
				staged: false,
				unstaged: false,
				untracked: true,
			});
		} else if (/^[12u] /u.test(record)) {
			const kind = record[0];
			const path = pathAfter(record, kind === "1" ? 8 : kind === "2" ? 9 : 10);
			const file: GitWorkbenchFile = {
				path,
				staged: record[2] !== ".",
				unstaged: record[3] !== ".",
				untracked: false,
				...(kind === "2" ? { previousPath: records[++index] ?? "" } : {}),
			};
			addFile(file);
		}
	}
	return { branch, upstream, ahead, behind, files, filesTruncated };
}

function commandError(command: string, stderr: string): Error {
	const detail = stderr.trim().slice(0, 4_096);
	return new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
}

function rows(stdout: string): string[] {
	return stdout.split("\n").filter(Boolean);
}

function parseBranches(
	stdout: string,
	currentBranch: string | undefined,
): {
	readonly values: GitWorkbenchBranch[];
	readonly truncated: boolean;
} {
	const entries = rows(stdout);
	const visible = entries.slice(0, MAX_BRANCHES);
	if (
		entries.length > MAX_BRANCHES &&
		currentBranch &&
		!visible.some((row) => row.startsWith(`${currentBranch}\0`))
	) {
		const current = entries.find((row) => row.startsWith(`${currentBranch}\0`));
		if (current) visible[MAX_BRANCHES - 1] = current;
	}
	return {
		values: visible.map((row) => {
			const [name = "", oid = "", upstream = "", head = "", subject = ""] =
				row.split("\0");
			return {
				name,
				oid,
				upstream: upstream || undefined,
				current: head === "*",
				subject,
			};
		}),
		truncated: entries.length > MAX_BRANCHES,
	};
}

function parseCommits(stdout: string): {
	readonly values: GitWorkbenchCommit[];
	readonly truncated: boolean;
} {
	const entries = rows(stdout).filter((row) => row.includes("\u001e"));
	return {
		values: entries.slice(0, MAX_COMMITS).map((row) => {
			const marker = row.indexOf("\u001e");
			const [
				oid = "",
				shortOid = "",
				parents = "",
				decorations = "",
				subject = "",
				author = "",
				authoredAt = "",
			] = row.slice(marker + 1).split("\0");
			return {
				oid,
				shortOid,
				parents: parents ? parents.split(" ") : [],
				decorations,
				subject,
				author,
				authoredAt,
				graph: row.slice(0, marker),
			};
		}),
		truncated: entries.length > MAX_COMMITS,
	};
}

function parseStashes(stdout: string): {
	readonly values: GitWorkbenchStash[];
	readonly truncated: boolean;
} {
	const entries = rows(stdout);
	return {
		values: entries.slice(0, MAX_STASHES).map((row) => {
			const [ref = "", oid = "", subject = "", authoredAt = ""] =
				row.split("\0");
			return { ref, oid, subject, authoredAt };
		}),
		truncated: entries.length > MAX_STASHES,
	};
}

function boundedDiff(path: string, text: string): GitWorkbenchDiff {
	const bytes = Buffer.from(text);
	if (bytes.length <= MAX_DIFF_BYTES) return { path, text, truncated: false };
	return {
		path,
		text: bytes
			.subarray(0, MAX_DIFF_BYTES)
			.toString("utf8")
			.replace(/\uFFFD$/u, ""),
		truncated: true,
	};
}

export async function readGitWorkbenchSnapshot(
	repository: string,
	runner: SessionProcessRunner,
	selection?: string | GitSelection,
): Promise<GitWorkbenchSnapshot> {
	const selected =
		typeof selection === "string"
			? ({ kind: "file", value: selection } as const)
			: selection;
	const status = await runner.run(
		"git",
		["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
		repository,
	);
	if (status.code !== 0) throw commandError("git status", status.stderr);
	const { filesTruncated, ...statusSnapshot } = parseStatus(status.stdout);
	const selectedFile =
		selected?.kind !== "file"
			? undefined
			: statusSnapshot.files.find(({ path }) => path === selected.value);
	if (selected?.kind === "file" && !selectedFile)
		throw new Error(
			`selected path is not changed: ${selected.value.slice(0, 512)}`,
		);
	const diffArgs = selectedFile
		? selectedFile.untracked
			? [
					"diff",
					"--no-index",
					"--no-ext-diff",
					"--no-color",
					"--unified=3",
					"--",
					"/dev/null",
					selectedFile.path,
				]
			: [
					"diff",
					"--no-ext-diff",
					"--no-color",
					"--unified=3",
					"HEAD",
					"--",
					selectedFile.path,
				]
		: undefined;
	const [branchResult, commitResult, stashResult, diffResult] =
		await Promise.all([
			runner.run(
				"git",
				[
					"for-each-ref",
					"--sort=-committerdate",
					"--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(HEAD)%00%(subject)",
					"refs/heads/",
				],
				repository,
			),
			runner.run(
				"git",
				[
					"log",
					`--max-count=${MAX_COMMITS + 1}`,
					"--date-order",
					"--decorate=short",
					"--graph",
					"--format=%x1e%H%x00%h%x00%P%x00%D%x00%s%x00%an%x00%aI",
				],
				repository,
			),
			runner.run(
				"git",
				[
					"stash",
					"list",
					`--max-count=${MAX_STASHES + 1}`,
					"--format=%gd%x00%H%x00%gs%x00%aI",
				],
				repository,
			),
			diffArgs ? runner.run("git", diffArgs, repository) : undefined,
		]);
	if (branchResult.code !== 0)
		throw commandError("git for-each-ref", branchResult.stderr);
	if (commitResult.code !== 0)
		throw commandError("git log", commitResult.stderr);
	if (stashResult.code !== 0)
		throw commandError("git stash list", stashResult.stderr);
	if (
		diffResult &&
		diffResult.code !== 0 &&
		!(selectedFile?.untracked && diffResult.code === 1)
	)
		throw commandError("git diff", diffResult.stderr);
	const branches = parseBranches(branchResult.stdout, statusSnapshot.branch);
	const commits = parseCommits(commitResult.stdout);
	const stashes = parseStashes(stashResult.stdout);
	let selectedDiff =
		selectedFile && diffResult
			? boundedDiff(selectedFile.path, diffResult.stdout)
			: undefined;
	if (selected && selected.kind !== "file") {
		const target =
			selected.kind === "branch"
				? branches.values.find(({ name }) => name === selected.value)?.name
				: selected.kind === "commit"
					? commits.values.find(({ oid }) => oid === selected.value)?.oid
					: stashes.values.find(({ ref }) => ref === selected.value)?.ref;
		if (!target) throw new Error(`selected ${selected.kind} is not visible`);
		const preview = await runner.run(
			"git",
			selected.kind === "branch"
				? ["log", "-1", "--stat", "--decorate=short", `refs/heads/${target}`]
				: selected.kind === "commit"
					? ["show", "--stat", "--format=fuller", "--no-ext-diff", target]
					: ["stash", "show", "--stat", "--patch", target],
			repository,
		);
		if (preview.code !== 0)
			throw commandError(`git ${selected.kind} preview`, preview.stderr);
		selectedDiff = boundedDiff(
			`${selected.kind}:${selected.value}`,
			preview.stdout,
		);
	}
	return {
		...statusSnapshot,
		branches: branches.values,
		commits: commits.values,
		stashes: stashes.values,
		truncated: {
			files: filesTruncated,
			branches: branches.truncated,
			commits: commits.truncated,
			stashes: stashes.truncated,
		},
		...(selectedDiff ? { selectedDiff } : {}),
	};
}

function requireSelectionKind(
	selection: GitSelection,
	kind: GitSelection["kind"],
): void {
	if (selection.kind !== kind)
		throw new Error(`${selection.kind} selection cannot run a ${kind} action`);
}

function escapedExcludePath(path: string): string {
	if (path.includes("\n") || path.includes("\r"))
		throw new Error(
			"paths containing newlines cannot be added to Git excludes",
		);
	return `/${path.replaceAll("\\", "\\\\").replace(/[?*[#! ]/gu, "\\$&")}`;
}

export async function runGitWorkbenchAction(
	repository: string,
	runner: SessionProcessRunner,
	request: GitWorkbenchAction,
): Promise<void> {
	let args: readonly string[];
	if (request.action === "fetch") args = ["fetch", "--prune"];
	else if (request.action === "pull") args = ["pull", "--ff-only"];
	else if (request.action === "branch-create") {
		const name = request.name.trim();
		if (!name || name.length > 255) throw new Error("invalid branch name");
		const check = await runner.run(
			"git",
			["check-ref-format", "--branch", name],
			repository,
		);
		if (check.code !== 0)
			throw commandError("git check-ref-format", check.stderr);
		args = ["switch", "-c", name];
	} else if (request.action === "stash-create") {
		const message = request.message.trim();
		if (!message || message.length > 512)
			throw new Error("invalid stash message");
		args = ["stash", "push", "-u", "-m", message];
	} else {
		const snapshot = await readGitWorkbenchSnapshot(
			repository,
			runner,
			request.selection,
		);
		const value = request.selection.value;
		switch (request.action) {
			case "branch-checkout":
			case "branch-delete":
				requireSelectionKind(request.selection, "branch");
				if (request.action === "branch-delete" && snapshot.branch === value)
					throw new Error("cannot delete the current branch");
				args =
					request.action === "branch-checkout"
						? ["switch", "--", value]
						: ["branch", "-d", "--", value];
				break;
			case "stash-apply":
			case "stash-pop":
			case "stash-drop":
				requireSelectionKind(request.selection, "stash");
				args = ["stash", request.action.slice(6), value];
				break;
			case "commit-revert":
				requireSelectionKind(request.selection, "commit");
				args = ["revert", "--no-edit", value];
				break;
			case "file-discard": {
				requireSelectionKind(request.selection, "file");
				const file = snapshot.files.find(({ path }) => path === value);
				if (!file) throw new Error("selected file is no longer changed");
				args = file.untracked
					? ["clean", "-f", "--", value]
					: ["restore", "--source=HEAD", "--staged", "--worktree", "--", value];
				break;
			}
			case "file-ignore": {
				requireSelectionKind(request.selection, "file");
				const file = snapshot.files.find(({ path }) => path === value);
				if (!file?.untracked)
					throw new Error("only untracked files can be ignored");
				const gitPath = await runner.run(
					"git",
					["rev-parse", "--git-path", "info/exclude"],
					repository,
				);
				if (gitPath.code !== 0)
					throw commandError("git rev-parse", gitPath.stderr);
				appendFileSync(
					resolve(repository, gitPath.stdout.trim()),
					`${escapedExcludePath(value)}\n`,
					"utf8",
				);
				return;
			}
		}
	}
	const result = await runner.run("git", args, repository);
	if (result.code !== 0)
		throw commandError(`git ${args[0] ?? "action"}`, result.stderr);
}
