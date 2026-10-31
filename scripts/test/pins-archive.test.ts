/**
 * Asset pins of release archives, the library half: the pin records the
 * archive's sha256 and the one member to run, and `extractMember` reads that
 * member, and only that member, out of a verified archive. The verbs over
 * such a pin are `pins-archive-verbs.test.ts`.
 *
 * Archives are built in memory (support/tar-support.ts) so the hostile ones
 * can be: a link where the binary should be, the binary twice, a pax header
 * that renames it, a corrupt header, a truncated stream.
 */
import assert from "node:assert/strict";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PinsError, parsePins } from "../lib/pins.ts";
import { extractMember, memberDigest } from "../lib/pins-archive.ts";
import { serializePins } from "../lib/pins-assets.ts";
import { scratch, sha256Hex } from "./support/pins-support.ts";
import { paxPath, tarGz } from "./support/tar-support.ts";

const BINARY = Buffer.from("#!/bin/sh\necho mirror from an archive\n");
const ARCHIVE = tarGz([
	{ name: "LICENSE", body: "MIT\n" },
	{ name: "mirror", body: BINARY },
]);

function refusal(code: string) {
	return (error: Error) => error instanceof PinsError && error.code === code;
}

describe("extractMember", () => {
	function archiveFile(bytes: Buffer) {
		const dir = scratch("archive");
		const path = join(dir, "a.tar.gz");
		writeFileSync(path, bytes);
		return { dir, path };
	}

	it("writes only the named member, with its bytes and mode 0755; ./name matches too", async () => {
		const { dir, path } = archiveFile(ARCHIVE);
		const dest = join(dir, "mirror-entry");
		await extractMember(path, "mirror", dest, sha256Hex(ARCHIVE));
		assert.deepEqual(readFileSync(dest), BINARY);
		assert.equal(statSync(dest).mode & 0o777, 0o755);
		assert.deepEqual(readdirSync(dir).sort(), ["a.tar.gz", "mirror-entry"]);

		const dottedBytes = tarGz([{ name: "./mirror", body: BINARY }]);
		const dotted = archiveFile(dottedBytes);
		await extractMember(
			dotted.path,
			"mirror",
			join(dotted.dir, "out"),
			sha256Hex(dottedBytes),
		);
		assert.deepEqual(readFileSync(join(dotted.dir, "out")), BINARY);
		assert.deepEqual(await memberDigest(path, "mirror"), {
			archive: sha256Hex(ARCHIVE),
			member: sha256Hex(BINARY),
		});
	});

	it("never makes a path of a name in the archive", async () => {
		const bytes = tarGz([
			{ name: "../../escaped", body: "x" },
			{ name: "/etc/escaped", body: "x" },
			{ name: "mirror", body: BINARY },
		]);
		const { dir, path } = archiveFile(bytes);
		await extractMember(path, "mirror", join(dir, "out"), sha256Hex(bytes));
		assert.deepEqual(readdirSync(dir).sort(), ["a.tar.gz", "out"]);
		assert.equal(existsSync(join(dir, "..", "..", "escaped")), false);
	});

	const hostile: [string, Buffer, string][] = [
		[
			"a member the archive does not hold",
			tarGz([{ name: "LICENSE", body: "MIT" }]),
			"ARCHIVE_MEMBER_MISSING",
		],
		[
			"a member that is a symbolic link",
			tarGz([{ name: "mirror", type: "2", linkname: "/bin/sh" }]),
			"ARCHIVE_UNSAFE",
		],
		[
			"a member that is a directory",
			tarGz([{ name: "mirror", type: "5" }]),
			"ARCHIVE_UNSAFE",
		],
		[
			"the member twice",
			tarGz([
				{ name: "mirror", body: BINARY },
				{ name: "./mirror", body: "other" },
			]),
			"ARCHIVE_UNSAFE",
		],
		[
			"a pax header that renames the next entry",
			tarGz([
				{ name: "PaxHeader", type: "x", body: paxPath("mirror") },
				{ name: "evil", body: "x" },
			]),
			"ARCHIVE_UNSUPPORTED",
		],
		[
			"a header with a wrong checksum",
			tarGz([{ name: "mirror", body: BINARY, badChecksum: true }]),
			"ARCHIVE_MALFORMED",
		],
		[
			"a truncated archive",
			ARCHIVE.subarray(0, ARCHIVE.length - 20),
			"ARCHIVE_MALFORMED",
		],
		[
			"bytes that are not gzip",
			Buffer.from("not an archive at all"),
			"ARCHIVE_MALFORMED",
		],
	];
	for (const [what, bytes, code] of hostile) {
		it(`refuses ${what} (${code}) and leaves nothing at the destination`, async () => {
			const { dir, path } = archiveFile(bytes);
			const dest = join(dir, "out");
			await assert.rejects(
				extractMember(path, "mirror", dest, sha256Hex(bytes)),
				refusal(code),
			);
			assert.equal(existsSync(dest), false);
			assert.deepEqual(readdirSync(dir), ["a.tar.gz"]);
		});
	}
});

describe("an asset pin of an archive", () => {
	const file = (overrides: string) =>
		`{"url":"https://example.com/o/mirror/releases/download/v1.0.0/mirror_v1.0.0_linux_amd64.tar.gz","sha256":"${"a".repeat(64)}","size":10,"entry":"mirror"${overrides}}`;
	const manifest = (fileText: string) =>
		`{"schemaVersion":1,"git":{},"assets":{"mirror":{"repo":"https://example.com/o/mirror","tag":"v1.0.0","files":{"linux-x64":${fileText}}}},"vendor":{}}`;

	it("parses the archive and serialises it back unchanged", () => {
		const text = manifest(
			file(',"archive":{"format":"tar.gz","member":"mirror"}'),
		);
		const pins = parsePins(text);
		assert.deepEqual(pins.assets.mirror?.files["linux-x64"]?.archive, {
			format: "tar.gz",
			member: "mirror",
		});
		assert.equal(
			serializePins(pins),
			`${JSON.stringify(JSON.parse(text), null, 2)}\n`,
		);
	});

	for (const [what, archive] of [
		["a member that climbs out", '{"format":"tar.gz","member":"../mirror"}'],
		["an absolute member", '{"format":"tar.gz","member":"/mirror"}'],
		["an empty segment", '{"format":"tar.gz","member":"bin//mirror"}'],
		["a dot segment", '{"format":"tar.gz","member":"./mirror"}'],
		["an empty member", '{"format":"tar.gz","member":""}'],
		["a format it cannot read", '{"format":"zip","member":"mirror"}'],
		["an unknown key", '{"format":"tar.gz","member":"mirror","strip":1}'],
	] as const) {
		it(`refuses ${what}`, () => {
			assert.throws(
				() => parsePins(manifest(file(`,"archive":${archive}`))),
				refusal("PINS_MALFORMED"),
			);
		});
	}

	it("refuses an entry named like the archive it is unpacked from", () => {
		const text = manifest(
			file(',"archive":{"format":"tar.gz","member":"mirror"}').replace(
				'"entry":"mirror"',
				'"entry":"mirror_v1.0.0_linux_amd64.tar.gz"',
			),
		);
		assert.throws(() => parsePins(text), refusal("PINS_MALFORMED"));
	});

	it("refuses an archive whose URL does not end in .tar.gz", () => {
		const text = manifest(
			file(',"archive":{"format":"tar.gz","member":"mirror"}').replace(
				"mirror_v1.0.0_linux_amd64.tar.gz",
				"mirror-linux-x64",
			),
		);
		assert.throws(() => parsePins(text), refusal("PINS_MALFORMED"));
	});
});
