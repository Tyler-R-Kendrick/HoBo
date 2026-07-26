import fs from "node:fs";

// ==========================================================================
// Supplied artwork. Anything dropped into public/parallax/plates/ becomes a
// layer of the trail band: the file is tiled along x and scrolled at the
// speed named here, at its own aspect ratio, so nothing is squashed.
//
// The slot name is the file name. `plates/clouds.png` fills the cloud layer,
// `plates/sky.png` the distant one, and so on. Naming a plate after a layer
// this repo draws itself — poles, trail, fore — replaces the drawn one.
//
// A plate must repeat cleanly left-to-right; the band tiles it, it does not
// mirror or blend the join. Crop it vertically to the strip you want to see,
// because the whole image height is mapped onto the band height.
// ==========================================================================

/** Back to front, with each slot's speed relative to the trail plane. */
export const PLATE_SLOTS = [
	{ key: "sky", speed: 0.12, opacity: 0.5 },
	{ key: "clouds", speed: 0.28, opacity: 0.8 },
	{ key: "hills", speed: 0.4, opacity: 0.9 },
] as const;

export type PlateSlot = (typeof PLATE_SLOTS)[number]["key"];

const DIR = new URL("../../public/parallax/plates/", import.meta.url);
const EXTENSIONS = ["png", "webp", "avif", "jpg", "jpeg", "gif", "svg"];

/** Intrinsic size, straight out of the file header — no decoding needed. */
function measure(file: URL, ext: string): { w: number; h: number } | null {
	const bytes = fs.readFileSync(file);
	if (ext === "png" && bytes.length > 24) {
		return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
	}
	if (ext === "gif" && bytes.length > 10) {
		return { w: bytes.readUInt16LE(6), h: bytes.readUInt16LE(8) };
	}
	if (ext === "jpg" || ext === "jpeg") {
		// Walk the segment chain to the frame header that carries the size.
		let i = 2;
		while (i + 9 < bytes.length && bytes[i] === 0xff) {
			const marker = bytes[i + 1];
			const length = bytes.readUInt16BE(i + 2);
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return { w: bytes.readUInt16BE(i + 7), h: bytes.readUInt16BE(i + 5) };
			}
			i += 2 + length;
		}
		return null;
	}
	if (ext === "svg" || ext === "webp" || ext === "avif") {
		const head = bytes.subarray(0, 2048).toString("utf8");
		const box = /viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/.exec(head);
		if (box) return { w: Number(box[1]), h: Number(box[2]) };
		return null;
	}
	return null;
}

export type Plate = {
	key: string;
	speed: number;
	opacity: number;
	file: string;
	/** Tile width as a multiple of the band height, so the aspect holds. */
	aspect: number;
};

/**
 * Every plate actually present, in back-to-front order. Absent slots simply
 * do not render — the band is whatever artwork is there plus what it draws.
 */
export function plates(): Plate[] {
	if (!fs.existsSync(DIR)) return [];
	const found: Plate[] = [];
	for (const slot of PLATE_SLOTS) {
		for (const ext of EXTENSIONS) {
			const file = new URL(`${slot.key}.${ext}`, DIR);
			if (!fs.existsSync(file)) continue;
			const size = measure(file, ext);
			found.push({
				key: slot.key,
				speed: slot.speed,
				opacity: slot.opacity,
				file: `${slot.key}.${ext}`,
				// A plate whose size cannot be read is assumed 3:2, the shape the
				// reference sheets came in.
				aspect: size && size.h > 0 ? size.w / size.h : 1.5,
			});
			break;
		}
	}
	return found;
}

/** Slots a plate could fill but nothing has been dropped into yet. */
export function emptySlots(): string[] {
	const filled = new Set(plates().map((p) => p.key));
	return PLATE_SLOTS.map((s) => s.key).filter((k) => !filled.has(k));
}
