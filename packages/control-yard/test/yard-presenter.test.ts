import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";
import {
	deriveYardVisualState,
	type PresenterInput,
	presentYard,
	type RenderItem,
	resolveBoTransitAnim,
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
		...overrides,
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
