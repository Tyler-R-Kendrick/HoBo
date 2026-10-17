/**
 * What must hold before the pin code moves a submodule: the repository is named
 * the same everywhere, and nothing but the reflog would hold the commit HEAD
 * is about to leave. Both are refusals with the command that resolves them.
 *
 * Erasable TypeScript with node builtins only.
 */

import { type GitPin, PinsError } from "./pins.ts";
import { git, onAnyRef, Refusal, sameRepo, short } from "./pins-git-core.ts";
import { isAllowedTransport, type NetOptions } from "./pins-git-net.ts";
import { modulesEntry } from "./pins-gitmodules.ts";

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
	refusal?: Refusal;
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
		if (!(error instanceof Refusal)) throw error;
		found.problems.push(error.problem);
		found.fixes.push(error.fix);
		found.refusal = error;
		return found;
	}
	if (entry === null) {
		// The gitlink is in the index (gitlinkOf comes first), so
		// `git submodule add` would refuse: "already exists in the index".
		const key = `-f .gitmodules submodule.${pin.path}`;
		found.problems.push(`${pin.path} is not registered in .gitmodules`);
		found.fixes.push(
			`git config ${key}.path ${pin.path} && git config ${key}.url ${pin.repo}`,
		);
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
	// No scope, so every one is read, as `git submodule update` reads them:
	// the system and global files, this clone's own, and the command line
	// (`git -c`, which a child git gets as GIT_CONFIG_COUNT or
	// GIT_CONFIG_PARAMETERS), the last one winning. GIT_CONFIG is dropped,
	// so nothing redirects the read; --show-scope says where the fix goes.
	const read = git(root, [
		"config",
		"--show-scope",
		"--get",
		`submodule.${entry.name}.url`,
	]).stdout;
	const tab = read.indexOf("\t");
	const configured = read.slice(tab + 1);
	if (configured !== "" && !sameRepo(configured, entry.url)) {
		const scope = tab === -1 ? "" : read.slice(0, tab);
		const stale = staleUrl(pin.path, entry.name, scope);
		found.problems.push(
			`${stale.said} ${configured}, not ${entry.url}${stale.why}`,
		);
		found.fixes.push(stale.fix);
	}
	return found;
}

/** A configured URL `.gitmodules` does not name: how to say where it came from, and the fix that works there. */
interface StaleUrl {
	/** Comes before the URL. */
	readonly said: string;
	/** Comes after the URL `.gitmodules` names. */
	readonly why: string;
	readonly fix: string;
}

function staleUrl(path: string, name: string, scope: string): StaleUrl {
	const key = `submodule.${name}.url`;
	const sync = `git submodule sync -- ${path}`;
	if (scope === "local" || scope === "worktree") {
		return {
			said: `this clone's configured URL for ${path} is`,
			why: ' (a stale "git submodule init")',
			fix: sync,
		};
	}
	if (scope === "global" || scope === "system") {
		return {
			said: `the ${scope} git config sets the URL for ${path} to`,
			why: "",
			fix: `${sync}   (this clone's URL then overrides it; or: git config --${scope} --unset ${key})`,
		};
	}
	const where = "git -c, GIT_CONFIG_COUNT or GIT_CONFIG_PARAMETERS";
	return {
		said: `the command line (${where}) sets the URL for ${path} to`,
		why: "",
		fix: `drop ${key} from ${where}`,
	};
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
