/**
 * One member out of a release archive (a gzip-compressed ustar file).
 *
 * What a pin of an archive trusts is the archive's sha256; the executable is
 * the one member the pin names. The archive is read once: every compressed
 * byte is hashed as it streams, and the member it yields is kept only if those
 * bytes hash to the pin. So the bytes used are the bytes verified, not a file
 * that was verified earlier under the same name.
 *
 * Nothing else in the archive is written anywhere, and no name in the archive
 * ever becomes a path: the member's bytes go to the cache path the pin's
 * `entry` names. A name such as `../../.bashrc` or `/etc/passwd` is refused
 * outright. What the reader accepts and refuses, and why, is `pins-tar.ts`;
 * here:
 *
 * - inflating stops at the archive's end blocks (the file is still read to
 *   its end, to hash it), so bytes past the end are never decompressed;
 * - a file that cannot be read (absent, a directory, unreadable) is
 *   ARCHIVE_UNREADABLE, a corrupt or truncated gzip ARCHIVE_MALFORMED;
 * - the extracted file is written to a private partial file, made 0755
 *   through its own descriptor and renamed into place only when the archive's
 *   digest matched; any failure leaves nothing behind;
 * - a failure to create, write, sync or rename that file (no space, an I/O
 *   error, no permission, a write that makes no progress) is
 *   ARCHIVE_WRITE_FAILED, naming the errno and keeping the error as its
 *   `cause`: it says nothing about the archive, so it is never reported as
 *   ARCHIVE_MALFORMED.
 *
 * Erasable TypeScript with node builtins only.
 */
import { createHash } from "node:crypto";
import {
	closeSync,
	createReadStream,
	fchmodSync,
	fsyncSync,
	openSync,
	renameSync,
	rmSync,
	writeSync,
} from "node:fs";
import { createGunzip } from "node:zlib";

import { PinsError } from "./pins.ts";
import { armGuard, partialPath } from "./pins-partial.ts";
import { TarScan } from "./pins-tar.ts";

export { MAX_MEMBER_BYTES } from "./pins-tar.ts";

/** What one read of an archive established. */
export interface MemberRead {
	/** The member's size in bytes. */
	readonly size: number;
	/** The sha256 of every compressed byte read. */
	readonly archive: string;
}

function unreadable(archive: string, error: Error): PinsError {
	// A file system error's message names its code: "ENOENT: no such file …".
	return new PinsError(
		"ARCHIVE_UNREADABLE",
		`${archive} could not be read: ${error.message}`,
	);
}

/** Resolves on the first of `events`; never rejects (the inflater's errors are recorded apart). */
function first(
	stream: NodeJS.EventEmitter,
	events: readonly string[],
): Promise<void> {
	return new Promise((resolve) => {
		const done = (): void => {
			for (const name of events) stream.off(name, done);
			resolve();
		};
		for (const name of events) stream.once(name, done);
	});
}

/**
 * Read `archive` to its end, hashing every byte, and hand the bytes of
 * `member` to `sink`. Every refusal is a PinsError.
 */
async function readMember(
	archive: string,
	member: string,
	sink: (chunk: Buffer) => void,
): Promise<MemberRead> {
	const hash = createHash("sha256");
	const scan = new TarScan(archive, member, sink);
	const gunzip = createGunzip();
	let refusal: PinsError | undefined;
	let inflateError: Error | undefined;
	gunzip.on("data", (chunk: Buffer) => {
		if (refusal !== undefined || scan.ended) return;
		try {
			scan.push(chunk);
		} catch (error) {
			refusal =
				error instanceof PinsError
					? error
					: new PinsError("ARCHIVE_MALFORMED", `${archive}: ${String(error)}`);
		}
		// Past the end blocks, or refused: stop inflating. The file is still read.
		if (refusal !== undefined || scan.ended) gunzip.destroy();
	});
	gunzip.on("error", (error) => {
		inflateError = error;
	});
	const inflated = first(gunzip, ["close"]);
	try {
		for await (const chunk of createReadStream(archive)) {
			hash.update(chunk);
			if (gunzip.destroyed) continue;
			if (!gunzip.write(chunk)) {
				await first(gunzip, ["drain", "close"]);
			}
		}
	} catch (error) {
		gunzip.destroy();
		throw error instanceof PinsError
			? error
			: unreadable(
					archive,
					error instanceof Error ? error : new Error(String(error)),
				);
	}
	if (!gunzip.destroyed) gunzip.end();
	await inflated;
	if (refusal !== undefined) throw refusal;
	if (inflateError !== undefined && !scan.ended) {
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`${archive} could not be read as gzip: ${inflateError.message}`,
		);
	}
	return { size: scan.finish(), archive: hash.digest("hex") };
}

/** How `writeAll` writes: `writeSync`'s shape, returning the bytes it wrote. */
export type WriteSome = (
	fd: number,
	buffer: Uint8Array,
	offset: number,
	length: number,
) => number;

/**
 * Write every byte of `chunk` to `fd`. One `writeSync` may write fewer bytes
 * than it was given; the rest are written until none is left, and a write
 * that makes no progress is an error rather than a loop.
 */
export function writeAll(
	fd: number,
	chunk: Uint8Array,
	write: WriteSome = writeSync,
): void {
	let offset = 0;
	while (offset < chunk.length) {
		const written = write(fd, chunk, offset, chunk.length - offset);
		if (written <= 0) {
			throw new PinsError(
				"ARCHIVE_WRITE_FAILED",
				`a write to the partial file wrote ${written} of ${chunk.length - offset} bytes`,
			);
		}
		offset += written;
	}
}

/** Run `act` on `path`: a file system error becomes ARCHIVE_WRITE_FAILED naming its errno, a PinsError passes through. */
function writing<T>(what: string, path: string, act: () => T): T {
	try {
		return act();
	} catch (error) {
		if (error instanceof PinsError) throw error;
		const errno =
			error instanceof Error && "code" in error ? error.code : undefined;
		const detail = error instanceof Error ? error.message : String(error);
		throw new PinsError(
			"ARCHIVE_WRITE_FAILED",
			`${what} ${path} failed${errno === undefined ? "" : ` (${String(errno)})`}: ${detail}`,
			{ cause: error },
		);
	}
}

/** The sha256 of `archive` and of `member` inside it, from one read, writing nothing. */
export async function memberDigest(
	archive: string,
	member: string,
): Promise<{ readonly archive: string; readonly member: string }> {
	const hash = createHash("sha256");
	const read = await readMember(archive, member, (chunk) => hash.update(chunk));
	return { archive: read.archive, member: hash.digest("hex") };
}

/**
 * Write `member` of `archive` to `dest`, mode 0755, if the archive's bytes
 * hash to `sha256`. The bytes go to a private partial file first and are
 * renamed into place only once all of them are there and the digest matched;
 * any failure leaves nothing at `dest`.
 */
export async function extractMember(
	archive: string,
	member: string,
	dest: string,
	sha256: string,
): Promise<void> {
	const partial = partialPath(dest);
	const guard = armGuard(partial, () => undefined);
	let fd: number | undefined;
	try {
		// O_CREAT | O_EXCL: never an existing file, never through a link.
		fd = writing("creating", partial, () => openSync(partial, "wx", 0o600));
		const out = fd;
		const read = await readMember(archive, member, (chunk) => {
			writing(`writing ${member} to`, partial, () => writeAll(out, chunk));
		});
		if (read.archive !== sha256) {
			throw new PinsError(
				"DIGEST_MISMATCH",
				`${archive} hashed to ${read.archive} while ${member} was read from it, but the pin says ${sha256}; nothing was kept`,
			);
		}
		writing("syncing", partial, () => {
			fsyncSync(out);
			fchmodSync(out, 0o755);
		});
		fd = undefined;
		writing("closing", partial, () => closeSync(out));
		writing(`renaming ${partial} to`, dest, () => renameSync(partial, dest));
	} catch (error) {
		// Every error thrown above is a PinsError; a failure while cleaning up
		// is recorded beside it, never in its place, and the partial file is
		// removed whether or not closing it worked.
		let failure = error;
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch (closeError) {
				if (failure instanceof PinsError && closeError instanceof Error) {
					failure = failure.withSuppressed(`closing ${partial}`, closeError);
				}
			}
		}
		try {
			rmSync(partial, { force: true });
		} catch (rmError) {
			if (failure instanceof PinsError && rmError instanceof Error) {
				failure = failure.withSuppressed(`removing ${partial}`, rmError);
			}
		}
		const signal = guard.interrupted();
		if (signal !== null) {
			throw new PinsError(
				"INTERRUPTED",
				`unpacking ${member} was interrupted by ${signal}; nothing was kept`,
			);
		}
		throw failure;
	} finally {
		guard.release();
	}
}
