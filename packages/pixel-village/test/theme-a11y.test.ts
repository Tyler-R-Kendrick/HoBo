import { describe, expect, it } from "vitest";

import {
	applyTheme,
	baseSnapshot,
	deriveWaybills,
	deriveYardVisualState,
	type PresenterInput,
	pinnedFrame,
	presentYard,
	scenarioWorld,
	toWorldView,
	type WorldView,
} from "../src/index.js";

function input(over: Partial<PresenterInput> = {}): PresenterInput {
	const snap = baseSnapshot({ doctor: { hazards: ["station-closed"] } });
	const visual = deriveYardVisualState(snap);
	return {
		visual,
		zone: visual.bo.zone,
		selectedZone: null,
		speech: null,
		particles: [],
		testMode: false,
		ready: true,
		// SAFETY: `world: toWorldView(scenarioWorld(1, 5), true) as WorldView,` is required at this I/O or test boundary.
		world: toWorldView(scenarioWorld(1, 5), true) as WorldView,
		scenarioMode: false,
		waybills: deriveWaybills(snap),
		highball: false,
		...over,
	};
}

describe("day/night inversion", () => {
	const day = presentYard(input());

	it("day is untouched", () => {
		expect(applyTheme(day, "day")).toBe(day);
	});

	it("night inverts every chrome ground exactly", () => {
		const night = applyTheme(day, "night");
		const dayCard = day.items.find((i) => i.id === "hud-card");
		const nightCard = night.items.find((i) => i.id === "hud-card");
		expect(dayCard?.kind === "rect" && dayCard.fill).toBe("#f4f1e8");
		expect(nightCard?.kind === "rect" && nightCard.fill).toBe("#262b44");
		const dayTitle = day.items.find((i) => i.id === "hud-title");
		const nightTitle = night.items.find((i) => i.id === "hud-title");
		expect(dayTitle?.kind === "text" && dayTitle.color).toBe("#3f2631");
		expect(nightTitle?.kind === "text" && nightTitle.color).toBe("#f4f1e8");
		// The model must actually differ — a seam-only theme is not a theme.
		expect(JSON.stringify(night)).not.toBe(JSON.stringify(day));
	});

	it("tints the sourced art down instead of leaving a lit meadow at night", () => {
		const night = applyTheme(day, "night");
		const dayTiles = day.items.filter((i) => i.kind === "tile");
		const nightTiles = night.items.filter((i) => i.kind === "tile");
		expect(dayTiles.length).toBeGreaterThan(100);
		expect(dayTiles.every((t) => t.kind === "tile" && !t.tint)).toBe(true);
		expect(nightTiles.every((t) => t.kind === "tile" && Boolean(t.tint))).toBe(
			true,
		);
	});

	it("keeps danger as an accent in both themes", () => {
		const night = applyTheme(day, "night");
		const count = (m: typeof day) =>
			m.items.filter(
				(i) =>
					("fill" in i && i.fill === "#c34b35") ||
					(i.kind === "text" && i.color === "#c34b35"),
			).length;
		expect(count(day)).toBeGreaterThan(0);
		expect(count(night)).toBe(count(day));
	});
});

describe("reduced motion stills the yard", () => {
	it("pins sprite frames when the OS asks, and in test mode", () => {
		expect(pinnedFrame(input({ reducedMotion: true }), 0)).toBe(0);
		expect(pinnedFrame(input({ testMode: true }), 4)).toBe(4);
		expect(pinnedFrame(input(), 0)).toBeNull();
	});

	it("stops particles but keeps every state on screen", () => {
		const particles = [{ x: 300, y: 340, alive: true }];
		const moving = presentYard(input({ particles }));
		const still = presentYard(input({ particles, reducedMotion: true }));
		expect(moving.items.some((i) => i.id === "particle-0")).toBe(true);
		expect(still.items.some((i) => i.id === "particle-0")).toBe(false);
		// The hazard is still fully rendered — information survives.
		expect(still.items.some((i) => i.id === "hazard-bomb")).toBe(true);
		expect(still.items.some((i) => i.id === "hazard-mark-0")).toBe(true);
		expect(still.items.some((i) => i.id === "hazard-text-0")).toBe(true);
		// …and so is every house and villager.
		expect(still.items.some((i) => i.id.startsWith("house-"))).toBe(true);
		expect(still.items.some((i) => i.id.startsWith("npc-"))).toBe(true);
	});
});

describe("hazard severity is visible on the hazard spur", () => {
	function marks(hazards: string[]): number {
		const snap = baseSnapshot({ doctor: { hazards } });
		const visual = deriveYardVisualState(snap);
		return presentYard(
			input({ visual, waybills: deriveWaybills(snap) }),
		).items.filter((i) => /^hazard-mark-\d+$/.test(i.id)).length;
	}

	it("escalates with the hazard count, not merely on/off", () => {
		const one = marks(["station-closed"]);
		const three = marks([
			"station-closed",
			"connection-revoked:c1",
			"bootstrap-rail-active",
		]);
		expect(one).toBe(1);
		expect(three).toBe(3);
		expect(three).toBeGreaterThan(one);
	});
});
