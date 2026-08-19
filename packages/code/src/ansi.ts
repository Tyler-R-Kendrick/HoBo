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

/** SGR colour/style sequences: ESC `[` ... `m`. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is the sequence being matched.
const SGR = /\u001b\[[0-9;]*m/gu;

/** Any CSI sequence - cursor moves, erases, colours. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is the sequence being matched.
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu;

/** OSC sequences - window title, hyperlinks - terminated by BEL. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC/BEL delimit the sequence being matched.
const OSC = /\u001b\][^\u0007]*\u0007/gu;

/**
 * Control characters that must never reach a terminal verbatim. Tab, LF and CR
 * are omitted on purpose - those are real layout, not smuggled escapes.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is what is being neutralised.
const UNSAFE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

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
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is the sequence being matched.
const CURSOR_PREVIOUS_LINE = /\u001b\[\d+F/u;

/** Every SGR run in `text`, in order — for asserting on a palette. */
export function sgrRuns(text: string): readonly string[] {
	return text.match(SGR) ?? [];
}

/** True when `text` rewinds the cursor over lines it already painted. */
export function hasCursorPreviousLine(text: string): boolean {
	return CURSOR_PREVIOUS_LINE.test(text);
}
