/**
 * Gzip-compressed ustar archives built in memory, so the archive tests can
 * make the hostile ones (a link where the binary should be, a pax header, a
 * member twice, a bad checksum) that no well-behaved `tar` writes.
 */
import { gzipSync } from "node:zlib";

export interface TarEntry {
	readonly name: string;
	readonly body?: Uint8Array | string;
	/** ustar type flag: "0" file (default), "2" symlink, "5" directory, "x" pax. */
	readonly type?: string;
	readonly linkname?: string;
	/** Corrupt the header checksum. */
	readonly badChecksum?: boolean;
}

function put(block: Buffer, text: string, at: number, length: number): void {
	block.write(text.slice(0, length), at, length, "latin1");
}

function octalField(value: number, length: number): string {
	return `${value.toString(8).padStart(length - 1, "0")}\0`;
}

function header(entry: TarEntry, size: number): Buffer {
	const block = Buffer.alloc(512);
	const name = entry.name;
	if (name.length > 100) {
		const cut = name.lastIndexOf("/", 155);
		put(block, name.slice(cut + 1), 0, 100);
		put(block, name.slice(0, cut), 345, 155);
	} else {
		put(block, name, 0, 100);
	}
	const type = entry.type ?? "0";
	put(block, octalField(type === "5" ? 0o755 : 0o755, 8), 100, 8);
	put(block, octalField(0, 8), 108, 8);
	put(block, octalField(0, 8), 116, 8);
	put(block, octalField(size, 12), 124, 12);
	put(block, octalField(0, 12), 136, 12);
	put(block, "        ", 148, 8);
	put(block, type, 156, 1);
	put(block, entry.linkname ?? "", 157, 100);
	put(block, "ustar\0", 257, 6);
	put(block, "00", 263, 2);
	let sum = 0;
	for (const byte of block) sum += byte;
	if (entry.badChecksum === true) sum += 1;
	put(block, `${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
	return block;
}

/** The archive bytes: entries in order, two zero blocks, gzip with no name or time. */
export function tarGz(entries: readonly TarEntry[]): Buffer {
	const parts: Buffer[] = [];
	for (const entry of entries) {
		const body =
			entry.body === undefined ? Buffer.alloc(0) : Buffer.from(entry.body);
		const size =
			entry.type === undefined || entry.type === "0" || entry.type === "x"
				? body.length
				: 0;
		parts.push(header(entry, size));
		if (size > 0) {
			parts.push(body);
			parts.push(Buffer.alloc((512 - (size % 512)) % 512));
		}
	}
	parts.push(Buffer.alloc(1024));
	return gzipSync(Buffer.concat(parts));
}

/** A pax extended header body that renames the next entry. */
export function paxPath(path: string): string {
	const record = ` path=${path}\n`;
	let length = record.length + 2;
	while (`${length}${record}`.length !== length) length += 1;
	return `${length}${record}`;
}
