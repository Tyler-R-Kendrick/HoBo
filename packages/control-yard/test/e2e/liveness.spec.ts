/**
 * liveness.spec — "the picture is alive, and the seam agrees why".
 *
 * For every scenario beat declared in `src/scenarios/*` (`expectedBeats`):
 *   1. capture the beat's region 30 ticks BEFORE the beat,
 *   2. at the beat tick, assert the beat's own `seamPredicate` against
 *      `window.__TEST__.state()` — and, for `mustChange` beats, assert the
 *      predicate did NOT already hold before (so the beat is a real transition),
 *   3. capture the region 30 ticks AFTER and require a measurable pixel delta.
 *
 * Regions come from the scenario's `region` (built by `zoneRegion()` /
 * `costMeterRegion()` from `YARD_LAYOUT`), never from hard-coded prop
 * coordinates, so the diegetic-prop rewrite moves the assertion with the art.
 *
 * Runs in `?test=1`, where the presenter pins sprites to a static frame — any
 * pixel delta measured here is caused by projection state, not by an idle loop.
 */

import { type Harness, startHarness } from "../../scripts/demo-harness.mjs";
import { SCENARIOS } from "../../src/scenarios/index.js";
import {
	advanceToTick,
	canvasPng,
	cropRegion,
	diffPct,
	expect,
	seamState,
	test,
	waitForFrames,
	waitForYard,
} from "./yard-fixture.js";

/** Ticks either side of the beat that the capture pair straddles. */
const BEAT_WINDOW_TICKS = 30;
/**
 * Minimum share of region pixels that must change across a `mustChange` beat.
 * Deliberately small: this catches a DEAD region (nothing rendered the event),
 * not a stylistic threshold — the diegetic-prop rewrite is free to change how
 * loudly a beat reads.
 */
const MIN_CHANGED_PCT = 0.1;

let harness: Harness;

test.beforeAll(async () => {
	harness = await startHarness({ seedFixtures: true });
});

test.afterAll(async () => {
	await harness?.close();
});

for (const [scenarioId, scenario] of Object.entries(SCENARIOS)) {
	test.describe(`scenario: ${scenarioId}`, () => {
		for (const beat of scenario.expectedBeats) {
			test(`beat "${beat.label}" @tick ${beat.atTick}${beat.mustChange ? " (must change)" : " (steady)"}`, async ({
				page,
			}) => {
				const beforeTick = Math.max(0, beat.atTick - BEAT_WINDOW_TICKS);
				const afterTick = Math.min(
					scenario.totalTicks,
					beat.atTick + BEAT_WINDOW_TICKS,
				);

				await page.goto(harness.gameUrl({ scenario: scenarioId }));
				await waitForYard(page);

				await advanceToTick(page, beforeTick);
				await waitForFrames(page, 3);
				const stateBefore = await seamState(page);
				const shotBefore = cropRegion(await canvasPng(page), beat.region);

				await advanceToTick(page, beat.atTick);
				await waitForFrames(page, 3);
				const stateAt = await seamState(page);

				// The seam has to agree WHY the picture changed.
				expect(
					beat.seamPredicate(stateAt),
					`seamPredicate for beat "${beat.label}" does not hold at tick ${beat.atTick}: ` +
						JSON.stringify({
							tick: stateAt.tick,
							zone: stateAt.zone,
							seq: stateAt.seq,
							hazards: stateAt.hazards,
							occupyMode: stateAt.occupyMode,
							connCount: stateAt.connCount,
							trafficRate: stateAt.trafficRate,
							bootstrapActive: stateAt.bootstrapActive,
						}),
				).toBe(true);

				if (beat.mustChange) {
					expect(
						beat.seamPredicate(stateBefore),
						`beat "${beat.label}" is declared mustChange, but its seamPredicate ` +
							`already held ${BEAT_WINDOW_TICKS} ticks earlier — it is not a transition`,
					).toBe(false);
				}

				await advanceToTick(page, afterTick);
				await waitForFrames(page, 3);
				const shotAfter = cropRegion(await canvasPng(page), beat.region);

				const delta = diffPct(shotBefore, shotAfter);
				console.log(
					`[liveness] ${scenarioId}/${beat.label} ticks ${beforeTick}→${afterTick} ` +
						`region ${beat.region.w}x${beat.region.h}@${beat.region.x},${beat.region.y} ` +
						`delta=${delta.pct.toFixed(3)}% (${delta.changed}/${delta.total}px)`,
				);
				test.info().annotations.push({
					type: "liveness",
					description: `${scenarioId}/${beat.label} delta ${delta.pct.toFixed(3)}%`,
				});

				if (beat.mustChange) {
					expect(
						delta.pct,
						`beat "${beat.label}" changed nothing inside its own region — ` +
							`the projection moved but the picture did not (dead region)`,
					).toBeGreaterThanOrEqual(MIN_CHANGED_PCT);
				}
			});
		}
	});
}
