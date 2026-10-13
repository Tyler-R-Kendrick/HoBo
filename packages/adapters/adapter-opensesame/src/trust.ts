/**
 * Which places a program may be taken from, and which directories a program
 * may be found through. The store passphrase goes to `opensesame`, and
 * OpenSesame's first act is to run a bare `node`, so both lookups are decisions
 * about where code the caller did not write may sit.
 *
 * A place is trusted when:
 *
 * - it resolves (through every symlink) to something that exists;
 * - neither the place nor where it resolves is under a `node_modules/.bin`
 *   directory, where a dependency can name a program anything;
 * - it is not inside the working directory's tree, which a checkout controls
 *   (unless the working directory is the filesystem root or the home directory,
 *   which are not projects);
 * - on a system with users (not Windows), the place and every directory above it
 *   belong to the effective user or to root, and only they can write: nothing is
 *   writable by group or others, except a sticky directory (`/tmp`) whose owner
 *   is the user or root, in which others can add files but not replace ours.
 *
 * What this does not check: the contents of the place, ACLs and extended
 * attributes, a mount that lies about modes (WSL's `/mnt/c`, FAT: every file
 * looks 0777 and is refused), or that a trusted place stays trusted between the
 * check and the use. A swap in that gap needs write access to the place or to a
 * directory above it, which is what the rule refuses.
 */

import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** What the rule reads of one file or directory. */
export type EntryStat = Readonly<{
	uid: number;
	mode: number;
	directory: boolean;
}>;

/** The file system as the rule sees it; tests supply a tree in memory. */
export interface TrustFs {
	/** Where `path` ends once every symlink is followed, or `undefined` when it does not exist. */
	realpath(path: string): string | undefined;
	/** Owner and mode of what `path` ends at, or `undefined`. */
	stat(path: string): EntryStat | undefined;
}

export type Trust = Readonly<{
	fs: TrustFs;
	/** The effective uid; `undefined` where there are none (Windows), and then no owner or mode is checked. */
	euid: number | undefined;
	cwd: string;
	home: string;
}>;

const nodeFs: TrustFs = {
	realpath(target) {
		try {
			return realpathSync(target);
		} catch {
			return undefined;
		}
	},
	stat(target) {
		try {
			const stats = statSync(target);
			return {
				uid: stats.uid,
				mode: stats.mode,
				directory: stats.isDirectory(),
			};
		} catch {
			return undefined;
		}
	},
};

/** This process's file system, user, working directory and home. */
export function nodeTrust(): Trust {
	return {
		fs: nodeFs,
		euid: process.geteuid?.(),
		cwd: process.cwd(),
		home: homedir(),
	};
}

const STICKY = 0o1000;
const GROUP_OR_OTHERS_WRITE = 0o022;
const SAFE_POSIX_PATH = "/usr/local/bin:/usr/bin:/bin";

function hasNodeModulesBin(target: string): boolean {
	const parts = target.split(/[\\/]/u);
	return parts.some(
		(part, at) => part === "node_modules" && parts[at + 1] === ".bin",
	);
}

function insideProject(real: string, trust: Trust): boolean {
	const cwd = trust.fs.realpath(trust.cwd) ?? trust.cwd;
	const home = trust.fs.realpath(trust.home) ?? trust.home;
	if (cwd === home || path.parse(cwd).root === cwd) return false;
	return real === cwd || real.startsWith(`${cwd}${path.sep}`);
}

/** `real`, then each directory above it up to the root. */
function chain(real: string): string[] {
	const out = [real];
	for (
		let at = path.dirname(real);
		at !== out[out.length - 1];
		at = path.dirname(at)
	) {
		out.push(at);
	}
	return out;
}

/** Why `target` is not a trusted place, or `undefined` when it is. */
export function placeProblem(target: string, trust: Trust): string | undefined {
	const real = trust.fs.realpath(target);
	if (real === undefined) return `${target} does not exist`;
	if (hasNodeModulesBin(target) || hasNodeModulesBin(real)) {
		return `${target} is under a node_modules/.bin directory, where a dependency can put a program of any name`;
	}
	if (insideProject(real, trust)) {
		return `${target} is inside the working directory's tree, which a checkout controls`;
	}
	if (trust.euid === undefined) return undefined;
	for (const place of chain(real)) {
		const stats = trust.fs.stat(place);
		if (stats === undefined) return `${place} cannot be inspected`;
		if (stats.uid !== trust.euid && stats.uid !== 0) {
			return `${place} is owned by another user`;
		}
		const writable = (stats.mode & GROUP_OR_OTHERS_WRITE) !== 0;
		const sticky = stats.directory && (stats.mode & STICKY) !== 0;
		if (writable && !sticky) return `${place} is writable by group or others`;
	}
	return undefined;
}

/** The absolute, non-empty entries of a PATH, in order. */
export function absolutePathEntries(
	pathValue: string | undefined,
	platform: NodeJS.Platform,
): string[] {
	const flavour = platform === "win32" ? path.win32 : path.posix;
	return (pathValue ?? "")
		.split(flavour.delimiter)
		.filter((entry) => entry !== "" && flavour.isAbsolute(entry));
}

function defaultPath(
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
): string {
	if (platform !== "win32") return SAFE_POSIX_PATH;
	const root = env.SYSTEMROOT ?? env.SystemRoot ?? "C:\\Windows";
	return `${root}\\System32;${root}`;
}

/**
 * The PATH a run is started with: the caller's, reduced to the absolute
 * directories that exist and are trusted places, each written as it resolves
 * and none twice. An empty or relative entry means the working directory, and
 * OpenSesame's first act is a bare `node` lookup with the store passphrase in its
 * environment. When nothing is left, a fixed system PATH.
 */
export function trustedPath(
	pathValue: string | undefined,
	trust: Trust,
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
): string {
	const kept: string[] = [];
	for (const entry of absolutePathEntries(pathValue, platform)) {
		if (trust.fs.stat(entry)?.directory !== true) continue;
		if (placeProblem(entry, trust) !== undefined) continue;
		const real = trust.fs.realpath(entry);
		if (real !== undefined && !kept.includes(real)) kept.push(real);
	}
	const flavour = platform === "win32" ? path.win32 : path.posix;
	return kept.length === 0
		? defaultPath(platform, env)
		: kept.join(flavour.delimiter);
}
