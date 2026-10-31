/**
 * What the content-addressed cache holds for a pinned file, re-hashed every
 * time it is asked about: never trusted by its name, and never read unless it
 * is a regular file. For an archive pin, the archive is checked against the
 * pin and the unpacked entry against the member the verified archive holds.
 *
 * Erasable TypeScript with node builtins only.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";

import type { AssetFile } from "./pins.ts";
import { memberDigest } from "./pins-archive.ts";
import { cachedArchivePath, cachedPath } from "./pins-assets.ts";

export async function sha256OfFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
}

export type CacheState =
	| { readonly state: "absent" }
	| { readonly state: "ok" }
	/** `path` is the file that failed: the archive, for an archive pin. */
	| {
			readonly state: "mismatch";
			readonly actual: string;
			readonly path: string;
	  }
	/** Something is there that is not a regular file: a link, a directory, a device. */
	| {
			readonly state: "invalid";
			readonly reason: string;
			readonly path: string;
	  }
	/** An archive pin's entry is not the member of the verified archive it was unpacked from. */
	| { readonly state: "stale"; readonly reason: string };

function describeKind(info: Awaited<ReturnType<typeof lstat>>): string {
	if (info.isSymbolicLink()) return "a symbolic link";
	if (info.isDirectory()) return "a directory";
	return "not a regular file";
}

/** The state of one cached file against the digest it must have. */
export async function verifyFile(
	path: string,
	sha256: string,
): Promise<CacheState> {
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		info = await lstat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return { state: "absent" };
		throw error;
	}
	if (!info.isFile())
		return { state: "invalid", reason: describeKind(info), path };
	const actual = await sha256OfFile(path);
	return actual === sha256
		? { state: "ok" }
		: { state: "mismatch", actual, path };
}

/**
 * Re-hash what the cache holds for `file`; never trusts a file by its name,
 * and never reads anything but a regular file (a link to a correct file, or to
 * /dev/zero, is not a verified file). For an archive pin, the archive is
 * re-hashed against the pin and the entry against the member it holds.
 */
export async function verifyCached(
	cache: string,
	file: AssetFile,
): Promise<CacheState> {
	const path = cachedPath(cache, file);
	if (file.archive === undefined) return await verifyFile(path, file.sha256);
	const archive = await verifyFile(cachedArchivePath(cache, file), file.sha256);
	if (archive.state !== "ok") return archive;
	const entry = await verifyFile(
		path,
		await memberDigest(cachedArchivePath(cache, file), file.archive.member),
	);
	if (entry.state === "mismatch") {
		return {
			state: "stale",
			reason: `${path} is not ${file.archive.member} from the verified archive`,
		};
	}
	return entry;
}
