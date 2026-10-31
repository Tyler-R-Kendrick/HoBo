/**
 * One member out of a release archive (a gzip-compressed ustar file), read
 * only after the archive itself has been verified against its pin.
 *
 * What a pin of an archive trusts is the archive's sha256; the executable is
 * the one member the pin names. Nothing else in the archive is written
 * anywhere, and no name in the archive ever becomes a path: the member's bytes
 * go to the cache path the pin's `entry` names, so a member called
 * `../../.bashrc` or `/etc/passwd` can only fail to match.
 *
 * Refused, rather than guessed at:
 * - a member the archive does not hold, or holds twice;
 * - a member that is not a regular file (a link, a directory, a device);
 * - pax and GNU long-name headers anywhere, because they rename the entry that
 *   follows them, and a reader that ignored them would read a different file
 *   than `tar` would extract;
 * - a header whose checksum is wrong, a truncated archive, a corrupt gzip;
 * - a member larger than the cap.
 *
 * The extracted file is written to a private partial file, made 0755 through
 * its own descriptor and renamed into place, as a download is.
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

const BLOCK = 512;
/** The largest member read: the manifest's largest asset. */
export const MAX_MEMBER_BYTES = 2 * 1024 ** 3;

interface Header {
	readonly name: string;
	readonly size: number;
	readonly type: string;
}

function field(block: Buffer, start: number, length: number): string {
	const raw = block.subarray(start, start + length);
	const end = raw.indexOf(0);
	return raw.subarray(0, end === -1 ? length : end).toString("latin1");
}

function octal(
	block: Buffer,
	start: number,
	length: number,
	what: string,
): number {
	const text = field(block, start, length).trim();
	if (!/^[0-7]+$/u.test(text)) {
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`a tar header's ${what} is not an octal number`,
		);
	}
	return Number.parseInt(text, 8);
}

function parseHeader(block: Buffer, archive: string): Header {
	const stored = octal(block, 148, 8, "checksum");
	let sum = 0;
	for (let i = 0; i < BLOCK; i += 1) {
		sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
	}
	if (sum !== stored) {
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`${archive} has a tar header whose checksum is wrong`,
		);
	}
	const type = field(block, 156, 1) || "0";
	if (["x", "g", "L", "K"].includes(type)) {
		throw new PinsError(
			"ARCHIVE_UNSUPPORTED",
			`${archive} carries a ${type === "x" || type === "g" ? "pax" : "GNU long-name"} header, which renames the entry after it; only plain ustar archives are read`,
		);
	}
	const name = field(block, 0, 100);
	const prefix = field(block, 345, 155);
	return {
		name: prefix === "" ? name : `${prefix}/${name}`,
		size: octal(block, 124, 12, "size"),
		type,
	};
}

/**
 * Stream `archive`, hand the bytes of `member` to `sink`, and return how many
 * there were. Every refusal is a PinsError; nothing is read past the end.
 */
async function readMember(
	archive: string,
	member: string,
	sink: (chunk: Buffer) => void,
): Promise<number> {
	const names = new Set([member, `./${member}`]);
	let pending = Buffer.alloc(0);
	let left = 0;
	let pad = 0;
	let taking = false;
	let found = false;
	let size = 0;
	let zeros = 0;
	let ended = false;
	const stream = createReadStream(archive).pipe(createGunzip());
	try {
		for await (const chunk of stream) {
			if (ended) continue;
			pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
			for (;;) {
				if (left > 0) {
					const n = Math.min(left, pending.length);
					if (n === 0) break;
					if (taking) sink(pending.subarray(0, n));
					pending = pending.subarray(n);
					left -= n;
					continue;
				}
				if (pad > 0) {
					const n = Math.min(pad, pending.length);
					if (n === 0) break;
					pending = pending.subarray(n);
					pad -= n;
					continue;
				}
				if (pending.length < BLOCK) break;
				const block = pending.subarray(0, BLOCK);
				pending = pending.subarray(BLOCK);
				if (block.every((byte) => byte === 0)) {
					zeros += 1;
					if (zeros === 2) {
						ended = true;
						break;
					}
					continue;
				}
				if (zeros > 0) {
					throw new PinsError(
						"ARCHIVE_MALFORMED",
						`${archive} has an entry after its end-of-archive block`,
					);
				}
				const header = parseHeader(block, archive);
				taking = names.has(header.name);
				if (taking) {
					if (found) {
						throw new PinsError(
							"ARCHIVE_UNSAFE",
							`${archive} holds ${member} twice; refusing to choose one`,
						);
					}
					if (header.type !== "0") {
						throw new PinsError(
							"ARCHIVE_UNSAFE",
							`${member} in ${archive} is not a regular file (tar type ${JSON.stringify(header.type)}); refusing to follow or create it`,
						);
					}
					if (header.size > MAX_MEMBER_BYTES) {
						throw new PinsError(
							"SIZE_EXCEEDED",
							`${member} in ${archive} is ${header.size} bytes, more than ${MAX_MEMBER_BYTES}`,
						);
					}
					found = true;
					size = header.size;
				}
				// Only regular files carry data; a link's size field is not trusted.
				const carried = header.type === "0" ? header.size : 0;
				left = carried;
				pad = (BLOCK - (carried % BLOCK)) % BLOCK;
			}
		}
	} catch (error) {
		if (error instanceof PinsError) throw error;
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`${archive} could not be read as gzip: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		stream.destroy();
	}
	if (!ended || left > 0 || pad > 0) {
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`${archive} ends before its end-of-archive blocks`,
		);
	}
	if (!found) {
		throw new PinsError(
			"ARCHIVE_MEMBER_MISSING",
			`${archive} holds no regular file named ${member}`,
		);
	}
	return size;
}

/** The sha256 of `member` inside `archive`, without writing anything. */
export async function memberDigest(
	archive: string,
	member: string,
): Promise<string> {
	const hash = createHash("sha256");
	await readMember(archive, member, (chunk) => hash.update(chunk));
	return hash.digest("hex");
}

/**
 * Write `member` of the already verified `archive` to `dest`, mode 0755. The
 * bytes go to a private partial file first and are renamed into place only
 * once all of them are there; any failure leaves nothing at `dest`.
 */
export async function extractMember(
	archive: string,
	member: string,
	dest: string,
): Promise<void> {
	const partial = partialPath(dest);
	const guard = armGuard(partial, () => undefined);
	let fd: number | undefined;
	try {
		// O_CREAT | O_EXCL: never an existing file, never through a link.
		fd = openSync(partial, "wx", 0o600);
		const out = fd;
		await readMember(archive, member, (chunk) => {
			writeSync(out, chunk);
		});
		fsyncSync(fd);
		fchmodSync(fd, 0o755);
		closeSync(fd);
		fd = undefined;
		renameSync(partial, dest);
	} catch (error) {
		if (fd !== undefined) closeSync(fd);
		rmSync(partial, { force: true });
		const signal = guard.interrupted();
		if (signal !== null) {
			throw new PinsError(
				"INTERRUPTED",
				`unpacking ${member} was interrupted by ${signal}; nothing was kept`,
			);
		}
		throw error;
	} finally {
		guard.release();
	}
}
