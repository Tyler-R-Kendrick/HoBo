/**
 * The sentences OpenSesame writes after its `opensesame: ` prefix, found in a
 * stream of stderr that its child shares. Everything here is a read of text
 * the child may have written: it returns text to classify and decides nothing.
 */

export const OWN_PREFIX = "opensesame: ";
/** How much of what follows the prefix is read; the longest sentence OpenSesame writes is under 300. */
export const SENTENCE_LIMIT = 512;

/**
 * Where each sentence's window starts and ends: after an `opensesame: `, up to
 * the next prefix or SENTENCE_LIMIT characters, whichever comes first. Stopping
 * at the next prefix keeps the windows apart (they sum to at most the text), so
 * each character is read once however the prefix is repeated; none of
 * OpenSesame's sentences holds the prefix itself.
 */
export function sentenceWindows(
	stderr: string,
): readonly (readonly [number, number])[] {
	const out: (readonly [number, number])[] = [];
	let at = stderr.indexOf(OWN_PREFIX);
	while (at >= 0) {
		const from = at + OWN_PREFIX.length;
		const next = stderr.indexOf(OWN_PREFIX, from);
		const end = Math.min(
			from + SENTENCE_LIMIT,
			next < 0 ? stderr.length : next,
		);
		out.push([from, end]);
		at = next;
	}
	return out;
}

/** What follows each `opensesame: ` in the text, up to the end of its line, the next prefix, or the limit. */
export function sentencesOf(stderr: string): string[] {
	return sentenceWindows(stderr).map(
		([from, end]) => stderr.slice(from, end).split(/[\r\n]/u, 1)[0] ?? "",
	);
}
