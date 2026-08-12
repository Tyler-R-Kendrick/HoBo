import { spawn } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewError } from "./review-errors.js";

export interface ReviewProcessResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface ReviewProcessRunner {
	run(
		command: string,
		args: readonly string[],
		cwd: string,
		env?: Readonly<Record<string, string>>,
	): Promise<ReviewProcessResult>;
}

export function reviewProcessRunner(): ReviewProcessRunner {
	return {
		run(command, args, cwd, env) {
			return new Promise((done) => {
				const child = spawn(command, [...args], {
					cwd,
					env: env ? { ...process.env, ...env } : process.env,
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stdout = "";
				let stderr = "";
				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (chunk: string) => {
					stdout += chunk;
				});
				child.stderr.on("data", (chunk: string) => {
					stderr += chunk;
				});
				child.once("error", (error) =>
					done({ code: null, stdout, stderr: String(error) }),
				);
				child.once("close", (code) => done({ code, stdout, stderr }));
			});
		},
	};
}

export interface ReviewRepoIdentity {
	readonly toplevel: string;
	readonly gitDir: string;
	readonly headOid: string;
	readonly indexTreeOid: string;
}

export interface SimulatedIndexApply {
	readonly preIndexTreeOid: string;
	readonly postIndexTreeOid: string;
}

export interface ReviewGitCommand {
	readonly command: "git";
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env?: Readonly<Record<string, string>>;
}

export async function readReviewRepoIdentity(
	repositoryRoot: string,
	runner: ReviewProcessRunner = reviewProcessRunner(),
): Promise<ReviewRepoIdentity> {
	const toplevel = await gitText(
		runner,
		["rev-parse", "--path-format=absolute", "--show-toplevel"],
		repositoryRoot,
	);
	const gitDir = await gitText(
		runner,
		["rev-parse", "--path-format=absolute", "--absolute-git-dir"],
		repositoryRoot,
	);
	const headOid = await gitText(runner, ["rev-parse", "HEAD"], repositoryRoot);
	const indexTreeOid = await gitText(runner, ["write-tree"], repositoryRoot);
	return { toplevel, gitDir, headOid, indexTreeOid };
}

export async function readIndexBlob(
	repositoryRoot: string,
	relPath: string,
	runner: ReviewProcessRunner = reviewProcessRunner(),
): Promise<Uint8Array> {
	const listed = await runner.run(
		"git",
		["ls-files", "--stage", "-z", "--", relPath],
		repositoryRoot,
	);
	if (listed.code !== 0 || listed.stdout.length === 0) return new Uint8Array();
	const shown = await runner.run(
		"git",
		["show", `:${relPath}`],
		repositoryRoot,
	);
	if (shown.code !== 0) return new Uint8Array();
	return Buffer.from(shown.stdout, "binary");
}

export async function simulateCachedApply(input: {
	readonly repositoryRoot: string;
	readonly patchText: string;
	readonly reverse?: boolean;
	readonly runner?: ReviewProcessRunner;
}): Promise<SimulatedIndexApply> {
	const runner = input.runner ?? reviewProcessRunner();
	const identity = await readReviewRepoIdentity(input.repositoryRoot, runner);
	return await withTemporaryIndex(
		input.repositoryRoot,
		runner,
		async (indexPath) => {
			const env = gitIndexEnv(indexPath);
			const preIndexTreeOid = await gitText(
				runner,
				["write-tree"],
				input.repositoryRoot,
				env,
			);
			if (preIndexTreeOid !== identity.indexTreeOid)
				throw reviewError(
					"corrupted-state",
					"temporary index does not match the live index tree",
					{ preIndexTreeOid, indexTreeOid: identity.indexTreeOid },
				);
			await applyCachedPatch({
				repositoryRoot: input.repositoryRoot,
				patchText: input.patchText,
				reverse: input.reverse === true,
				runner,
				env,
				checkOnly: true,
			});
			await applyCachedPatch({
				repositoryRoot: input.repositoryRoot,
				patchText: input.patchText,
				reverse: input.reverse === true,
				runner,
				env,
				checkOnly: false,
			});
			const postIndexTreeOid = await gitText(
				runner,
				["write-tree"],
				input.repositoryRoot,
				env,
			);
			return { preIndexTreeOid, postIndexTreeOid };
		},
	);
}

export async function applyCachedPatchToIndexFile(input: {
	readonly repositoryRoot: string;
	readonly indexPath: string;
	readonly patchText: string;
	readonly reverse?: boolean;
	readonly runner?: ReviewProcessRunner;
}): Promise<string> {
	const runner = input.runner ?? reviewProcessRunner();
	const env = gitIndexEnv(input.indexPath);
	await applyCachedPatch({
		repositoryRoot: input.repositoryRoot,
		patchText: input.patchText,
		reverse: input.reverse === true,
		runner,
		env,
		checkOnly: true,
	});
	await applyCachedPatch({
		repositoryRoot: input.repositoryRoot,
		patchText: input.patchText,
		reverse: input.reverse === true,
		runner,
		env,
		checkOnly: false,
	});
	return await gitText(runner, ["write-tree"], input.repositoryRoot, env);
}

export async function withTemporaryIndex<T>(
	repositoryRoot: string,
	runner: ReviewProcessRunner,
	work: (indexPath: string) => Promise<T>,
): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), "hobo-review-index-"));
	const indexPath = join(dir, "index");
	try {
		const liveIndex = await gitText(
			runner,
			["rev-parse", "--path-format=absolute", "--git-path", "index"],
			repositoryRoot,
		);
		if (existsSync(liveIndex)) copyFileSync(liveIndex, indexPath);
		return await work(indexPath);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function gitIndexEnv(
	indexPath: string,
): Readonly<Record<string, string>> {
	return {
		GIT_INDEX_FILE: indexPath,
		GIT_PAGER: "cat",
		GIT_OPTIONAL_LOCKS: "0",
		GIT_TERMINAL_PROMPT: "0",
	};
}

export function cachedApplyArgs(input: {
	readonly checkOnly: boolean;
	readonly reverse: boolean;
	readonly patchPath: string;
}): readonly string[] {
	return [
		"apply",
		"--cached",
		"--whitespace=nowarn",
		...(input.checkOnly ? (["--check"] as const) : []),
		...(input.reverse ? (["--reverse"] as const) : []),
		"--",
		input.patchPath,
	];
}

async function applyCachedPatch(input: {
	readonly repositoryRoot: string;
	readonly patchText: string;
	readonly reverse: boolean;
	readonly runner: ReviewProcessRunner;
	readonly env: Readonly<Record<string, string>>;
	readonly checkOnly: boolean;
}): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), "hobo-review-patch-"));
	const patchPath = join(dir, "change.patch");
	try {
		writeFileSync(patchPath, input.patchText);
		const args = cachedApplyArgs({
			checkOnly: input.checkOnly,
			reverse: input.reverse,
			patchPath,
		});
		const result = await input.runner.run(
			"git",
			args,
			input.repositoryRoot,
			input.env,
		);
		if (result.code !== 0) {
			throw reviewError(
				"patch-conflict",
				input.checkOnly
					? "patch does not apply cleanly to the index"
					: "patch failed while updating the temporary index",
				{ stderr: result.stderr.trim().slice(0, 1_024) },
			);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export async function gitText(
	runner: ReviewProcessRunner,
	args: readonly string[],
	cwd: string,
	env?: Readonly<Record<string, string>>,
): Promise<string> {
	const result = await runner.run("git", args, cwd, env);
	if (result.code !== 0) {
		throw reviewError("corrupted-state", `git ${args[0] ?? "command"} failed`, {
			stderr: result.stderr.trim().slice(0, 1_024),
		});
	}
	return result.stdout.replace(/\n$/u, "");
}
