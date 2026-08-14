import { cellWidth, centreBlock, fitCells, INK } from "./rubberhose.js";

/** Centre a single line in `width` cells. Overflow truncates with an ellipsis. */
export interface InkTableRow {
	readonly label: string;
	readonly value: string;
}

/** Two-column ink table. Space gutters only — never hairline rules. */
export function formatInkTable(rows: readonly InkTableRow[]): string {
	const labelWidth = Math.max(0, ...rows.map((row) => row.label.length));
	return rows
		.map((row) => `${row.label.padEnd(labelWidth)}  ${row.value}`.trimEnd())
		.join("\n");
}

export function centerLine(text: string, width: number): string {
	const ink = text.trim();
	const visible = cellWidth(ink);
	if (visible >= width) return fitCells(ink, width);
	const left = Math.floor((width - visible) / 2);
	return fitCells(`${" ".repeat(left)}${ink}`, width);
}

export type LayoutMessageRole = "system" | "user" | "assistant" | "product";

export interface LayoutMessage {
	readonly role: LayoutMessageRole;
	readonly text: string;
}

export function wrapText(text: string, width: number, hang = 0): string[] {
	const w = Math.max(8, width);
	const indent = " ".repeat(Math.max(0, Math.min(hang, w - 8)));
	const out: string[] = [];
	for (const para of text.split("\n")) {
		if (para.length === 0) {
			out.push("");
			continue;
		}
		let rest = para;
		let col = w;
		while (rest.length > col) {
			let breakAt = rest.lastIndexOf(" ", col);
			if (breakAt < col * 0.5) breakAt = col;
			out.push(rest.slice(0, breakAt).trimEnd());
			rest = indent + rest.slice(breakAt).trimStart();
			col = w;
		}
		out.push(rest);
	}
	return out;
}

let wrapCache = new WeakMap<
	LayoutMessage,
	{ readonly width: number; readonly lines: readonly string[] }
>();

export function messagePrefix(role: LayoutMessageRole): string {
	return role === "user"
		? "you · "
		: role === "assistant"
			? "Bo  · "
			: role === "product"
				? "··· · "
				: "sys · ";
}

function isInkArtLine(line: string): boolean {
	return (
		line.includes(INK.topLeft) ||
		line.includes(INK.bottomLeft) ||
		line.includes(INK.vertical) ||
		line.includes(INK.shadow) ||
		/[█▄▀▌▐]/.test(line)
	);
}

export function wrapMessage(
	m: LayoutMessage,
	width: number,
): readonly string[] {
	const hit = wrapCache.get(m);
	if (hit && hit.width === width) return hit.lines;
	let lines: string[];
	if (m.text.includes(INK.topLeft) || /[█▄▀]/.test(m.text)) {
		lines = [];
		const raw = m.text.split("\n");
		let sawArt = false;
		let i = 0;
		while (i < raw.length) {
			const line = raw[i] ?? "";
			if (isInkArtLine(line)) {
				const group: string[] = [];
				while (i < raw.length && isInkArtLine(raw[i] ?? "")) {
					group.push(raw[i] ?? "");
					i += 1;
				}
				sawArt = true;
				lines.push(...centreBlock(group, width));
				continue;
			}
			if (line.length === 0) {
				lines.push("");
			} else if (sawArt) {
				lines.push(centerLine(line, width));
			} else {
				lines.push(
					...wrapText(
						messagePrefix(m.role) + line,
						width,
						messagePrefix(m.role).length,
					),
				);
			}
			i += 1;
		}
	} else {
		const prefix = messagePrefix(m.role);
		lines = wrapText(prefix + m.text, width, prefix.length);
	}
	wrapCache.set(m, { width, lines });
	return lines;
}

export function clearWrapCache(): void {
	wrapCache = new WeakMap();
}

export function peekWrapCache(
	message: LayoutMessage,
): { readonly width: number; readonly lines: readonly string[] } | undefined {
	return wrapCache.get(message);
}

export type ScrollOrigin = "end" | "start";

export function padLines(
	lines: readonly string[],
	height: number,
	scrollOffset = 0,
	origin: ScrollOrigin = "end",
): string[] {
	const max = Math.max(0, lines.length - height);
	const scroll = Math.max(0, Math.min(scrollOffset, max));
	const slice =
		origin === "start"
			? lines.slice(scroll, scroll + height)
			: lines.slice(
					Math.max(0, lines.length - scroll - height),
					lines.length - scroll,
				);
	const out = [...slice];
	while (out.length < height) out.push("");
	return out.slice(0, height);
}

/** Overwrite a rectangular sticker onto a padded cell grid. */
export function blitBlock(
	dest: readonly string[],
	src: readonly string[],
	row: number,
	col: number,
	destWidth: number,
): string[] {
	const width = Math.max(0, destWidth);
	const out = dest.map((line) =>
		line.length >= width
			? line.slice(0, width)
			: `${line}${" ".repeat(width - line.length)}`,
	);
	for (let i = 0; i < src.length; i += 1) {
		const y = row + i;
		if (y < 0 || y >= out.length) continue;
		const piece = src[i] ?? "";
		const line = out[y] ?? " ".repeat(width);
		const left = line.slice(0, Math.max(0, col));
		const mid = piece;
		const rightStart = Math.max(0, col) + mid.length;
		const right = line.slice(rightStart);
		const merged = `${left}${mid}${right}`;
		out[y] =
			merged.length >= width
				? merged.slice(0, width)
				: `${merged}${" ".repeat(width - merged.length)}`;
	}
	return out;
}

export function windowAround(
	lines: readonly string[],
	height: number,
	selectedIndex: number,
): { readonly lines: readonly string[]; readonly start: number } {
	if (lines.length <= height) {
		return { lines: padLines(lines, height), start: 0 };
	}
	const visible = Math.max(1, height - 1);
	const start = Math.max(
		0,
		Math.min(
			selectedIndex - Math.floor((visible - 1) / 2),
			lines.length - visible,
		),
	);
	const end = Math.min(lines.length, start + visible);
	const shown = [
		...lines.slice(start, end),
		`  ${start + 1}-${end} of ${lines.length}`,
	];
	return { lines: padLines(shown, height), start };
}
