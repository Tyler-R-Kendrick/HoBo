/**
 * The archive reader against the system `tar`, on archives crafted byte by
 * byte. Whatever the reader accepts, it must name exactly the bytes `tar -xzf`
 * leaves at the member's path, both when `tar` extracts the whole archive and
 * when it extracts only that member by name; anything else it must refuse.
 *
 * Each case also says what the reader answers, so the reader is pinned on a
 * machine without `tar`; only the comparison with `tar` needs one.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PinsError } from "../lib/pins.ts";
import { memberDigest } from "../lib/pins-archive.ts";
import { scratch, sha256Hex } from "./support/pins-support.ts";
import { type TarEntry, tarGz } from "./support/tar-support.ts";

const GOOD = Buffer.from("#!/bin/sh\necho GOOD\n");
const EVIL = Buffer.from("#!/bin/sh\necho EVIL\n");
/** GNU tar's magic and version, `ustar  \0`. */
const GNU = "ustar  ";
const NAMES = new Map([
	[sha256Hex(GOOD), "GOOD"],
	[sha256Hex(EVIL), "EVIL"],
]);

interface Case {
	readonly what: string;
	readonly entries: readonly TarEntry[];
	/** Entries after the two end blocks. */
	readonly after?: readonly TarEntry[];
	/** The member the pin names; `mirror` unless given. */
	readonly member?: string;
	/** `GOOD` when the reader names GOOD's bytes, else the code it refuses with. */
	readonly reader: string;
}

const CASES: readonly Case[] = [
	{
		what: "mirror's own layout: LICENSE, then mirror",
		entries: [
			{ name: "LICENSE", body: "MIT\n" },
			{ name: "mirror", body: GOOD },
		],
		reader: "GOOD",
	},
	{
		what: "a nested member after its directory",
		entries: [
			{ name: "bin/", type: "5" },
			{ name: "bin/mirror", body: GOOD },
		],
		member: "bin/mirror",
		reader: "GOOD",
	},
	{
		what: "a nested member before its directory",
		entries: [
			{ name: "bin/mirror", body: GOOD },
			{ name: "bin/", type: "5" },
		],
		member: "bin/mirror",
		reader: "GOOD",
	},
	{
		what: "a nested member named through the ustar prefix",
		entries: [{ name: "mirror", prefix: "bin", body: GOOD }],
		member: "bin/mirror",
		reader: "GOOD",
	},
	{
		what: "a second mirror after the end blocks",
		entries: [{ name: "mirror", body: GOOD }],
		after: [{ name: "mirror", body: EVIL }],
		reader: "GOOD",
	},
	{
		what: "POSIX magic with an odd version, named through the prefix",
		entries: [
			{ name: "mirror", prefix: "bin", magic: "ustar\0XX", body: GOOD },
		],
		member: "bin/mirror",
		reader: "GOOD",
	},
	// GNU headers. Bytes 345 to 500 hold times there, and tar reads no prefix.
	{
		what: "mirror, then a GNU-magic mirror with zz where a prefix would be",
		entries: [
			{ name: "mirror", body: GOOD },
			{ name: "mirror", prefix: "zz", magic: GNU, body: EVIL },
		],
		reader: "ARCHIVE_UNSUPPORTED",
	},
	{
		what: "a lone GNU-magic mirror with zz where a prefix would be",
		entries: [{ name: "mirror", prefix: "zz", magic: GNU, body: EVIL }],
		reader: "ARCHIVE_UNSUPPORTED",
	},
	{
		what: "a GNU-magic mirror",
		entries: [{ name: "mirror", magic: GNU, body: GOOD }],
		reader: "ARCHIVE_UNSUPPORTED",
	},
	{
		what: "GNU magic with its version zeroed, which tar reads as v7",
		entries: [{ name: "mirror", magic: "ustar ", body: GOOD }],
		reader: "ARCHIVE_UNSUPPORTED",
	},
];

function archiveOf(crafted: Case): string {
	const path = join(scratch("tar-diff"), "a.tar.gz");
	writeFileSync(path, tarGz(crafted.entries, crafted.after));
	return path;
}

/** The reader's answer: the member's sha256, or the code it refused with. */
async function readerSays(path: string, member: string): Promise<string> {
	try {
		return (await memberDigest(path, member)).member;
	} catch (error) {
		if (error instanceof PinsError) return error.code;
		throw error;
	}
}

const label = (answer: string): string => NAMES.get(answer) ?? answer;

describe("crafted archives, as the reader reads them", () => {
	for (const crafted of CASES) {
		it(`${crafted.what}: ${crafted.reader === "GOOD" ? "names GOOD" : `refused, ${crafted.reader}`}`, async () => {
			const answer = await readerSays(
				archiveOf(crafted),
				crafted.member ?? "mirror",
			);
			assert.equal(label(answer), crafted.reader);
		});
	}
});

const noTar =
	spawnSync("tar", ["--version"]).status === 0
		? false
		: "no `tar` on PATH, so there is nothing to compare the reader with";

/** What `tar` leaves at `member`: a regular file's sha256 or what is there instead, and its exit status when not 0. */
function tarLeaves(path: string, member: string, named: boolean): string {
	const into = join(scratch("tar-diff-out"), "x");
	mkdirSync(into);
	const args = ["-xzf", path, "-C", into, ...(named ? [member] : [])];
	const run = spawnSync("tar", args, { encoding: "utf8" });
	const at = join(into, member);
	let found = "nothing";
	try {
		const stat = lstatSync(at);
		found = stat.isFile()
			? sha256Hex(readFileSync(at))
			: stat.isDirectory()
				? "a directory"
				: "not a regular file";
	} catch {
		// Nothing at the member's path.
	}
	return run.status === 0 ? found : `${label(found)} (tar exit ${run.status})`;
}

describe("crafted archives, against the system tar", () => {
	it("the reader refuses each, or names the bytes tar leaves at the member, extracting all or only the member", {
		skip: noTar,
	}, async () => {
		const disagreements: string[] = [];
		for (const crafted of CASES) {
			const path = archiveOf(crafted);
			const member = crafted.member ?? "mirror";
			const answer = await readerSays(path, member);
			if (!/^[0-9a-f]{64}$/u.test(answer)) continue;
			for (const named of [false, true]) {
				const left = tarLeaves(path, member, named);
				if (left !== answer) {
					disagreements.push(
						`${crafted.what} (${named ? `tar -xzf A ${member}` : "tar -xzf A"}): the reader names ${label(answer)}, tar leaves ${label(left)}`,
					);
				}
			}
		}
		assert.deepEqual(disagreements, []);
	});
});
