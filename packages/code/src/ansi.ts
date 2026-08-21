/**
 * ANSI + control-character handling, in one place.
 *
 * eli5: terminals talk in invisible escape codes. Two things need doing with
 * them, and both were previously reimplemented in seven files: *strip* them so
 * a test (or a log scraper) can assert on the visible text, and *neutralise*
 * untrusted control characters before printing them back to a terminal.
 *
 * tldr: `stripSgr`/`stripAnsi` for measuring, `sanitizeDisplay` for printing.
 * These literals are the only place in the package allowed to name a control
 * character, so `lint/suspicious/noControlCharactersInRegex` is suppressed
 * here - deliberately, with a reason - instead of at every call site.
 */

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/** SGR colour/style sequences: ESC `[` ... `m`. */
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");

/** Any CSI sequence - cursor moves, erases, colours. */
const CSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "gu");

/** OSC sequences - window title, hyperlinks - terminated by BEL. */
const OSC = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "gu");

/**
 * Control characters that must never reach a terminal verbatim. Tab, LF and CR
 * are omitted on purpose - those are real layout, not smuggled escapes.
 */
function unsafeControlPattern(): RegExp {
	let chars = "";
	for (let code = 0; code <= 8; code += 1) chars += String.fromCharCode(code);
	chars += String.fromCharCode(11, 12);
	for (let code = 14; code <= 31; code += 1) chars += String.fromCharCode(code);
	chars += String.fromCharCode(127);
	return new RegExp(`[${chars}]`, "gu");
}
const UNSAFE_CONTROL = unsafeControlPattern();

/** Drop SGR colour/style codes, keeping every visible cell. */
export function stripSgr(text: string): string {
	return text.replace(SGR, "");
}

/** Drop every CSI and OSC sequence, leaving only painted cells. */
export function stripAnsi(text: string): string {
	return text.replace(CSI, "").replace(OSC, "");
}

/** Replace unsafe control characters with U+FFFD so untrusted text is printable. */
export function sanitizeDisplay(text: string): string {
	return text.replace(UNSAFE_CONTROL, "\uFFFD");
}

/** Cursor-previous-line moves (CSI n F) — a repaint that rewinds over prior output. */
const CURSOR_PREVIOUS_LINE = new RegExp(`${ESC}\\[\\d+F`, "u");

/** Every SGR run in `text`, in order — for asserting on a palette. */
export function sgrRuns(text: string): readonly string[] {
	return text.match(SGR) ?? [];
}

/** True when `text` rewinds the cursor over lines it already painted. */
export function hasCursorPreviousLine(text: string): boolean {
	return CURSOR_PREVIOUS_LINE.test(text);
}
