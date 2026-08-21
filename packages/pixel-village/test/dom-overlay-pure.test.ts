/**
 * The pure half of the DOM overlay: dock placement and display-sheet
 * construction.
 *
 * `createDomOverlay` needs a live `Document` and is exercised by the Playwright
 * suite under `test/e2e`. These three functions are not — they are ordinary
 * data transforms that decide *what* the overlay shows and *where*, and they
 * carry the properties an operator's safety depends on.
 *
 * **A sheet never docks over the zone it describes.** The panel is ~360px of a
 * 1280px stage, so a right-docked sheet blankets everything past x≈900 — which
 * is exactly where Connection Bay and Cost Booth live. Covering the prop you
 * are acting on hides the state you are acting on.
 *
 * **A waybill's blast radius travels with it.** The waybill grammar is STAMP
 * (approve) / SPIKE (deny), and the placard saying what a stamp can touch has
 * to reach the surface where the stamping happens.
 *
 * **A waybill's fields are read-only, all of them.** You read a waybill, then
 * stamp it. An editable field would let the values change between what was
 * read and what is confirmed.
 *
 * **Every zone yields a sheet, even one with nothing to confirm.** A zone with
 * no operation still gets an inspect card whose `confirmOp` is `noop` — the
 * player learns the zone rather than clicking into nothing.
 */

import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";

import {
	displaySheetForWaybill,
	displaySheetForZone,
	dockForZone,
} from "../src/dom-overlay.js";
import { YARD_LAYOUT, type ZoneId } from "../src/layout.js";
import type { Waybill } from "../src/waybills.js";

function snapshot(
	overrides: Record<string, unknown> = {},
): YardProjectionSnapshot {
	return {
		occupancy: { stationId: "station:prod" },
		connections: [],
		rails: [],
		activity: [],
		metering: { quotaUsed: 0, quotaLimit: 10, spendCapUsd: 25, budgetUsd: 0 },
		doctor: { hazards: [], hint: "" },
		...overrides,
		// SAFETY: these builders read exactly the fields named above.
	} as never;
}

/** A waybill with one declared field and one extra value. */
const waybill = (overrides: Partial<Waybill> = {}): Waybill =>
	({
		id: "wb-1",
		kind: "rail.activate",
		title: "Activate rail",
		summary: "Make sha256:aaa the active rail.",
		fields: [{ name: "hashOrId", label: "Rail", value: "sha256:aaa" }],
		confirmOp: "stationRailsActivate",
		values: { hashOrId: "sha256:aaa", extra: "carried" },
		blastRadius: "rail",
		...overrides,
		// SAFETY: the display builder reads exactly the fields Waybill names.
	}) as never;

describe("docking a sheet away from its zone", () => {
	it("docks left for a zone on the right half", () => {
		// The panel blankets everything past x≈900. Docking right over Connection
		// Bay would hide the connection the operator is authorizing.
		expect(dockForZone("connectionBay")).toBe("left");
	});

	it("docks right for a zone on the left half", () => {
		expect(dockForZone("bootstrapDesk")).toBe("right");
	});

	it("decides by the zone's centre, not its left edge", () => {
		// A wide zone straddling the midpoint docks by where its mass is; using
		// the left edge alone would dock a mostly-right zone to the right.
		for (const zone of Object.keys(YARD_LAYOUT.zones) as ZoneId[]) {
			const z = YARD_LAYOUT.zones[zone];
			const centre = z.x + z.width / 2;
			expect(dockForZone(zone)).toBe(
				centre > YARD_LAYOUT.width / 2 ? "left" : "right",
			);
		}
	});

	it("gives every zone in the layout a dock", () => {
		// A zone with no dock would render the panel at a default position that
		// may be exactly over the thing it describes.
		for (const zone of Object.keys(YARD_LAYOUT.zones) as ZoneId[]) {
			expect(["left", "right"]).toContain(dockForZone(zone));
		}
	});
});

describe("a waybill as a display sheet", () => {
	it("prefixes the title so the grammar is visible", () => {
		// WAYBILL is the cue that this is a STAMP/SPIKE surface rather than an
		// ordinary form — the two confirm differently.
		expect(displaySheetForWaybill(waybill()).title).toBe(
			"WAYBILL — Activate rail",
		);
	});

	it("carries the blast radius into the description", () => {
		// The placard saying what a stamp can touch has to reach the surface
		// where the stamping happens.
		expect(displaySheetForWaybill(waybill()).description).toContain(
			"Blast radius: rail.",
		);
	});

	it("carries the summary above the blast radius", () => {
		const description = displaySheetForWaybill(waybill()).description;
		expect(description.indexOf("Make sha256:aaa")).toBeLessThan(
			description.indexOf("Blast radius"),
		);
	});

	it("identifies the waybill it renders", () => {
		// The id is what a STAMP or SPIKE is recorded against; losing it would
		// approve an unattributable decision.
		expect(displaySheetForWaybill(waybill()).waybill).toEqual({
			id: "wb-1",
			kind: "rail.activate",
		});
	});

	it("renders every declared field read-only", () => {
		// You read a waybill, then stamp it. An editable field would let the
		// values change between what was read and what is confirmed.
		expect(
			displaySheetForWaybill(waybill()).fields.every(
				(f) => f.type === "readonly",
			),
		).toBe(true);
	});

	it("carries confirm values that had no declared field", () => {
		// A value that rides along invisibly is a value the operator stamps
		// without seeing.
		expect(
			displaySheetForWaybill(waybill()).fields.map((f) => f.name),
		).toContain("extra");
	});

	it("does not render a value twice when it has a declared field", () => {
		const names = displaySheetForWaybill(waybill()).fields.map((f) => f.name);
		expect(names.filter((n) => n === "hashOrId")).toHaveLength(1);
	});

	it("labels an undeclared value by its own name", () => {
		const extra = displaySheetForWaybill(waybill()).fields.find(
			(f) => f.name === "extra",
		);
		expect(extra?.label).toBe("extra");
	});

	it("passes an ordinary confirm op straight through", () => {
		expect(displaySheetForWaybill(waybill()).confirmOp).toBe(
			"stationRailsActivate",
		);
	});

	it("turns the init-up special into a noop plus two actions", () => {
		// `init-up` is not a management op — it is two client actions in order.
		// Sending it as a confirmOp would call an operation that does not exist.
		const sheet = displaySheetForWaybill(
			waybill({ confirmOp: "init-up" as never }),
		);
		expect(sheet.confirmOp).toBe("noop");
		expect(sheet.runActions).toEqual(["init", "up"]);
	});

	it("attaches no run-actions to an ordinary waybill", () => {
		// A stray `runActions` would run init/up alongside the real operation.
		expect(displaySheetForWaybill(waybill()).runActions).toBeUndefined();
	});

	it("keeps the waybill's own kind as the sheet kind", () => {
		expect(displaySheetForWaybill(waybill()).kind).toBe("rail.activate");
	});

	it("renders a waybill with no fields at all", () => {
		const sheet = displaySheetForWaybill(
			waybill({ fields: [], values: { only: "value" } }),
		);
		// A waybill whose values are all undeclared still has to show them.
		expect(sheet.fields.map((f) => f.name)).toEqual(["only"]);
	});
});

describe("a zone as a display sheet", () => {
	it("passes a generative sheet through with its fields", () => {
		const sheet = displaySheetForZone("costBooth", snapshot());
		expect(sheet.kind).toBe("cost.plan");
		expect(sheet.fields.length).toBeGreaterThan(0);
	});

	it("keeps the generative sheet's confirm op", () => {
		expect(displaySheetForZone("costBooth", snapshot()).confirmOp).toBe(
			"doctorSnapshot",
		);
	});

	it("renders the bootstrap desk as its own card", () => {
		expect(displaySheetForZone("bootstrapDesk", snapshot()).kind).toBe(
			"bootstrap",
		);
	});

	it("reports an active bootstrap rail", () => {
		const snap = snapshot({
			occupancy: { stationId: "s", bootstrapActive: true },
		});
		// Bootstrap active means the station is running on the rail that got it
		// started, not a production one — the operator needs to know to move off.
		expect(displaySheetForZone("bootstrapDesk", snap).description).toContain(
			"activate a production rail",
		);
	});

	it("reports an inactive bootstrap rail", () => {
		expect(
			displaySheetForZone("bootstrapDesk", snapshot()).description,
		).toContain("inactive");
	});

	it("names the active rail hash when there is one", () => {
		const snap = snapshot({
			occupancy: { stationId: "s", activeRailHash: "sha256:aaa" },
		});
		const sheet = displaySheetForZone("bootstrapDesk", snap);
		expect(sheet.fields.find((f) => f.name === "active")?.value).toBe(
			"sha256:aaa",
		);
	});

	it("says `(none)` when no rail is active", () => {
		// A blank reads as "not loaded"; `(none)` reads as "checked, and there
		// is none" — which is the state the desk exists to surface.
		const sheet = displaySheetForZone("bootstrapDesk", snapshot());
		expect(sheet.fields.find((f) => f.name === "active")?.value).toBe("(none)");
	});

	it("renders the bootstrap desk with no snapshot at all", () => {
		const sheet = displaySheetForZone("bootstrapDesk", null);
		expect(sheet.fields.find((f) => f.name === "bootstrap")?.value).toBe(
			"false",
		);
	});

	it("falls back to an inspect card for a zone with no operation", () => {
		// A zone that produced nothing would be a click into nothing; the
		// inspect card at least teaches the zone.
		expect(displaySheetForZone("platformRest", snapshot()).kind).toBe(
			"inspect",
		);
	});

	it("makes the inspect card a noop", () => {
		// There is nothing to confirm, so confirming must do nothing rather than
		// firing whatever the previous sheet's op was.
		expect(displaySheetForZone("platformRest", snapshot()).confirmOp).toBe(
			"noop",
		);
	});

	it("titles the inspect card with the zone's own label", () => {
		expect(displaySheetForZone("platformRest", snapshot()).title).toBe(
			YARD_LAYOUT.zones.platformRest.label,
		);
	});

	it("falls back to the zone id when the layout has no label", () => {
		expect(displaySheetForZone("nowhere" as ZoneId, snapshot()).title).toBe(
			"nowhere",
		);
	});

	it("always returns a sheet, never null", () => {
		// Unlike `sheetForZone`, this layer is what the overlay renders — it has
		// to have something to open for every zone a player can click.
		for (const zone of Object.keys(YARD_LAYOUT.zones) as ZoneId[]) {
			expect(displaySheetForZone(zone, snapshot())).toBeDefined();
		}
	});
});
