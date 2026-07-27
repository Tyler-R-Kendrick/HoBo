import fs from "node:fs";

// ==========================================================================
// Bo's walk sheets — one per direction, both supplied artwork.
//
// He is not symmetric. The bindle hangs off one specific anatomical arm, and
// mirroring the east sheet hands it to the other one, so the west sheet has to
// be drawn: the bindle arm goes *behind* the body, the bundle trails to
// screen-right, and the near-side free arm stays the plain white curve with a
// dot for a hand. See ../../public/parallax/README.md for the full brief.
//
// Because of that, a missing west sheet is not something to paper over. There
// is no fallback here on purpose — the mirror looked plausible enough to ship
// once already, and a build that fails is cheaper than a frame that lies.
// ==========================================================================

export type Facing = "east" | "west";

export const WALK_SHEETS = {
	east: "bo-walk.png",
	west: "bo-walk-left.png",
} as const satisfies Record<Facing, string>;

const DIR = new URL("../../public/parallax/", import.meta.url);

/** Whether the sheet for a direction has actually been supplied. */
export function hasWalkSheet(facing: Facing): boolean {
	return fs.existsSync(new URL(WALK_SHEETS[facing], DIR));
}

/** The sheet file for a direction, or a hard failure naming what is missing. */
export function walkSheet(facing: Facing): string {
	if (!hasWalkSheet(facing)) {
		throw new Error(
			`ParallaxTrail facing="${facing}" needs public/parallax/${WALK_SHEETS[facing]}, ` +
				"which has not been supplied. It cannot be produced by mirroring the other " +
				"sheet: that moves the bindle to the wrong anatomical arm. See " +
				"public/parallax/README.md.",
		);
	}
	return WALK_SHEETS[facing];
}
