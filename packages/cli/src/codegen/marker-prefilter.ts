// The marker prefilter for ambient `@trainable` discovery (ADR-0128): which
// source files are worth parsing for a class with one of
// ts-autocode-grounding's marker decorators. It must pass every file in which
// grounding's scanner would find one, and it reads each file once, in time
// linear in its length, since it runs on every file of the source dir.

/** ts-autocode-grounding's marker decorators. */
export const MARKERS: ReadonlySet<string> = new Set(["trainable", "component"]);

/**
 * One character of an identifier as source may spell it: itself, or a
 * unicode escape for it (`\u0074`, `\u{74}`), hex digits in either case.
 * TypeScript reads both as the same identifier, and so does the scanner.
 */
function spelled(char: string): string {
	const hex = (char.codePointAt(0) ?? 0).toString(16);
	const digits = [...hex]
		.map((digit) =>
			/[a-f]/u.test(digit) ? `[${digit}${digit.toUpperCase()}]` : digit,
		)
		.join("");
	return `(?:${char}|\\\\u${"0".repeat(4 - hex.length)}${digits}|\\\\u\\{0*${digits}\\})`;
}

/**
 * A marker's name as an identifier that ends there, matched at `lastIndex`
 * only: no alternative can match a text two ways, so it runs in time linear
 * in what it reads.
 */
const MARKER_NAME = new RegExp(
	`(?:${[...MARKERS]
		.map((marker) => [...marker].map(spelled).join(""))
		.join("|")})(?![\\p{ID_Continue}$\\u200C\\u200D\\\\])`,
	"uy",
);

const LF = 0x0a;
const CR = 0x0d;
const SPACE = 0x20;
const SLASH = 0x2f;
const STAR = 0x2a;
const LESS = 0x3c;
const EQUALS = 0x3d;
const GREATER = 0x3e;
const BAR = 0x7c;
/** The length of a merge conflict marker's run of one character. */
const CONFLICT_RUN = 7;

/** TypeScript's line terminators (its scanner's `isLineBreak`). */
function isLineBreak(code: number): boolean {
	return code === LF || code === CR || code === 0x2028 || code === 0x2029;
}

/**
 * TypeScript's other whitespace (its scanner's `isWhiteSpaceSingleLine`):
 * JavaScript's `\s` without the line terminators, plus U+0085 and U+200B.
 */
function isSpace(code: number): boolean {
	return (
		code === 0x09 ||
		code === 0x0b ||
		code === 0x0c ||
		code === SPACE ||
		code === 0xa0 ||
		code === 0x85 ||
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200b) ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000 ||
		code === 0xfeff
	);
}

/**
 * Whether a merge conflict marker starts at `at`, as TypeScript's
 * `isConflictMarkerTrivia` reads one: at the start of a line, seven of one
 * character with more text after them, and a space after the seventh unless
 * the character is `=`.
 */
function isConflictMarker(source: string, at: number): boolean {
	if (at !== 0 && !isLineBreak(source.charCodeAt(at - 1))) return false;
	if (at + CONFLICT_RUN >= source.length) return false;
	const code = source.charCodeAt(at);
	for (let offset = 1; offset < CONFLICT_RUN; offset++) {
		if (source.charCodeAt(at + offset) !== code) return false;
	}
	return code === EQUALS || source.charCodeAt(at + CONFLICT_RUN) === SPACE;
}

/**
 * For each position of a text, the first position at or after it where
 * `starts` holds, or -1: what each kind of trivia reads to, worked out once
 * per text from its end, so no position is searched from twice.
 */
function nextWhere(
	length: number,
	starts: (at: number) => boolean,
): Int32Array {
	const next = new Int32Array(length + 1).fill(-1);
	for (let at = length - 1; at >= 0; at--) {
		next[at] = starts(at) ? at : (next[at + 1] ?? -1);
	}
	return next;
}

/**
 * TypeScript's scanner over one text, reading only trivia: what it skips
 * between two tokens. Every lookup is a table read, and where a token starts
 * is remembered for every position trivia was read from, so the trivia after
 * all of a text's `@`s together is read in time linear in its length.
 */
class TriviaReader {
	readonly #source: string;
	/** Where the next token starts, plus one, for each position read from; 0 when not yet read. */
	readonly #tokenStarts: Int32Array;
	readonly #tables = new Map<string, Int32Array>();

	constructor(source: string) {
		this.#source = source;
		this.#tokenStarts = new Int32Array(source.length + 1);
	}

	/** The first position at or after `at` where `starts` holds, or the text's end. */
	#next(kind: string, at: number, starts: (at: number) => boolean): number {
		let table = this.#tables.get(kind);
		if (table === undefined) {
			table = nextWhere(this.#source.length, starts);
			this.#tables.set(kind, table);
		}
		const found = table[at] ?? -1;
		return found === -1 ? this.#source.length : found;
	}

	#lineEnd(at: number): number {
		return this.#next("line break", at, (index) =>
			isLineBreak(this.#source.charCodeAt(index)),
		);
	}

	/**
	 * Where the trivia that starts at `at` ends, or `at` when none does: a
	 * whitespace character or line terminator; a block comment, to the first
	 * end of comment (to the end of the text when it has none, as the scanner
	 * reads it); a line comment, to its line's end, which any line terminator
	 * makes; and a merge conflict marker (scanConflictMarkerTrivia): `<<<<<<< `
	 * and `>>>>>>> ` to the end of the line, `|||||||` to the next `=======` or
	 * `>>>>>>> ` marker, and `=======` to the next `>>>>>>> ` marker.
	 */
	#triviaEnd(at: number): number {
		const source = this.#source;
		const code = source.charCodeAt(at);
		if (isSpace(code) || isLineBreak(code)) return at + 1;
		if (code === SLASH) {
			const second = source.charCodeAt(at + 1);
			if (second === STAR) {
				const close = this.#next(
					"end of comment",
					at + 2,
					(index) =>
						source.charCodeAt(index) === STAR &&
						source.charCodeAt(index + 1) === SLASH,
				);
				return Math.min(close + 2, source.length);
			}
			return second === SLASH ? this.#lineEnd(at + 2) : at;
		}
		if (
			(code === LESS || code === EQUALS || code === GREATER || code === BAR) &&
			isConflictMarker(source, at)
		) {
			if (code === LESS || code === GREATER) return this.#lineEnd(at);
			const greater = (index: number) =>
				source.charCodeAt(index) === GREATER && isConflictMarker(source, index);
			return code === BAR
				? this.#next(
						"middle or end marker",
						at,
						(index) =>
							(source.charCodeAt(index) === EQUALS &&
								isConflictMarker(source, index)) ||
							greater(index),
					)
				: this.#next("end marker", at, greater);
		}
		return at;
	}

	/** Where the scanner's next token starts, reading from `at`: past all the trivia there. */
	tokenStart(at: number): number {
		const read: number[] = [];
		let position = at;
		let known = this.#tokenStarts[position] ?? 0;
		while (known === 0) {
			read.push(position);
			const end =
				position < this.#source.length ? this.#triviaEnd(position) : position;
			if (end === position) {
				known = position + 1;
			} else {
				position = end;
				known = this.#tokenStarts[position] ?? 0;
			}
		}
		for (const from of read) this.#tokenStarts[from] = known;
		return known - 1;
	}
}

/**
 * Whether a source file may hold a class with a marker decorator, and so is
 * parsed: true when some `@` is followed, past the trivia TypeScript's scanner
 * skips, by a marker's name as an identifier that ends there. That is what the
 * scanner marks a class by (a decorator whose expression, or whose call's
 * callee, is that identifier), widened only by not knowing whether the text
 * is code, a comment or a string. The trivia is read as the scanner reads it
 * (checked against `ts.isWhiteSpaceLike` and `ts.isLineBreak` for every
 * UTF-16 code unit in the codegen test), once per position, and the name is
 * matched once per position the trivia leads to.
 */
export function mayHoldMarkedClass(source: string): boolean {
	const first = source.indexOf("@");
	if (first === -1) return false;
	const trivia = new TriviaReader(source);
	const matched = new Set<number>();
	for (let at = first; at !== -1; at = source.indexOf("@", at + 1)) {
		const name = trivia.tokenStart(at + 1);
		if (matched.has(name)) continue;
		matched.add(name);
		MARKER_NAME.lastIndex = name;
		if (MARKER_NAME.test(source)) return true;
	}
	return false;
}
