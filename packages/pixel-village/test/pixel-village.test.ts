import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	connectionAuthorize,
	connectionCreate,
	createManagementContext,
	projectYardSnapshot,
	stationInit,
	stationUp,
} from "@hobo/management";
import { afterEach, describe, expect, it } from "vitest";

import {
	assertSheetFitsFrames,
	buildBootLoadPlan,
	confirmSheet,
	createYardEngine,
	describeYardSceneLoad,
	expectedSheetPixelSize,
	HOBO_PIXEL_VILLAGE_PACKAGE,
	isTestMode,
	loadAssetIndex,
	OPERATOR_SPRITE,
	operatorStateForVisual,
	seededRandom,
	selectZoneWithSnapshot,
	sheetForConnectionCreate,
	stepToward,
	streamSheet,
	TILE,
	VILLAGERS,
	YARD_LAYOUT,
	ZONE_TILE_RECT,
	zoneAt,
} from "../src/index.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function tempHome(): string {
	const d = mkdtempSync(join(tmpdir(), "hobo-yard-"));
	temps.push(d);
	return d;
}

describe("@hobo/pixel-village", () => {
	it("exports package id", () => {
		expect(HOBO_PIXEL_VILLAGE_PACKAGE).toBe("@hobo/pixel-village");
	});

	it("derives every zone rect from the village tile grid", () => {
		expect(YARD_LAYOUT.width).toBe(1280);
		expect(YARD_LAYOUT.height).toBe(720);
		const ids = Object.keys(YARD_LAYOUT.zones);
		expect(ids).toEqual(
			expect.arrayContaining([
				"platformRest",
				"bootstrapDesk",
				"activeRailTrack",
				"connectionBay",
				"policyBoard",
				"costBooth",
				"errorBunker",
			]),
		);
		for (const zone of Object.values(YARD_LAYOUT.zones)) {
			const r = ZONE_TILE_RECT[zone.id];
			expect(zone.x, zone.id).toBe(r.tx * TILE);
			expect(zone.y, zone.id).toBe(r.ty * TILE);
			// The 27th column overhangs the canvas, so rects clamp to it.
			expect(zone.width, zone.id).toBe(
				Math.min(r.w * TILE, YARD_LAYOUT.width - zone.x),
			);
			expect(zone.x + zone.width, zone.id).toBeLessThanOrEqual(
				YARD_LAYOUT.width,
			);
			expect(zone.y + zone.height, zone.id).toBeLessThanOrEqual(
				YARD_LAYOUT.height,
			);
			// The anchor is the bottom centre of the thing, still on the grid.
			expect(zone.anchorY, zone.id).toBe(zone.y + zone.height);
		}
	});

	it("hit-tests the village: the smallest thing under the pixel wins", () => {
		// The town green holds the notice board, so a click on the board must
		// open the board and not the green underneath it.
		const board = YARD_LAYOUT.zones.bootstrapDesk;
		expect(zoneAt(board.x + 4, board.y + 4)).toBe("bootstrapDesk");
		const green = YARD_LAYOUT.zones.platformRest;
		expect(zoneAt(green.x + 4, green.y + green.height - 4)).toBe(
			"platformRest",
		);
		// The road spans the whole stage but never swallows a landmark click.
		expect(zoneAt(20, YARD_LAYOUT.zones.activeRailTrack.y + 20)).toBe(
			"activeRailTrack",
		);
		expect(zoneAt(-10, -10)).toBeNull();
	});

	it("asset index carries the vendored Kenney tilesheets on measured grids", () => {
		const index = loadAssetIndex();
		// The village is built from these six sheets and nothing else.
		for (const id of ["town", "dungeon", "urban", "rogue", "chars", "ui"]) {
			expect(index.spritesheets[id], id).toBeDefined();
		}
		const town = index.spritesheets.town;
		expect(town?.frameWidth).toBe(16);
		expect(town?.frameHeight).toBe(16);
		expect(town?.columns).toBe(12);
		expect(town?.rows).toBe(11);
		expect(town?.spacing).toBe(0);
		// Kenney roguelike sheets are 1px-spaced; the grid must say so or every
		// frame index after the first column is silently off by a pixel.
		expect(index.spritesheets.chars?.spacing).toBe(1);
		expect(index.spritesheets.rogue?.spacing).toBe(1);

		for (const sheet of Object.values(index.spritesheets)) {
			assertSheetFitsFrames(sheet);
			const size = expectedSheetPixelSize(sheet);
			expect(size.width, sheet.id).toBe(sheet.width);
			expect(size.height, sheet.id).toBe(sheet.height);
		}

		// Every sprite the village names must exist inside its sheet.
		const chars = index.spritesheets.chars;
		const charFrames = (chars?.columns ?? 0) * (chars?.rows ?? 0);
		for (const frame of [...VILLAGERS, OPERATOR_SPRITE]) {
			expect(frame).toBeGreaterThanOrEqual(0);
			expect(frame).toBeLessThan(charFrames);
		}

		const manifest = describeYardSceneLoad(index);
		expect(manifest.sheets.some((s) => s.key === "town")).toBe(true);
		expect(manifest.sheets.some((s) => s.key === "chars")).toBe(true);
		// The rubberhose Bo/bindlebug/guest art was deleted with ADR-0148.
		expect(manifest.sheets.some((s) => s.key.startsWith("bo-"))).toBe(false);
		expect(manifest.animations).toHaveLength(0);
	});

	it("yard engine reacts to mocked projections and opens connection sheet", () => {
		const home = tempHome();
		const ctx = createManagementContext({ hoboHome: home });
		stationInit(ctx, { name: "local", tenant: "local" });
		stationUp(ctx, "station:local");
		connectionCreate(ctx, {
			provider: "asana",
			alias: "work",
			stationId: "station:local",
		});
		connectionAuthorize(ctx, { idOrAlias: "work" });

		const snap = projectYardSnapshot(ctx, { stationId: "station:local" });
		expect(snap.ok).toBe(true);
		const engine = createYardEngine();
		assert(snap.data);
		const visual = engine.applySnapshot(snap.data);
		expect(visual.connections[0]?.visual).toBe("authorized");
		expect(visual.traffic.rate).toBeGreaterThan(0);
		// A fresh station still reports the bootstrap hazard, which outranks
		// every steady state in the priority ladder.
		expect(visual.bo.state).toBe("error");
		expect(operatorStateForVisual(visual)).toBe(visual.bo.state);

		engine.tick(0.1);
		// particles may emit
		assert(snap.data);
		const sheet = selectZoneWithSnapshot(engine, "connectionBay", snap.data);
		expect(sheet?.kind).toMatch(/connection\./);

		const createSheet = sheetForConnectionCreate(snap.data);
		const chunks = [...streamSheet(createSheet)];
		expect(chunks.some((c) => c.type === "chunk")).toBe(true);
		expect(chunks.at(-1)?.type).toBe("done");

		const result = confirmSheet(
			createSheet,
			{
				provider: "github",
				alias: "gh",
				stationId: "station:local",
			},
			{
				connectionCreate: (input) => connectionCreate(ctx, input),
				connectionAuthorize: (input) => connectionAuthorize(ctx, input),
				stationRailsActivate: () => ({
					ok: false,
					code: "n/a",
					message: "n/a",
				}),
				stationRailsApprove: () => ({
					ok: false,
					code: "n/a",
					message: "n/a",
				}),
				stationRailsPublish: () => ({
					ok: false,
					code: "n/a",
					message: "n/a",
				}),
				doctorSnapshot: () => ({ ok: true, code: "HOBO_OK", message: "ok" }),
			},
		);
		expect(result.ok).toBe(true);
	});

	it("stepToward is frame-rate independent", () => {
		const a = stepToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 1);
		expect(a.x).toBe(50);
		expect(a.arrived).toBe(false);
		const b = stepToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 3);
		expect(b.arrived).toBe(true);
		expect(b.x).toBe(100);
	});

	it("gamedev-assets v2 index boots the tilesheets with measured configs", () => {
		const index = loadAssetIndex();
		expect(index.meta?.version).toBe(2);
		// No parallax plates survive: the village IS the background.
		expect(index.backgrounds ?? {}).toEqual({});
		const plan = buildBootLoadPlan(index, "/assets");
		expect(plan.spritesheets.length).toBeGreaterThanOrEqual(6);
		// measured load config — STOP rule
		const chars = plan.spritesheets.find((s) => s.key === "chars");
		expect(chars?.frameWidth).toBe(16);
		expect(chars?.frameHeight).toBe(16);
		expect(chars?.spacing).toBe(1);
		expect(chars?.url).toContain("/assets/kenney/roguelike-characters/");
	});

	it("playwright-testing seam helpers: seed + test mode", () => {
		const { testMode, seed } = isTestMode("?test=1&seed=7");
		expect(testMode).toBe(true);
		expect(seed).toBe(7);
		const r = seededRandom(42);
		const a = r();
		const r2 = seededRandom(42);
		expect(r2()).toBe(a);
	});
});
