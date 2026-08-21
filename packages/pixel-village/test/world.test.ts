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
	dockForZone,
	fixtureCharacterState,
	foldWorldDelta,
	HOUSE_PLOTS,
	makeConnection,
	makeRail,
	OPERATOR_SPRITE,
	type PresenterInput,
	presentYard,
	type RenderItem,
	scenarioWorld,
	T,
	TILE,
	toWorldView,
	VILLAGERS,
	villagePlacements,
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
		zone: visual.bo.zone,
		selectedZone: null,
		speech: null,
		particles: [],
		testMode: true,
		ready: true,
		world: null,
		scenarioMode: false,
		waybills: [],
		highball: false,
		...overrides,
	};
}

describe("the Operator's semantic state (projection → meaning, never a clip)", () => {
	it("never leaks a clip id: the presenter picks the tile, not this module", () => {
		const visual = deriveYardVisualState(baseSnapshot({}));
		expect(Object.keys(visual.bo).sort()).toEqual(["facing", "state", "zone"]);
		expect(JSON.stringify(visual)).not.toContain("bo.");
	});

	it("sleeps while the station is not open", () => {
		const snap = baseSnapshot({ occupancy: { status: "closed" } });
		expect(deriveYardVisualState(snap).bo.state).toBe("asleep");
	});

	it("reports error when hazards are present (over lower priorities)", () => {
		const snap = baseSnapshot({
			occupancy: { bootstrapActive: true },
			doctor: { hazards: ["connection-revoked:conn-1"] },
			connections: [makeConnection({ status: "pending" })],
		});
		expect(deriveYardVisualState(snap).bo.state).toBe("error");
	});

	it("reports bootstrapping while the bootstrap rail is active", () => {
		const snap = baseSnapshot({ occupancy: { bootstrapActive: true } });
		expect(deriveYardVisualState(snap).bo.state).toBe("bootstrapping");
	});

	it("asks for attention when a connection is pending or a rail awaits activation", () => {
		const pendingConn = baseSnapshot({
			connections: [makeConnection({ status: "pending" })],
		});
		expect(deriveYardVisualState(pendingConn).bo.state).toBe("attention");

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
		expect(deriveYardVisualState(bootstrapOnly).bo.state).toBe("idle");

		for (const activationStatus of ["draft", "approved"] as const) {
			const railWaiting = baseSnapshot({
				rails: [makeRail({ activationStatus })],
			});
			expect(
				deriveYardVisualState(railWaiting).bo.state,
				activationStatus,
			).toBe("attention");
		}
	});

	it("celebrates on recentSuccess, then falls through without it", () => {
		const snap = baseSnapshot({});
		expect(deriveYardVisualState(snap, { recentSuccess: true }).bo.state).toBe(
			"celebrating",
		);
		expect(deriveYardVisualState(snap).bo.state).toBe("idle");
	});

	it("keeps walking/idle when occupying an active rail (no attention needed)", () => {
		const snap = baseSnapshot({
			occupancy: { activeRailHash: "hash-1" },
			rails: [makeRail({ activationStatus: "active" })],
			occupyMode: "occupying",
		});
		const visual = deriveYardVisualState(snap);
		expect(visual.bo.zone).toBe("activeRailTrack");
		expect(visual.bo.state).toBe("walking");
	});

	it("keeps facing as plain data (no sheet is ever mirrored)", () => {
		const snap = baseSnapshot({ occupancy: { status: "closed" } });
		const visual = deriveYardVisualState(snap);
		expect(visual.bo.state).toBe("asleep");
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
	// SAFETY: `const view = toWorldView(scenarioWorld(1, 5), true) as WorldView;` is required at this I/O or test boundary.
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
	// SAFETY: `const worldView = toWorldView(scenarioWorld(1, 0), true) as WorldView;` is required at this I/O or test boundary.
	const worldView = toWorldView(scenarioWorld(1, 0), true) as WorldView;

	it("raises one house per camp room with its label over the roof", () => {
		const { items } = presentYard(presenterInput({ world: worldView }));
		worldView.camps.forEach((camp, i) => {
			const roof = byId(items, `house-${camp.id}-0`);
			expect(roof?.kind, camp.id).toBe("tile");
			const plot = HOUSE_PLOTS[i];
			if (roof?.kind === "tile" && plot) {
				expect(roof.x).toBe(plot.tx * TILE);
				expect(roof.y).toBe(plot.ty * TILE);
			}
			const label = byId(items, `camp-${camp.id}-label`);
			expect(label?.kind).toBe("text");
			if (label?.kind === "text" && plot) {
				expect(label.y).toBeLessThan(plot.ty * TILE);
			}
		});
	});

	it("renders a villager tile per Bindle, stable per id, dimmed when idle", () => {
		const { items } = presentYard(presenterInput({ world: worldView }));
		for (const p of villagePlacements(worldView)) {
			const sprite = byId(items, `npc-${p.id}`);
			expect(sprite?.kind, p.id).toBe("tile");
			if (sprite?.kind !== "tile") continue;
			expect(sprite.sheet).toBe("chars");
			expect(VILLAGERS).toContain(sprite.index);
			expect(sprite.index).not.toBe(OPERATOR_SPRITE);
			expect(sprite.alpha).toBe(p.state === "idle" ? 0.65 : 1);
		}
	});

	it("marks stuck Bindles with a danger tile and low health with a bar", () => {
		// SAFETY: `const campId = worldView.camps[0]?.id as string;` is required at this I/O or test boundary.
		const campId = worldView.camps[0]?.id as string;
		// SAFETY: `const base = worldView.characters[0] as WorldView["characters"][number];` is required at this I/O or test boundary.
		const base = worldView.characters[0] as WorldView["characters"][number];
		const custom: WorldView = {
			// SAFETY: `camps: [worldView.camps[0] as WorldView["camps"][number]],` is required at this I/O or test boundary.
			camps: [worldView.camps[0] as WorldView["camps"][number]],
			characters: [
				{
					...base,
					campId,
					id: "x-stuck",
					state: "stuck",
					health: 0.3,
					bubble: "error in span deadbeef",
				},
				{
					...base,
					campId,
					id: "x-reading",
					state: "reading",
					health: 1,
					bubble: null,
				},
			],
			demo: false,
		};
		const { items } = presentYard(presenterInput({ world: custom }));
		const stuck = byId(items, "npc-x-stuck-danger");
		expect(stuck?.kind).toBe("tile");
		if (stuck?.kind === "tile") expect(stuck.index).toBe(T.target);
		const pip = byId(items, "npc-x-stuck-health");
		expect(pip?.kind).toBe("rect");
		if (pip?.kind === "rect") expect(pip.fill).toBe("#c34b35");
		expect(byId(items, "npc-x-stuck-bubble-text")).toBeDefined();
		const bubble = byId(items, "npc-x-stuck-bubble");
		if (bubble?.kind === "rect") {
			// Bubbles stay on the canvas — a truncated word helps nobody.
			expect(bubble.x).toBeGreaterThanOrEqual(0);
			expect(bubble.x + bubble.w).toBeLessThanOrEqual(YARD_LAYOUT.width);
		}
		// A healthy, reading Bindle spends no chrome at all.
		expect(byId(items, "npc-x-reading-danger")).toBeUndefined();
		expect(byId(items, "npc-x-reading-health")).toBeUndefined();
	});

	it("renders no world items when world is null", () => {
		const { items } = presentYard(presenterInput({ world: null }));
		expect(items.some((i) => i.id.startsWith("camp-"))).toBe(false);
		expect(items.some((i) => i.id.startsWith("house-"))).toBe(false);
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
		// SAFETY: `const id = Object.keys(world.characters)[0] as string;` is required at this I/O or test boundary.
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

describe("camp room selection (regression: OTLP placeholder camps)", () => {
	// Reproduces a real defect found by posting logs/metrics without a
	// `hobo.camp` resource attribute: yard-world materializes a placeholder
	// camp, which used to take a room slot away from a Camp that actually
	// has Bindles in it — and drew an empty room besides.
	function worldWith(
		camps: string[],
		characters: Record<string, string>,
	): Parameters<typeof toWorldView>[0] {
		const base = scenarioWorld(1, 0);
		// SAFETY: `return {` is required at this I/O or test boundary.
		return {
			...base,
			camps: Object.fromEntries(
				camps.map((id) => [id, { id, name: id, stationId: "s", yardId: "y" }]),
			),
			characters: Object.fromEntries(
				Object.entries(characters).map(([id, campId]) => [
					id,
					{
						// SAFETY: `...(Object.values(base.characters)[0] as object),` is required at this I/O or test boundary.
						...(Object.values(base.characters)[0] as object),
						id,
						campId,
					},
				]),
			),
		} as Parameters<typeof toWorldView>[0];
	}

	it("omits camps with no characters", () => {
		// SAFETY: `const view = toWorldView(` is required at this I/O or test boundary.
		const view = toWorldView(
			worldWith(["camp-orders", "default"], { "s/orders": "camp-orders" }),
			false,
		) as WorldView;
		expect(view.camps.map((c) => c.id)).toEqual(["camp-orders"]);
	});

	it("never lets an empty placeholder displace an inhabited camp", () => {
		// "aaa-empty" sorts first; without the filter it would claim a slot.
		// SAFETY: `const view = toWorldView(` is required at this I/O or test boundary.
		const view = toWorldView(
			worldWith(["aaa-empty", "camp-a", "camp-b", "camp-c", "camp-d"], {
				"s/1": "camp-a",
				"s/2": "camp-b",
				"s/3": "camp-c",
				"s/4": "camp-d",
			}),
			false,
		) as WorldView;
		expect(view.camps.map((c) => c.id)).toEqual([
			"camp-a",
			"camp-b",
			"camp-c",
			"camp-d",
		]);
	});
});

describe("sheet docking", () => {
	it("docks away from the zone it describes so the prop stays visible", () => {
		// The village puts the gate, the treasury and the hazard spur on the
		// eastern half, so their sheets dock west; the town green and its notice
		// board sit centre-west and dock east.
		expect(dockForZone("connectionBay")).toBe("left");
		expect(dockForZone("costBooth")).toBe("left");
		expect(dockForZone("errorBunker")).toBe("left");
		expect(dockForZone("platformRest")).toBe("right");
		expect(dockForZone("bootstrapDesk")).toBe("right");
	});

	it("keeps the docked panel clear of every compact zone rect", () => {
		const PANEL = 360 + 32;
		for (const zone of Object.values(YARD_LAYOUT.zones)) {
			// The rail track spans the whole stage, so no dock can clear it;
			// only compact props can be guaranteed visible beside the panel.
			if (zone.width > YARD_LAYOUT.width / 2) continue;
			const dock = dockForZone(zone.id);
			if (dock === "left") {
				expect(zone.x, zone.id).toBeGreaterThanOrEqual(PANEL);
			} else {
				expect(zone.x + zone.width, zone.id).toBeLessThanOrEqual(
					YARD_LAYOUT.width - PANEL,
				);
			}
		}
	});
});
