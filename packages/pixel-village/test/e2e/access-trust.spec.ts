/**
 * access-trust.spec — CI-blocking accessibility + provenance gates.
 *
 * These are the gates the launch baseline
 * (`docs/design/accessibility-usability-launch-baseline.md`) and the HYX rubric
 * category `clarity-trust` make non-negotiable:
 *
 *  - a keyboard-only path from page load to a confirmed command
 *  - a visible focus treatment on every keyboard stop, in BOTH themes
 *  - no serious/critical axe violations on the DOM chrome (sheet + toolbar)
 *  - reduced-motion information parity (nothing conveyed only by motion)
 *  - real-vs-simulated labelling that is present in demo/scenario mode and
 *    absent in live mode
 *
 * Structural assertions go through the seam and through the PURE presenter, so
 * they survive the diegetic-prop rewrite; pixel checks are either derived from
 * `YARD_LAYOUT` or explicitly advisory.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { PNG } from "pngjs";
import { type Harness, startHarness } from "../../scripts/demo-harness.mjs";
import { deriveYardVisualState } from "../../src/entity-state.js";
import { presentYard } from "../../src/phaser/yard-presenter.js";
import { incidentStorm } from "../../src/scenarios/incident-storm.js";
import { baseSnapshot } from "../../src/scenarios/scenario.js";
import {
	advanceToTick,
	canvasPng,
	cropPixels,
	cropRegion,
	decodePng,
	diffPct,
	expect,
	type PixelDelta,
	seamState,
	setTheme,
	test,
	topRightBadgeBand,
	waitForFrames,
	waitForYard,
} from "./yard-fixture.js";

const MAX_TAB_STOPS = 30;
/** Focus treatment must move at least this share of pixels around the control. */
const MIN_FOCUS_DELTA_PCT = 0.2;

type TabStop = Readonly<{
	tag: string;
	id: string;
	text: string;
	label: string | null;
}>;

let harness: Harness;
/** Throwaway station: keyboard activation may fire real control-api commands. */
let scratchHarness: Harness;

test.beforeAll(async () => {
	harness = await startHarness({ seedFixtures: true });
	scratchHarness = await startHarness({ seedFixtures: false });
});

test.afterAll(async () => {
	await harness?.close();
	await scratchHarness?.close();
});

/** Walk the document's tab order from the top of the page. */
async function tabStops(page: Page, max = MAX_TAB_STOPS): Promise<TabStop[]> {
	const stops: TabStop[] = [];
	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur();
		window.scrollTo(0, 0);
	});
	for (let i = 0; i < max; i++) {
		await page.keyboard.press("Tab");
		const info = (await page.evaluate(() => {
			const el = document.activeElement as HTMLElement | null;
			if (!el || el === document.body || el === document.documentElement) {
				return null;
			}
			return {
				tag: el.tagName.toLowerCase(),
				id: el.id,
				text: (el.textContent || "").trim().slice(0, 40),
				label: el.getAttribute("aria-label"),
			};
		})) as TabStop | null;
		if (!info) break;
		const key = `${info.tag}#${info.id}:${info.text}`;
		if (stops.some((s) => `${s.tag}#${s.id}:${s.text}` === key)) break;
		stops.push(info);
	}
	return stops;
}

/**
 * Focus-treatment delta measured ONLY in the band immediately outside the
 * control's border box, versus an unfocused baseline of the same viewport.
 *
 * Two deliberate choices:
 *  - the interior is excluded, so a text-selection highlight or a caret cannot
 *    masquerade as a focus indicator (WCAG 2.4.11 wants the *control* marked);
 *  - both captures are full-viewport and cropped in node, so the pair is
 *    guaranteed to share geometry (a `clip:` pair drifts when the browser
 *    scrolls a control into view between shots).
 */
async function focusRingDelta(
	page: Page,
	baseline: PNG,
	pad = 8,
): Promise<{ who: string; delta: PixelDelta }> {
	const probe = (await page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body) return null;
		const r = el.getBoundingClientRect();
		return {
			who: `${el.tagName.toLowerCase()}#${el.id || "?"}“${(el.textContent || "").trim().slice(0, 24)}”`,
			rect: { x: r.x, y: r.y, width: r.width, height: r.height },
		};
	})) as {
		who: string;
		rect: { x: number; y: number; width: number; height: number };
	} | null;
	if (!probe || probe.rect.width < 2 || probe.rect.height < 2) {
		throw new Error("focused element has no measurable box");
	}
	const focused = decodePng(await page.screenshot());
	const { x, y, width: w, height: h } = probe.rect;
	const bands = [
		{ x: x - pad, y: y - pad, width: w + pad * 2, height: pad },
		{ x: x - pad, y: y + h, width: w + pad * 2, height: pad },
		{ x: x - pad, y, width: pad, height: h },
		{ x: x + w, y, width: pad, height: h },
	];
	let changed = 0;
	let total = 0;
	for (const band of bands) {
		const d = diffPct(cropPixels(baseline, band), cropPixels(focused, band));
		changed += d.changed;
		total += d.total;
	}
	return {
		who: probe.who,
		delta: Object.freeze({
			changed,
			total,
			pct: total === 0 ? 0 : (changed / total) * 100,
		}),
	};
}

test.describe("keyboard operability", () => {
	test("the canvas host exposes an accessible name", async ({ page }) => {
		await page.goto(harness.gameUrl({ scenario: "quiet-yard" }));
		await waitForYard(page);
		const host = await page.evaluate(() => {
			const el = document.getElementById("yard");
			return el
				? {
						role: el.getAttribute("role"),
						label: el.getAttribute("aria-label"),
						tabindex: el.getAttribute("tabindex"),
					}
				: null;
		});
		expect(host, "#yard host is missing").not.toBeNull();
		expect(
			(host as { label: string | null }).label,
			"the yard canvas host must carry an accessible name",
		).toBeTruthy();
		expect((host as { role: string | null }).role).toBeTruthy();
	});

	test("a keyboard-only path reaches and confirms a command sheet", async ({
		page,
	}) => {
		await page.goto(scratchHarness.gameUrl({ scenario: "first-run" }));
		await waitForYard(page);

		const stops = await tabStops(page);
		console.log(
			`[a11y] tab order: ${stops
				.map((s) => `${s.tag}#${s.id || "(no id)"}“${s.text}”`)
				.join(" → ")}`,
		);
		expect(
			stops.length,
			"the page has no keyboard stops at all",
		).toBeGreaterThan(0);

		// ONE forward pass: Tab to the next stop, activate it, look for a sheet.
		// (Never re-tab from a blurred body: `blur()` does not reset the browser's
		// sequential focus navigation starting point, so index-based re-tabbing
		// silently lands on the wrong control.)
		const openedBy = await keyboardWalk(
			page,
			async () => (await seamState(page)).sheetOpen,
		);

		expect(
			openedBy,
			"ACCESSIBILITY GAP: no keyboard stop opens a command sheet. Zone/prop " +
				"selection is pointer-only (the Phaser canvas has no tabindex and no " +
				"keyboard handler) and the dev-drawer toolbar fires commands directly " +
				"without a sheet, so a keyboard-only operator can never read a waybill " +
				"before approving it. Tab order was: " +
				stops.map((s) => `${s.tag}#${s.id || "?"}“${s.text}”`).join(", "),
		).not.toBeNull();

		// ...and CONFIRM it, still keyboard-only.
		const confirmed = await confirmOpenSheetByKeyboard(page);
		expect(confirmed, "the open sheet could not be confirmed by keyboard").toBe(
			true,
		);
	});

	test("an open sheet is fully operable by keyboard (STAMP and SPIKE)", async ({
		page,
	}) => {
		await page.goto(scratchHarness.gameUrl({ scenario: "first-run" }));
		await waitForYard(page);
		// Open through the seam: this test isolates *sheet* operability from the
		// separate question of whether a keyboard route to the sheet exists.
		await page.evaluate(() => {
			type Seam = { commands: { selectZone: (z: string) => void } };
			(window as unknown as { __TEST__: Seam }).__TEST__.commands.selectZone(
				"bootstrapDesk",
			);
		});
		expect((await seamState(page)).sheetOpen).toBe(true);

		const sheetStops = await tabStops(page);
		const ids = sheetStops.map((s) => s.id);
		expect(ids, "sheet controls must be in the tab order").toEqual(
			expect.arrayContaining(["sheet-close", "sheet-spike", "sheet-confirm"]),
		);

		// SPIKE by keyboard.
		await page.locator("#sheet-spike").focus();
		await page.keyboard.press("Enter");
		await page.waitForTimeout(150);
		const afterSpike = await seamState(page);
		expect(afterSpike.sheetOpen, "SPIKE must close the sheet").toBe(false);
		expect(afterSpike.recentFx.map((f) => f.fx).join(" ")).toMatch(
			/spike:waybill:/,
		);
	});
});

/**
 * Forward-only keyboard walk: Tab to each successive stop and press Enter,
 * stopping when `done()` is satisfied. Returns the stop that satisfied it.
 */
async function keyboardWalk(
	page: Page,
	done: () => Promise<boolean>,
	max = MAX_TAB_STOPS,
): Promise<TabStop | null> {
	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur();
		window.scrollTo(0, 0);
	});
	for (let i = 0; i < max; i++) {
		await page.keyboard.press("Tab");
		const info = await activeStop(page);
		if (!info) continue;
		await page.keyboard.press("Enter");
		await page.waitForTimeout(120);
		if (await done()) return info;
	}
	return null;
}

async function activeStop(page: Page): Promise<TabStop | null> {
	return (await page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body || el === document.documentElement) {
			return null;
		}
		return {
			tag: el.tagName.toLowerCase(),
			id: el.id,
			text: (el.textContent || "").trim().slice(0, 40),
			label: el.getAttribute("aria-label"),
		};
	})) as TabStop | null;
}

/** Tab forward from the current focus until #sheet-confirm, then activate it. */
async function confirmOpenSheetByKeyboard(page: Page): Promise<boolean> {
	for (let i = 0; i < MAX_TAB_STOPS; i++) {
		await page.keyboard.press("Tab");
		const info = await activeStop(page);
		if (info?.id === "sheet-confirm") {
			await page.keyboard.press("Enter");
			await page.waitForTimeout(400);
			return !(await seamState(page)).sheetOpen;
		}
	}
	return false;
}

test.describe("focus visibility", () => {
	for (const theme of ["day", "night"] as const) {
		test(`every keyboard stop has a visible focus treatment (${theme})`, async ({
			page,
		}) => {
			await page.goto(harness.gameUrl({ scenario: "quiet-yard" }));
			await waitForYard(page);
			await setTheme(page, theme);
			// Open a sheet so its controls are part of the tab order too.
			await page.evaluate(() => {
				type Seam = { commands: { selectZone: (z: string) => void } };
				(window as unknown as { __TEST__: Seam }).__TEST__.commands.selectZone(
					"connectionBay",
				);
			});
			await waitForFrames(page, 2);

			await page.evaluate(() => {
				(document.activeElement as HTMLElement | null)?.blur();
				window.scrollTo(0, 0);
			});
			const baseline = decodePng(await page.screenshot());

			// ONE forward pass through the tab order, measuring at each stop.
			const invisible: string[] = [];
			const visited: string[] = [];
			for (let i = 0; i < MAX_TAB_STOPS; i++) {
				await page.keyboard.press("Tab");
				const stop = await activeStop(page);
				if (!stop) continue;
				const key = `${stop.tag}#${stop.id}:${stop.text}`;
				if (visited.includes(key)) break;
				visited.push(key);
				let probe: { who: string; delta: PixelDelta };
				try {
					probe = await focusRingDelta(page, baseline);
				} catch {
					continue;
				}
				console.log(
					`[focus/${theme}] ${probe.who} delta=${probe.delta.pct.toFixed(3)}%`,
				);
				if (probe.delta.pct < MIN_FOCUS_DELTA_PCT) {
					invisible.push(`${probe.who} (${probe.delta.pct.toFixed(3)}%)`);
				}
			}
			expect(visited.length, "no keyboard stops found").toBeGreaterThan(0);

			expect(
				invisible,
				`[${theme}] keyboard stops with no visible focus treatment`,
			).toEqual([]);
		});
	}
});

test.describe("axe-core", () => {
	test("no serious or critical violations on the DOM chrome", async ({
		page,
	}) => {
		await page.goto(harness.gameUrl({ scenario: "quiet-yard" }));
		await waitForYard(page);
		await page.evaluate(() => {
			type Seam = { commands: { selectZone: (z: string) => void } };
			(window as unknown as { __TEST__: Seam }).__TEST__.commands.selectZone(
				"connectionBay",
			);
		});
		await waitForFrames(page, 2);

		const results = await new AxeBuilder({ page })
			.include("#chrome")
			.include("#sheet")
			.include("#help")
			.analyze();

		const blocking = results.violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		);
		if (results.violations.length > 0) {
			console.log(
				`[axe] ${results.violations.length} violation(s): ` +
					results.violations
						.map((v) => `${v.id}[${v.impact}]×${v.nodes.length}`)
						.join(", "),
			);
		}
		// Name the offending nodes, not just the rule. A contrast failure
		// reported as "elements must meet minimum contrast" is a finding
		// nobody can act on without re-running the scan by hand; the selector
		// and axe's own summary are what turn it into a fix.
		expect(
			blocking.flatMap((v) =>
				v.nodes.map(
					(node) =>
						`${v.id} (${v.impact}) at ${node.target.join(" ")} :: ${
							node.failureSummary?.replace(/\s+/gu, " ").trim() ?? v.help
						}`,
				),
			),
			"serious/critical axe violations on the yard's DOM chrome",
		).toEqual([]);
	});
});

test.describe("reduced-motion information parity", () => {
	for (const beat of incidentStorm.expectedBeats.filter((b) => b.mustChange)) {
		test(`incident-storm "${beat.label}" still reads with reduced motion`, async ({
			page,
		}) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			const before = Math.max(0, beat.atTick - 30);
			const after = Math.min(incidentStorm.totalTicks, beat.atTick + 30);

			await page.goto(harness.gameUrl({ scenario: incidentStorm.id }));
			await waitForYard(page);

			await advanceToTick(page, before);
			await waitForFrames(page, 3);
			const shotBefore = cropRegion(await canvasPng(page), beat.region);

			await advanceToTick(page, beat.atTick);
			await waitForFrames(page, 3);
			const stateAt = await seamState(page);
			expect(
				beat.seamPredicate(stateAt),
				`seamPredicate for "${beat.label}" must hold under reduced motion too`,
			).toBe(true);

			await advanceToTick(page, after);
			await waitForFrames(page, 3);
			const shotAfter = cropRegion(await canvasPng(page), beat.region);
			const delta = diffPct(shotBefore, shotAfter);
			console.log(
				`[reduced-motion] ${beat.label} static delta=${delta.pct.toFixed(3)}%`,
			);
			expect(
				delta.pct,
				`"${beat.label}" conveys nothing statically — with prefers-reduced-motion ` +
					`the beat region is pixel-identical before and after, so the event is ` +
					`readable only as motion`,
			).toBeGreaterThan(0);
		});
	}
});

test.describe("real vs simulated provenance", () => {
	test("the presenter emits the SIMULATED tag exactly when data is synthetic", () => {
		const visual = deriveYardVisualState(baseSnapshot());
		const input = {
			visual,
			boPos: { x: 200, y: 600 },
			boAnimationId: "bo.idle",
			zone: "platformRest" as const,
			selectedZone: null,
			speech: null,
			particles: [],
			testMode: true,
			ready: true,
			hasImage: () => false,
			world: null,
			waybills: [],
			highball: false,
		};
		const simulated = presentYard({ ...input, scenarioMode: true });
		const live = presentYard({ ...input, scenarioMode: false });
		expect(
			simulated.items.some((i) => i.id === "simulated-badge-text"),
			"TRU-1: synthetic data must be labelled SIMULATED",
		).toBe(true);
		expect(
			live.items.some((i) => i.id.startsWith("simulated-badge")),
			"TRU-1: live data must NOT be labelled SIMULATED",
		).toBe(false);
	});

	test("scenario mode reports demo provenance through the seam and the DOM", async ({
		page,
	}) => {
		await page.goto(harness.gameUrl({ scenario: "quiet-yard" }));
		await waitForYard(page);
		const st = await seamState(page);
		expect(st.world?.demo, "scenario mode must report demo provenance").toBe(
			true,
		);
		expect(await page.evaluate(() => document.body.dataset.demo)).toBe("1");
		const simulatedBand = cropRegion(
			await canvasPng(page),
			topRightBadgeBand(),
		);

		await page.goto(harness.gameUrl({}));
		await waitForYard(page);
		const liveState = await seamState(page);
		expect(
			liveState.world?.demo ?? false,
			"live (non-demo) mode must NOT report demo provenance",
		).toBe(false);
		expect(await page.evaluate(() => document.body.dataset.demo)).toBe("0");
		const liveBand = cropRegion(await canvasPng(page), topRightBadgeBand());

		// Pixel corroboration: the badge really is drawn in one mode and not the
		// other. Advisory, because the band is a layout-derived region and the
		// diegetic rewrite may reposition the tag inside the frame.
		const delta = diffPct(simulatedBand, liveBand);
		console.log(
			`[provenance] SIMULATED band delta simulated-vs-live=${delta.pct.toFixed(3)}%`,
		);
		test.info().annotations.push({
			type: "advisory",
			description: `SIMULATED band delta ${delta.pct.toFixed(3)}%`,
		});

		await page.goto("about:blank");
	});
});
