/**
 * M1 phase A: autonomous-foreman clip mapping + world model rendering.
 */
import { describe, expect, it } from "vitest";

import {
	baseSnapshot,
	bindlebugVariant,
	CAMP_GROUNDS,
	campRoomSlots,
	deriveYardVisualState,
	detectRecentSuccess,
	fixtureCharacterState,
	foldWorldDelta,
	makeConnection,
	makeRail,
	type PresenterInput,
	presentYard,
	type RenderItem,
	scenarioWorld,
	toWorldView,
	type WorldView,
	YARD_LAYOUT,
} from "../src/index.js";

function byId(
	items: readonly RenderItem[],
	id: string,
): RenderItem | undefined {
	return items.find((i) => i.id === id);
}

function presenterInput(
	overrides: Partial<PresenterInput> = {},
): PresenterInput {
	const snap = baseSnapshot({ occupyMode: "occupying" });
	const visual = deriveYardVisualState(snap);
	return {
		visual,
		boPos: { x: 640, y: 360 },
		boAnimationId: visual.bo.animationId,
		zone: visual.bo.zone,
		selectedZone: null,
		speech: null,
		particles: [],
		testMode: true,
		ready: true,
		hasImage: () => true,
		world: null,
		scenarioMode: false,
		waybills: [],
		highball: false,
		...overrides,
	};
}

describe("Bo the autonomous foreman (clip mapping)", () => {
	it("plays bo.sleep-wake while the station is not open", () => {
		const snap = baseSnapshot({ occupancy: { status: "closed" } });
		expect(deriveYardVisualState(snap).bo.animationId).toBe("bo.sleep-wake");
	});

	it("plays bo.hurt when hazards are present (over lower priorities)", () => {
		const snap = baseSnapshot({
			occupancy: { bootstrapActive: true },
			doctor: { hazards: ["connection-revoked:conn-1"] },
			connections: [makeConnection({ status: "pending" })],
		});
		expect(deriveYardVisualState(snap).bo.animationId).toBe("bo.hurt");
	});

	it("plays bo.bindle-adjust while the bootstrap rail is active", () => {
		const snap = baseSnapshot({ occupancy: { bootstrapActive: true } });
		expect(deriveYardVisualState(snap).bo.animationId).toBe("bo.bindle-adjust");
	});

	it("plays bo.wave when a connection is pending or a rail awaits activation", () => {
		const pendingConn = baseSnapshot({
			connections: [makeConnection({ status: "pending" })],
		});
		expect(deriveYardVisualState(pendingConn).bo.animationId).toBe("bo.wave");

		// A demoted bootstrap rail is steady state, never an attention item.
		const bootstrapOnly = baseSnapshot({
			rails: [
				makeRail({
					id: "rail-bootstrap",
					isBootstrap: true,
					activationStatus: "approved",
				}),
			],
		});
		expect(deriveYardVisualState(bootstrapOnly).bo.animationId).toBe("bo.idle");

		for (const activationStatus of ["draft", "approved"] as const) {
			const railWaiting = baseSnapshot({
				rails: [makeRail({ activationStatus })],
			});
			expect(
				deriveYardVisualState(railWaiting).bo.animationId,
				activationStatus,
			).toBe("bo.wave");
		}
	});

	it("plays bo.jump on recentSuccess, then falls through without it", () => {
		const snap = baseSnapshot({});
		expect(
			deriveYardVisualState(snap, { recentSuccess: true }).bo.animationId,
		).toBe("bo.jump");
		expect(deriveYardVisualState(snap).bo.animationId).toBe("bo.idle");
	});

	it("keeps walk/idle when occupying an active rail (no attention needed)", () => {
		const snap = baseSnapshot({
			occupancy: { activeRailHash: "hash-1" },
			rails: [makeRail({ activationStatus: "active" })],
			occupyMode: "occupying",
		});
		const visual = deriveYardVisualState(snap);
		expect(visual.bo.zone).toBe("activeRailTrack");
		expect(visual.bo.animationId).toMatch(/^bo\.walk\./);
	});

	it("action clips never flip facing (west sheets stay unmirrored data)", () => {
		const snap = baseSnapshot({ occupancy: { status: "closed" } });
		const visual = deriveYardVisualState(snap);
		expect(visual.bo.animationId).toBe("bo.sleep-wake");
		expect(["east", "west"]).toContain(visual.bo.facing);
	});
});

describe("detectRecentSuccess", () => {
	const before = baseSnapshot({
		rails: [makeRail({ activationStatus: "approved" })],
		connections: [makeConnection({ status: "pending" })],
		seq: 1,
	});

	it("fires when seq advances and a rail becomes active", () => {
		const after = baseSnapshot({
			rails: [makeRail({ activationStatus: "active" })],
			connections: [makeConnection({ status: "pending" })],
			seq: 2,
		});
		expect(detectRecentSuccess(before, after)).toBe(true);
	});

	it("fires when seq advances and a connection becomes authorized", () => {
		const after = baseSnapshot({
			rails: [makeRail({ activationStatus: "approved" })],
			connections: [makeConnection({ status: "active" })],
			seq: 2,
		});
		expect(detectRecentSuccess(before, after)).toBe(true);
	});

	it("stays quiet without a seq advance, without a change, or without prev", () => {
		const sameSeq = baseSnapshot({
			rails: [makeRail({ activationStatus: "active" })],
			seq: 1,
		});
		expect(detectRecentSuccess(before, sameSeq)).toBe(false);
		const noChange = baseSnapshot({
			rails: [makeRail({ activationStatus: "approved" })],
			connections: [makeConnection({ status: "pending" })],
			seq: 2,
		});
		expect(detectRecentSuccess(before, noChange)).toBe(false);
		expect(detectRecentSuccess(null, sameSeq)).toBe(false);
	});
});

describe("scenario world fixture", () => {
	it("is pure and deterministic: same seed+tick → deep-equal states", () => {
		expect(scenarioWorld(42, 7)).toEqual(scenarioWorld(42, 7));
		expect(scenarioWorld(42, 7)).not.toEqual(scenarioWorld(42, 8));
	});

	it("builds 2 camps with 2-3 bindlebugs each, cycling states over ticks", () => {
		const world = scenarioWorld(1, 0);
		expect(Object.keys(world.camps)).toHaveLength(2);
		for (const campId of Object.keys(world.camps)) {
			const members = Object.values(world.characters).filter(
				(ch) => ch.campId === campId,
			);
			expect(members.length).toBeGreaterThanOrEqual(2);
			expect(members.length).toBeLessThanOrEqual(3);
		}
		const seen = new Set<string>();
		for (let t = 0; t < 8; t++) seen.add(fixtureCharacterState(1, t, 0));
		expect(seen.size).toBeGreaterThan(2);
		expect([...seen]).toContain("stuck");
	});
});

describe("world view mapping", () => {
	const view = toWorldView(scenarioWorld(1, 5), true) as WorldView;

	it("returns null world untouched", () => {
		expect(toWorldView(null, true)).toBeNull();
	});

	it("lays camp rooms inside CAMP_GROUNDS without touching the Bootstrap Desk", () => {
		const desk = YARD_LAYOUT.zones.bootstrapDesk;
		expect(view.camps.length).toBeGreaterThan(0);
		expect(view.camps.length).toBeLessThanOrEqual(4);
		for (const camp of view.camps) {
			expect(camp.x).toBeGreaterThanOrEqual(CAMP_GROUNDS.x);
			expect(camp.y).toBeGreaterThanOrEqual(CAMP_GROUNDS.y);
			expect(camp.x + camp.w).toBeLessThanOrEqual(
				CAMP_GROUNDS.x + CAMP_GROUNDS.width,
			);
			expect(camp.y + camp.h).toBeLessThanOrEqual(
				CAMP_GROUNDS.y + CAMP_GROUNDS.height,
			);
			expect(camp.x).toBeGreaterThanOrEqual(desk.x + desk.width);
		}
		for (const slot of campRoomSlots()) {
			expect(slot.w).toBeGreaterThan(0);
			expect(slot.h).toBeGreaterThan(0);
		}
	});

	it("assigns bindlebug variants deterministically from the id hash", () => {
		for (const ch of view.characters) {
			expect(ch.variant).toBe(bindlebugVariant(ch.id));
			expect(ch.animationId).toBe(`bindlebug.${ch.variant}.idle`);
		}
		expect(bindlebugVariant("bindle-ada")).toBe(bindlebugVariant("bindle-ada"));
	});

	it("positions characters inside their camp room", () => {
		for (const ch of view.characters) {
			const room = view.camps.find((c) => c.id === ch.campId);
			expect(room).toBeDefined();
			if (!room) continue;
			expect(ch.x).toBeGreaterThanOrEqual(room.x);
			expect(ch.x).toBeLessThanOrEqual(room.x + room.w);
			expect(ch.y).toBeGreaterThanOrEqual(room.y);
			expect(ch.y).toBeLessThanOrEqual(room.y + room.h);
		}
	});

	it("truncates bubbles to 24 chars and clamps health", () => {
		for (const ch of view.characters) {
			if (ch.bubble !== null) expect(ch.bubble.length).toBeLessThanOrEqual(24);
			expect(ch.health).toBeGreaterThanOrEqual(0);
			expect(ch.health).toBeLessThanOrEqual(1);
		}
	});
});

describe("presenter world rendering", () => {
	const worldView = toWorldView(scenarioWorld(1, 0), true) as WorldView;

	it("renders one sticker card per camp room with its label", () => {
		const { items } = presentYard(presenterInput({ world: worldView }));
		for (const camp of worldView.camps) {
			expect(byId(items, `camp-${camp.id}`), camp.id).toBeDefined();
			const label = byId(items, `camp-${camp.id}-label`);
			expect(label?.kind).toBe("text");
		}
	});

	it("renders a bindlebug sprite per character with variant clip and idle alpha", () => {
		const { items } = presentYard(presenterInput({ world: worldView }));
		for (const ch of worldView.characters) {
			const sprite = byId(items, `npc-${ch.id}`);
			expect(sprite?.kind).toBe("sprite");
			if (sprite?.kind !== "sprite") continue;
			expect(sprite.animationId).toBe(`bindlebug.${ch.variant}.idle`);
			expect(sprite.scale).toBe(0.5);
			expect(sprite.testFrame).toBe(0);
			if (ch.state === "idle") expect(sprite.alpha).toBe(0.6);
			else expect(sprite.alpha).toBeUndefined();
		}
	});

	it("marks stuck characters with a spark ink mark and low health with pips", () => {
		const custom: WorldView = {
			camps: worldView.camps,
			characters: [
				{
					...(worldView.characters[0] as WorldView["characters"][number]),
					id: "x-stuck",
					state: "stuck",
					health: 0.3,
					bubble: "error in span deadbeef",
				},
				{
					...(worldView.characters[0] as WorldView["characters"][number]),
					id: "x-reading",
					state: "reading",
					health: 1,
					bubble: null,
				},
			],
			demo: false,
		};
		const { items } = presentYard(presenterInput({ world: custom }));
		const stuck = byId(items, "npc-x-stuck-stuck");
		expect(stuck?.kind).toBe("text");
		if (stuck?.kind === "text") expect(stuck.color).toBe("#c5301c");
		const pip = byId(items, "npc-x-stuck-health");
		expect(pip?.kind).toBe("rect");
		if (pip?.kind === "rect") expect(pip.fill).toBe("#c5301c");
		expect(byId(items, "npc-x-stuck-bubble-text")).toBeDefined();
		const bubble = byId(items, "npc-x-stuck-bubble");
		if (bubble?.kind === "rect") {
			// Bubbles never occlude the Bootstrap Desk (DESIGN.md reserved regions).
			const desk = YARD_LAYOUT.zones.bootstrapDesk;
			expect(bubble.x).toBeGreaterThanOrEqual(desk.x + desk.width);
		}
		expect(byId(items, "npc-x-reading-book")).toBeDefined();
		expect(byId(items, "npc-x-reading-health")).toBeUndefined();
	});

	it("renders no world items when world is null", () => {
		const { items } = presentYard(presenterInput({ world: null }));
		expect(items.some((i) => i.id.startsWith("camp-"))).toBe(false);
		expect(items.some((i) => i.id.startsWith("npc-"))).toBe(false);
	});

	it("pins the SIMULATED badge iff the data is demo or scenario driven", () => {
		const demoOn = presentYard(presenterInput({ world: worldView }));
		expect(byId(demoOn.items, "simulated-badge")).toBeDefined();

		const scenarioOnly = presentYard(
			presenterInput({ world: null, scenarioMode: true }),
		);
		expect(byId(scenarioOnly.items, "simulated-badge")).toBeDefined();

		const realWorld: WorldView = { ...worldView, demo: false };
		const off = presentYard(presenterInput({ world: realWorld }));
		expect(byId(off.items, "simulated-badge")).toBeUndefined();
		expect(
			byId(presentYard(presenterInput()).items, "simulated-badge"),
		).toBeUndefined();
	});
});

describe("world client folding", () => {
	it("folds world deltas over a snapshot with the yard-world reducer", () => {
		const world = scenarioWorld(1, 0);
		const id = Object.keys(world.characters)[0] as string;
		const folded = foldWorldDelta(world, [
			{
				type: "log-record",
				at: 1,
				characterId: id,
				severity: "ERROR",
				message: "boom",
			},
		]);
		expect(folded.characters[id]?.state).toBe("stuck");
		expect(folded.characters[id]?.bubble).toBe("boom");
		// input untouched (pure fold)
		expect(world.characters[id]?.bubble).not.toBe("boom");
	});
});
