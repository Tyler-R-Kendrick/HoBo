import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";
import {
	deriveYardVisualState,
	type PresenterInput,
	presentYard,
	type RenderItem,
	resolveBoTransitAnim,
	type Waybill,
	YARD_LAYOUT,
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
	it("renders all seven zone sticker cards with labels", () => {
		const { items } = presentYard(input());
		for (const z of Object.values(YARD_LAYOUT.zones)) {
			expect(byId(items, `zone-${z.id}`), z.id).toBeDefined();
			const label = byId(items, `zone-${z.id}-label`);
			expect(label?.kind).toBe("text");
			if (label?.kind === "text") expect(label.text).toBe(z.label);
		}
	});

	it("binds cost meter fill and heat to metering projection", () => {
		const { items } = presentYard(input());
		const fill = byId(items, "cost-fill");
		expect(fill?.kind).toBe("rect");
		if (fill?.kind === "rect") {
			// quotaUsed/quotaLimit = 0.5 → half of (width - 4)
			const m = YARD_LAYOUT.costMeter;
			expect(fill.w).toBeCloseTo((m.width - 4) * 0.5, 5);
			// heat 0.1 → go green, not spark
			expect(fill.fill).toBe("#14672c");
		}
	});

	it("shows one bay per connection with authorized styling and no decorative cars", () => {
		const { items } = presentYard(input());
		const bay0 = byId(items, "bay-0");
		expect(bay0?.kind).toBe("rect");
		if (bay0?.kind === "rect") expect(bay0.fill).toBe("#14672c");
		// empty slots render closed (dark) but carry no label
		expect(byId(items, "bay-1-label")).toBeUndefined();
	});

	it("guest sprite appears only with an authorized connection", () => {
		expect(byId(presentYard(input()).items, "guest-swe-claude")).toBeDefined();
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

	it("hazards activate the error bunker heat + hazard text", () => {
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
		expect(byId(items, "bunker-heat")).toBeDefined();
		const text = byId(items, "bunker-hazard-0");
		expect(text?.kind).toBe("text");
		if (text?.kind === "text") {
			expect(text.text).toBe("connection-revoked:con".slice(0, 22));
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
});
