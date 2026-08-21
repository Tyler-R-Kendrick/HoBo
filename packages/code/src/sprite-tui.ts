/**
 * Deterministic 2D sprite → TUI (terminal) conversion.
 *
 * Inspired by full-screen TUI image paint (Grok Build-style terminal
 * surfaces): fixed cell grid, no reflow between frames, Unicode half-blocks
 * (or braille) so a grayscale+alpha sprite sheet becomes an animatable
 * console string.
 *
 * Half-block mode: each terminal row covers 2 source pixels vertically
 * (▀ upper / ▄ lower / █ both / space neither). Braille mode packs 2×4.
 *
 * Pure functions — no canvas/DOM. PNG decode is gray+alpha only (PNG ct=4).
 */

import { inflateSync } from "node:zlib";
import { at, must } from "@hobo/core/total-access";

// ── PNG gray+alpha (color type 4) decoder ─────────────────────────────────

export interface GrayAlphaImage {
	readonly width: number;
	readonly height: number;
	/** Interleaved gray, alpha (length = width * height * 2). */
	readonly data: Uint8Array;
}

function readU32(buf: Uint8Array, o: number): number {
	return (
		((must(buf[o], "buf[o]") << 24) |
			(must(buf[o + 1], "buf[o + 1]") << 16) |
			(must(buf[o + 2], "buf[o + 2]") << 8) |
			must(buf[o + 3], "buf[o + 3]")) >>>
		0
	);
}

/**
 * Decode 8-bit grayscale+alpha PNG (color type 4). Deterministic pure inflate.
 * Throws on unsupported PNG variants.
 */
export function decodeGrayAlphaPng(bytes: Uint8Array): GrayAlphaImage {
	if (
		bytes.length < 8 ||
		bytes[0] !== 0x89 ||
		bytes[1] !== 0x50 ||
		bytes[2] !== 0x4e ||
		bytes[3] !== 0x47
	) {
		throw new Error("not a PNG");
	}
	let o = 8;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = -1;
	const idats: Uint8Array[] = [];
	while (o + 8 <= bytes.length) {
		const len = readU32(bytes, o);
		o += 4;
		const type = String.fromCharCode(
			must(bytes[o], "bytes[o]"),
			must(bytes[o + 1], "bytes[o + 1]"),
			must(bytes[o + 2], "bytes[o + 2]"),
			must(bytes[o + 3], "bytes[o + 3]"),
		);
		o += 4;
		const data = bytes.subarray(o, o + len);
		o += len + 4; // skip CRC
		if (type === "IHDR") {
			width = readU32(data, 0);
			height = readU32(data, 4);
			bitDepth = at(data, 8, "data");
			colorType = at(data, 9, "data");
		} else if (type === "IDAT") {
			idats.push(data);
		} else if (type === "IEND") {
			break;
		}
	}
	if (bitDepth !== 8 || colorType !== 4) {
		throw new Error(
			`unsupported PNG (need 8-bit gray+alpha ct=4; got depth=${bitDepth} ct=${colorType})`,
		);
	}
	const compressed = Buffer.concat(idats.map((c) => Buffer.from(c)));
	const raw = inflateSync(compressed);
	const bpp = 2; // gray + alpha
	const stride = width * bpp;
	const out = new Uint8Array(width * height * bpp);
	let src = 0;
	let prev = new Uint8Array(stride);
	for (let y = 0; y < height; y += 1) {
		const filter = must(raw[src++], "raw[src++]");
		const row = raw.subarray(src, src + stride);
		src += stride;
		const cur = new Uint8Array(stride);
		for (let i = 0; i < stride; i += 1) {
			const x = must(row[i], "row[i]");
			const a = i >= bpp ? must(cur[i - bpp], "cur[i - bpp]") : 0;
			const b = must(prev[i], "prev[i]");
			const c = i >= bpp ? must(prev[i - bpp], "prev[i - bpp]") : 0;
			let v: number;
			switch (filter) {
				case 0:
					v = x;
					break;
				case 1:
					v = (x + a) & 255;
					break;
				case 2:
					v = (x + b) & 255;
					break;
				case 3:
					v = (x + ((a + b) >> 1)) & 255;
					break;
				case 4: {
					// Paeth
					const p = a + b - c;
					const pa = Math.abs(p - a);
					const pb = Math.abs(p - b);
					const pc = Math.abs(p - c);
					const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
					v = (x + pr) & 255;
					break;
				}
				default:
					throw new Error(`unsupported PNG filter ${filter}`);
			}
			cur[i] = v;
		}
		out.set(cur, y * stride);
		prev = cur;
	}
	return { width, height, data: out };
}

// ── Sprite sheet ──────────────────────────────────────────────────────────

export interface SpriteSheetMeta {
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly frameCount: number;
	readonly columns: number;
	readonly rows: number;
}

/** Horizontal strip (bo-idle: 12×1). */
export function spriteStripMeta(
	imageWidth: number,
	imageHeight: number,
	frameCount: number,
): SpriteSheetMeta {
	const columns = frameCount;
	const rows = 1;
	return {
		frameWidth: Math.floor(imageWidth / columns),
		frameHeight: imageHeight,
		frameCount,
		columns,
		rows,
	};
}

/**
 * Extract one frame's gray+alpha pixels (copy).
 * Frame index is row-major left→right, top→bottom.
 */
export function extractSpriteFrame(
	image: GrayAlphaImage,
	meta: SpriteSheetMeta,
	frameIndex: number,
): GrayAlphaImage {
	const i =
		((Math.trunc(frameIndex) % meta.frameCount) + meta.frameCount) %
		meta.frameCount;
	const col = i % meta.columns;
	const row = Math.floor(i / meta.columns);
	const fw = meta.frameWidth;
	const fh = meta.frameHeight;
	const data = new Uint8Array(fw * fh * 2);
	for (let y = 0; y < fh; y += 1) {
		const sy = row * fh + y;
		for (let x = 0; x < fw; x += 1) {
			const sx = col * fw + x;
			const si = (sy * image.width + sx) * 2;
			const di = (y * fw + x) * 2;
			data[di] = must(image.data[si], "image.data[si]");
			data[di + 1] = must(image.data[si + 1], "image.data[si + 1]");
		}
	}
	return { width: fw, height: fh, data };
}

// ── Pixel sampling ────────────────────────────────────────────────────────

export interface SampledBitmap {
	readonly width: number;
	readonly height: number;
	/** 1 = ink (visible), 0 = transparent/background. */
	readonly ink: Uint8Array;
}

/**
 * Downsample gray+alpha to a binary ink bitmap of target size.
 * Alpha threshold + optional invert (Bo is dark ink on transparent).
 * Nearest-neighbor — deterministic.
 */
export function sampleInkBitmap(
	image: GrayAlphaImage,
	targetWidth: number,
	targetHeight: number,
	options: { readonly alphaMin?: number; readonly darkIsInk?: boolean } = {},
): SampledBitmap {
	const tw = Math.max(1, Math.trunc(targetWidth));
	const th = Math.max(1, Math.trunc(targetHeight));
	const alphaMin = options.alphaMin ?? 40;
	const darkIsInk = options.darkIsInk !== false;
	const ink = new Uint8Array(tw * th);
	for (let y = 0; y < th; y += 1) {
		const sy = Math.min(
			image.height - 1,
			Math.floor(((y + 0.5) * image.height) / th),
		);
		for (let x = 0; x < tw; x += 1) {
			const sx = Math.min(
				image.width - 1,
				Math.floor(((x + 0.5) * image.width) / tw),
			);
			const i = (sy * image.width + sx) * 2;
			const g = must(image.data[i], "image.data[i]");
			const a = must(image.data[i + 1], "image.data[i + 1]");
			if (a < alphaMin) {
				ink[y * tw + x] = 0;
				continue;
			}
			// Bo: dark fur = ink; white eyes/bindle paper stay hollow so eyes read.
			// darkIsInk true (default): opaque dark → ink; light → empty.
			ink[y * tw + x] = darkIsInk ? (g < 160 ? 1 : 0) : g > 128 ? 1 : 0;
		}
	}
	return { width: tw, height: th, ink };
}

// ── Half-block + braille paint ────────────────────────────────────────────

const HALF = {
	none: " ",
	upper: "▀",
	lower: "▄",
	both: "█",
} as const;

/**
 * Render binary ink bitmap to Unicode half-blocks.
 * Output height = ceil(bitmap.height / 2); width = bitmap.width.
 * Each line padded to width.
 */
export function renderHalfBlocks(bitmap: SampledBitmap): string {
	const rows: string[] = [];
	const h = bitmap.height;
	const w = bitmap.width;
	for (let y = 0; y < h; y += 2) {
		let line = "";
		for (let x = 0; x < w; x += 1) {
			const top = must(bitmap.ink[y * w + x], "bitmap.ink[y * w + x]") === 1;
			const bot =
				y + 1 < h
					? must(bitmap.ink[(y + 1) * w + x], "bitmap.ink[(y + 1) * w + x]") ===
						1
					: false;
			if (top && bot) line += HALF.both;
			else if (top) line += HALF.upper;
			else if (bot) line += HALF.lower;
			else line += HALF.none;
		}
		rows.push(line);
	}
	return rows.join("\n");
}

/** Braille base U+2800; dots 1–8 map to bits. */
const BRAILLE_BASE = 0x2800;
// Dot bit order for (x,y) in 2×4 cell:
// (0,0)=0x01 (0,1)=0x02 (0,2)=0x04 (0,3)=0x40
// (1,0)=0x08 (1,1)=0x10 (1,2)=0x20 (1,3)=0x80
const BRAILLE_DOT = [
	[0x01, 0x02, 0x04, 0x40],
	[0x08, 0x10, 0x20, 0x80],
] as const;

/**
 * Render binary ink bitmap to braille (2×4 px per cell).
 * Output width = ceil(bw/2), height = ceil(bh/4).
 */
export function renderBraille(bitmap: SampledBitmap): string {
	const bw = bitmap.width;
	const bh = bitmap.height;
	const cw = Math.ceil(bw / 2);
	const ch = Math.ceil(bh / 4);
	const rows: string[] = [];
	for (let cy = 0; cy < ch; cy += 1) {
		let line = "";
		for (let cx = 0; cx < cw; cx += 1) {
			let bits = 0;
			for (let dy = 0; dy < 4; dy += 1) {
				for (let dx = 0; dx < 2; dx += 1) {
					const px = cx * 2 + dx;
					const py = cy * 4 + dy;
					if (px < bw && py < bh && bitmap.ink[py * bw + px] === 1) {
						const dotRow = must(BRAILLE_DOT[dx], "BRAILLE_DOT[dx]");
						bits |= must(dotRow[dy], "BRAILLE_DOT[dx][dy]");
					}
				}
			}
			line += String.fromCharCode(BRAILLE_BASE + bits);
		}
		rows.push(line);
	}
	return rows.join("\n");
}

export type TuiSpriteMode = "half-block" | "braille";

export interface SpriteToTuiOptions {
	/** Terminal columns for the sprite (half-block width = sample width). */
	readonly cols: number;
	/** Terminal rows for the sprite (half-block: sample height = rows*2). */
	readonly rows: number;
	readonly mode?: TuiSpriteMode;
	readonly alphaMin?: number;
}

/**
 * Convert one sprite frame image to a fixed-size TUI string
 * (exactly `rows` lines × `cols` cells after pad).
 */
export function spriteFrameToTui(
	frame: GrayAlphaImage,
	options: SpriteToTuiOptions,
): string {
	const cols = Math.max(1, Math.trunc(options.cols));
	const rows = Math.max(1, Math.trunc(options.rows));
	const mode = options.mode ?? "half-block";
	const sampleW = mode === "braille" ? cols * 2 : cols;
	const sampleH = mode === "braille" ? rows * 4 : rows * 2;
	const bitmap = sampleInkBitmap(
		frame,
		sampleW,
		sampleH,
		options.alphaMin !== undefined ? { alphaMin: options.alphaMin } : {},
	);
	const raw =
		mode === "braille" ? renderBraille(bitmap) : renderHalfBlocks(bitmap);
	// Force exact geometry.
	const lines = raw.split("\n");
	const out: string[] = [];
	for (let i = 0; i < rows; i += 1) {
		const line = lines[i] ?? "";
		out.push(
			line.length === cols
				? line
				: line.length > cols
					? line.slice(0, cols)
					: line + " ".repeat(cols - line.length),
		);
	}
	return out.join("\n");
}

/**
 * Convert a full horizontal strip PNG into an ordered list of TUI frames.
 */
export function spriteStripToTuiFrames(
	image: GrayAlphaImage,
	frameCount: number,
	options: SpriteToTuiOptions,
): readonly string[] {
	const meta = spriteStripMeta(image.width, image.height, frameCount);
	const frames: string[] = [];
	for (let i = 0; i < meta.frameCount; i += 1) {
		const frame = extractSpriteFrame(image, meta, i);
		frames.push(spriteFrameToTui(frame, options));
	}
	return Object.freeze(frames);
}

/** Geometry of a painted TUI sprite (all lines equal width). */
export function measureTuiSprite(text: string) {
	const rows = text.length === 0 ? [] : text.split("\n");
	const widths = rows.map((r) => r.length);
	const width = widths.length > 0 ? Math.max(...widths) : 0;
	return {
		lines: rows.length,
		width,
		fixed: widths.length > 0 && widths.every((w) => w === width),
	};
}
