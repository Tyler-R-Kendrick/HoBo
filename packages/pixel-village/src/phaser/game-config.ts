/**
 * Phaser game config — FIT scale, no global window state, Arcade optional.
 * Physics: none for control-yard (projection-driven, not a platformer).
 */

import type { JsonObject } from "../json.js";
import { YARD_HEIGHT, YARD_WIDTH } from "../layout.js";

export type YardGameConfigOptions = Readonly<{
	parent?: string | HTMLElement;
	/** Deterministic test mode (?test=1). */
	testMode?: boolean;
	backgroundColor?: string;
}>;

// Returns a Phaser runtime config, not a JSON document: `parent` may be a live
// `HTMLElement`, which no `JsonValue` can describe. This is handed straight to
// Phaser and never serialized.
export function yardPhaserConfig(
	opts: YardGameConfigOptions = {},
): Readonly<Record<string, unknown>> {
	return {
		type: 0, // Phaser.AUTO at runtime
		width: YARD_WIDTH,
		height: YARD_HEIGHT,
		parent: opts.parent ?? "yard-root",
		backgroundColor: opts.backgroundColor ?? "#cfe0ec",
		scale: {
			mode: 3, // Phaser.Scale.FIT
			autoCenter: 1, // CENTER_BOTH
		},
		// No arcade physics — control plane is projection-driven (phaser-gamedev variation guidance).
		physics: { default: false },
		fps: opts.testMode
			? { target: 60, forceSetTimeOut: true, smoothStep: false }
			: { target: 60, smoothStep: true },
		render: {
			pixelArt: true,
			antialias: false,
			roundPixels: true,
		},
	};
}
