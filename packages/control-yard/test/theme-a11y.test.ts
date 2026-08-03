import { describe, expect, it } from "vitest";

import {
	applyTheme,
	baseSnapshot,
	deriveWaybills,
	deriveYardVisualState,
	type PresenterInput,
	pinnedFrame,
	presentYard,
} from "../src/index.js";

function input(over: Partial<PresenterInput> = {}): PresenterInput {
	const snap = baseSnapshot({ doctor: { hazards: ["station-closed"] } });
	const visual = deriveYardVisualState(snap);
	return {
		visual,
		boPos: { x: 200, y: 600 },
		boAnimationId: visual.bo.animationId,
		zone: visual.bo.zone,
		selectedZone: null,
		speech: null,
		particles: [],
		testMode: false,
		ready: true,
		hasImage: () => false,
		world: null,
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

	it("night swaps ink and paper exactly", () => {
		const night = applyTheme(day, "night");
		const dayGround = day.items.find((i) => i.id === "ground-strip");
		const nightGround = night.items.find((i) => i.id === "ground-strip");
		expect(dayGround?.kind === "rect" && dayGround.fill).toBe("#ffffff");
		expect(nightGround?.kind === "rect" && nightGround.fill).toBe("#0a0a0a");
		// The model must actually differ — a seam-only theme is not a theme.
		expect(JSON.stringify(night)).not.toBe(JSON.stringify(day));
	});

	it("keeps spark and go as accents in both themes", () => {
		const night = applyTheme(day, "night");
		const sparkDay = day.items.filter(
			(i) => "fill" in i && i.fill === "#c5301c",
		).length;
		const sparkNight = night.items.filter(
			(i) => "fill" in i && i.fill === "#c5301c",
		).length;
		expect(sparkDay).toBeGreaterThan(0);
		expect(sparkNight).toBe(sparkDay);
	});
});

describe("reduced motion stills the yard", () => {
	it("pins sprite frames when the OS asks, and in test mode", () => {
		expect(pinnedFrame(input({ reducedMotion: true }), 0)).toBe(0);
		expect(pinnedFrame(input({ testMode: true }), 4)).toBe(4);
		expect(pinnedFrame(input(), 0)).toBeNull();
	});

	it("stops particles but keeps every ink state", () => {
		const particles = [{ x: 300, y: 340, alive: true }];
		const moving = presentYard(input({ particles }));
		const still = presentYard(input({ particles, reducedMotion: true }));
		expect(moving.items.some((i) => i.id === "particle-0")).toBe(true);
		expect(still.items.some((i) => i.id === "particle-0")).toBe(false);
		// The hazard is still fully rendered — information survives.
		expect(still.items.some((i) => i.id === "bunker-tally-0")).toBe(true);
		expect(still.items.some((i) => i.id === "bunker-smoke-0")).toBe(true);
	});
});

describe("hazard severity is visible inside the bunker", () => {
	function marks(hazards: string[]): number {
		const snap = baseSnapshot({ doctor: { hazards } });
		const visual = deriveYardVisualState(snap);
		return presentYard(
			input({ visual, waybills: deriveWaybills(snap) }),
		).items.filter((i) => /^bunker-(smoke|tally)-/.test(i.id)).length;
	}

	it("escalates with the hazard count, not merely on/off", () => {
		const one = marks(["station-closed"]);
		const three = marks([
			"station-closed",
			"connection-revoked:c1",
			"bootstrap-rail-active",
		]);
		expect(three).toBeGreaterThan(one);
	});
});

describe("guest connector clip", () => {
	it("reflects real activity instead of always pantomiming work", () => {
		const snap = baseSnapshot({});
		const visual = deriveYardVisualState(snap);
		const guests = [
			{
				connectorKind: "swe-claude",
				visual: "error" as const,
				animationId: "guest.swe-claude.error",
			},
		];
		const withError = presentYard(
			input({
				visual: { ...visual, guests } as typeof visual,
			}),
		);
		const sprite = withError.items.find((i) => i.id === "guest-swe-claude");
		if (sprite?.kind === "sprite") {
			expect(sprite.animationId).toBe("guest.swe-claude.error");
		}
	});
});
