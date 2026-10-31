/**
 * How the archive reader reads an entry's name besides its spelling: the
 * code points another file system ignores, the forms under which two names
 * are one file elsewhere, and how a name is shown in a refusal. A name
 * reaches these as the reader holds it: its bytes, one latin1 character
 * each.
 *
 * Erasable TypeScript with node builtins only.
 */

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** A name's bytes read as UTF-8, any that are not UTF-8 as U+FFFD. */
const asText = (name: string): string =>
	Buffer.from(name, "latin1").toString("utf8");

/**
 * Unicode 15.1's Default_Ignorable_Code_Point, as DerivedCoreProperties.txt
 * lists it, in inclusive ranges. HFS+ and some Linux casefold kernels drop
 * such code points when they compare names, so `mi‍rror` is `mirror`
 * there. `pins-archive-fold.test.ts` checks this list against the table
 * written from that file.
 */
export const DEFAULT_IGNORABLE: readonly (readonly [number, number])[] = [
	[0x00ad, 0x00ad],
	[0x034f, 0x034f],
	[0x061c, 0x061c],
	[0x115f, 0x1160],
	[0x17b4, 0x17b5],
	[0x180b, 0x180f],
	[0x200b, 0x200f],
	[0x202a, 0x202e],
	[0x2060, 0x206f],
	[0x3164, 0x3164],
	[0xfe00, 0xfe0f],
	[0xfeff, 0xfeff],
	[0xffa0, 0xffa0],
	[0xfff0, 0xfff8],
	[0x1bca0, 0x1bca3],
	[0x1d173, 0x1d17a],
	[0xe0000, 0xe0fff],
];

/** The first default-ignorable code point in `name`, if it holds one. */
export function firstIgnorable(name: string): number | undefined {
	for (const char of asText(name)) {
		const point = char.codePointAt(0) ?? 0;
		if (
			DEFAULT_IGNORABLE.some(([low, high]) => point >= low && point <= high)
		) {
			return point;
		}
	}
	return undefined;
}

/**
 * A name as a case-insensitive, normalisation-insensitive file system sees it:
 * its bytes read as UTF-8, put in NFC and case-folded by
 * `toLowerCase().toUpperCase().toLowerCase()`. That joins every pair of code
 * points Unicode 15.1's full case folding joins under canonical equivalence
 * (`ẞ`, `ß` and `ss`), the folding Linux casefold directories apply;
 * `pins-archive-fold.test.ts` checks it for every code point. It also joins
 * some names those keep apart (`ı` with `i`), and bytes that are not UTF-8
 * all read as U+FFFD: both only refuse more.
 */
export function foldName(name: string): string {
	const text = asText(name).normalize("NFC");
	return text.toLowerCase().toUpperCase().toLowerCase().normalize("NFC");
}

/** A character for a message: itself, or an escape when it would not show (a control, a format character, a space other than U+0020). */
function shownChar(char: string): string {
	if (char === '"' || char === "\\") return `\\${char}`;
	if (char === " " || !/[\p{C}\p{Z}]/u.test(char)) return char;
	return `\\u{${(char.codePointAt(0) ?? 0).toString(16)}}`;
}

/**
 * A name for a message, quoted: its bytes read as UTF-8, so `café` is shown
 * as `café` and not as the latin1 of its bytes, with anything unprintable
 * escaped. Bytes that are not UTF-8 are shown as `\xNN`.
 */
export function shownName(raw: string): string {
	let text: string | undefined;
	try {
		text = UTF8.decode(Buffer.from(raw, "latin1"));
	} catch {
		text = undefined;
	}
	let shown = "";
	for (const char of text ?? raw) {
		const code = char.charCodeAt(0);
		shown +=
			text === undefined && code >= 0x80
				? `\\x${code.toString(16).padStart(2, "0")}`
				: shownChar(char);
	}
	return `"${shown}"`;
}
