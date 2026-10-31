import { lstat, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Whether a project marker can be trusted to be this uid's own. Discovery's
 * answer decides what `hobo` loads and runs (cloud/loader.ts imports the
 * project's `app.ts` or `bindle.ts`), so a marker anyone else could have put
 * in place, or swapped, is code execution as the user. As git's
 * `safe.directory` trusts only a repository its user owns, a marker counts
 * only when:
 *
 * - it is not a symlink (checked with `lstat`, never followed);
 * - this uid owns it, and it is neither group- nor world-writable;
 * - every directory from the walked one down to the marker's own is owned by
 *   this uid or by root and is not world-writable (so `/tmp/app.ts` and a
 *   stranger's file in a 1777 scratch directory are both refused), and none
 *   below the walked one is a symlink.
 *
 * The answer is the reason it is not trusted, naming the path, its owner and
 * its mode, or `null` when it is. Where there is no uid (Windows) nothing is
 * checked.
 */
export async function untrustedMarker(
	walked: string,
	marker: string,
	uid: number | undefined,
): Promise<string | null> {
	if (uid === undefined) return null;
	const own = await describe(marker, uid, "marker");
	if (own !== null) return own;
	for (const dir of holdingDirectories(walked, marker)) {
		const reason = await describe(
			dir,
			uid,
			dir === walked ? "walked" : "between",
		);
		if (reason !== null) return reason;
	}
	return null;
}

/**
 * Whether a file inside a trusted `.hobo` (its `session.json`, `generated/`)
 * is this uid's own: not a symlink, owned by this uid, neither group- nor
 * world-writable. The `.hobo` itself has passed `untrustedMarker`.
 */
export async function untrustedEntry(
	entry: string,
	uid: number | undefined,
): Promise<string | null> {
	if (uid === undefined) return null;
	return describe(entry, uid, "marker");
}

/** The directories between `walked` and `marker`, the walked one first. */
function holdingDirectories(walked: string, marker: string): string[] {
	const dirs: string[] = [];
	for (
		let dir = path.dirname(marker);
		dir.length >= walked.length;
		dir = path.dirname(dir)
	) {
		dirs.unshift(dir);
		if (dir === walked || path.dirname(dir) === dir) break;
	}
	return dirs;
}

type Role = "marker" | "between" | "walked";

async function describe(
	target: string,
	uid: number,
	role: Role,
): Promise<string | null> {
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		// The walked directory may be reached through a symlink in the cwd the
		// person chose; everything below it is examined as it is on disk.
		info = role === "walked" ? await stat(target) : await lstat(target);
	} catch (error) {
		const code =
			error instanceof Error && "code" in error ? String(error.code) : "";
		return `cannot examine ${target} (${code || String(error)})`;
	}
	const reasons = problems(info, uid, role);
	if (reasons.length === 0) return null;
	const what = role === "marker" ? "" : `${target} is `;
	return `${what}${reasons.join(" and ")} (owner uid ${info.uid}, mode ${octal(info.mode)})`;
}

function problems(
	info: { isSymbolicLink(): boolean; uid: number; mode: number },
	uid: number,
	role: Role,
): string[] {
	if (role !== "walked" && info.isSymbolicLink()) return ["a symlink"];
	const reasons: string[] = [];
	if (role === "marker") {
		if (info.uid !== uid) reasons.push(`not owned by uid ${uid}`);
		if ((info.mode & 0o022) !== 0) reasons.push("group- or world-writable");
		return reasons;
	}
	if (info.uid !== uid && info.uid !== 0)
		reasons.push(`owned by neither uid ${uid} nor root`);
	if ((info.mode & 0o002) !== 0) reasons.push("world-writable");
	return reasons;
}

function octal(mode: number): string {
	return (mode & 0o7777).toString(8).padStart(4, "0");
}
