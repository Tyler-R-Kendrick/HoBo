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
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type GitPin, isSafeRef, PinsError } from "./pins.ts";
import {
	git,
	gitlinkOf,
	headOf,
	isDirty,
	isShallow,
	modulesEntry,
	must,
	sameRepo,
	short,
} from "./pins-git-core.ts";
import {
	isAllowedTransport,
	type NetOptions,
	netGit,
	remoteTip,
} from "./pins-git-net.ts";

export {
	type GitResult,
	git,
	gitlinkOf,
	headOf,
	isDirty,
	modulesUrl,
	sameRepo,
	short,
} from "./pins-git-core.ts";

export interface GitOptions extends NetOptions {
	/** `--reference`: a local clone to borrow objects from. */
	readonly reference: string | undefined;
}

interface Findings {
	readonly problems: string[];
	readonly fixes: string[];
}

/**
 * The places a submodule's repository is named must agree with the manifest
 * before anything is fetched: `.gitmodules`, and the URL this clone configured
 * the last time it ran `git submodule init`. `git submodule update` uses those,
 * not the manifest, so a branch that edits `.gitmodules` would otherwise make
 * `setup` contact a host the manifest never named.
 */
function coherence(root: string, pin: GitPin, allowLocal: boolean): Findings {
	const found: Findings = { problems: [], fixes: [] };
	const entry = modulesEntry(root, pin.path);
	if (entry === null) {
		found.problems.push(`${pin.path} is not registered in .gitmodules`);
		found.fixes.push(`git submodule add ${pin.repo} ${pin.path}`);
		return found;
	}
	const setUrl = `git config -f .gitmodules submodule.${entry.name}.url ${pin.repo}`;
	if (!isAllowedTransport(entry.url, allowLocal)) {
		found.problems.push(
			`.gitmodules names ${entry.url} for ${pin.path}, which is not an https URL`,
		);
		found.fixes.push(setUrl);
	} else if (!sameRepo(entry.url, pin.repo)) {
		found.problems.push(
			`.gitmodules names ${entry.url} for ${pin.path}; siblings.json says ${pin.repo}`,
		);
		found.fixes.push(
			`${setUrl}   (or correct tools/pins/siblings.json if .gitmodules is right)`,
		);
	}
	const configured = git(root, [
		"config",
		"--get",
		`submodule.${entry.name}.url`,
	]).stdout;
	if (configured !== "" && !sameRepo(configured, entry.url)) {
		found.problems.push(
			`this clone's configured URL for ${pin.path} is ${configured}, not ${entry.url} (a stale "git submodule init")`,
		);
		found.fixes.push(`git submodule sync -- ${pin.path}`);
	}
	return found;
}

function assertCoherent(root: string, pin: GitPin, allowLocal: boolean): void {
	const { problems, fixes } = coherence(root, pin, allowLocal);
	if (problems.length > 0) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${problems.join("\n")}\nfix: ${fixes.join("\n     ")}`,
		);
	}
}

function updateSubmodule(root: string, pin: GitPin, options: GitOptions): void {
	const refArgs =
		options.reference === undefined ? [] : ["--reference", options.reference];
	const update = (depth: boolean) =>
		netGit(
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
			options,
			true,
		);
	if (update(true).status === 0) return;
	// A server that refuses a fetch of an unadvertised commit leaves a shallow
	// clone of the tip: take the full history, then check out the pin.
	const sub = join(root, pin.path);
	if (existsSync(join(sub, ".git"))) {
		const unshallow = isShallow(root, pin.path) ? ["--unshallow"] : [];
		const full = netGit(
			sub,
			[
				"fetch",
				"--no-tags",
				...unshallow,
				pin.repo,
				"+refs/heads/*:refs/remotes/origin/*",
			],
			options,
		);
		if (full.status !== 0) {
			throw new PinsError("GIT_FAILED", `full fetch failed:\n${full.stderr}`);
		}
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
	options: GitOptions,
): InitResult {
	const want = gitlinkOf(root, pin.path);
	assertCoherent(root, pin, options.allowLocal);
	const before = headOf(root, pin.path);
	if (before !== null && before !== want && isDirty(root, pin.path)) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} has uncommitted changes; commit or discard them before moving it to ${short(want)}`,
		);
	}
	if (before !== want) updateSubmodule(root, pin, options);
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

/** Offline: gitlink against HEAD, a clean tree, and the repository named the same everywhere. */
export function statusPin(
	root: string,
	name: string,
	pin: GitPin,
	online: boolean,
	options: NetOptions,
): GitStatus {
	const commit = gitlinkOf(root, pin.path);
	const { problems, fixes } = coherence(root, pin, options.allowLocal);
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
			fixes.push(
				`git -C ${pin.path} stash   (keeps them; or commit them there)`,
			);
		}
	}
	const tip = online ? remoteTip(root, pin.repo, pin.branch, options) : null;
	return { commit, problems, fixes, tip };
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
	pin: GitPin,
	ref: string,
	options: GitOptions,
): string {
	if (HEX_REF.test(ref)) {
		const local = peel(sub, ref);
		if (local !== null) return local;
		const borrowed =
			options.reference === undefined ? null : peel(options.reference, ref);
		if (borrowed !== null && options.reference !== undefined) {
			const lent = netGit(
				sub,
				["fetch", "--depth", "1", "--no-tags", options.reference, borrowed],
				options,
				false,
				true,
			);
			if (lent.status !== 0) {
				throw new PinsError(
					"GIT_FAILED",
					`fetch from the reference clone failed:\n${lent.stderr}`,
				);
			}
			return borrowed;
		}
		if (ref.length !== 40) {
			throw new PinsError(
				"GIT_FAILED",
				`cannot resolve ${ref} to a commit: give a full 40-character id, a branch or a tag, or --reference <a local clone that has it>`,
			);
		}
	}
	const fetched = netGit(
		sub,
		["fetch", "--depth", "1", "--no-tags", pin.repo, "--", ref],
		options,
	);
	if (fetched.status !== 0) {
		throw new PinsError(
			"GIT_FAILED",
			`fetch of ${ref} failed:\n${fetched.stderr}`,
		);
	}
	const commit = peel(sub, "FETCH_HEAD");
	if (commit === null)
		throw new PinsError("GIT_FAILED", `${ref} did not resolve to a commit`);
	return commit;
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
	options: GitOptions,
): Bump {
	if (!isSafeRef(ref)) {
		throw new PinsError("USAGE", `${ref} is not a commit, branch or tag name`);
	}
	const from = gitlinkOf(root, pin.path);
	assertCoherent(root, pin, options.allowLocal);
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
	const to = resolveCommit(sub, pin, ref, options);
	must(
		sub,
		["checkout", "--quiet", "--detach", to],
		`checkout of ${short(to)}`,
	);
	must(root, ["add", "--", pin.path], "staging the gitlink");
	return { from, to };
}
