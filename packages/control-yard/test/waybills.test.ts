import { describe, expect, it } from "vitest";
import {
	baseSnapshot,
	createSpikeLedger,
	deriveWaybills,
	deriveYardVisualState,
	displaySheetForWaybill,
	isHighball,
	makeConnection,
	makeRail,
	waybillForZone,
} from "../src/index.js";

const closedStation = { occupancy: { status: "closed" as const } };

describe("deriveWaybills (reality is the level designer)", () => {
	it("closed station → single station.open waybill with the init-up special", () => {
		const waybills = deriveWaybills(baseSnapshot(closedStation));
		expect(waybills).toHaveLength(1);
		const w = waybills[0]!;
		expect(w.kind).toBe("station.open");
		expect(w.title).toBe("Open the Station");
		expect(w.confirmOp).toBe("init-up");
		expect(w.blastRadius).toBe("station");
	});

	it("pending connection → connection.authorize with blast-radius placard fields", () => {
		const snap = baseSnapshot({
			connections: [
				makeConnection({
					id: "conn-9",
					alias: "work",
					provider: "asana",
					status: "pending",
					requestedScopes: ["tasks:read", "tasks:write"],
				}),
			],
		});
		const [w] = deriveWaybills(snap);
		expect(w?.kind).toBe("connection.authorize");
		expect(w?.confirmOp).toBe("connectionAuthorize");
		expect(w?.blastRadius).toBe("connection");
		expect(w?.values).toEqual({ idOrAlias: "work" });
		const byName = Object.fromEntries(w!.fields.map((f) => [f.name, f.value]));
		expect(byName.idOrAlias).toBe("work");
		expect(byName.provider).toBe("asana");
		expect(byName.scopes).toBe("tasks:read, tasks:write");
	});

	it("active/authorized connections produce no waybill", () => {
		const snap = baseSnapshot({
			connections: [makeConnection({ status: "active" })],
		});
		expect(deriveWaybills(snap)).toHaveLength(0);
	});

	it("draft rail → rail.approve; approved rail → rail.activate (hashOrId carried)", () => {
		const snap = baseSnapshot({
			rails: [
				makeRail({ id: "r-draft", activationStatus: "draft" }),
				makeRail({
					id: "r-approved",
					activationStatus: "approved",
					contentHash: "sha256:bbb",
				}),
				makeRail({ id: "r-active", activationStatus: "active" }),
			],
		});
		const waybills = deriveWaybills(snap);
		expect(waybills.map((w) => w.kind)).toEqual([
			"rail.approve",
			"rail.activate",
		]);
		expect(waybills[0]?.confirmOp).toBe("stationRailsApprove");
		expect(waybills[1]?.confirmOp).toBe("stationRailsActivate");
		expect(waybills[1]?.values).toEqual({ hashOrId: "sha256:bbb" });
		expect(waybills.every((w) => w.blastRadius === "rail")).toBe(true);
	});

	it("bootstrap rails are excluded, matching entity-state's wave rule", () => {
		const snap = baseSnapshot({
			rails: [
				makeRail({ id: "boot", isBootstrap: true, activationStatus: "draft" }),
				makeRail({
					id: "boot2",
					isBootstrap: true,
					activationStatus: "approved",
				}),
			],
		});
		expect(deriveWaybills(snap)).toHaveLength(0);
		// Consistency: no waybills ⇔ no attention wave from the same snapshot.
		expect(deriveYardVisualState(snap).bo.animationId).not.toBe("bo.wave");
	});

	it("each doctor hazard becomes a read-only doctor.fix waybill carrying the hint", () => {
		const snap = baseSnapshot({
			doctor: {
				hazards: ["connection-revoked:conn-1", "quota-exceeded"],
				hint: "run hobo doctor",
			},
		});
		const waybills = deriveWaybills(snap);
		expect(waybills).toHaveLength(2);
		for (const w of waybills) {
			expect(w.kind).toBe("doctor.fix");
			expect(w.confirmOp).toBe("doctorSnapshot");
			expect(w.blastRadius).toBe("read-only");
			expect(w.fields.find((f) => f.name === "hint")?.value).toBe(
				"run hobo doctor",
			);
		}
		expect(waybills[0]?.fields.find((f) => f.name === "hazard")?.value).toBe(
			"connection-revoked:conn-1",
		);
	});

	it("priority order: station.open → connection → rails → hazards", () => {
		const snap = baseSnapshot({
			...closedStation,
			connections: [makeConnection({ status: "pending" })],
			rails: [makeRail({ activationStatus: "draft" })],
			doctor: { hazards: ["drift"] },
		});
		expect(deriveWaybills(snap).map((w) => w.kind)).toEqual([
			"station.open",
			"connection.authorize",
			"rail.approve",
			"doctor.fix",
		]);
	});
});

describe("isHighball truth table", () => {
	const clean = baseSnapshot({
		connections: [makeConnection({ status: "active" })],
		rails: [makeRail({ activationStatus: "active" })],
	});

	it("clean board → highball", () => {
		expect(isHighball(clean, deriveWaybills(clean))).toBe(true);
	});

	it("closed station → not highball", () => {
		const snap = baseSnapshot(closedStation);
		expect(isHighball(snap, deriveWaybills(snap))).toBe(false);
	});

	it("any waybill on the desk → not highball", () => {
		const snap = baseSnapshot({
			rails: [makeRail({ activationStatus: "draft" })],
		});
		expect(isHighball(snap, deriveWaybills(snap))).toBe(false);
	});

	it("hazards → not highball", () => {
		const snap = baseSnapshot({ doctor: { hazards: ["drift"] } });
		expect(isHighball(snap, deriveWaybills(snap))).toBe(false);
	});

	it.each([
		"needs-reauth",
		"revoked",
		"expired",
	] as const)("%s connection → not highball even with zero waybills", (status) => {
		const snap = baseSnapshot({
			connections: [makeConnection({ status })],
		});
		const waybills = deriveWaybills(snap);
		expect(waybills).toHaveLength(0);
		expect(isHighball(snap, waybills)).toBe(false);
	});
});

describe("waybillForZone routing", () => {
	const snap = baseSnapshot({
		...closedStation,
		connections: [makeConnection({ status: "pending" })],
		rails: [makeRail({ activationStatus: "approved" })],
		doctor: { hazards: ["drift"] },
	});
	const waybills = deriveWaybills(snap);

	it("bootstrapDesk always opens the top of the stack", () => {
		expect(waybillForZone("bootstrapDesk", waybills)?.kind).toBe(
			"station.open",
		);
	});

	it("zones route to their object's waybill; others fall through", () => {
		expect(waybillForZone("connectionBay", waybills)?.kind).toBe(
			"connection.authorize",
		);
		expect(waybillForZone("policyBoard", waybills)?.kind).toBe("rail.activate");
		expect(waybillForZone("errorBunker", waybills)?.kind).toBe("doctor.fix");
		expect(waybillForZone("costBooth", waybills)).toBeNull();
		expect(waybillForZone("bootstrapDesk", [])).toBeNull();
	});
});

describe("spike ledger (SPIKE = deny, session-local)", () => {
	it("spiked waybills are skipped until seq advances", () => {
		const ledger = createSpikeLedger();
		const snap = baseSnapshot({
			rails: [makeRail({ activationStatus: "draft" })],
			seq: 3,
		});
		const waybills = deriveWaybills(snap);
		ledger.onSeq(3);
		ledger.spike(waybills[0]!.id);
		expect(ledger.filter(waybills)).toHaveLength(0);
		// Same seq re-observed: spike holds.
		ledger.onSeq(3);
		expect(ledger.filter(waybills)).toHaveLength(0);
		expect(ledger.size()).toBe(1);
		// Seq advance = snapshot content changed → spikes reconsidered.
		ledger.onSeq(4);
		expect(ledger.filter(waybills)).toHaveLength(1);
		expect(ledger.size()).toBe(0);
	});
});

describe("displaySheetForWaybill (STAMP grammar)", () => {
	it("prefixes WAYBILL, appends the blast-radius line, read-only fields", () => {
		const snap = baseSnapshot({
			connections: [makeConnection({ status: "pending" })],
		});
		const sheet = displaySheetForWaybill(deriveWaybills(snap)[0]!);
		expect(sheet.title).toBe("WAYBILL — Authorize Connection");
		expect(sheet.description).toContain("Blast radius: connection.");
		expect(sheet.waybill?.kind).toBe("connection.authorize");
		expect(sheet.fields.every((f) => f.type === "readonly")).toBe(true);
		// confirm values ride the form so client.confirm sees idOrAlias
		expect(sheet.fields.some((f) => f.name === "idOrAlias")).toBe(true);
		expect(sheet.runActions).toBeUndefined();
	});

	it("station.open maps to the init→up action pair, never a confirm op", () => {
		const sheet = displaySheetForWaybill(
			deriveWaybills(baseSnapshot(closedStation))[0]!,
		);
		expect(sheet.runActions).toEqual(["init", "up"]);
		expect(sheet.confirmOp).toBe("noop");
		expect(sheet.waybill?.id).toBe("waybill:station.open");
	});
});
