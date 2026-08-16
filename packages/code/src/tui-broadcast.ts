/**
 * Algorithmic cartoon CRT / film-broadcast bezel.
 *
 * Pixel-ink silhouette (█▄▀▌▐), centered title plaque, symmetric film perfs.
 * Not a decorated unicode box. DESIGN.md: thick ink, hard sticker shadow,
 * never hairline SaaS rules or neon glow.
 */
import { ACCENT, type AccentName, fitCells } from "./rubberhose.js";

export const BROADCAST = {
	screw: "●",
	sprocket: "▪",
	block: "█",
	hood: "▄",
	chin: "▀",
	glassLeft: "▌",
	glassRight: "▐",
	sprocketStride: 4,
} as const;

/** Leading space + █▌ + ▐█ + sticker shadow. */
export const BROADCAST_INNER_INSET = 6;

/** Hood, top lip, bottom lip, chin, sticker row. */
export const BROADCAST_CHROME_ROWS = 5;

export interface BroadcastFrameOptions {
	readonly width: number;
	readonly title?: string;
	readonly accent?: AccentName;
	/** Film-gate phase; 0 is the still frame (reduced motion). */
	readonly phase?: number;
}

function paint(text: string, accent: AccentName, enabled: boolean): string {
	if (!enabled || accent === "none") return text;
	return `${ACCENT[accent]}${text}${ACCENT.reset}`;
}

function colourEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
	if (env.HOBO_CODE_NO_COLOR === "1") return false;
	return true;
}

function cells(width: number, fill = " "): string[] {
	return Array.from({ length: Math.max(0, width) }, () => fill);
}

function stamp(row: string[], start: number, piece: string): void {
	for (let i = 0; i < piece.length; i += 1) {
		const ch = piece[i];
		const at = start + i;
		if (ch === undefined || at < 0 || at >= row.length) continue;
		row[at] = ch;
	}
}

function placeCentered(
	row: string[],
	piece: string,
	from: number,
	to: number,
): void {
	const span = Math.max(0, to - from);
	if (piece.length === 0 || span === 0) return;
	const start = from + Math.max(0, Math.floor((span - piece.length) / 2));
	stamp(row, start, piece.slice(0, span));
}

/** Symmetric film perfs, inset from the glass so they read as a reel gate. */
export function sprocketBand(width: number, phase = 0): string {
	const row = cells(width, " ");
	if (width < 3) return row.join("");
	const stride = BROADCAST.sprocketStride;
	const mid = Math.floor(width / 2);
	const shift = ((phase % stride) + stride) % stride;
	for (
		let delta = shift;
		mid + delta < width - 1 || mid - delta > 0;
		delta += stride
	) {
		if (mid + delta < width - 1) row[mid + delta] = BROADCAST.sprocket;
		if (delta > 0 && mid - delta > 0) row[mid - delta] = BROADCAST.sprocket;
	}
	return row.join("");
}

function hoodRow(outer: number, title: string | undefined): string {
	const row = cells(outer, " ");
	const left = 2;
	const right = outer - 3;
	for (let i = left; i <= right; i += 1) row[i] = BROADCAST.block;
	stamp(row, left, `${BROADCAST.hood}${BROADCAST.hood}${BROADCAST.hood}`);
	stamp(row, right - 2, `${BROADCAST.hood}${BROADCAST.hood}${BROADCAST.hood}`);
	const plaque = title && title.length > 0 ? ` ${title} ` : "";
	placeCentered(row, plaque, left + 3, right - 2);
	return row.join("");
}

function lipRow(outer: number, kind: "top" | "bottom", phase: number): string {
	const row = cells(outer, " ");
	if (kind === "top") {
		stamp(row, 1, `${BROADCAST.hood}${BROADCAST.block}${BROADCAST.chin}`);
		stamp(
			row,
			outer - 4,
			`${BROADCAST.chin}${BROADCAST.block}${BROADCAST.hood}`,
		);
	} else {
		stamp(row, 1, `${BROADCAST.chin}${BROADCAST.block}${BROADCAST.hood}`);
		stamp(
			row,
			outer - 4,
			`${BROADCAST.hood}${BROADCAST.block}${BROADCAST.chin}`,
		);
		row[outer - 1] = "▒";
	}
	const bandFrom = 5;
	const bandTo = outer - 5;
	stamp(row, bandFrom, sprocketBand(Math.max(0, bandTo - bandFrom), phase));
	return row.join("");
}

function glassRow(
	outer: number,
	content: string,
	accent: AccentName,
	colour: boolean,
): string {
	const inner = Math.max(0, outer - BROADCAST_INNER_INSET);
	// Do NOT stamp ANSI into a cell array — escape bytes would overwrite ▐█▒.
	const left = ` ${BROADCAST.block}${BROADCAST.glassLeft}`;
	const right = `${BROADCAST.glassRight}${BROADCAST.block}▒`;
	const raw = `${left}${fitCells(content, inner)}${right}`;
	if (!colour || accent === "none") return fitCells(raw, outer);
	return paint(fitCells(raw, outer), accent, true);
}

function chinRow(outer: number): string {
	const row = cells(outer, " ");
	const left = 2;
	const right = outer - 3;
	for (let i = left; i <= right; i += 1) row[i] = BROADCAST.block;
	stamp(row, left, `${BROADCAST.chin}${BROADCAST.chin}${BROADCAST.chin}`);
	stamp(row, right - 2, `${BROADCAST.chin}${BROADCAST.chin}${BROADCAST.chin}`);
	row[outer - 1] = "▒";
	return row.join("");
}

function shadowRow(outer: number): string {
	const row = cells(outer, " ");
	for (let i = 3; i < outer; i += 1) row[i] = "▒";
	return row.join("");
}

/**
 * Paint body lines inside a rounded CRT/film bezel.
 * Returns `body.length + BROADCAST_CHROME_ROWS` rows.
 */
export function broadcastFrame(
	body: readonly string[],
	options: BroadcastFrameOptions,
): string[] {
	const accent = options.accent ?? "none";
	const phase = options.phase ?? 0;
	const colour = colourEnabled();
	const outer = Math.max(16, Math.trunc(options.width));
	const lines = [hoodRow(outer, options.title), lipRow(outer, "top", phase)];
	for (const line of body) {
		lines.push(glassRow(outer, line ?? "", accent, colour));
	}
	lines.push(lipRow(outer, "bottom", phase));
	lines.push(chinRow(outer));
	lines.push(shadowRow(outer));
	return lines.map((line) => fitCells(line, outer));
}

export function broadcastContentWidth(outerWidth: number): number {
	return Math.max(1, Math.trunc(outerWidth) - BROADCAST_INNER_INSET);
}
