/**
 * `foldName` against Unicode's own case folding. Two names a case-insensitive
 * file system stores as one file must fold to one name, or the reader would
 * accept an archive whose second copy of the member overwrites the first
 * there. `support/unicode-casefold.json` holds, for every assigned code point
 * of Unicode 15.1, its full case folding under canonical equivalence (Linux
 * casefold directories) and its simple uppercase (NTFS), and the
 * Default_Ignorable_Code_Point ranges; its generator is
 * `support/unicode-casefold.py`. `foldName` may join more than either.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { foldName } from "../lib/pins-tar.ts";
import { DEFAULT_IGNORABLE, firstIgnorable } from "../lib/pins-tar-names.ts";

interface Table {
	readonly unicode: string;
	readonly fold: readonly (readonly [number, string])[];
	readonly upcase: readonly (readonly [number, number])[];
	readonly ignorable: readonly (readonly [number, number])[];
}

function readTable(): Table {
	const parsed: Table = JSON.parse(
		readFileSync(
			new URL("support/unicode-casefold.json", import.meta.url),
			"utf8",
		),
	);
	return parsed;
}

const TABLE = readTable();

/** A name as the reader gets it: UTF-8 bytes in a latin1 string. */
const asBytes = (text: string): string =>
	Buffer.from(text, "utf8").toString("latin1");

const fold = (text: string): string => foldName(asBytes(text));

describe("foldName", () => {
	it("joins every pair Unicode 15.1's full case folding joins", () => {
		assert.equal(TABLE.unicode, "15.1.0");
		assert.ok(TABLE.fold.length > 1000);
		const split = TABLE.fold
			.filter(
				([point, folded]) => fold(String.fromCodePoint(point)) !== fold(folded),
			)
			.map(
				([point, folded]) =>
					`U+${point.toString(16).toUpperCase()} -> ${JSON.stringify(folded)}`,
			);
		assert.deepEqual(split, []);
	});

	it("joins every pair NTFS's simple uppercase joins", () => {
		assert.ok(TABLE.upcase.length > 1000);
		const split = TABLE.upcase
			.filter(
				([point, upper]) =>
					fold(String.fromCodePoint(point)) !==
					fold(String.fromCodePoint(upper)),
			)
			.map(
				([point, upper]) =>
					`U+${point.toString(16).toUpperCase()} -> U+${upper.toString(16).toUpperCase()}`,
			);
		assert.deepEqual(split, []);
	});

	it("folds a name the way it folds its letters: ẞH, ßh and ssh are one name", () => {
		assert.equal(fold("ẞH"), fold("ssh"));
		assert.equal(fold("ßh"), fold("ssh"));
		assert.equal(fold("STRAẞE"), fold("strasse"));
	});
});

describe("default-ignorable code points", () => {
	it("are Unicode 15.1's Default_Ignorable_Code_Point, every range of it", () => {
		assert.deepEqual(DEFAULT_IGNORABLE, TABLE.ignorable);
	});

	it("are found in a name, whichever of them it holds and wherever", () => {
		const missed: string[] = [];
		for (const [low, high] of TABLE.ignorable) {
			for (let point = low; point <= high; point += 1) {
				const name = asBytes(`mi${String.fromCodePoint(point)}rror`);
				if (firstIgnorable(name) !== point) {
					missed.push(`U+${point.toString(16).toUpperCase()}`);
				}
			}
		}
		assert.deepEqual(missed, []);
		assert.equal(firstIgnorable(asBytes("mirror")), undefined);
		assert.equal(firstIgnorable(asBytes("caf\u00e9")), undefined);
	});
});
