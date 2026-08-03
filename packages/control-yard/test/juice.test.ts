import { describe, expect, it } from "vitest";

import {
	baseSnapshot,
	derailHitStop,
	deriveWaybills,
	type PresenterInput,
	presentYard,
	stampSquash,
} from "../src/index.js";

function input(over: Partial<PresenterInput> = {}): PresenterInput {
	const snap = baseSnapshot({ occupancy: { status: "closed" } });
	return {
		visual: null,
		boPos: { x: 200, y: 600 },
		boAnimationId: "bo.idle",
		zone: "bootstrapDesk",
		selectedZone: null,
		speech: null,
		particles: [],
		testMode: true,
		ready: true,
		hasImage: () => false,
		world: null,
		scenarioMode: false,
		waybills: deriveWaybills(snap),
		highball: false,
		...over,
	};
}

describe("stamp slam", () => {
	it("squashes within the feel budget and springs back", () => {
		expect(stampSquash(input({ fx: { kind: "stamp", elapsedMs: 0 } }))).toBe(0);
		const mid = stampSquash(input({ fx: { kind: "stamp", elapsedMs: 80 } }));
		expect(mid).toBeGreaterThan(0.15);
		expect(mid).toBeLessThanOrEqual(0.2);
		// Springs back — never a held deformation.
		expect(
			stampSquash(input({ fx: { kind: "stamp", elapsedMs: 160 } })),
		).toBeCloseTo(0, 5);
		expect(stampSquash(input({ fx: { kind: "stamp", elapsedMs: 400 } }))).toBe(
			0,
		);
	});

	it("shortens the top waybill card only while the slam is in flight", () => {
		const still = presentYard(input({ fx: null })).items.find(
			(i) => i.id === "waybill-0",
		);
		const slammed = presentYard(
			input({ fx: { kind: "stamp", elapsedMs: 80 } }),
		).items.find((i) => i.id === "waybill-0");
		expect(still?.kind).toBe("rect");
		expect(slammed?.kind).toBe("rect");
		if (still?.kind === "rect" && slammed?.kind === "rect") {
			expect(slammed.h).toBeLessThan(still.h);
			// Squashes toward the desk, so its top edge drops.
			expect(slammed.y).toBeGreaterThan(still.y);
		}
	});
});

describe("derail hit-stop", () => {
	it("holds only for the failure window", () => {
		expect(
			derailHitStop(input({ fx: { kind: "derail", elapsedMs: 60 } })),
		).toBe(true);
		expect(
			derailHitStop(input({ fx: { kind: "derail", elapsedMs: 200 } })),
		).toBe(false);
	});

	it("flashes spark across the rail, and only then", () => {
		const flash = (fx: PresenterInput["fx"]) =>
			presentYard(input({ fx })).items.find((i) => i.id === "derail-flash");
		expect(flash({ kind: "derail", elapsedMs: 60 })).toBeDefined();
		expect(flash(null)).toBeUndefined();
		expect(flash({ kind: "stamp", elapsedMs: 60 })).toBeUndefined();
	});
});

describe("reduced motion parity", () => {
	it("drops the accent but never the information", () => {
		const reduced = input({
			fx: { kind: "stamp", elapsedMs: 80 },
			reducedMotion: true,
		});
		expect(stampSquash(reduced)).toBe(0);
		expect(
			derailHitStop({ ...reduced, fx: { kind: "derail", elapsedMs: 60 } }),
		).toBe(false);
		// The waybill itself is still on the desk — the beat is legible.
		const items = presentYard(reduced).items;
		expect(items.find((i) => i.id === "waybill-0")).toBeDefined();
		expect(items.find((i) => i.id === "waybill-0-title")).toBeDefined();
	});
});
