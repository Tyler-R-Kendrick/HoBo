import { type JsonValue } from "../../src/json.js";
/**
 * Shared e2e plumbing for the experiential validation suite.
 *
 * Design rule (HIGHBALL plan): assertions go through the `window.__TEST__` seam
 * and semantic state. Where pixels are genuinely the subject (motion/stillness
 * duality, liveness beats, focus visibility) the regions are DERIVED FROM
 * `YARD_LAYOUT` / the scenario `expectedBeats` at runtime — never hard-coded —
 * so the suite survives the diegetic-prop visual rewrite.
 */

// @ts-expect-error - global playwright install, resolved by absolute path
export {
	expect,
	test,
} from "/home/codex/.local/lib/node_modules/playwright/test.mjs";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
// @ts-expect-error - global playwright install, resolved by absolute path
import type { Page } from "/home/codex/.local/lib/node_modules/playwright/index.mjs";
import type { ZoneId } from "../../src/layout.js";
import { YARD_LAYOUT } from "../../src/layout.js";
import type { BeatRegion } from "../../src/scenarios/scenario.js";
import type { YardTestState, YardTheme } from "../../src/test-seam.js";

export type { BeatRegion };
export { YARD_LAYOUT };

const READY_TIMEOUT = 45_000;

type SeamCommandFn = (...args: JsonValue[]) => JsonValue | void;

type SeamWindow = Window & {
	__TEST__: {
		ready: boolean;
		frameCount: number;
		state: () => YardTestState;
		commands: {
			advanceFrame?: (dt: number) => void;
			loadScenario?: SeamCommandFn;
			setTheme?: SeamCommandFn;
			selectZone?: SeamCommandFn;
			dismissSheet?: SeamCommandFn;
			advanceToTick?: SeamCommandFn;
			runAction?: SeamCommandFn;
			hoverZone?: SeamCommandFn;
			reset?: SeamCommandFn;
			seed?: SeamCommandFn;
		};
	};
};

/** Wait until the seam reports ready and has rendered a couple of frames. */
export async function waitForYard(page: Page): Promise<void> {
	await page.waitForFunction(
		// SAFETY: `() => (window as Partial<SeamWindow>).__TEST__?.ready === true,` is required at this I/O or test boundary.
		() => (window as SeamWindow).__TEST__?.ready === true,
		null,
		{ timeout: READY_TIMEOUT },
	);
	await waitForFrames(page, 2);
}

/** Wait for the Phaser render loop to advance `n` more frames. */
export async function waitForFrames(page: Page, n: number): Promise<void> {
	const start = await page.evaluate(
		// SAFETY: `() => (window as SeamWindow).__TEST__.frameCount,` is required at this I/O or test boundary.
		() => (window as SeamWindow).__TEST__.frameCount,
	);
	await page.waitForFunction(
		(target: number) =>
			// SAFETY: `(window as SeamWindow).__TEST__.frameCount >= target,` is required at this I/O or test boundary.
			(window as SeamWindow).__TEST__.frameCount >= target,
		start + n,
		{ timeout: 30_000 },
	);
}

export async function seamState(page: Page): Promise<YardTestState> {
	// SAFETY: `return (await page.evaluate(() =>` is required at this I/O or test boundary.
	return await page.evaluate(() =>
		// SAFETY: e2e host installs the playwright seam on window.
		(window as SeamWindow).__TEST__.state(),
	);
}

/** Invoke a seam command by name. Commands are the only way tests mutate state. */
export async function seamCommand(
	page: Page,
	name: string,
	...args: JsonValue[]
): Promise<void> {
	await page.evaluate(
		([cmd, callArgs]) => {
			// SAFETY: `const seam = (window as SeamWindow).__TEST__;` is required at this I/O or test boundary.
			const commands = (window as SeamWindow).__TEST__.commands;
			const fn =
				cmd === "advanceFrame"
					? commands.advanceFrame
					: cmd === "loadScenario"
						? commands.loadScenario
						: cmd === "setTheme"
							? commands.setTheme
							: cmd === "selectZone"
								? commands.selectZone
								: cmd === "dismissSheet"
									? commands.dismissSheet
									: cmd === "advanceToTick"
										? commands.advanceToTick
										: cmd === "runAction"
											? commands.runAction
											: cmd === "hoverZone"
												? commands.hoverZone
												: cmd === "reset"
													? commands.reset
													: cmd === "seed"
														? commands.seed
														: undefined;
			if (!(fn instanceof Function)) throw new Error(`no seam command: ${cmd}`);
			return fn(...callArgs);
		},
		[name, args] as const,
	);
}

export const loadScenario = (page: Page, id: string) =>
	seamCommand(page, "loadScenario", id);
export const advanceToTick = (page: Page, tick: number) =>
	seamCommand(page, "advanceToTick", tick);
export const setTheme = (page: Page, theme: YardTheme) =>
	seamCommand(page, "setTheme", theme);
export const selectZone = (page: Page, zone: ZoneId) =>
	seamCommand(page, "selectZone", zone);
export const dismissSheet = (page: Page) => seamCommand(page, "dismissSheet");

/** Step the engine `n` frames through the seam (deterministic dt). */
export async function advanceFrames(
	page: Page,
	n: number,
	dtMs = 16.67,
): Promise<void> {
	await page.evaluate(
		([count, dt]) => {
			// SAFETY: `const seam = (window as SeamWindow).__TEST__;` is required at this I/O or test boundary.
			const seam = (window as SeamWindow).__TEST__;
			// SAFETY: `for (let i = 0; i < (count as number); i++) {` is required at this I/O or test boundary.
			for (let i = 0; i < (count as number); i++) {
				seam.commands.advanceFrame?.(dt);
			}
		},
		[n, dtMs] as const,
	);
}

// ---------------------------------------------------------------- pixels ----

/**
 * Capture the whole game canvas. Element screenshot (not a viewport clip) so
 * the capture is independent of page scroll and DOM chrome height.
 */
export async function canvasPng(page: Page): Promise<PNG> {
	const canvas = page.locator("#yard canvas");
	await canvas.waitFor({ state: "visible", timeout: 30_000 });
	const buf = await canvas.screenshot({ animations: "allow" });
	return PNG.sync.read(buf);
}

/**
 * Crop a logical YARD_LAYOUT-space region out of a canvas capture. The canvas
 * is Phaser FIT-scaled, so the mapping is a single uniform factor derived at
 * runtime from the captured width — no hard-coded device pixel assumptions.
 */
export function cropRegion(png: PNG, region: BeatRegion): PNG {
	const scale = png.width / YARD_LAYOUT.width;
	const x = Math.max(0, Math.min(png.width - 1, Math.round(region.x * scale)));
	const y = Math.max(0, Math.min(png.height - 1, Math.round(region.y * scale)));
	const w = Math.max(1, Math.min(png.width - x, Math.round(region.w * scale)));
	const h = Math.max(1, Math.min(png.height - y, Math.round(region.h * scale)));
	const out = new PNG({ width: w, height: h });
	PNG.bitblt(png, out, x, y, w, h, 0, 0);
	return out;
}

export type PixelDelta = Readonly<{
	changed: number;
	total: number;
	pct: number;
}>;

/** Percentage of pixels that differ between two equally-sized captures. */
export function diffPct(a: PNG, b: PNG, threshold = 0.12): PixelDelta {
	const width = Math.min(a.width, b.width);
	const height = Math.min(a.height, b.height);
	const left =
		a.width === width && a.height === height ? a : resize(a, width, height);
	const right =
		b.width === width && b.height === height ? b : resize(b, width, height);
	const out = new PNG({ width, height });
	const changed = pixelmatch(left.data, right.data, out.data, width, height, {
		threshold,
		includeAA: false,
	});
	const total = width * height;
	return Object.freeze({
		changed,
		total,
		pct: total === 0 ? 0 : (changed / total) * 100,
	});
}

function resize(src: PNG, width: number, height: number): PNG {
	const out = new PNG({ width, height });
	PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
	return out;
}

/** Crop raw device pixels out of a capture (clamped to the image). */
export function cropPixels(
	png: PNG,
	rect: { x: number; y: number; width: number; height: number },
): PNG {
	const x = Math.max(0, Math.min(png.width - 1, Math.round(rect.x)));
	const y = Math.max(0, Math.min(png.height - 1, Math.round(rect.y)));
	const w = Math.max(1, Math.min(png.width - x, Math.round(rect.width)));
	const h = Math.max(1, Math.min(png.height - y, Math.round(rect.height)));
	const out = new PNG({ width: w, height: h });
	PNG.bitblt(png, out, x, y, w, h, 0, 0);
	return out;
}

/** Decode a PNG buffer (e.g. a `page.screenshot({ clip })` result). */
export function decodePng(buf: Buffer): PNG {
	return PNG.sync.read(buf);
}

/** Screenshot an element's box and return it decoded. */
export async function elementPng(page: Page, selector: string): Promise<PNG> {
	const buf = await page.locator(selector).screenshot({ animations: "allow" });
	return PNG.sync.read(buf);
}

/** Region helper for the SIMULATED film-leader tag band (top strip, right half). */
export function topRightBadgeBand(): BeatRegion {
	// Derived from layout width, not the presenter's private badge coordinates,
	// so a repositioned badge inside the top-right strip still lands in-band.
	return Object.freeze({
		x: Math.round(YARD_LAYOUT.width * 0.6),
		y: 0,
		w: Math.round(YARD_LAYOUT.width * 0.4),
		h: 56,
	});
}
