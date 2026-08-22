/**
 * Browser-safe asset-index core: types + pure resolvers.
 * No node imports — this module is bundled into the Phaser host.
 * Node-only loading (fs paths) lives in assets-index.ts.
 */

export type AnimationDef = Readonly<{
	id: string;
	sourceClipName: string;
	frames: number[] | "all";
	frameCount?: number;
	fps?: number;
	frameRate: number;
	repeat: number;
}>;

export type SpritesheetDef = Readonly<{
	id: string;
	path: string;
	width?: number;
	height?: number;
	frameWidth: number;
	frameHeight: number;
	columns: number;
	rows: number;
	margin: number;
	spacing: number;
	fps?: number;
	frameMs?: number;
	origin: { x: number; y: number };
	anchor?: string;
	neverMirrorFrom?: string;
	frames?: number[][] | "all" | number[];
	emptyCount?: number;
	animations: Readonly<Record<string, AnimationDef>>;
}>;

export type ImageDef = Readonly<{
	path: string;
	width: number;
	height: number;
	id?: string;
}>;

/** A synthesized audio clip. Sound follows the same manifest-only rule as art. */
export type AudioDef = Readonly<{
	id: string;
	path: string;
	durationMs: number;
	role: string;
	source?: string;
}>;

export type AssetIndex = Readonly<{
	meta?: Readonly<{
		version?: number;
		root?: string;
		defaultFps?: number;
		measuredAt?: string;
		artBible?: string;
		notes?: readonly string[];
	}>;
	/** gamedev-assets v2 categories */
	backgrounds?: Readonly<Record<string, ImageDef>>;
	images?: Readonly<Record<string, ImageDef>>;
	audio?: Readonly<Record<string, AudioDef>>;
	spritesheets: Readonly<Record<string, SpritesheetDef>>;
	animationIds: Readonly<Record<string, { sheet: string; animation: string }>>;
	zoneAssetKeys?: Readonly<Record<string, string>>;
}>;

/** Resolve stable animation id → sheet + clip metadata. Never hard-code clip names. */
export function resolveAnimation(index: AssetIndex, animationId: string) {
	const ref = index.animationIds[animationId];
	if (!ref) throw new Error(`unknown animation id: ${animationId}`);
	const sheet = index.spritesheets[ref.sheet];
	if (!sheet) {
		throw new Error(`unknown sheet for animation ${animationId}: ${ref.sheet}`);
	}
	const animation = sheet.animations[ref.animation];
	if (!animation) {
		throw new Error(`unknown animation ${ref.animation} on sheet ${ref.sheet}`);
	}
	return { sheet, animation };
}

export function expectedSheetPixelSize(sheet: SpritesheetDef) {
	const width =
		sheet.columns * sheet.frameWidth +
		sheet.margin * 2 +
		sheet.spacing * Math.max(0, sheet.columns - 1);
	const height =
		sheet.rows * sheet.frameHeight +
		sheet.margin * 2 +
		sheet.spacing * Math.max(0, sheet.rows - 1);
	return { width, height };
}

export function frameCount(sheet: SpritesheetDef): number {
	return sheet.columns * sheet.rows;
}

export function animationFrameList(
	sheet: SpritesheetDef,
	animation: AnimationDef,
): number[] {
	if (animation.frames === "all") {
		const n = animation.frameCount ?? frameCount(sheet);
		return Array.from({ length: n }, (_, i) => i);
	}
	return [...animation.frames];
}

/** All PNG paths for coverage / preload. */
export function allAssetPaths(index: AssetIndex): string[] {
	const paths: string[] = [];
	for (const b of Object.values(index.backgrounds ?? {})) paths.push(b.path);
	for (const i of Object.values(index.images ?? {})) paths.push(i.path);
	for (const s of Object.values(index.spritesheets)) paths.push(s.path);
	return paths;
}
