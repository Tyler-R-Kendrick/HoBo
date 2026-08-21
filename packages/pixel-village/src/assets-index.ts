/**
 * Node-side asset index loading (fs). Pure types/resolvers live in
 * assets-index-core.ts so the browser bundle never imports node:fs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AssetIndex } from "./assets-index-core.js";

export * from "./assets-index-core.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export function assetsRoot(): string {
	return join(HERE, "..", "assets");
}

export function loadAssetIndex(indexPath?: string): AssetIndex {
	const path = indexPath ?? join(assetsRoot(), "assets_index.json");
	// SAFETY: `const raw = JSON.parse(readFileSync(path, "utf8")) as AssetIndex;` is required at this I/O or test boundary.
	const raw = JSON.parse(readFileSync(path, "utf8")) as AssetIndex;
	return Object.freeze(raw);
}

export function sheetAbsolutePath(
	index: AssetIndex,
	sheetId: string,
	root = assetsRoot(),
): string {
	const sheet = index.spritesheets[sheetId];
	if (!sheet) throw new Error(`unknown sheet: ${sheetId}`);
	return join(root, sheet.path);
}

/** Phaser loader configs measured from index (STOP rule). */
export function phaserSpritesheetConfigs(
	index: AssetIndex,
	assetBaseUrl = "",
): readonly {
	key: string;
	url: string;
	frameWidth: number;
	frameHeight: number;
	margin: number;
	spacing: number;
}[] {
	return Object.values(index.spritesheets).map((sheet) => ({
		key: sheet.id,
		url: assetBaseUrl
			? `${assetBaseUrl.replace(/\/$/, "")}/${sheet.path}`
			: sheetAbsolutePath(index, sheet.id),
		frameWidth: sheet.frameWidth,
		frameHeight: sheet.frameHeight,
		margin: sheet.margin,
		spacing: sheet.spacing,
	}));
}
