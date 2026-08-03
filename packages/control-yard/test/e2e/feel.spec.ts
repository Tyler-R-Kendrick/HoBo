/**
 * feel.spec — game-feel gates for the HoBo Yard.
 *
 * Everything here is asserted through the `window.__TEST__` seam or through
 * pixel regions DERIVED FROM `YARD_LAYOUT` at runtime, so the suite survives
 * the diegetic-prop visual rewrite (no baselines, no prop coordinates).
 *
 * Covers:
 *  - animation-clip coverage: every character clip in assets_index is actually
 *    reachable from a scenario+tick (or is on a documented unbound allowlist)
 *  - juice timing vs docs/validation/feel-budgets.json
 *  - motion/stillness duality (the dead-diagram catch)
 *  - day/night theme round-trip
 *  - frame pacing (advisory ceiling only)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { type Harness, startHarness } from "../../scripts/demo-harness.mjs";
import type { ZoneId } from "../../src/layout.js";
import { SCENARIOS } from "../../src/scenarios/index.js";
import {
	canvasPng,
	diffPct,
	expect,
	seamState,
	setTheme,
	test,
	waitForFrames,
	waitForYard,
	YARD_LAYOUT,
} from "./yard-fixture.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const assetIndex = JSON.parse(
	readFileSync(join(ROOT, "assets/assets_index.json"), "utf8"),
) as { animationIds: Record<string, { sheet: string; animation: string }> };

const budgets = JSON.parse(
	readFileSync(join(ROOT, "docs/validation/feel-budgets.json"), "utf8"),
) as {
	ackMaxMs: number;
	framePacing: { longTaskAdvisoryMs: number; longTaskFailMs: number };
	reducedMotion: { maxChangedPixelPct: number };
};

/** Character clips are the ones a player reads as a living creature. */
const CHARACTER_PREFIXES = ["bo.", "guest.", "bindlebug."] as const;

const CHARACTER_CLIPS = Object.keys(assetIndex.animationIds).filter((id) =>
	CHARACTER_PREFIXES.some((p) => id.startsWith(p)),
);

/**
 * Clips that exist in `assets_index.json` but that NO scenario+tick can put on
 * screen with the current mappings. Each entry is a real product gap, not a
 * test convenience — deleting an entry here is the acceptance criterion for
 * closing that gap.
 *
 *  - `guest.swe-claude.idle` / `guest.swe-claude.error`: `deriveYardVisualState`
 *    maps activity status → these clips (GUEST_ANIM), but both the presenter
 *    (`yard-presenter.ts` guest sprite) and the seam's `currentEntities()` in
 *    `main.ts` hard-code `"guest.swe-claude.work"`, so the idle/error plates
 *    can never render. Fix = feed `visual.guests[].animationId` through instead.
 *  - `guest.swe-claude.walk`: no state machine ever selects it — guests are
 *    stationary at the Connection Bay. Either give guests transit or drop the
 *    clip from the sheet.
 */
// `guest.swe-claude.idle` / `.error` became reachable once the presenter
// stopped hard-coding the "work" clip and started reading the derived guest
// state. `.walk` remains genuinely unbound: connectors are rendered at their
// post, and nothing moves them along the bay.
const KNOWN_UNBOUND_CLIPS: readonly string[] = Object.freeze([
	"guest.swe-claude.walk",
]);

const ZONES = Object.keys(YARD_LAYOUT.zones) as ZoneId[];

let harness: Harness;
/** Empty HOBO_HOME — the first-run waybill must really be able to open a station. */
let freshHarness: Harness;

// Both servers are started up front. Booting a second control-api *during* a
// test and then closing it under a live (SSE-subscribed) page wedges the
// Playwright context teardown, so harness lifetimes stay hook-scoped.
test.beforeAll(async () => {
	harness = await startHarness({ seedFixtures: true });
	freshHarness = await startHarness({ seedFixtures: false });
});

test.afterAll(async () => {
	await harness?.close();
	await freshHarness?.close();
});

test.describe("animation-clip coverage", () => {
	test("every character clip is reachable from some scenario + tick", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const seen = new Set<string>();

		for (const [id, scenario] of Object.entries(SCENARIOS)) {
			await page.goto(harness.gameUrl({ scenario: id }));
			await waitForYard(page);

			// Full tick sweep in-page: one round trip per scenario, not per tick.
			const sweep = (await page.evaluate((totalTicks: number) => {
				type Seam = {
					state: () => {
						bo: { animationId: string };
						entities: readonly { animationId: string }[];
					};
					commands: {
						advanceToTick: (n: number) => void;
						advanceFrame: (dt?: number) => void;
					};
				};
				const seam = (window as unknown as { __TEST__: Seam }).__TEST__;
				const found = new Set<string>();
				const collect = () => {
					const s = seam.state();
					found.add(s.bo.animationId);
					for (const e of s.entities) found.add(e.animationId);
				};
				for (let t = 0; t <= totalTicks; t++) {
					seam.commands.advanceToTick(t);
					collect();
					// Let Bo settle at the zone anchor: `resolveBoTransitAnim` masks
					// the projection clip while he is in transit, so a state that only
					// exists during a zone change would otherwise never be observable.
					for (let f = 0; f < 4; f++) {
						seam.commands.advanceFrame(16.67);
						collect();
					}
				}
				return [...found];
			}, scenario.totalTicks)) as string[];
			for (const clip of sweep) seen.add(clip);

			// Zone selection drives Bo transit, which is where the walk plates live.
			const walk = (await page.evaluate((zones: string[]) => {
				type Seam = {
					state: () => { bo: { animationId: string } };
					commands: {
						selectZone: (z: string) => void;
						dismissSheet: () => void;
						advanceFrame: (dt?: number) => void;
					};
				};
				const seam = (window as unknown as { __TEST__: Seam }).__TEST__;
				const found = new Set<string>();
				for (const zone of zones) {
					seam.commands.dismissSheet();
					seam.commands.selectZone(zone);
					for (let f = 0; f < 90; f++) {
						seam.commands.advanceFrame(16.67);
						found.add(seam.state().bo.animationId);
					}
				}
				return [...found];
			}, ZONES)) as string[];
			for (const clip of walk) seen.add(clip);
		}

		// Live (non-scenario) pass: some clips key off real transitions that no
		// scripted snapshot timeline reproduces (e.g. the success jump). Seeded,
		// because in ?test=1 the boot path never auto-runs init/up, so the seam
		// only becomes ready once a real snapshot exists.
		{
			await page.goto(harness.gameUrl({}));
			await waitForYard(page);
			const liveSeen = (await page.evaluate(async () => {
				type Seam = {
					state: () => {
						bo: { animationId: string };
						entities: readonly { animationId: string }[];
					};
					commands: {
						runAction: (a: string) => Promise<void>;
						advanceFrame: (dt?: number) => void;
					};
				};
				const seam = (window as unknown as { __TEST__: Seam }).__TEST__;
				const found = new Set<string>();
				const collect = () => {
					const s = seam.state();
					found.add(s.bo.animationId);
					for (const e of s.entities) found.add(e.animationId);
				};
				for (const action of [
					"init",
					"up",
					"publish-rail",
					"activate-rail",
					"create-conn",
					"authorize-conn",
				]) {
					await seam.commands.runAction(action).catch(() => undefined);
					// 240 frames ≈ 4s: longer than the 2s success window, and long
					// enough for Bo to finish any zone transit it triggered.
					for (let f = 0; f < 240; f++) {
						seam.commands.advanceFrame(16.67);
						collect();
					}
				}
				return [...found];
			})) as string[];
			for (const clip of liveSeen) seen.add(clip);
			// Detach the live SSE subscription: node's server.close() waits for
			// open connections, so leaving one attached wedges teardown.
			await page.goto("about:blank");
		}

		const unreachable = CHARACTER_CLIPS.filter((clip) => !seen.has(clip));
		const unexpected = unreachable.filter(
			(clip) => !KNOWN_UNBOUND_CLIPS.includes(clip),
		);
		const staleAllowlist = KNOWN_UNBOUND_CLIPS.filter((clip) => seen.has(clip));

		expect(
			unexpected,
			`character clips in assets_index.json that no scenario+tick can render.\n` +
				`reached: ${[...seen].sort().join(", ")}\n` +
				`unreachable: ${unreachable.join(", ")}`,
		).toEqual([]);
		expect(
			staleAllowlist,
			"KNOWN_UNBOUND_CLIPS entries are now reachable — delete them from the allowlist",
		).toEqual([]);
	});
});

test.describe("juice timing", () => {
	test(`command acknowledgment lands within ${budgets.ackMaxMs}ms`, async ({
		page,
	}) => {
		await page.goto(harness.gameUrl({}));
		await waitForYard(page);

		const result = (await page.evaluate(async () => {
			type Seam = {
				frameCount: number;
				state: () => { recentFx: readonly { fx: string; atFrame: number }[] };
				commands: { runAction: (a: string) => Promise<void> };
			};
			const seam = (window as unknown as { __TEST__: Seam }).__TEST__;
			const before = seam.state().recentFx.length;
			const framesBefore = seam.frameCount;
			const t0 = performance.now();
			let ackMs: number | null = null;
			let ackFrames: number | null = null;
			const pending = seam.commands.runAction("up").catch(() => undefined);
			await new Promise<void>((resolve) => {
				const poll = () => {
					if (seam.state().recentFx.length > before) {
						ackMs = performance.now() - t0;
						ackFrames = seam.frameCount - framesBefore;
						resolve();
						return;
					}
					if (performance.now() - t0 > 5000) {
						resolve();
						return;
					}
					requestAnimationFrame(poll);
				};
				poll();
			});
			await pending;
			const fx = seam.state().recentFx.slice(before);
			return { ackMs, ackFrames, fx };
		})) as {
			ackMs: number | null;
			ackFrames: number | null;
			fx: { fx: string; atFrame: number }[];
		};

		expect(
			result.ackMs,
			"runAction produced no entry in state().recentFx within 5s",
		).not.toBeNull();
		expect(result.fx.length).toBeGreaterThan(0);
		console.log(
			`[juice] ack in ${result.ackMs?.toFixed(1)}ms / ${result.ackFrames} frames — fx=${result.fx
				.map((f) => f.fx)
				.join(" | ")}`,
		);
		expect(
			result.ackMs as number,
			`JUI-1: acknowledgment must land within feel-budgets ackMaxMs=${budgets.ackMaxMs}ms`,
		).toBeLessThanOrEqual(budgets.ackMaxMs);
	});

	test("stamping the first-run waybill records a stamp fx", async ({
		page,
	}) => {
		// Fresh HOBO_HOME: the station.open waybill's init+up must really succeed.
		{
			await page.goto(freshHarness.gameUrl({ scenario: "first-run" }));
			await waitForYard(page);
			// first-run tick 0: station closed → exactly the station.open waybill.
			const before = await seamState(page);
			expect(
				before.waybillCount,
				"fresh station offers exactly one waybill",
			).toBe(1);

			await page.evaluate(() => {
				type Seam = { commands: { selectZone: (z: string) => void } };
				(window as unknown as { __TEST__: Seam }).__TEST__.commands.selectZone(
					"bootstrapDesk",
				);
			});
			expect(
				(await seamState(page)).sheetOpen,
				"bootstrapDesk must open the top waybill",
			).toBe(true);
			await page.locator("#sheet-confirm").click();
			// Wait for the stamp specifically: selectZone already recorded the
			// zone-label fx, so "any fx" would race the async confirm.
			await page.waitForFunction(
				() =>
					(
						window as unknown as {
							__TEST__: {
								state: () => { recentFx: readonly { fx: string }[] };
							};
						}
					).__TEST__
						.state()
						.recentFx.some((f) => /stamp:|Stamped/.test(f.fx)),
				null,
				{ timeout: 15_000 },
			);
			const after = await seamState(page);
			expect(after.recentFx.map((f) => f.fx).join(" ")).toMatch(
				/stamp:|Stamped/,
			);
		}
	});

	test("spiking a waybill records a spike fx without touching the server", async ({
		page,
	}) => {
		await page.goto(harness.gameUrl({ scenario: "first-run" }));
		await waitForYard(page);
		await page.evaluate(() => {
			type Seam = { commands: { selectZone: (z: string) => void } };
			(window as unknown as { __TEST__: Seam }).__TEST__.commands.selectZone(
				"bootstrapDesk",
			);
		});
		expect((await seamState(page)).sheetOpen).toBe(true);
		await page.locator("#sheet-spike").click();
		const after = await seamState(page);
		expect(after.recentFx.map((f) => f.fx).join(" ")).toMatch(/spike:waybill:/);
		expect(after.sheetOpen).toBe(false);
	});
});

test.describe("motion / stillness duality", () => {
	// Runs OUTSIDE ?test=1: test mode freezes sprites to a static frame
	// (presenter `testFrame`) and stops the engine tick, which would make the
	// "is it alive?" half of this pair pass vacuously.
	const liveUrl = () =>
		harness.gameUrl({
			scenario: "quiet-yard",
			test: false,
			seed: false,
			api: harness.apiUrl,
		});

	test("the idle yard is visibly alive when motion is allowed", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.goto(liveUrl());
		await page.waitForFunction(
			() =>
				(window as unknown as { __TEST__?: { frameCount?: number } }).__TEST__
					?.frameCount !== undefined,
			null,
			{ timeout: 45_000 },
		);
		await waitForFrames(page, 30);
		const a = await canvasPng(page);
		await waitForFrames(page, 60);
		const b = await canvasPng(page);
		const delta = diffPct(a, b);
		console.log(`[duality] motion-on delta=${delta.pct.toFixed(3)}%`);
		expect(
			delta.pct,
			"JUI-4: the idle world must read alive — 60 frames apart the canvas is pixel-identical (dead diagram)",
		).toBeGreaterThan(budgets.reducedMotion.maxChangedPixelPct);
	});

	test("reduced motion makes the yard still, not silent", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(liveUrl());
		await page.waitForFunction(
			() =>
				(window as unknown as { __TEST__?: { frameCount?: number } }).__TEST__
					?.frameCount !== undefined,
			null,
			{ timeout: 45_000 },
		);
		await waitForFrames(page, 30);
		const a = await canvasPng(page);
		await waitForFrames(page, 60);
		const b = await canvasPng(page);
		const delta = diffPct(a, b);
		console.log(`[duality] reduced-motion delta=${delta.pct.toFixed(3)}%`);

		// Still: nothing moves...
		expect(
			delta.pct,
			`JUI-4: prefers-reduced-motion must hold the yard still (<= ${budgets.reducedMotion.maxChangedPixelPct}% changed pixels)`,
		).toBeLessThanOrEqual(budgets.reducedMotion.maxChangedPixelPct);

		// ...but never silent: the yard must still be drawn, not blanked.
		const ink = countInk(a);
		expect(
			ink,
			"reduced motion must not blank the yard — 'still, never silent'",
		).toBeGreaterThan(0.005);
	});
});

test.describe("day / night", () => {
	test("theme round-trips through the seam and the document", async ({
		page,
	}) => {
		await page.goto(harness.gameUrl({ scenario: "quiet-yard" }));
		await waitForYard(page);
		expect((await seamState(page)).theme).toBe("day");

		await setTheme(page, "night");
		await waitForFrames(page, 2);
		expect((await seamState(page)).theme).toBe("night");
		expect(await page.evaluate(() => document.body.dataset.theme)).toBe(
			"night",
		);
		const night = await canvasPng(page);

		await setTheme(page, "day");
		await waitForFrames(page, 2);
		expect((await seamState(page)).theme).toBe("day");
		expect(await page.evaluate(() => document.body.dataset.theme)).toBe("day");
		const day = await canvasPng(page);

		// Advisory: GLA-3 wants the night inversion to actually invert the
		// picture. Reported, not blocking, until the night palette ships.
		const delta = diffPct(night, day);
		console.log(
			`[theme] night-vs-day canvas delta=${delta.pct.toFixed(3)}% ` +
				`(GLA-3 expects a real inversion; 0% means the theme is seam-only)`,
		);
		test.info().annotations.push({
			type: "advisory",
			description: `night-vs-day canvas delta ${delta.pct.toFixed(3)}%`,
		});
	});
});

test.describe("frame pacing", () => {
	test("no long task above the fail ceiling on incident-storm", async ({
		page,
	}) => {
		test.setTimeout(90_000);
		await page.goto(
			harness.gameUrl({ scenario: "incident-storm", test: false, seed: false }),
		);
		await page.waitForFunction(
			() =>
				(window as unknown as { __TEST__?: { frameCount?: number } }).__TEST__
					?.frameCount !== undefined,
			null,
			{ timeout: 45_000 },
		);
		const deltas = (await page.evaluate(async () => {
			const samples: number[] = [];
			let last = performance.now();
			const started = last;
			await new Promise<void>((resolve) => {
				const step = () => {
					const now = performance.now();
					samples.push(now - last);
					last = now;
					if (now - started >= 5000) {
						resolve();
						return;
					}
					requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			});
			return samples;
		})) as number[];

		const sorted = [...deltas].sort((a, b) => a - b);
		const pick = (q: number) =>
			sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
		const worst = sorted[sorted.length - 1] ?? 0;
		console.log(
			`[pacing] frames=${deltas.length} p50=${pick(0.5).toFixed(1)}ms ` +
				`p95=${pick(0.95).toFixed(1)}ms p99=${pick(0.99).toFixed(1)}ms max=${worst.toFixed(1)}ms`,
		);
		if (worst > budgets.framePacing.longTaskAdvisoryMs) {
			test.info().annotations.push({
				type: "advisory",
				description: `longest frame ${worst.toFixed(1)}ms > advisory ${budgets.framePacing.longTaskAdvisoryMs}ms`,
			});
		}
		expect(
			worst,
			`frame pacing exceeded the hard ceiling (${budgets.framePacing.longTaskFailMs}ms)`,
		).toBeLessThanOrEqual(budgets.framePacing.longTaskFailMs);
	});
});

/** Fraction of non-paper (inked) pixels — proof the yard is drawn at all. */
function countInk(png: {
	data: Buffer;
	width: number;
	height: number;
}): number {
	let dark = 0;
	for (let i = 0; i < png.data.length; i += 4) {
		const r = png.data[i] ?? 255;
		const g = png.data[i + 1] ?? 255;
		const b = png.data[i + 2] ?? 255;
		if (r + g + b < 600) dark += 1;
	}
	return dark / (png.width * png.height);
}
