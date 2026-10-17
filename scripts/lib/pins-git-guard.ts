/**
 * What must hold before the pin code moves a submodule: the repository is named
 * the same everywhere, and nothing but the reflog would hold the commit HEAD
 * is about to leave. Both are refusals with the command that resolves them.
 *
 * Erasable TypeScript with node builtins only.
 */

import { type GitPin, PinsError } from "./pins.ts";
import {
	GitmodulesError,
	git,
	modulesEntry,
	onAnyRef,
	sameRepo,
	short,
} from "./pins-git-core.ts";
import { isAllowedTransport, type NetOptions } from "./pins-git-net.ts";

export interface GitOptions extends NetOptions {
	/** `--reference`: a local clone to borrow objects from. */
	readonly reference: string | undefined;
	/** `--force`: move a submodule off a commit that is on no branch. */
	readonly force: boolean;
}

export interface Findings {
	readonly problems: string[];
	readonly fixes: string[];
	/** `.gitmodules` git could read differently: what fetch and bump throw. */
	refusal?: GitmodulesError;
}

/**
 * The places a submodule's repository is named must agree with the manifest
 * before anything is fetched: `.gitmodules`, and the URL this clone configured
 * the last time it ran `git submodule init`. `git submodule update` uses those,
 * not the manifest, so a branch that edits `.gitmodules` would otherwise make
 * `setup` contact a host the manifest never named.
 */
export function coherence(
	root: string,
	pin: GitPin,
	allowLocal: boolean,
): Findings {
	const found: Findings = { problems: [], fixes: [] };
	let entry: ReturnType<typeof modulesEntry>;
	try {
		entry = modulesEntry(root, pin.path);
	} catch (error) {
		if (!(error instanceof GitmodulesError)) throw error;
		found.problems.push(error.problem);
		found.fixes.push(error.fix);
		found.refusal = error;
		return found;
	}
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

export function assertCoherent(
	root: string,
	pin: GitPin,
	allowLocal: boolean,
): void {
	const { problems, fixes, refusal } = coherence(root, pin, allowLocal);
	if (refusal !== undefined) throw refusal;
	if (problems.length > 0) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${problems.join("\n")}\nfix: ${fixes.join("\n     ")}`,
		);
	}
}

/**
 * Moving HEAD off a commit that no branch, tag or remote holds leaves it in the
 * reflog only (a branch always contains its own tip, so a commit on a local
 * branch is never in the way). Refuse, naming the commit and the way out, unless the
 * operator said `--force`.
 */
export function assertNotAbandoning(
	root: string,
	pin: GitPin,
	from: string,
	to: string,
	force: boolean,
): void {
	if (force || onAnyRef(root, pin.path, from)) {
		return;
	}
	throw new PinsError(
		"SUBMODULE_STATE",
		`${pin.path} is at ${short(from)}, a commit on no branch or tag; moving it to ${short(to)} would leave that commit only in the reflog.\nfix: git -C ${pin.path} branch rescue-${short(from)} ${from}   (then re-run), or re-run with --force`,
	);
}
