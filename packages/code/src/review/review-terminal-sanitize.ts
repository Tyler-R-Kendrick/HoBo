/**
 * Hostile git paths and comment bodies must never become live terminal
 * controls. Strip OSC/DCS/CSI/BEL/CR/bidi before any cell is painted.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: control stripping is the point
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: DCS payload ends at ST or BEL
const DCS = /\u001b[P^_X][\s\S]*?(?:\u001b\\|\u0007)/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: CSI includes cursor/erase/SGR
const CSI = /\u001b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: leftover ESC + one byte
const STRAY_ESC = /\u001b./gu;
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: remaining C0 minus TAB/LF
const C0 = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

export function containsUnsafeTerminalControl(value: string): boolean {
	return (
		value.includes("\u001b") ||
		value.includes("\u0007") ||
		value.includes("\r") ||
		/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(value)
	);
}

function stripControls(value: string): string {
	return value
		.replace(OSC, "")
		.replace(DCS, "")
		.replace(CSI, "")
		.replace(STRAY_ESC, "")
		.replace(BIDI, "")
		.replace(C0, "");
}

/** Single-line display: flatten CR/LF so a CR cannot overwrite the row. */
export function sanitizeReviewTerminalText(value: string): string {
	return stripControls(
		value.replace(/\r\n/gu, "\n").replace(/[\r\n\t]/gu, " "),
	);
}

/** Keep newlines for wrapped comment bodies; still flatten CR. */
export function sanitizeReviewTerminalMultiline(value: string): string {
	return stripControls(
		value.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").replace(/\t/gu, " "),
	);
}
