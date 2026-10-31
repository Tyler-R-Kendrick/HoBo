/**
 * The ustar reading behind `pins-archive.ts`: one header at a time, and the
 * scan that finds the one member a pin names. Pure: no file, no stream, no
 * gzip. Every refusal is a PinsError, thrown as soon as it is known.
 *
 * What it reads, and only that: POSIX ustar headers (magic `ustar\0`), whose
 * type is a regular file (`0`, or the old `\0`) or one
 * of the data-less types `1`–`6` (hard link, symbolic link, character device,
 * block device, directory, FIFO). Any other type is refused, because its data
 * is that entry's own contents to `tar` (a `7` contiguous file, a GNU `D`
 * dumpdir or `S` sparse file), or it renames the entry after it (pax `x`/`g`,
 * GNU `L`/`K`): a reader that skipped such data, or parsed it as headers,
 * would find members `tar` never extracts. A data-less type that claims data
 * is refused for the same reason.
 *
 * A GNU header (`ustar  \0`) is refused, and so is any other magic. Where
 * POSIX keeps a name prefix (bytes 345 to 500), a GNU header keeps times and
 * sparse-file data, and `tar` never reads a name there; mirror's archives are
 * made with `tar --format=ustar`, so they never carry one.
 *
 * Names are compared as `tar` would write them out: repeated slashes
 * collapsed, any leading `./` and a trailing `/` removed, so `.//mirror` is
 * `mirror` and a second copy spelled that way is the member twice.
 *
 * The scan ends at the two zero blocks that end the archive; what follows them
 * is not read, as `tar` does not read it. A single zero block followed by an
 * entry is refused.
 *
 * Erasable TypeScript with node builtins only.
 */
import { PinsError } from "./pins.ts";

export const BLOCK = 512;
/** The largest member read: the manifest's largest asset. */
export const MAX_MEMBER_BYTES = 2 * 1024 ** 3;

/** The data-less entry types, by what they are. */
const DATALESS = new Map([
	["1", "hard link"],
	["2", "symbolic link"],
	["3", "character device"],
	["4", "block device"],
	["5", "directory"],
	["6", "FIFO"],
]);

/** Types the reader refuses, named where the name says why. */
const REFUSED_KIND = new Map([
	["7", "contiguous file"],
	["D", "GNU dumpdir"],
	["S", "GNU sparse file"],
	["M", "GNU multi-volume continuation"],
	["N", "GNU old long name"],
	["V", "GNU volume label"],
]);

interface TarHeader {
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

/** A name as `tar` writes it out: `//` collapsed, leading `./` and a trailing `/` removed. */
export function normaliseName(name: string): string {
	let normal = name.replace(/\/{2,}/gu, "/");
	while (normal.startsWith("./")) normal = normal.slice(2);
	return normal.endsWith("/") ? normal.slice(0, -1) : normal;
}

function parseHeader(block: Buffer, archive: string): TarHeader {
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
	const magic = block.subarray(257, 263).toString("latin1");
	if (magic === "ustar ") {
		throw new PinsError(
			"ARCHIVE_UNSUPPORTED",
			`${archive} has a GNU-format header ("ustar  " magic), whose bytes 345 to 500 tar reads as times, never as a name prefix; only POSIX ustar headers are read`,
		);
	}
	if (magic !== "ustar\0") {
		throw new PinsError(
			"ARCHIVE_UNSUPPORTED",
			`${archive} has a header that is not ustar (no ustar magic: a v7 or unknown format); only POSIX ustar headers are read`,
		);
	}
	const type = field(block, 156, 1) || "0";
	if (type === "x" || type === "g" || type === "L" || type === "K") {
		throw new PinsError(
			"ARCHIVE_UNSUPPORTED",
			`${archive} carries a ${type === "x" || type === "g" ? "pax" : "GNU long-name"} header, which renames the entry after it; only plain ustar archives are read`,
		);
	}
	if (type !== "0" && !DATALESS.has(type)) {
		const kind = REFUSED_KIND.get(type);
		throw new PinsError(
			"ARCHIVE_UNSUPPORTED",
			`${archive} has a type ${JSON.stringify(type)} entry${kind === undefined ? "" : ` (${kind})`}, whose data tar reads as that entry's own; only regular files, links, devices, directories and FIFOs are read`,
		);
	}
	const size = octal(block, 124, 12, "size");
	const dataless = DATALESS.get(type);
	if (dataless !== undefined && size !== 0) {
		throw new PinsError(
			"ARCHIVE_MALFORMED",
			`${archive} has a ${dataless} entry that claims ${size} bytes of data; tar and this reader would disagree about what follows it`,
		);
	}
	const name = field(block, 0, 100);
	const prefix = field(block, 345, 155);
	return {
		name: normaliseName(prefix === "" ? name : `${prefix}/${name}`),
		size,
		type,
	};
}

/**
 * Feed it the decompressed archive in any chunking; it hands the bytes of
 * `member` to `sink` and stops at the end of the archive.
 */
export class TarScan {
	readonly #archive: string;
	readonly #member: string;
	readonly #sink: (chunk: Buffer) => void;
	#pending: Buffer = Buffer.alloc(0);
	#left = 0;
	#pad = 0;
	#taking = false;
	#found = false;
	#size = 0;
	#zeros = 0;
	#ended = false;

	constructor(archive: string, member: string, sink: (chunk: Buffer) => void) {
		this.#archive = archive;
		this.#member = member;
		this.#sink = sink;
	}

	/** True once the two end-of-archive blocks have been read. */
	get ended(): boolean {
		return this.#ended;
	}

	push(chunk: Buffer): void {
		if (this.#ended) return;
		this.#pending =
			this.#pending.length === 0
				? chunk
				: Buffer.concat([this.#pending, chunk]);
		// Each step consumes data, padding or one header block.
		let more = true;
		while (more && !this.#ended) more = this.#step();
	}

	/** The member's size, once the whole archive has been read. */
	finish(): number {
		if (!this.#ended || this.#left > 0 || this.#pad > 0) {
			throw new PinsError(
				"ARCHIVE_MALFORMED",
				`${this.#archive} ends before its end-of-archive blocks`,
			);
		}
		if (!this.#found) {
			throw new PinsError(
				"ARCHIVE_MEMBER_MISSING",
				`${this.#archive} holds no regular file named ${this.#member}`,
			);
		}
		return this.#size;
	}

	/** One unit of work; false when it needs more bytes. */
	#step(): boolean {
		if (this.#left > 0 || this.#pad > 0) {
			const want = this.#left > 0 ? this.#left : this.#pad;
			const n = Math.min(want, this.#pending.length);
			if (n === 0) return false;
			if (this.#left > 0) {
				if (this.#taking) this.#sink(this.#pending.subarray(0, n));
				this.#left -= n;
			} else {
				this.#pad -= n;
			}
			this.#pending = this.#pending.subarray(n);
			return true;
		}
		if (this.#pending.length < BLOCK) return false;
		const block = this.#pending.subarray(0, BLOCK);
		this.#pending = this.#pending.subarray(BLOCK);
		if (block.every((byte) => byte === 0)) {
			this.#zeros += 1;
			this.#ended = this.#zeros === 2;
			return true;
		}
		if (this.#zeros > 0) {
			throw new PinsError(
				"ARCHIVE_MALFORMED",
				`${this.#archive} has an entry after a lone zero block`,
			);
		}
		this.#header(parseHeader(block, this.#archive));
		return true;
	}

	#header(header: TarHeader): void {
		this.#taking = header.name === this.#member;
		if (this.#taking) {
			if (this.#found) {
				throw new PinsError(
					"ARCHIVE_UNSAFE",
					`${this.#archive} holds ${this.#member} twice; refusing to choose one`,
				);
			}
			if (header.type !== "0") {
				throw new PinsError(
					"ARCHIVE_UNSAFE",
					`${this.#member} in ${this.#archive} is a ${DATALESS.get(header.type) ?? "non-regular file"}, not a regular file; refusing to follow or create it`,
				);
			}
			if (header.size > MAX_MEMBER_BYTES) {
				throw new PinsError(
					"SIZE_EXCEEDED",
					`${this.#member} in ${this.#archive} is ${header.size} bytes, more than ${MAX_MEMBER_BYTES}`,
				);
			}
			this.#found = true;
			this.#size = header.size;
		}
		this.#left = header.size;
		this.#pad = (BLOCK - (header.size % BLOCK)) % BLOCK;
	}
}
