import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";
import {
	deriveYardVisualState,
	lanternLines,
	lanternRowText,
	type PresenterInput,
	presentYard,
	type RenderItem,
	resolveBoTransitAnim,
	scenarioWorld,
	toWorldView,
	type Waybill,
	type WorldView,
	YARD_LAYOUT,
	type ZoneId,
} from "../src/index.js";

const baseSnap: YardProjectionSnapshot = {
	occupancy: {
		stationId: "station:local",
		status: "open",
		activeRailHash: "hash-1",
		bootstrapActive: false,
		connectionCount: 1,
		seq: 7,
	} as YardProjectionSnapshot["occupancy"],
	rails: [
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
		} as YardProjectionSnapshot["connections"][number],
	],
	metering: {
		quotaUsed: 5,
		quotaLimit: 10,
		budgetUsd: 1,
		spendCapUsd: 10,
		trafficRate: 0.4,
		trafficRateSource: "synthetic",
	} as YardProjectionSnapshot["metering"],
	activity: [],
	doctor: {
		hazards: [],
		bootstrapActive: false,
	} as unknown as YardProjectionSnapshot["doctor"],
	seq: 7,
	occupyMode: "occupying",
};

function input(overrides: Partial<PresenterInput> = {}): PresenterInput {
	const visual = deriveYardVisualState(baseSnap);
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

describe("yard presenter", () => {
	it("draws no labelled zone cards — only diegetic props", () => {
		const { items } = presentYard(input());
		for (const z of Object.values(YARD_LAYOUT.zones)) {
			expect(byId(items, `zone-${z.id}`), z.id).toBeUndefined();
			expect(byId(items, `zone-${z.id}-shadow`), z.id).toBeUndefined();
			expect(byId(items, `zone-${z.id}-rail`), z.id).toBeUndefined();
			expect(byId(items, `zone-${z.id}-label`), z.id).toBeUndefined();
		}
	});

	it("carries an enamel sign for every zone so names survive the redraw", () => {
		const { items } = presentYard(input());
		for (const z of Object.values(YARD_LAYOUT.zones)) {
			const plate = byId(items, `sign-${z.id}`);
			expect(plate?.kind, z.id).toBe("rect");
			if (plate?.kind === "rect") {
				expect(plate.fill).toBe("#ffffff");
				expect(plate.stroke).toBe("#101010");
				expect(plate.lineWidth).toBe(2);
				// Ink-on-paper only; never a spark/go plate.
				expect(plate.x + plate.w).toBeLessThanOrEqual(YARD_LAYOUT.width);
			}
			const label = byId(items, `sign-${z.id}-text`);
			expect(label?.kind, z.id).toBe("text");
			if (label?.kind === "text") {
				expect(label.text).toBe(label.text.toUpperCase());
				expect(label.color).toBe("#101010");
			}
		}
	});

	it("renders one prop per zone built from ink primitives", () => {
		const { items } = presentYard(input());
		for (const id of [
			// platform: plank deck on posts + lamp post
			"platform-plank-0",
			"platform-post-a",
			"lamp-glass",
			// waybill desk: furniture + bell
			"desk-slab",
			"desk-leg-left",
			"station-bell",
			"station-bell-crown",
			// rail track + switch stand
			"track-bed",
			"switch-post",
			"switch-target",
			// policy notice board
			"board-slab",
			"board-post-left",
			"board-shingle-0",
			// cost booth: coal tender + pressure governor
			"tender-band-0",
			"gauge-needle",
			"gauge-hub",
			// hazard spur
			"spur-rail",
			"spur-tie-broken",
			"spur-bumper",
			// connection siding
			"siding-rail-0",
			// the highball signal
			"semaphore-post",
		]) {
			expect(byId(items, id), id).toBeDefined();
		}
	});

	it("binds the coal tender fill and the governor needle to metering", () => {
		const { items } = presentYard(input());
		// quotaUsed/quotaLimit = 0.5 → coal fills the lower half of the hopper.
		const coal = items.filter((i) => i.id.startsWith("tender-coal-"));
		expect(coal.length).toBeGreaterThan(0);
		for (const c of coal) {
			if (c.kind === "rect") expect(c.fill).toBe("#101010");
		}
		const filled = coal.reduce(
			(sum, c) => sum + (c.kind === "rect" ? c.h : 0),
			0,
		);
		// Hopper interior is 146..194; half fill ≈ 24px of coal (band insets ~3px).
		expect(filled).toBeGreaterThan(15);
		expect(filled).toBeLessThan(34);
		// heat 0.1 → ink needle, not spark.
		const needle = byId(items, "gauge-needle");
		expect(needle?.kind).toBe("line");
		if (needle?.kind === "line") expect(needle.color).toBe("#101010");
	});

	it("turns the governor needle spark-red above 0.8 heat and sweeps with it", () => {
		const hot = deriveYardVisualState({
			...baseSnap,
			metering: {
				...baseSnap.metering,
				budgetUsd: 9,
			} as YardProjectionSnapshot["metering"],
		});
		const cold = deriveYardVisualState(baseSnap);
		const hotNeedle = byId(
			presentYard(input({ visual: hot })).items,
			"gauge-needle",
		);
		const coldNeedle = byId(
			presentYard(input({ visual: cold })).items,
			"gauge-needle",
		);
		expect(hotNeedle?.kind).toBe("line");
		if (hotNeedle?.kind === "line" && coldNeedle?.kind === "line") {
			expect(hotNeedle.color).toBe("#c5301c");
			// Higher heat sweeps the needle clockwise (further east).
			expect(hotNeedle.x2).toBeGreaterThan(coldNeedle.x2);
		}
	});

	it("keeps the fare readout beneath the gauge, clear of the Cost Booth sign", () => {
		const { items } = presentYard(input());
		const fare = byId(items, "cost-label");
		const sign = byId(items, "sign-costBooth");
		expect(fare?.kind).toBe("text");
		if (fare?.kind === "text" && sign?.kind === "rect") {
			expect(fare.y).toBeGreaterThan(sign.y + sign.h);
		}
	});

	it("rolls out exactly one freight car per REAL connection — never a decorative one", () => {
		const { items } = presentYard(input());
		expect(byId(items, "car-0")).toBeDefined();
		const label = byId(items, "car-0-label");
		expect(label?.kind).toBe("text");
		if (label?.kind === "text") expect(label.text).toBe("work");
		// authorized → go-green door panel
		const door = byId(items, "car-0-door");
		if (door?.kind === "rect") expect(door.fill).toBe("#14672c");
		// one connection → exactly one car body, no padding slots
		expect(items.filter((i) => /^car-\d+$/.test(i.id))).toHaveLength(1);
		expect(byId(items, "car-1")).toBeUndefined();
	});

	it("shows an empty siding (no cars at all) when there are no connections", () => {
		const visual = deriveYardVisualState({ ...baseSnap, connections: [] });
		const { items } = presentYard(input({ visual }));
		expect(items.filter((i) => /^car-\d+$/.test(i.id))).toHaveLength(0);
		expect(byId(items, "siding-rail-0")).toBeDefined();
		expect(byId(items, "sign-connectionBay")).toBeDefined();
	});

	it("steams a spark-red car for every unhealthy connection status", () => {
		for (const status of ["needs-reauth", "revoked", "expired"] as const) {
			const visual = deriveYardVisualState({
				...baseSnap,
				connections: [
					{
						id: "conn-1",
						alias: "work",
						provider: "asana",
						status,
					} as YardProjectionSnapshot["connections"][number],
				],
			});
			const { items } = presentYard(input({ visual }));
			const door = byId(items, "car-0-door");
			expect(door?.kind, status).toBe("rect");
			if (door?.kind === "rect") expect(door.fill, status).toBe("#c5301c");
			expect(byId(items, "car-0-steam-0"), status).toBeDefined();
			expect(byId(items, "car-0-steam-2"), status).toBeDefined();
		}
	});

	it("marks a pending car with an ink door and a question mark, no steam", () => {
		const visual = deriveYardVisualState({
			...baseSnap,
			connections: [
				{
					id: "conn-1",
					alias: "work",
					provider: "asana",
					status: "pending",
				} as YardProjectionSnapshot["connections"][number],
			],
		});
		const { items } = presentYard(input({ visual }));
		const door = byId(items, "car-0-door");
		if (door?.kind === "rect") expect(door.fill).toBe("#101010");
		const mark = byId(items, "car-0-mark");
		expect(mark?.kind).toBe("text");
		if (mark?.kind === "text") expect(mark.text).toBe("?");
		expect(byId(items, "car-0-steam-0")).toBeUndefined();
	});

	it("guest sprite needs real connector activity, not just an authorized connection", () => {
		// An authorized connection alone is not an agent at work: with no
		// activity row there is nobody to draw, and drawing one anyway would be
		// decorative scenery masquerading as signal.
		expect(
			byId(presentYard(input()).items, "guest-swe-claude"),
		).toBeUndefined();

		const active = {
			...baseSnap,
			activity: [
				{
					connectorKind: "swe-claude",
					connectionId: "conn-1",
					status: "working",
				},
			],
		} as unknown as YardProjectionSnapshot;
		const activeVisual = deriveYardVisualState(active);
		const withGuest = presentYard(
			input({
				visual: activeVisual,
				zone: activeVisual.bo.zone,
				boAnimationId: activeVisual.bo.animationId,
			}),
		);
		const sprite = byId(withGuest.items, "guest-swe-claude");
		expect(sprite).toBeDefined();
		if (sprite?.kind === "sprite") {
			expect(sprite.animationId).toBe("guest.swe-claude.work");
		}

		const noConn = {
			...baseSnap,
			connections: [],
		};
		const visual = deriveYardVisualState(noConn);
		const { items } = presentYard(
			input({
				visual,
				zone: visual.bo.zone,
				boAnimationId: visual.bo.animationId,
			}),
		);
		expect(byId(items, "guest-swe-claude")).toBeUndefined();
	});

	it("hazard spur stays quiet when clean and smokes spark-red on real hazards", () => {
		const calm = presentYard(input()).items;
		expect(byId(calm, "spur-rail")).toBeDefined();
		// A clean board carries no red and no smoke anywhere.
		expect(byId(calm, "bunker-warning-a")).toBeUndefined();
		expect(byId(calm, "bunker-smoke-0")).toBeUndefined();
		expect(
			calm.filter(
				(i) =>
					(i.kind === "rect" && i.fill === "#c5301c") ||
					(i.kind === "line" && i.color === "#c5301c") ||
					(i.kind === "text" && i.color === "#c5301c"),
			),
		).toHaveLength(0);

		const hazardSnap = {
			...baseSnap,
			doctor: {
				hazards: ["connection-revoked:conn-1"],
				bootstrapActive: false,
			} as unknown as YardProjectionSnapshot["doctor"],
		};
		const visual = deriveYardVisualState(hazardSnap);
		const { items } = presentYard(
			input({
				visual,
				zone: visual.bo.zone,
				boAnimationId: visual.bo.animationId,
			}),
		);
		const warn = byId(items, "bunker-warning-a");
		expect(warn?.kind).toBe("line");
		if (warn?.kind === "line") expect(warn.color).toBe("#c5301c");
		expect(byId(items, "bunker-smoke-0")).toBeDefined();
		const text = byId(items, "bunker-hazard-0");
		expect(text?.kind).toBe("text");
		if (text?.kind === "text") {
			expect(text.text).toBe("connection-revoked:con".slice(0, 22));
			expect(text.color).toBe("#c5301c");
		}
	});

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

	it("freezes sprites on testFrame in test mode, plays clips live", () => {
		const { items } = presentYard(input());
		const bo = byId(items, "bo");
		if (bo?.kind === "sprite") expect(bo.testFrame).toBe(0);
		const live = byId(presentYard(input({ testMode: false })).items, "bo");
		if (live?.kind === "sprite") expect(live.testFrame).toBeNull();
	});

	it("resolveBoTransitAnim walks toward distant targets and settles on arrival", () => {
		expect(
			resolveBoTransitAnim({ x: 0, y: 0 }, { x: 100, y: 0 }, "bo.idle"),
		).toBe("bo.walk.east");
		expect(
			resolveBoTransitAnim({ x: 100, y: 0 }, { x: 0, y: 0 }, "bo.idle"),
		).toBe("bo.walk.west");
		expect(
			resolveBoTransitAnim({ x: 5, y: 5 }, { x: 5, y: 5 }, "bo.idle"),
		).toBe("bo.idle");
	});

	it("omits optional plates when images are missing", () => {
		const { items } = presentYard(input({ hasImage: () => false }));
		expect(byId(items, "poles")).toBeUndefined();
		expect(byId(items, "trail")).toBeUndefined();
		expect(byId(items, "trail-front")).toBeUndefined();
	});
});

describe("HIGHBALL presenter props (M1 phase B)", () => {
	it("renders up to 3 waybill cards with the top card frontmost", () => {
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
			expect(top.fill).toBe("#ffffff");
			expect(top.stroke).toBe("#101010");
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

	it("semaphore: arm down + no lamp/label when not highball", () => {
		const { items } = presentYard(input());
		expect(byId(items, "semaphore-post")).toBeDefined();
		const arm = byId(items, "semaphore-arm");
		expect(arm?.kind).toBe("line");
		if (arm?.kind === "line") expect(arm.y2).toBeGreaterThan(arm.y1);
		expect(byId(items, "semaphore-lamp")).toBeUndefined();
		expect(byId(items, "highball-label")).toBeUndefined();
	});

	it("semaphore: arm raised + go lamp + HIGHBALL label when highball", () => {
		const { items } = presentYard(input({ highball: true }));
		const arm = byId(items, "semaphore-arm");
		expect(arm?.kind).toBe("line");
		if (arm?.kind === "line") expect(arm.y2).toBeLessThan(arm.y1);
		const lamp = byId(items, "semaphore-lamp");
		expect(lamp?.kind).toBe("rect");
		// go green is reserved for confirmed success only
		if (lamp?.kind === "rect") expect(lamp.fill).toBe("#14672c");
		const label = byId(items, "highball-label");
		expect(label?.kind).toBe("text");
		if (label?.kind === "text") expect(label.text).toBe("HIGHBALL");
	});

	it("station bell always present; cream glow only with a station.open waybill", () => {
		const calm = presentYard(input()).items;
		expect(byId(calm, "station-bell")).toBeDefined();
		expect(byId(calm, "station-bell-glow")).toBeUndefined();
		const firstRun = presentYard(
			input({
				waybills: [
					makeWaybill({
						id: "waybill:station.open",
						kind: "station.open",
						title: "Open the Station",
						confirmOp: "init-up",
						blastRadius: "station",
					}),
				],
			}),
		).items;
		const glow = byId(firstRun, "station-bell-glow");
		expect(glow?.kind).toBe("rect");
		// static cream ring — reduced-motion-safe onboarding signal
		if (glow?.kind === "rect") expect(glow.fill).toBe("#f2f1ec");
	});

	it("HUD title carries the HIGHBALL! picture card", () => {
		const title = byId(presentYard(input()).items, "hud-title");
		expect(title?.kind).toBe("text");
		if (title?.kind === "text") {
			expect(title.text).toBe("HIGHBALL! · single Station");
		}
	});

	it("plants the semaphore in the clear mid-left band, out of the sheet gutter", () => {
		const { items } = presentYard(input({ highball: true }));
		const post = byId(items, "semaphore-post");
		expect(post?.kind).toBe("rect");
		if (post?.kind !== "rect") return;
		// The DOM sheet is right:32px / width ≤360 over a 1280 canvas — anything
		// past x≈900 renders underneath it.
		const SHEET_GUTTER_X = 900;
		const label = byId(items, "highball-label");
		const lamp = byId(items, "semaphore-lamp");
		for (const item of [post, label, lamp]) {
			if (item?.kind === "rect") {
				expect(item.x + item.w, item.id).toBeLessThan(SHEET_GUTTER_X);
			}
			if (item?.kind === "text") {
				expect(item.x, item.id).toBeLessThan(SHEET_GUTTER_X);
			}
		}
		// …and clear of the Error Bunker (ends x=240) and Policy Board (x=560).
		expect(post.x).toBeGreaterThan(YARD_LAYOUT.zones.errorBunker.x + 200);
		expect(post.x + post.w).toBeLessThan(YARD_LAYOUT.zones.policyBoard.x);
		// Base sits at the track bottom, mast rises into the open band.
		expect(post.y).toBeLessThanOrEqual(250);
		expect(post.y + post.h).toBeGreaterThanOrEqual(370);
		if (label?.kind === "text") {
			expect(label.x).toBeGreaterThan(
				YARD_LAYOUT.zones.errorBunker.x + YARD_LAYOUT.zones.errorBunker.width,
			);
		}
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
			expect(card.fill).toBe("#ffffff");
			expect(card.stroke).toBe("#101010");
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
		const cases: Record<ZoneId, RegExp[]> = {
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
		};
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
		const many = {
			...baseSnap,
			doctor: {
				hazards: Array.from({ length: 9 }, (_, i) => `hazard-number-${i}`),
				bootstrapActive: false,
				hint: "run `hobo doctor --fix` and then re-authorize the connection",
			} as unknown as YardProjectionSnapshot["doctor"],
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
	const world = toWorldView(scenarioWorld(1, 5), true) as WorldView;

	function overlaps(
		a: { x: number; y: number; w: number; h: number },
		b: { x: number; y: number; w: number; h: number },
	): boolean {
		return (
			a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
		);
	}

	/** Conservative bounding box for a render item (text estimated generously). */
	function boxOf(
		item: RenderItem,
	): { x: number; y: number; w: number; h: number } | null {
		switch (item.kind) {
			case "rect":
				return { x: item.x, y: item.y, w: item.w, h: item.h };
			case "line":
				return {
					x: Math.min(item.x1, item.x2),
					y: Math.min(item.y1, item.y2),
					w: Math.max(2, Math.abs(item.x2 - item.x1)),
					h: Math.max(2, Math.abs(item.y2 - item.y1)),
				};
			case "text":
				return { x: item.x, y: item.y, w: item.text.length * 8, h: 14 };
			default:
				return null;
		}
	}

	it("camp rooms never collide with a zone rect", () => {
		expect(world.camps.length).toBeGreaterThan(0);
		for (const camp of world.camps) {
			const room = { x: camp.x, y: camp.y, w: camp.w, h: camp.h };
			for (const z of Object.values(YARD_LAYOUT.zones)) {
				expect(
					overlaps(room, { x: z.x, y: z.y, w: z.width, h: z.height }),
					`${camp.id} vs ${z.id}`,
				).toBe(false);
			}
		}
	});

	it("camp rooms never collide with a static prop footprint", () => {
		// Render WITHOUT the world so only fixed yard property is in the model.
		const { items } = presentYard(input());
		const props = items.filter(
			(i) => i.depth < YARD_LAYOUT.depths.ui && !i.id.startsWith("ground-"),
		);
		expect(props.length).toBeGreaterThan(40);
		for (const camp of world.camps) {
			const room = { x: camp.x, y: camp.y, w: camp.w, h: camp.h };
			for (const item of props) {
				const box = boxOf(item);
				if (!box) continue;
				expect(overlaps(room, box), `${camp.id} vs ${item.id}`).toBe(false);
			}
		}
	});
});
