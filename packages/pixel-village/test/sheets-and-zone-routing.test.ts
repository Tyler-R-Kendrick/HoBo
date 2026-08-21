/**
 * OpenUI sheet construction and the zone → sheet routing above it.
 *
 * A sheet is the Yard's confirm surface: it is what a player reads before
 * approving an operation that the CLI would otherwise run with a flag. The
 * `confirmOp` on each sheet names the management operation that will actually
 * fire, so the properties worth holding are the ones that keep the *label* and
 * the *effect* in agreement.
 *
 * **A sheet must default to the snapshot's real values, not to plausible
 * ones.** The station id, the rail hash, the quota — each is prefilled from
 * the projection, and a hard-coded default would let a player confirm an
 * operation against a station or a rail they are not looking at.
 *
 * **A missing projection degrades to a usable sheet, not a broken one.** The
 * Yard renders before its first snapshot arrives, so every sheet builder takes
 * an optional snapshot and has to produce something legible without one.
 *
 * **Zone routing is stateful in one direction only.** Selecting a zone reads
 * the snapshot and produces a sheet; a zone with nothing to confirm produces
 * `null` rather than an empty sheet, because an empty confirm surface invites
 * a confirmation that does nothing.
 *
 * All of this is pure — no DOM, no Phaser, no browser. The rest of this
 * package's chrome is exercised by the Playwright suite under `test/e2e`,
 * whose coverage does not reach this gate.
 */

import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";

import {
	confirmSheet,
	sheetForConnectionAuthorize,
	sheetForConnectionCreate,
	sheetForCostBooth,
	sheetForDoctor,
	sheetForRailLifecycle,
	streamSheet,
} from "../src/openui/sheets.js";
import {
	createYardEngine,
	selectZoneWithSnapshot,
	sheetForZone,
} from "../src/yard-engine.js";

/** A projection snapshot with everything the sheets read. */
function snapshot(
	overrides: Record<string, unknown> = {},
): YardProjectionSnapshot {
	return {
		occupancy: { stationId: "station:prod" },
		connections: [],
		rails: [],
		activity: [],
		metering: {
			quotaUsed: 3,
			quotaLimit: 10,
			spendCapUsd: 25,
			budgetUsd: 5,
		},
		doctor: { hazards: [], hint: "" },
		...overrides,
		// SAFETY: the sheet builders read exactly the fields named above.
	} as never;
}

/** The value of a named field on a sheet. */
const fieldValue = (
	sheet: { fields: readonly { name: string; value?: unknown }[] },
	name: string,
) => sheet.fields.find((f) => f.name === name)?.value;

describe("streaming a sheet", () => {
	it("yields each chunk before the sheet itself", () => {
		const sheet = sheetForCostBooth();
		const kinds = [...streamSheet(sheet)].map((step) => step.type);
		// The done step carries the sheet; a consumer that rendered on the first
		// chunk would paint a form with no fields.
		expect(kinds.at(-1)).toBe("done");
		expect(kinds.slice(0, -1).every((k) => k === "chunk")).toBe(true);
	});

	it("yields one chunk per declared chunk", () => {
		const sheet = sheetForConnectionCreate();
		expect([...streamSheet(sheet)]).toHaveLength(sheet.streamChunks.length + 1);
	});

	it("carries the sheet on the done step", () => {
		const sheet = sheetForDoctor();
		expect([...streamSheet(sheet)].at(-1)?.sheet).toBe(sheet);
	});

	it("streams text on every chunk step", () => {
		const steps = [...streamSheet(sheetForConnectionCreate())];
		expect(
			steps.filter((s) => s.type === "chunk").every((s) => Boolean(s.text)),
		).toBe(true);
	});
});

describe("the connection-create sheet", () => {
	it("names the operation the CLI would run", () => {
		// Every sheet teaches its one-shot equivalent; a description that named
		// the wrong verb would send a player to a command that does something
		// else.
		expect(sheetForConnectionCreate().description).toContain(
			"hobo connection create",
		);
	});

	it("confirms through connectionCreate", () => {
		expect(sheetForConnectionCreate().confirmOp).toBe("connectionCreate");
	});

	it("prefills the station from the projection", () => {
		// A hard-coded station would let a player confirm against a station they
		// are not looking at.
		expect(fieldValue(sheetForConnectionCreate(snapshot()), "stationId")).toBe(
			"station:prod",
		);
	});

	it("falls back to the local station with no projection", () => {
		// The Yard renders before its first snapshot arrives.
		expect(fieldValue(sheetForConnectionCreate(), "stationId")).toBe(
			"station:local",
		);
	});

	it("marks the station read-only", () => {
		// The station is context, not a choice — an editable one would let a
		// player retarget the operation from inside the confirm surface.
		expect(
			sheetForConnectionCreate().fields.find((f) => f.name === "stationId")
				?.type,
		).toBe("readonly");
	});

	it("requires a provider", () => {
		expect(
			sheetForConnectionCreate().fields.find((f) => f.name === "provider")
				?.required,
		).toBe(true);
	});

	it("is frozen", () => {
		// A sheet is handed to the renderer and to the confirm path; a mutation
		// between the two would confirm something other than what was read.
		expect(Object.isFrozen(sheetForConnectionCreate())).toBe(true);
	});
});

describe("the connection-authorize sheet", () => {
	it("names the connection it will authorize", () => {
		expect(sheetForConnectionAuthorize("work").description).toContain("work");
	});

	it("echoes the connection as a read-only field", () => {
		expect(fieldValue(sheetForConnectionAuthorize("work"), "idOrAlias")).toBe(
			"work",
		);
	});

	it("reports the current status from the projection", () => {
		const snap = snapshot({
			connections: [{ id: "c1", alias: "work", status: "pending" }],
		});
		expect(
			fieldValue(sheetForConnectionAuthorize("work", snap), "status"),
		).toBe("pending");
	});

	it("matches a connection by id as well as alias", () => {
		const snap = snapshot({
			connections: [{ id: "c1", alias: "work", status: "pending" }],
		});
		// A player may have either handle in front of them; resolving only one
		// would show "unknown" for a connection that is right there.
		expect(fieldValue(sheetForConnectionAuthorize("c1", snap), "status")).toBe(
			"pending",
		);
	});

	it("reports unknown for a connection not in the projection", () => {
		// Better an honest "unknown" than a confident wrong status on the
		// surface a player is about to approve.
		expect(
			fieldValue(sheetForConnectionAuthorize("ghost", snapshot()), "status"),
		).toBe("unknown");
	});

	it("reports unknown with no projection at all", () => {
		expect(fieldValue(sheetForConnectionAuthorize("work"), "status")).toBe(
			"unknown",
		);
	});
});

describe("the rail lifecycle sheet", () => {
	it("offers each rail in the projection", () => {
		const snap = snapshot({
			rails: [{ contentHash: "sha256:aaa" }, { contentHash: "sha256:bbb" }],
		});
		expect(
			sheetForRailLifecycle(snap).fields.find((f) => f.name === "hashOrId")
				?.options,
		).toEqual(["sha256:aaa", "sha256:bbb"]);
	});

	it("preselects the first rail", () => {
		const snap = snapshot({ rails: [{ contentHash: "sha256:aaa" }] });
		expect(fieldValue(sheetForRailLifecycle(snap), "hashOrId")).toBe(
			"sha256:aaa",
		);
	});

	it("offers no rail when the projection has none", () => {
		// An empty select with a blank value is honest; inventing a hash would
		// let a confirm fire against a rail that does not exist.
		expect(fieldValue(sheetForRailLifecycle(snapshot()), "hashOrId")).toBe("");
	});

	it("offers approve and activate as the actions", () => {
		expect(
			sheetForRailLifecycle(snapshot()).fields.find((f) => f.name === "action")
				?.options,
		).toEqual(["approve", "activate"]);
	});

	it("survives a projection with no rails key at all", () => {
		expect(() => sheetForRailLifecycle()).not.toThrow();
	});
});

describe("the cost booth sheet", () => {
	it("reads metering from the projection", () => {
		const sheet = sheetForCostBooth(snapshot());
		expect(fieldValue(sheet, "quotaUsed")).toBe(3);
		expect(fieldValue(sheet, "quotaLimit")).toBe(10);
		expect(fieldValue(sheet, "spendCapUsd")).toBe(25);
	});

	it("shows zeros rather than blanks with no projection", () => {
		// A blank spend cap reads as "no cap"; zero reads as "not yet known".
		// Neither is ideal, but only one of them looks like permission to spend.
		expect(fieldValue(sheetForCostBooth(), "spendCapUsd")).toBe(0);
	});

	it("is projection-only — it confirms a doctor snapshot, not a payment", () => {
		// The Cost Booth reads a meter. If its confirmOp were a billing
		// operation, looking at your costs could change them.
		expect(sheetForCostBooth().confirmOp).toBe("doctorSnapshot");
	});

	it("keeps every metering field read-only", () => {
		expect(
			sheetForCostBooth(snapshot()).fields.every((f) => f.type === "readonly"),
		).toBe(true);
	});
});

describe("the doctor sheet", () => {
	it("lists the hazards from the projection", () => {
		const snap = snapshot({
			doctor: { hazards: ["drift", "clock-skew"], hint: "run hobo doctor" },
		});
		expect(fieldValue(sheetForDoctor(snap), "hazards")).toBe(
			"drift, clock-skew",
		);
	});

	it("says `(none)` rather than nothing when there are no hazards", () => {
		// An empty field reads as "not checked"; `(none)` reads as "checked, and
		// clear" — which is the whole point of opening the Error Bunker.
		expect(fieldValue(sheetForDoctor(snapshot()), "hazards")).toBe("(none)");
	});

	it("carries the doctor's hint", () => {
		const snap = snapshot({ doctor: { hazards: [], hint: "run hobo doctor" } });
		expect(fieldValue(sheetForDoctor(snap), "hint")).toBe("run hobo doctor");
	});

	it("survives no projection", () => {
		expect(fieldValue(sheetForDoctor(), "hazards")).toBe("(none)");
	});
});

describe("routing a zone to a sheet", () => {
	it("opens connection-create when nothing is pending", () => {
		expect(sheetForZone("connectionBay", snapshot())?.kind).toBe(
			"connection.create",
		);
	});

	it("opens connection-authorize when something is pending", () => {
		const snap = snapshot({
			connections: [{ id: "c1", alias: "work", status: "pending" }],
		});
		// A pending connection is the thing the player came to the bay for;
		// showing the create form instead would bury it.
		expect(sheetForZone("connectionBay", snap)?.kind).toBe(
			"connection.authorize",
		);
	});

	it("prefers the alias over the id when authorizing", () => {
		const snap = snapshot({
			connections: [{ id: "c1", alias: "work", status: "pending" }],
		});
		// The alias is what the player named it; the id is machine detail.
		expect(sheetForZone("connectionBay", snap)?.description).toContain("work");
	});

	it("falls back to the id when a pending connection has no alias", () => {
		const snap = snapshot({
			connections: [{ id: "c1", status: "pending" }],
		});
		expect(sheetForZone("connectionBay", snap)?.description).toContain("c1");
	});

	it("ignores a connection that is not pending", () => {
		const snap = snapshot({
			connections: [{ id: "c1", alias: "work", status: "authorized" }],
		});
		expect(sheetForZone("connectionBay", snap)?.kind).toBe("connection.create");
	});

	it("routes the policy board to rail lifecycle", () => {
		expect(sheetForZone("policyBoard", snapshot())?.kind).toBe(
			"rail.lifecycle",
		);
	});

	it("routes the cost booth to the cost sheet", () => {
		expect(sheetForZone("costBooth", snapshot())?.kind).toBe("cost.plan");
	});

	it("routes the error bunker to the doctor sheet", () => {
		expect(sheetForZone("errorBunker", snapshot())?.kind).toBe(
			"doctor.hazards",
		);
	});

	it("routes a zone with nothing to confirm to null", () => {
		// An empty confirm surface invites a confirmation that does nothing,
		// which teaches a player that confirming is meaningless.
		expect(sheetForZone("yardGate" as never, snapshot())).toBeNull();
	});

	it("routes with a null snapshot", () => {
		// The Yard is interactive before its first projection arrives.
		expect(sheetForZone("costBooth", null)?.kind).toBe("cost.plan");
	});
});

describe("selecting a zone on the engine", () => {
	it("records the selected zone", () => {
		const engine = createYardEngine();
		selectZoneWithSnapshot(engine, "costBooth", snapshot());
		expect(engine.selectedZone).toBe("costBooth");
	});

	it("opens the zone's sheet on the engine", () => {
		const engine = createYardEngine();
		selectZoneWithSnapshot(engine, "costBooth", snapshot());
		expect(engine.openSheet?.kind).toBe("cost.plan");
	});

	it("returns the same sheet it opened", () => {
		const engine = createYardEngine();
		const sheet = selectZoneWithSnapshot(engine, "costBooth", snapshot());
		// The caller renders the returned sheet while the engine holds the same
		// one; two different objects would drift the moment either changed.
		expect(sheet).toBe(engine.openSheet);
	});

	it("builds the sheet from the snapshot it was given", () => {
		const engine = createYardEngine();
		const sheet = selectZoneWithSnapshot(
			engine,
			"costBooth",
			snapshot({
				metering: {
					quotaUsed: 9,
					quotaLimit: 10,
					spendCapUsd: 1,
					budgetUsd: 0,
				},
			}),
		);
		// Applying the snapshot *after* building the sheet would render the
		// previous projection's numbers on the surface being confirmed.
		expect(fieldValue(sheet as never, "quotaUsed")).toBe(9);
	});

	it("clears the sheet for a zone that has none", () => {
		const engine = createYardEngine();
		selectZoneWithSnapshot(engine, "costBooth", snapshot());
		selectZoneWithSnapshot(engine, "yardGate" as never, snapshot());
		// A stale sheet left open over a zone that has none would confirm the
		// previous zone's operation.
		expect(engine.openSheet).toBeNull();
	});
});

describe("confirming a sheet", () => {
	/** Handlers that record which op fired with what. */
	function handlers() {
		const calls: [string, unknown][] = [];
		const ok = (name: string) => (input: unknown) => {
			calls.push([name, input]);
			// SAFETY: the confirm path only passes the result through.
			return { ok: true } as never;
		};
		return {
			calls,
			handlers: {
				connectionCreate: ok("connectionCreate"),
				connectionAuthorize: ok("connectionAuthorize"),
				stationRailsActivate: ok("stationRailsActivate"),
				stationRailsApprove: ok("stationRailsApprove"),
				stationRailsPublish: ok("stationRailsPublish"),
				doctorSnapshot: ok("doctorSnapshot"),
				// SAFETY: this is exactly the handler set the confirm path names.
			} as never,
		};
	}

	it("fires the operation the sheet declared", () => {
		const h = handlers();
		confirmSheet(sheetForConnectionCreate(), { provider: "asana" }, h.handlers);
		// The declared `confirmOp` is the contract between what a player reads
		// and what runs. Any drift here is the worst bug this surface can have.
		expect(h.calls[0]?.[0]).toBe("connectionCreate");
	});

	it("passes the provider through", () => {
		const h = handlers();
		confirmSheet(sheetForConnectionCreate(), { provider: "asana" }, h.handlers);
		expect(h.calls[0]?.[1]).toMatchObject({ provider: "asana" });
	});

	it("omits an alias the player left blank", () => {
		const h = handlers();
		confirmSheet(
			sheetForConnectionCreate(),
			{ provider: "asana", alias: "" },
			h.handlers,
		);
		// An empty alias is not an alias. Sending `""` would name the connection
		// the empty string rather than leaving it unnamed.
		expect(Object.hasOwn(h.calls[0]?.[1] as object, "alias")).toBe(false);
	});

	it("passes a non-empty alias through", () => {
		const h = handlers();
		confirmSheet(
			sheetForConnectionCreate(),
			{ provider: "asana", alias: "work" },
			h.handlers,
		);
		expect(h.calls[0]?.[1]).toMatchObject({ alias: "work" });
	});

	it("fires doctorSnapshot from the cost booth", () => {
		const h = handlers();
		confirmSheet(sheetForCostBooth(), {}, h.handlers);
		expect(h.calls[0]?.[0]).toBe("doctorSnapshot");
	});

	it("fires doctorSnapshot from the error bunker", () => {
		const h = handlers();
		confirmSheet(sheetForDoctor(), {}, h.handlers);
		expect(h.calls[0]?.[0]).toBe("doctorSnapshot");
	});

	it("fires connectionAuthorize from the authorize sheet", () => {
		const h = handlers();
		confirmSheet(
			sheetForConnectionAuthorize("work"),
			{ idOrAlias: "work" },
			h.handlers,
		);
		expect(h.calls[0]?.[0]).toBe("connectionAuthorize");
	});
});
