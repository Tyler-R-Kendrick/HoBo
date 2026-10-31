/**
 * The archive reader against the archives a careful reader must not trust:
 * entries `tar` would read differently, names spelled two ways, files that
 * cannot be opened, bytes that are not the pinned archive.
 *
 * Where the question is "what would `tar` do", the answer is GNU tar's, run
 * on the same bytes: an entry type the reader does not model carries data
 * that GNU tar treats as that entry's contents, never as headers, so a reader
 * that skipped over the type and parsed the data as headers would find a
 * member `tar` never extracts. Refusing such a type is the only safe reading.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";

import { PinsError } from "../lib/pins.ts";
import {
	extractMember,
	MAX_MEMBER_BYTES,
	memberDigest,
} from "../lib/pins-archive.ts";
import { scratch, sha256Hex } from "./support/pins-support.ts";
import { tarGz, tarStream } from "./support/tar-support.ts";

const BINARY = Buffer.from("#!/bin/sh\necho mirror from an archive\n");
const SMUGGLED = Buffer.from("#!/bin/sh\necho smuggled\n");

function refusal(code: string) {
	return (error: Error) => error instanceof PinsError && error.code === code;
}

function archiveFile(bytes: Buffer) {
	const dir = scratch("archive-hostile");
	const path = join(dir, "a.tar.gz");
	writeFileSync(path, bytes);
	return { dir, path };
}

/** GNU tar is the reference; elsewhere these comparisons say why they did not run. */
const gnuTar = (() => {
	const probe = spawnSync("tar", ["--version"], { encoding: "utf8" });
	return probe.status === 0 && /GNU tar/u.test(probe.stdout)
		? "tar"
		: undefined;
})();
const gnuOnly =
	gnuTar === undefined
		? "needs GNU tar, which this machine does not have"
		: false;

/** What GNU tar lists, and what it extracts into a fresh directory. */
function asGnuTarSees(path: string) {
	const listed = execFileSync("tar", ["-tzf", path], { encoding: "utf8" })
		.split("\n")
		.filter((line) => line !== "");
	const into = join(scratch("gnu-tar-out"), "x");
	mkdirSync(into);
	spawnSync("tar", ["-xzf", path, "-C", into], { encoding: "utf8" });
	return { listed, extracted: readdirSync(into).sort() };
}

/** An entry of `type` whose data is a ustar stream holding a `mirror` member. */
function decoy(type: string): Buffer {
	return tarGz([
		{
			name: "decoy",
			type,
			body: tarStream([{ name: "mirror", body: SMUGGLED }]),
		},
	]);
}

describe("entry types the reader does not model", () => {
	for (const [type, kind] of [
		["7", "contiguous file"],
		["D", "GNU dumpdir"],
	] as const) {
		it(`refuses a type ${type} (${kind}) entry, whose data GNU tar never reads as headers`, async (t) => {
			const bytes = decoy(type);
			const { dir, path } = archiveFile(bytes);
			const dest = join(dir, "out");
			await assert.rejects(
				extractMember(path, "mirror", dest, sha256Hex(bytes)),
				refusal("ARCHIVE_UNSUPPORTED"),
			);
			assert.equal(existsSync(dest), false);
			if (gnuOnly !== false) {
				t.diagnostic(gnuOnly);
				return;
			}
			const seen = asGnuTarSees(path);
			assert.deepEqual(seen.listed, ["decoy"]);
			assert.equal(seen.extracted.includes("mirror"), false);
		});
	}

	for (const type of ["S", "M", "N", "V", "A", "Z"]) {
		it(`refuses a type ${type} entry as unsupported`, async () => {
			const bytes = tarGz([
				{ name: "other", type, body: "x" },
				{ name: "mirror", body: BINARY },
			]);
			const { dir, path } = archiveFile(bytes);
			await assert.rejects(
				extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
				refusal("ARCHIVE_UNSUPPORTED"),
			);
		});
	}

	it("refuses GNU long-name and long-link headers", async () => {
		for (const type of ["L", "K"]) {
			const bytes = tarGz([
				{ name: "././@LongLink", type, body: "mirror\0" },
				{ name: "evil", body: SMUGGLED },
			]);
			const { dir, path } = archiveFile(bytes);
			await assert.rejects(
				extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
				refusal("ARCHIVE_UNSUPPORTED"),
			);
		}
	});

	it("refuses a link, device or directory entry that claims data", async () => {
		for (const type of ["1", "2", "3", "4", "5", "6"]) {
			const bytes = tarGz([
				{
					name: "other",
					type,
					body: tarStream([{ name: "mirror", body: SMUGGLED }]),
				},
				{ name: "mirror", body: BINARY },
			]);
			const { dir, path } = archiveFile(bytes);
			await assert.rejects(
				extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
				refusal("ARCHIVE_MALFORMED"),
				`type ${type}`,
			);
		}
	});

	it("refuses a member that is a hard link, a device or a FIFO", async () => {
		for (const type of ["1", "3", "4", "6"]) {
			const bytes = tarGz([{ name: "mirror", type, linkname: "LICENSE" }]);
			const { dir, path } = archiveFile(bytes);
			await assert.rejects(
				extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
				refusal("ARCHIVE_UNSAFE"),
				`type ${type}`,
			);
		}
	});

	it("refuses a header that is not ustar", async () => {
		const bytes = tarGz([{ name: "mirror", body: BINARY, magic: "" }]);
		const { dir, path } = archiveFile(bytes);
		await assert.rejects(
			extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
			refusal("ARCHIVE_UNSUPPORTED"),
		);
	});

	it("refuses a GNU-magic header, where tar reads no name prefix", async () => {
		const bytes = tarGz([
			{ name: "mirror", body: BINARY },
			{ name: "mirror", prefix: "zz", body: SMUGGLED, magic: "ustar  " },
		]);
		const { dir, path } = archiveFile(bytes);
		const dest = join(dir, "out");
		await assert.rejects(
			extractMember(path, "mirror", dest, sha256Hex(bytes)),
			refusal("ARCHIVE_UNSUPPORTED"),
		);
		assert.equal(existsSync(dest), false);
	});

	it("refuses a member over the size cap before reading its data", async () => {
		const bytes = tarGz([
			{ name: "mirror", claimedSize: MAX_MEMBER_BYTES + 1 },
		]);
		const { dir, path } = archiveFile(bytes);
		await assert.rejects(
			extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
			refusal("SIZE_EXCEEDED"),
		);
		assert.deepEqual(readdirSync(dir), ["a.tar.gz"]);
	});
});

describe("member names", () => {
	it("one name spelled two ways is the member twice", async () => {
		for (const second of [".//mirror", "./mirror/", "mirror/"]) {
			const bytes = tarGz([
				{ name: "mirror", body: BINARY },
				{ name: second, body: SMUGGLED },
			]);
			const { dir, path } = archiveFile(bytes);
			await assert.rejects(
				extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes)),
				refusal("ARCHIVE_UNSAFE"),
				second,
			);
		}
	});

	it("matches a member written as .//bin//mirror", async () => {
		const bytes = tarGz([{ name: ".//bin//mirror", body: BINARY }]);
		const { dir, path } = archiveFile(bytes);
		await extractMember(path, "bin/mirror", join(dir, "out"), sha256Hex(bytes));
		assert.deepEqual(readFileSync(join(dir, "out")), BINARY);
	});
});

describe("the end of the archive", () => {
	it("ignores entries after the two end blocks, as tar does", async () => {
		const bytes = tarGz(
			[{ name: "mirror", body: BINARY }],
			[{ name: "mirror", body: SMUGGLED }],
		);
		const { dir, path } = archiveFile(bytes);
		await extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes));
		assert.deepEqual(readFileSync(join(dir, "out")), BINARY);
	});

	it("stops inflating at the end blocks: a corrupt gzip trailer far past them is hashed, never reached", async () => {
		// A megabyte of incompressible bytes after the end blocks, then a gzip
		// trailer whose CRC is wrong. Only an inflater that read past the end of
		// the archive would see the CRC; the digest still covers every byte.
		const filler: Buffer[] = [];
		let seed = Buffer.from("filler");
		for (let i = 0; i < 1024 * 32; i += 1) {
			seed = createHash("sha256").update(seed).digest();
			filler.push(seed);
		}
		const bytes = Buffer.from(
			tarGz(
				[{ name: "mirror", body: BINARY }],
				[{ name: "after", body: Buffer.concat(filler) }],
			),
		);
		const crc = bytes.length - 8;
		bytes[crc] = (bytes[crc] ?? 0) ^ 0xff;
		assert.throws(() => gunzipSync(bytes), /incorrect data check/u);
		const { dir, path } = archiveFile(bytes);
		await extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes));
		assert.deepEqual(readFileSync(join(dir, "out")), BINARY);
		assert.deepEqual(await memberDigest(path, "mirror"), {
			archive: sha256Hex(bytes),
			member: sha256Hex(BINARY),
		});
	});
});

describe("the archive the bytes come from", () => {
	it("refuses to keep anything unless the bytes read hash to the pin", async () => {
		const bytes = tarGz([{ name: "mirror", body: BINARY }]);
		const { dir, path } = archiveFile(bytes);
		const dest = join(dir, "out");
		await assert.rejects(
			extractMember(path, "mirror", dest, "0".repeat(64)),
			refusal("DIGEST_MISMATCH"),
		);
		assert.deepEqual(readdirSync(dir), ["a.tar.gz"]);
	});

	it("a missing archive or a directory is a refusal, not a crash, and leaves no partial file", async () => {
		const dir = scratch("archive-unreadable");
		for (const archive of [join(dir, "absent.tar.gz"), dir]) {
			await assert.rejects(
				extractMember(archive, "mirror", join(dir, "out"), "0".repeat(64)),
				refusal("ARCHIVE_UNREADABLE"),
				archive,
			);
		}
		assert.deepEqual(readdirSync(dir), []);
	});
});
