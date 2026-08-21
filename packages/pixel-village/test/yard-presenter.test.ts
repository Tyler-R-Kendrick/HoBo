import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";
import {
	deriveYardVisualState,
	HOUSE_PLOTS,
	LANDMARK,
	lanternLines,
	lanternRowText,
	OPERATOR_SPRITE,
	type PresenterInput,
	presentYard,
	type RenderItem,
	ROAD_TY,
	scenarioWorld,
	T,
	TILE,
	TILE_SCALE,
	toWorldView,
	VILLAGERS,
	villagePlacements,
	type Waybill,
	type WorldView,
	YARD_LAYOUT,
	type ZoneId,
} from "../src/index.js";

// SAFETY: The fixture intentionally supplies the projection fields used by presenter tests.
const baseSnap: YardProjectionSnapshot = {
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	occupancy: {
		stationId: "station:local",
		status: "open",
		activeRailHash: "hash-1",
		bootstrapActive: false,
		connectionCount: 1,
		seq: 7,
	} as YardProjectionSnapshot["occupancy"],
	rails: [
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		{
			id: "rail-prod",
			contentHash: "hash-1",
			activationStatus: "active",
		} as YardProjectionSnapshot["rails"][number],
	],
	connections: [
		{
			id: "conn-1",
			alias: "work",
			provider: "asana",
			status: "active",
			// SAFETY: The fixture supplies the connection fields consumed by the presenter.
		} as YardProjectionSnapshot["connections"][number],
	],
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	metering: {
		quotaUsed: 5,
		quotaLimit: 10,
		budgetUsd: 1,
		spendCapUsd: 10,
		trafficRate: 0.4,
		trafficRateSource: "synthetic",
	} as YardProjectionSnapshot["metering"],
	activity: [],
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	doctor: {
		hazards: [],
		bootstrapActive: false,
	} as YardProjectionSnapshot["doctor"],
	seq: 7,
	occupyMode: "occupying",
};

function input(overrides: Partial<PresenterInput> = {}): PresenterInput {
	const visual = deriveYardVisualState(baseSnap);
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

function makeWaybill(patch: Partial<Waybill> = {}): Waybill {
	return {
		id: "waybill:rail.approve:rail-1",
		kind: "rail.approve",
		title: "Approve Rail",
		summary: "Draft rail awaits approval.",
		fields: [{ name: "hashOrId", label: "Rail", value: "sha256:abc" }],
		confirmOp: "stationRailsApprove",
		values: { hashOrId: "sha256:abc" },
		blastRadius: "rail",
		...patch,
	};
}

function byId(
	items: readonly RenderItem[],
	id: string,
): RenderItem | undefined {
	return items.find((i) => i.id === id);
}

/** Every tile in the model, keyed by the pixel cell it occupies. */
function tiles(items: readonly RenderItem[]) {
	return items.filter(
		(i): i is Extract<RenderItem, { kind: "tile" }> => i.kind === "tile",
	);
}

// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
const world = toWorldView(scenarioWorld(1, 5), true) as WorldView;

describe("the village is built from sourced tiles, never from primitives", () => {
	it("draws no labelled zone cards — the village IS the affordance", () => {
		const { items } = presentYard(input());
		for (const z of Object.values(YARD_LAYOUT.zones)) {
			expect(byId(items, `zone-${z.id}`), z.id).toBeUndefined();
			expect(byId(items, `zone-${z.id}-shadow`), z.id).toBeUndefined();
			expect(byId(items, `zone-${z.id}-label`), z.id).toBeUndefined();
			// The old enamel signs are gone with the props they were nailed to.
			expect(byId(items, `sign-${z.id}`), z.id).toBeUndefined();
		}
	});

	it("lays the meadow and the road as tiles at integer scale", () => {
		const { items } = presentYard(input());
		const ground = byId(items, "ground-0-0");
		expect(ground?.kind).toBe("tile");
		if (ground?.kind === "tile") {
			expect(ground.sheet).toBe("town");
			expect(ground.scale).toBe(TILE_SCALE);
			expect(Number.isInteger(ground.scale)).toBe(true);
		}
		// The road renders the active rail across the whole grid, three rows deep.
		// Derived from ROAD_TY so moving the road cannot silently rot this test.
		const road = byId(items, `road-0-${ROAD_TY}`);
		expect(road?.kind).toBe("tile");
		if (road?.kind === "tile") expect(road.index).toBe(T.dirtMid);
		expect(byId(items, `road-0-${ROAD_TY - 1}`)).toBeDefined();
		expect(byId(items, `road-0-${ROAD_TY + 1}`)).toBeDefined();
		// Every tile is placed on the grid — no fractional pixel offsets.
		for (const t of tiles(items)) {
			expect(Number.isInteger(t.x), t.id).toBe(true);
			expect(Number.isInteger(t.y), t.id).toBe(true);
			expect(t.scale, t.id).toBe(TILE_SCALE);
		}
	});

	it("places every fixed landmark on its verified tile", () => {
		const { items } = presentYard(input());
		const cases: [string, number][] = [
			["notice-board-0", T.signpost],
			["notice-board-1", T.signpost],
			["stores-barrel", T.barrel],
			["stores-chest", T.chest],
		];
		for (const [id, index] of cases) {
			const item = byId(items, id);
			expect(item?.kind, id).toBe("tile");
			if (item?.kind === "tile") {
				expect(item.sheet, id).toBe("town");
				expect(item.index, id).toBe(index);
			}
		}
	});

	it("stands the Operator beside the notice board — there is no Bo", () => {
		const { items } = presentYard(input());
		expect(byId(items, "bo")).toBeUndefined();
		const op = byId(items, "operator");
		expect(op?.kind).toBe("tile");
		if (op?.kind !== "tile") return;
		expect(op.sheet).toBe("chars");
		expect(op.index).toBe(OPERATOR_SPRITE);
		expect(VILLAGERS).not.toContain(op.index);
		const board = byId(items, "notice-board-0");
		if (board?.kind === "tile") {
			expect(Math.abs(op.x - board.x)).toBeLessThanOrEqual(TILE);
			expect(op.y).toBe(board.y);
		}
	});

	it("holds the Operator back until the sheets are actually loaded", () => {
		expect(byId(presentYard(input({ ready: false })).items, "operator")).toBe(
			undefined,
		);
	});
});

describe("houses are Camps, villagers are Bindles", () => {
	it("raises exactly one house per REAL Camp, never a decorative building", () => {
		const empty = presentYard(input()).items;
		expect(empty.filter((i) => i.id.startsWith("house-"))).toHaveLength(0);

		const { items } = presentYard(input({ world }));
		expect(world.camps.length).toBeGreaterThan(0);
		for (const camp of world.camps) {
			expect(byId(items, `house-${camp.id}-0`), camp.id).toBeDefined();
			const label = byId(items, `camp-${camp.id}-label`);
			expect(label?.kind, camp.id).toBe("text");
		}
		// One plot consumed per camp and no more: the empty plots stay empty.
		const roofs = items.filter((i) => /^house-.*-0$/.test(i.id));
		expect(roofs).toHaveLength(world.camps.length);
	});

	it("never raises more houses than there are plots", () => {
		const many: WorldView = {
			...world,
			camps: Array.from({ length: 9 }, (_, i) => ({
				id: `camp-${i}`,
				label: `camp ${i}`,
				x: 0,
				y: 0,
				w: 1,
				h: 1,
			})),
		};
		const { items } = presentYard(input({ world: many }));
		expect(items.filter((i) => /^house-.*-0$/.test(i.id))).toHaveLength(
			HOUSE_PLOTS.length,
		);
	});

	it("stands one villager per Bindle on its own Camp's doorstep", () => {
		const { items } = presentYard(input({ world }));
		const placed = villagePlacements(world);
		expect(placed.length).toBeGreaterThan(0);
		for (const p of placed) {
			const sprite = byId(items, `npc-${p.id}`);
			expect(sprite?.kind, p.id).toBe("tile");
			if (sprite?.kind !== "tile") continue;
			expect(sprite.sheet).toBe("chars");
			expect(VILLAGERS).toContain(sprite.index);
			// …and standing on the ground, not floating: the slot is a real tile.
			expect(sprite.x % TILE).toBe(0);
			expect(sprite.y % TILE).toBe(0);
			const plotIndex = world.camps.findIndex((c) => c.id === p.campId);
			const plot = HOUSE_PLOTS[plotIndex];
			expect(plot).toBeDefined();
			expect(plot?.standing.some((s) => s.tx === p.tx && s.ty === p.ty)).toBe(
				true,
			);
		}
		// A Bindle always looks like itself.
		expect(villagePlacements(world).map((p) => p.sprite)).toEqual(
			placed.map((p) => p.sprite),
		);
	});

	it("dims idle villagers and keeps working ones solid", () => {
		// SAFETY: The scenario fixture supplies the complete world shape used here.
		const custom: WorldView = {
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The scenario fixture always contains a first camp.
			camps: [world.camps[0] as WorldView["camps"][number]],
			characters: [
				// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
				{
					// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
					// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
					// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
					...(world.characters[0] as WorldView["characters"][number]),
					id: "x-idle",
					state: "idle",
					health: 1,
					bubble: null,
				},
				{
					...(world.characters[0] as WorldView["characters"][number]),
					// SAFETY: The scenario fixture always contains a first character.
					...(world.characters[0] as WorldView["characters"][number]),
					id: "x-working",
					state: "working",
					health: 1,
					bubble: null,
				},
			],
			demo: false,
		};
		const only = {
			...custom,
			characters: custom.characters.map((c) => ({
				...c,
				// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
				campId: custom.camps[0]?.id as string,
			})),
		};
		const { items } = presentYard(input({ world: only }));
		const idle = byId(items, "npc-x-idle");
		const working = byId(items, "npc-x-working");
		if (idle?.kind === "tile") expect(idle.alpha).toBe(0.65);
		if (working?.kind === "tile") expect(working.alpha).toBe(1);
	});

	it("plants a danger marker over a stuck or failing Bindle, and only then", () => {
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		const base = world.characters[0] as WorldView["characters"][number];
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		// SAFETY: The scenario fixture always contains a camp id.
		// SAFETY: The scenario fixture always contains a camp id.
		const campId = world.camps[0]
			?.id /* SAFETY: The scenario fixture contains a camp id. */ as string;
		// SAFETY: The scenario fixture supplies the complete world shape used here.
		const custom: WorldView = {
			camps: [
				world
					.camps[0] /* SAFETY: The scenario fixture contains a first camp. */ as WorldView["camps"][number],
			],
			characters: [
				{ ...base, campId, id: "x-stuck", state: "stuck", health: 1 },
				{ ...base, campId, id: "x-sick", state: "working", health: 0.3 },
				{ ...base, campId, id: "x-well", state: "working", health: 1 },
			],
			demo: false,
		};
		const { items } = presentYard(input({ world: custom }));
		for (const id of ["x-stuck", "x-sick"]) {
			const mark = byId(items, `npc-${id}-danger`);
			expect(mark?.kind, id).toBe("tile");
			if (mark?.kind !== "tile") continue;
			expect(mark.index).toBe(T.target);
			const body = byId(items, `npc-${id}`);
			// The marker sits ON the thing it marks: same column, one row above.
			if (body?.kind === "tile") {
				expect(mark.x).toBe(body.x);
				expect(mark.y).toBe(body.y - TILE);
			}
		}
		expect(byId(items, "npc-x-well-danger")).toBeUndefined();
		// Failing health also shows as a bar; full health spends no chrome on it.
		const pip = byId(items, "npc-x-sick-health");
		expect(pip?.kind).toBe("rect");
		if (pip?.kind === "rect") expect(pip.fill).toBe("#c34b35");
		expect(byId(items, "npc-x-well-health")).toBeUndefined();
	});

	it("keeps a Bindle's speech legible on screen", () => {
		// SAFETY: The scenario fixture contains the camp and character shapes used here.
		const campId = world.camps[0]?.id as string;
		const custom: WorldView = {
			// SAFETY: The scenario fixture contains a first camp.
			camps: [world.camps[0] as WorldView["camps"][number]],
			characters: [
				{
					// SAFETY: The scenario fixture contains a first character.
					...(world
						.characters[0] /* SAFETY: The scenario fixture contains a first character. */ as WorldView["characters"][number]),
					campId,
					// SAFETY: The scenario fixture always contains a first character.
					...(world.characters[0] as WorldView["characters"][number]),
					id: "x-talks",
					bubble: "error in span deadbeef",
				},
			],
			demo: false,
		};
		const { items } = presentYard(input({ world: custom }));
		const bubble = byId(items, "npc-x-talks-bubble");
		expect(bubble?.kind).toBe("rect");
		if (bubble?.kind === "rect") {
			expect(bubble.fill).toBe("#f4f1e8");
			expect(bubble.stroke).toBe("#3f2631");
			expect(bubble.x).toBeGreaterThanOrEqual(0);
			expect(bubble.x + bubble.w).toBeLessThanOrEqual(YARD_LAYOUT.width);
		}
		expect(byId(items, "npc-x-talks-bubble-text")).toBeDefined();
	});

	it("renders no village people at all when the world is unknown", () => {
		const { items } = presentYard(input({ world: null }));
		expect(items.some((i) => i.id.startsWith("npc-"))).toBe(false);
		expect(items.some((i) => i.id.startsWith("house-"))).toBe(false);
		expect(items.some((i) => i.id.startsWith("camp-"))).toBe(false);
	});
});

describe("the gate is the Connection", () => {
	it("stands the gate open for an authorized Connection and bars it otherwise", () => {
		const openItems = presentYard(input()).items;
		const gate = LANDMARK.gate;
		expect(byId(openItems, `fence-${gate.tx}-13`)).toBeUndefined();
		expect(byId(openItems, `fence-${gate.tx + 1}-13`)).toBeUndefined();
		// The fence itself is always there — a boundary is a real fact.
		expect(byId(openItems, "fence-2-13")).toBeDefined();

		// SAFETY: The fixture supplies the complete connection projection shape.
		const revoked = deriveYardVisualState({
			...baseSnap,
			connections: [
				{
					id: "conn-1",
					alias: "work",
					provider: "asana",
					status: "revoked",
				} as YardProjectionSnapshot["connections"][number],
			],
		});
		const barred = presentYard(input({ visual: revoked })).items;
		const bar = byId(barred, `fence-${gate.tx}-13`);
		expect(bar?.kind).toBe("tile");
		if (bar?.kind === "tile") expect(bar.index).toBe(T.gate);
	});
});

describe("hazards are the only danger on the board", () => {
	function hazardSnap(hazards: string[]): YardProjectionSnapshot {
		return {
			...baseSnap,
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			doctor: {
				hazards,
				bootstrapActive: false,
			} as YardProjectionSnapshot["doctor"],
		};
	}

	it("shows nothing at all — and no danger colour — on a clean board", () => {
		const calm = presentYard(input()).items;
		expect(byId(calm, "hazard-bomb")).toBeUndefined();
		expect(byId(calm, "hazard-mark-0")).toBeUndefined();
		expect(
			calm.filter(
				(i) =>
					(i.kind === "rect" && i.fill === "#c34b35") ||
					(i.kind === "line" && i.color === "#c34b35") ||
					(i.kind === "text" && i.color === "#c34b35"),
			),
		).toHaveLength(0);
	});

	it("escalates with the hazard COUNT, not merely on/off", () => {
		const marks = (n: number) =>
			presentYard(
				input({
					visual: deriveYardVisualState(
						hazardSnap(Array.from({ length: n }, (_, i) => `hazard-${i}`)),
					),
				}),
			).items.filter((i) => /^hazard-mark-\d+$/.test(i.id)).length;
		expect(marks(1)).toBe(1);
		expect(marks(3)).toBe(3);
		expect(marks(3)).toBeGreaterThan(marks(1));
		expect(marks(5)).toBeGreaterThan(marks(3));
	});

	it("plants the hazard on its own spur and states the real reason", () => {
		const { items } = presentYard(
			input({
				visual: deriveYardVisualState(
					hazardSnap(["connection-revoked:conn-1"]),
				),
			}),
		);
		const bomb = byId(items, "hazard-bomb");
		expect(bomb?.kind).toBe("tile");
		if (bomb?.kind === "tile") {
			expect(bomb.index).toBe(T.bomb);
			expect(bomb.x).toBe(LANDMARK.hazardSpur.tx * TILE);
		}
		const mark = byId(items, "hazard-mark-0");
		if (mark?.kind === "tile") expect(mark.index).toBe(T.target);
		const reason = byId(items, "hazard-text-0");
		expect(reason?.kind).toBe("text");
		if (reason?.kind === "text") {
			expect(reason.text).toBe("connection-revoked:conn-1");
			expect(reason.color).toBe("#c34b35");
			expect(reason.x).toBeGreaterThanOrEqual(0);
		}
		// …on a plaque, so danger text is never lost against the meadow.
		const plaque = byId(items, "hazard-plaque");
		expect(plaque?.kind).toBe("rect");
		if (plaque?.kind === "rect") {
			expect(plaque.fill).toBe("#f4f1e8");
			expect(plaque.stroke).toBe("#c34b35");
			expect(plaque.x + plaque.w).toBeLessThanOrEqual(YARD_LAYOUT.width);
		}
	});
});

describe("the treasury reads the metering projection back", () => {
	it("prints the real quota fill, in danger only when the cap is nearly spent", () => {
		const cool = byId(presentYard(input()).items, "treasury-label");
		expect(cool?.kind).toBe("text");
		if (cool?.kind === "text") {
			expect(cool.text).toBe("quota 50%");
			expect(cool.color).toBe("#3f2631");
		}
		const hot = deriveYardVisualState({
			...baseSnap,
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			metering: {
				...baseSnap.metering,
				budgetUsd: 9,
			} as YardProjectionSnapshot["metering"],
		});
		const hotLabel = byId(
			presentYard(input({ visual: hot })).items,
			"treasury-label",
		);
		if (hotLabel?.kind === "text") expect(hotLabel.color).toBe("#c34b35");
	});
});

describe("HIGHBALL presenter props (M1 phase B)", () => {
	it("renders up to 3 waybill papers with the top one frontmost", () => {
		const waybills = [0, 1].map((i) =>
			makeWaybill({ id: `waybill:${i}`, title: `Waybill ${i}` }),
		);
		const { items } = presentYard(input({ waybills }));
		const top = byId(items, "waybill-0");
		const below = byId(items, "waybill-1");
		expect(top?.kind).toBe("rect");
		expect(below?.kind).toBe("rect");
		expect(byId(items, "waybill-2")).toBeUndefined();
		expect(byId(items, "waybill-count")).toBeUndefined();
		if (top?.kind === "rect" && below?.kind === "rect") {
			expect(top.depth).toBeGreaterThan(below.depth);
			expect(top.fill).toBe("#f4f1e8");
			expect(top.stroke).toBe("#3f2631");
			// Pinned under the notice board, not floating in the meadow.
			expect(top.x).toBeGreaterThanOrEqual(LANDMARK.noticeBoard.tx * TILE);
			expect(top.y).toBeGreaterThan(LANDMARK.noticeBoard.ty * TILE);
		}
		const title = byId(items, "waybill-0-title");
		expect(title?.kind).toBe("text");
		if (title?.kind === "text") expect(title.text).toBe("Waybill 0");
	});

	it("caps the stack at 3 and badges the overflow count", () => {
		const waybills = [0, 1, 2, 3, 4].map((i) =>
			makeWaybill({ id: `waybill:${i}` }),
		);
		const { items } = presentYard(input({ waybills }));
		expect(byId(items, "waybill-2")).toBeDefined();
		expect(byId(items, "waybill-3")).toBeUndefined();
		const count = byId(items, "waybill-count");
		expect(count?.kind).toBe("text");
		if (count?.kind === "text") expect(count.text).toBe("+2");
	});

	it("keeps the banner down until the board is genuinely clean", () => {
		const { items } = presentYard(input());
		expect(byId(items, "banner-top")).toBeUndefined();
		expect(byId(items, "banner-tail")).toBeUndefined();
		expect(byId(items, "highball-label")).toBeUndefined();
	});

	it("raises the town banner over the road on HIGHBALL", () => {
		const { items } = presentYard(input({ highball: true }));
		const top = byId(items, "banner-top");
		const tail = byId(items, "banner-tail");
		expect(top?.kind).toBe("tile");
		expect(tail?.kind).toBe("tile");
		if (top?.kind === "tile" && tail?.kind === "tile") {
			// Sourced art, not a drawn flag — and one banner, hung as two tiles.
			expect(top.sheet).toBe("rogue");
			expect(tail.sheet).toBe("rogue");
			expect(top.x).toBe(LANDMARK.banner.tx * TILE);
			expect(tail.y).toBe(top.y + TILE);
		}
		const label = byId(items, "highball-label");
		expect(label?.kind).toBe("text");
		if (label?.kind === "text") expect(label.text).toBe("HIGHBALL");
	});

	it("HUD title carries the HIGHBALL! picture card", () => {
		const title = byId(presentYard(input()).items, "hud-title");
		expect(title?.kind).toBe("text");
		if (title?.kind === "text") {
			expect(title.text).toBe("HIGHBALL! · single Station");
		}
	});

	it("keeps every landmark inside the canvas, clear of the sheet gutter", () => {
		const { items } = presentYard(input({ highball: true, world }));
		// The DOM sheet is right:32px / width ≤360 over a 1280 canvas.
		for (const t of tiles(items)) {
			expect(t.x, t.id).toBeGreaterThanOrEqual(0);
			expect(t.y, t.id).toBeGreaterThanOrEqual(0);
			expect(t.y + TILE, t.id).toBeLessThanOrEqual(YARD_LAYOUT.height);
		}
		// Scenery is never sliced by the right edge (the grid overhangs it).
		for (const t of tiles(items).filter((i) => i.id.startsWith("tree-"))) {
			expect(t.x + TILE, t.id).toBeLessThanOrEqual(YARD_LAYOUT.width);
		}
		const label = byId(items, "highball-label");
		if (label?.kind === "text") expect(label.x).toBeLessThan(900);
	});
});

describe("motion is accent only", () => {
	it("suppresses particles in test mode and emits them live", () => {
		const particles = [{ x: 200, y: 340, alive: true }];
		expect(
			byId(presentYard(input({ particles })).items, "particle-0"),
		).toBeUndefined();
		expect(
			byId(
				presentYard(input({ particles, testMode: false })).items,
				"particle-0",
			),
		).toBeDefined();
	});
});

describe("lantern inspect (free read verb)", () => {
	function lanternText(items: readonly RenderItem[]): string[] {
		return items
			.filter((i) => i.id.startsWith("lantern-line-"))
			.map((i) => (i.kind === "text" ? i.text : ""));
	}

	it("stays down until a zone is hovered", () => {
		expect(byId(presentYard(input()).items, "lantern-card")).toBeUndefined();
		const { items } = presentYard(input({ hoveredZone: "costBooth" }));
		const card = byId(items, "lantern-card");
		expect(card?.kind).toBe("rect");
		if (card?.kind === "rect") {
			expect(card.fill).toBe("#f4f1e8");
			expect(card.stroke).toBe("#3f2631");
			expect(card.lineWidth).toBe(2);
		}
		// hard sticker offset shadow, never a soft blur
		const shadow = byId(items, "lantern-card-shadow");
		expect(shadow?.kind).toBe("rect");
		if (shadow?.kind === "rect" && card?.kind === "rect") {
			expect(shadow.x - card.x).toBe(4);
			expect(shadow.y - card.y).toBe(4);
		}
	});

	it("reads the REAL projection fields back per zone", () => {
		const cases = {
			platformRest: [/^station: station:local$/, /^status: open$/, /^seq: 7$/],
			bootstrapDesk: [/^bootstrap: idle$/, /^waybills: 0$/],
			activeRailTrack: [/^activeRail: hash-1$/, /^occupyMode: occupying$/],
			connectionBay: [/^work: asana · active$/],
			policyBoard: [/^hash-1: active$/],
			costBooth: [
				/^quota: 5 \/ 10$/,
				/^budgetUsd: \$1\.00$/,
				/^spendCapUsd: \$10\.00$/,
			],
			errorBunker: [/^hazards: \(none\)$/],
		} satisfies Record<ZoneId, RegExp[]>;
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		for (const [zone, patterns] of Object.entries(cases) as [
			ZoneId,
			RegExp[],
		][]) {
			const lines = lanternText(
				presentYard(input({ hoveredZone: zone })).items,
			);
			for (const p of patterns) {
				expect(
					lines.some((l) => p.test(l)),
					`${zone} ${p}`,
				).toBe(true);
			}
		}
	});

	it("badges every synthetic value with (SIMULATED) and never a real one", () => {
		for (const zone of ["costBooth", "activeRailTrack"] as const) {
			const lines = lanternText(
				presentYard(input({ hoveredZone: zone })).items,
			);
			const traffic = lines.find((l) => l.startsWith("trafficRate:"));
			expect(traffic, zone).toBe("trafficRate: 0.40 (SIMULATED)");
			// Measured fields never borrow the badge.
			for (const l of lines.filter((x) => !x.startsWith("trafficRate:"))) {
				expect(l, zone).not.toContain("SIMULATED");
			}
		}
		// Provenance comes from MeteringView.trafficRateSource, not a hard-code.
		// SAFETY: The fixture supplies the complete metering projection shape.
		const measured = deriveYardVisualState({
			...baseSnap,
			metering: {
				...baseSnap.metering,
				trafficRateSource: "otlp",
			} as YardProjectionSnapshot["metering"],
		});
		const rows = lanternLines("costBooth", measured, []);
		expect(rows.find((r) => r.label === "trafficRate")?.simulated).toBe(false);
		// An absent source is treated as synthetic — never silently promoted.
		// SAFETY: The fixture supplies the complete metering projection shape.
		const unknown = deriveYardVisualState({
			...baseSnap,
			metering: {
				quotaUsed: 5,
				quotaLimit: 10,
				budgetUsd: 1,
				spendCapUsd: 10,
				trafficRate: 0.4,
			} as YardProjectionSnapshot["metering"],
		});
		expect(
			lanternLines("costBooth", unknown, []).find(
				(r) => r.label === "trafficRate",
			)?.simulated,
		).toBe(true);
	});

	it("caps at 6 lines and truncates long values", () => {
		// SAFETY: The fixture supplies the complete doctor projection shape.
		const many = {
			...baseSnap,
			doctor: {
				hazards: Array.from({ length: 9 }, (_, i) => `hazard-number-${i}`),
				bootstrapActive: false,
				hint: "run `hobo doctor --fix` and then re-authorize the connection",
			} as YardProjectionSnapshot["doctor"],
		};
		const visual = deriveYardVisualState(many);
		const lines = lanternText(
			presentYard(input({ visual, hoveredZone: "errorBunker" })).items,
		);
		expect(lines.length).toBeLessThanOrEqual(6);
		for (const l of lines) {
			const value = l.slice(l.indexOf(": ") + 2);
			expect(value.length).toBeLessThanOrEqual(28);
		}
		expect(lines.at(-1)).toMatch(/^hint: .*…$/);
	});

	it("clamps the card inside the canvas for every zone", () => {
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		for (const zone of Object.keys(YARD_LAYOUT.zones) as ZoneId[]) {
			const card = byId(
				presentYard(input({ hoveredZone: zone })).items,
				"lantern-card",
			);
			expect(card?.kind, zone).toBe("rect");
			if (card?.kind !== "rect") continue;
			expect(card.x, zone).toBeGreaterThanOrEqual(0);
			expect(card.y, zone).toBeGreaterThanOrEqual(0);
			expect(card.x + card.w, zone).toBeLessThanOrEqual(YARD_LAYOUT.width);
			expect(card.y + card.h, zone).toBeLessThanOrEqual(YARD_LAYOUT.height);
		}
	});

	it("formats a row as label: value with the badge last", () => {
		expect(
			lanternRowText({ label: "trafficRate", value: "0.40", simulated: true }),
		).toBe("trafficRate: 0.40 (SIMULATED)");
		expect(lanternRowText({ label: "seq", value: "7" })).toBe("seq: 7");
	});
});

describe("reserved regions", () => {
	function overlaps(
		a: { x: number; y: number; w: number; h: number },
		b: { x: number; y: number; w: number; h: number },
	): boolean {
		return (
			a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
		);
	}

	/** Pixel cell a tile occupies. */
	function cell(t: Extract<RenderItem, { kind: "tile" }>) {
		return { x: t.x, y: t.y, w: TILE, h: TILE };
	}

	it("keeps the house band clear of every yard landmark and tree", () => {
		const { items } = presentYard(input({ world, highball: true }));
		const band = YARD_LAYOUT.campGrounds;
		const region = {
			x: band.x,
			y: band.y,
			w: band.width,
			h: band.height,
		};
		const intruders = tiles(items).filter(
			(t) =>
				!t.id.startsWith("ground-") &&
				!t.id.startsWith("road-") &&
				!t.id.startsWith("house-") &&
				!t.id.startsWith("npc-"),
		);
		expect(intruders.length).toBeGreaterThan(10);
		for (const t of intruders) {
			expect(overlaps(region, cell(t)), t.id).toBe(false);
		}
	});

	it("encodes the quota level in the treasury the region actually shows", () => {
		// A pile that only grows upward leaves the base tile unchanged, which
		// reads as a dead region even though the projection moved.
		const hoardAt = (fill: number) => {
			const visual = deriveYardVisualState({
				...baseSnap,
				// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
				metering: {
					...baseSnap.metering,
					quotaUsed: fill * 1000,
					quotaLimit: 1000,
				} as YardProjectionSnapshot["metering"],
			});
			const item = presentYard(input({ visual })).items.find(
				(i) => i.id === "treasury-coin-large",
			);
			return item?.kind === "tile" ? item.index : -1;
		};
		const tiers = [0.1, 0.4, 0.7, 0.95].map(hoardAt);
		expect(new Set(tiers).size, "each quota tier must look different").toBe(4);
	});

	it("never stacks two props on the same tile cell", () => {
		const { items } = presentYard(input({ world, highball: true }));
		// Ground and road are deliberate full-grid layers; state markers are
		// deliberately planted ON the thing they mark (DESIGN.md). Everything
		// else is furniture and must not double up on a cell.
		const props = tiles(items).filter(
			(t) =>
				!t.id.startsWith("ground-") &&
				!t.id.startsWith("road-") &&
				!t.id.endsWith("-danger"),
		);
		const seen = new Map<string, string>();
		for (const t of props) {
			const key = `${t.x},${t.y}`;
			expect(seen.has(key), `${t.id} collides with ${seen.get(key)}`).toBe(
				false,
			);
			seen.set(key, t.id);
		}
	});
});
