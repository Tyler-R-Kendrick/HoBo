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
import { type GitPin, PinsError } from "./pins.ts";
import {
	git,
	gitlinkOf,
	headOf,
	isDirty,
	isShallow,
	keepPin,
	must,
	Refusal,
	short,
} from "./pins-git-core.ts";
import {
	assertCoherent,
	assertNotAbandoning,
	coherence,
	type GitOptions,
} from "./pins-git-guard.ts";
import {
	type NetOptions,
	netGit,
	remoteHas,
	remoteTip,
} from "./pins-git-net.ts";

export { type Bump, bumpPin } from "./pins-git-bump.ts";
export {
	type GitResult,
	git,
	gitlinkOf,
	headOf,
	isDirty,
	sameRepo,
	short,
} from "./pins-git-core.ts";
export type { GitOptions } from "./pins-git-guard.ts";
export { modulesUrl } from "./pins-gitmodules.ts";

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
	/** The commit HEAD was moved off, when it was moved. */
	readonly was: string | null;
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
	if (before !== null && before !== want) {
		assertNotAbandoning(root, pin, before, want, options.force);
	}
	if (before !== want) updateSubmodule(root, pin, options);
	const head = headOf(root, pin.path);
	if (head !== want) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${pin.path} is at ${head === null ? "nothing" : short(head)} after update; the pin is ${short(want)}`,
		);
	}
	keepPin(root, pin.path, head);
	const sparseChanged = applySparse(root, pin);
	const kind =
		before === want
			? "already pinned"
			: before === null
				? "initialised"
				: "updated";
	return {
		kind,
		head,
		was: before !== null && before !== want ? before : null,
		shallow: isShallow(root, pin.path),
		sparseChanged,
	};
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
	let head: string | null;
	try {
		head = headOf(root, pin.path);
	} catch (error) {
		if (!(error instanceof Refusal)) throw error;
		return {
			commit,
			problems: [...problems, error.problem],
			fixes: [...fixes, error.fix],
			tip: null,
		};
	}
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
	if (online && tip !== commit && !remoteHas(pin.repo, commit, options)) {
		problems.push(
			`the pinned commit ${short(commit)} is not available from ${pin.repo}`,
		);
		fixes.push(
			`push it, or move the pin to a pushed commit: pnpm run pins:bump ${name} <a pushed ref>`,
		);
	}
	return { commit, problems, fixes, tip };
}
