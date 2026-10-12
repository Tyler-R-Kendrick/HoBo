/**
 * Git pins: a submodule whose pin is its gitlink.
 *
 * The gitlink in the index is the whole pin, so there is no second copy of the
 * commit id to drift. This module initialises a submodule at exactly that
 * commit (shallow, optionally borrowing objects from a local clone), reports
 * whether the checkout still matches, and moves the gitlink on request.
 *
 * Every git call is an argument vector (no shell), paths and refs follow `--`
 * or are screened first, and nothing here ever prompts for a credential.
 *
 * Erasable TypeScript with node builtins only.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { type GitPin, isSafeRef, PinsError } from "./pins.ts";

export interface GitResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

export function git(
	cwd: string,
	args: readonly string[],
	visible = false,
): GitResult {
	const result = spawnSync("git", [...args], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: visible ? ["ignore", "inherit", "inherit"] : "pipe",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
	});
	if (result.error !== undefined) {
		throw new PinsError(
			"GIT_FAILED",
			`cannot run git: ${result.error.message}`,
		);
	}
	return {
		status: result.status ?? 1,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

function must(cwd: string, args: readonly string[], what: string): string {
	const result = git(cwd, args);
	if (result.status !== 0) {
		throw new PinsError(
			"GIT_FAILED",
			`${what} failed: git ${args.join(" ")}\n${result.stderr}`,
		);
	}
	return result.stdout;
}

export function short(commit: string): string {
	return commit.slice(0, 7);
}

const GITLINK = /^160000 ([0-9a-f]{40}) 0\t/u;

/** The commit the index pins `path` at. */
export function gitlinkOf(root: string, path: string): string {
	const line = git(root, ["ls-files", "-s", "--", path]).stdout;
	const commit = GITLINK.exec(line)?.[1];
	if (commit === undefined) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${path} is not a submodule gitlink in this repository's index`,
		);
	}
	return commit;
}

/** HEAD of the submodule's own repository, or null when it is not fetched yet. */
export function headOf(root: string, path: string): string | null {
	if (!existsSync(join(root, path, ".git"))) return null;
	const result = git(join(root, path), ["rev-parse", "--verify", "HEAD"]);
	return result.status === 0 ? result.stdout : null;
}

/** Uncommitted changes to tracked files (untracked build output is ignored). */
export function isDirty(root: string, path: string): boolean {
	return (
		git(join(root, path), ["status", "--porcelain", "--untracked-files=no"])
			.stdout !== ""
	);
}

function isShallow(root: string, path: string): boolean {
	return (
		git(join(root, path), ["rev-parse", "--is-shallow-repository"]).stdout ===
		"true"
	);
}

const MODULES_LINE = /^submodule\.(.+)\.(path|url) (.*)$/u;

/** The url `.gitmodules` records for the submodule at `path`, if any. */
export function modulesUrl(root: string, path: string): string | null {
	const lines = git(root, [
		"config",
		"-f",
		".gitmodules",
		"--get-regexp",
		"^submodule\\.",
	]).stdout;
	const paths = new Map<string, string>();
	const urls = new Map<string, string>();
	for (const line of lines.split("\n")) {
		const match = MODULES_LINE.exec(line);
		const name = match?.[1];
		const value = match?.[3];
		if (name === undefined || value === undefined) continue;
		(match?.[2] === "path" ? paths : urls).set(name, value);
	}
	for (const [name, recorded] of paths) {
		if (recorded === path) return urls.get(name) ?? null;
	}
	return null;
}

/** `https://Host/a/b.git/`, `file:///a/b` and `/a/b` compare by what they name. */
export function sameRepo(left: string, right: string): boolean {
	const normal = (value: string): string => {
		const bare = value
			.replace(/^file:\/\//u, "")
			.replace(/\/+$/u, "")
			.replace(/\.git$/u, "");
		return /^https?:\/\//iu.test(bare) ? bare.toLowerCase() : bare;
	};
	return normal(left) === normal(right);
}

function updateSubmodule(
	root: string,
	pin: GitPin,
	reference: string | undefined,
): void {
	const refArgs = reference === undefined ? [] : ["--reference", reference];
	const update = (depth: boolean) =>
		git(
			root,
			[
				"submodule",
				"update",
				"--init",
				...(depth ? ["--depth", "1"] : []),
				...refArgs,
				"--",
				pin.path,
			],
			true,
		);
	if (update(true).status === 0) return;
	// A server that refuses a fetch of an unadvertised commit leaves a shallow
	// clone of the tip: take the full history, then check out the pin.
	const sub = join(root, pin.path);
	if (existsSync(join(sub, ".git"))) {
		const unshallow = isShallow(root, pin.path) ? ["--unshallow"] : [];
		must(
			sub,
			[
				"fetch",
				"--no-tags",
				...unshallow,
				"origin",
				"+refs/heads/*:refs/remotes/origin/*",
			],
			"full fetch",
		);
	}
	if (update(false).status !== 0) {
		throw new PinsError(
			"GIT_FAILED",
			`git submodule update failed for ${pin.path}, shallow and full`,
		);
	}
}

/** Cone-mode sparse checkout of exactly the pin's paths; false when already so. */
function applySparse(root: string, pin: GitPin): boolean {
	if (pin.sparse === null) return false;
	const sub = join(root, pin.path);
	const current = git(sub, ["sparse-checkout", "list"]);
	const have =
		current.status === 0 ? current.stdout.split("\n").filter(Boolean) : [];
	const want = [...pin.sparse];
	if (have.length === want.length && want.every((path) => have.includes(path)))
		return false;
	must(
		sub,
		["sparse-checkout", "set", "--cone", "--", ...want],
		"sparse-checkout",
	);
	return true;
}

export interface InitResult {
	readonly kind: "initialised" | "updated" | "already pinned";
	readonly head: string;
	readonly shallow: boolean;
	readonly sparseChanged: boolean;
}

/** Make the submodule's HEAD the gitlink, fetching only that commit when it can. */
export function initPin(
	root: string,
	pin: GitPin,
	reference: string | undefined,
): InitResult {
	const want = gitlinkOf(root, pin.path);
	const before = headOf(root, pin.path);
	if (before !== null && before !== want && isDirty(root, pin.path)) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} has uncommitted changes; commit or discard them before moving it to ${short(want)}`,
		);
	}
	if (before !== want) updateSubmodule(root, pin, reference);
	const head = headOf(root, pin.path);
	if (head !== want) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} is at ${head === null ? "nothing" : short(head)} after update; the pin is ${short(want)}`,
		);
	}
	const sparseChanged = applySparse(root, pin);
	const kind =
		before === want
			? "already pinned"
			: before === null
				? "initialised"
				: "updated";
	return { kind, head, shallow: isShallow(root, pin.path), sparseChanged };
}

export interface GitStatus {
	readonly commit: string;
	readonly problems: readonly string[];
	readonly fixes: readonly string[];
	/** Online only: the tip of the pin's branch. */
	readonly tip: string | null;
}

/** Offline: gitlink against HEAD, a clean tree, and .gitmodules against the manifest. */
export function statusPin(
	root: string,
	name: string,
	pin: GitPin,
	online: boolean,
): GitStatus {
	const commit = gitlinkOf(root, pin.path);
	const problems: string[] = [];
	const fixes: string[] = [];
	const recorded = modulesUrl(root, pin.path);
	if (recorded === null) {
		problems.push(`${pin.path} is not registered in .gitmodules`);
	} else if (!sameRepo(recorded, pin.repo)) {
		problems.push(
			`.gitmodules names ${recorded} for ${pin.path}; siblings.json says ${pin.repo}`,
		);
		fixes.push(
			"make .gitmodules and tools/pins/siblings.json name the same repository",
		);
	}
	const head = headOf(root, pin.path);
	if (head === null) {
		problems.push(`${pin.path} is not fetched`);
		fixes.push(`pnpm run pins:fetch ${name}`);
	} else {
		if (head !== commit) {
			problems.push(
				`${pin.path} is at ${short(head)}, the pin is ${short(commit)}`,
			);
			fixes.push(`pnpm run pins:fetch ${name}   (back to the pin)`);
			fixes.push(
				`pnpm run pins:bump ${name} ${short(head)}   (move the pin to what is checked out)`,
			);
		}
		if (isDirty(root, pin.path)) {
			problems.push(`${pin.path} has uncommitted changes to tracked files`);
			fixes.push(`commit them inside ${pin.path}, or discard them`);
		}
	}
	return { commit, problems, fixes, tip: online ? tipOf(root, pin) : null };
}

function tipOf(root: string, pin: GitPin): string {
	const out = must(
		root,
		["ls-remote", pin.repo, `refs/heads/${pin.branch}`],
		"ls-remote",
	);
	const tip = out.split(/\s+/u)[0] ?? "";
	if (!/^[0-9a-f]{40}$/u.test(tip)) {
		throw new PinsError(
			"GIT_FAILED",
			`${pin.repo} has no branch ${pin.branch}`,
		);
	}
	return tip;
}

const HEX_REF = /^[0-9a-f]{4,40}$/iu;

function peel(cwd: string, value: string): string | null {
	const result = git(cwd, [
		"rev-parse",
		"--verify",
		"--quiet",
		"--end-of-options",
		`${value}^{commit}`,
	]);
	return result.status === 0 ? result.stdout : null;
}

function resolveCommit(
	sub: string,
	ref: string,
	reference: string | undefined,
): string {
	if (HEX_REF.test(ref)) {
		const local = peel(sub, ref);
		if (local !== null) return local;
		const borrowed = reference === undefined ? null : peel(reference, ref);
		if (borrowed !== null && reference !== undefined) {
			must(
				sub,
				["fetch", "--depth", "1", "--no-tags", reference, borrowed],
				"fetch from the reference clone",
			);
			return borrowed;
		}
		if (ref.length !== 40) {
			throw new PinsError(
				"GIT_FAILED",
				`cannot resolve ${ref} to a commit: give a full 40-character id, a branch or a tag, or --reference <a local clone that has it>`,
			);
		}
	}
	must(
		sub,
		["fetch", "--depth", "1", "--no-tags", "origin", "--", ref],
		`fetch of ${ref}`,
	);
	const fetched = peel(sub, "FETCH_HEAD");
	if (fetched === null)
		throw new PinsError("GIT_FAILED", `${ref} did not resolve to a commit`);
	return fetched;
}

export interface Bump {
	readonly from: string;
	readonly to: string;
}

/** Check the submodule out at `ref` and stage the new gitlink; nothing else moves. */
export function bumpPin(
	root: string,
	name: string,
	pin: GitPin,
	ref: string,
	reference: string | undefined,
): Bump {
	if (!isSafeRef(ref)) {
		throw new PinsError("USAGE", `${ref} is not a commit, branch or tag name`);
	}
	const from = gitlinkOf(root, pin.path);
	if (headOf(root, pin.path) === null) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} is not fetched; run pnpm run pins:fetch ${name} first`,
		);
	}
	if (isDirty(root, pin.path)) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} has uncommitted changes; commit or discard them first`,
		);
	}
	const sub = join(root, pin.path);
	const to = resolveCommit(sub, ref, reference);
	must(
		sub,
		["checkout", "--quiet", "--detach", to],
		`checkout of ${short(to)}`,
	);
	must(root, ["add", "--", pin.path], "staging the gitlink");
	return { from, to };
}
