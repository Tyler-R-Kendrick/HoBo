/**
 * HIGHBALL waybill-desk approval grammar (M1 phase B).
 *
 * The gate is the game: every real actionable item in the projection becomes
 * a physical waybill the operator reads then STAMPs (approve) or SPIKEs
 * (deny). Waybills derive purely from YardProjectionSnapshot — reality is the
 * level designer, nothing fabricated — and confirm through the same
 * client.confirm ops the CLI uses, instantly. Approval speed and volume are
 * never rewarded; there are no deadlines.
 */

import type { YardProjectionSnapshot } from "@hobo/management";

import type { ZoneId } from "./layout.js";
import type { ConfirmOp } from "./net/yard-client.js";

export type WaybillKind =
	| "station.open"
	| "connection.authorize"
	| "rail.approve"
	| "rail.activate"
	| "doctor.fix";

/** The blast-radius placard: what a stamp can actually touch. */
export type BlastRadius = "read-only" | "station" | "connection" | "rail";

export type WaybillField = Readonly<{
	name: string;
	label: string;
	value: string;
}>;

/** "init-up" is the first-run special: client.runAction("init") then ("up"). */
export type WaybillOp = ConfirmOp | "init-up";

export type Waybill = Readonly<{
	id: string;
	kind: WaybillKind;
	title: string;
	summary: string;
	fields: readonly WaybillField[];
	confirmOp: WaybillOp;
	values: Readonly<Record<string, string>>;
	blastRadius: BlastRadius;
}>;

function field(name: string, label: string, value: string): WaybillField {
	return Object.freeze({ name, label, value });
}

function waybill(w: Waybill): Waybill {
	return Object.freeze({
		...w,
		fields: Object.freeze([...w.fields]),
		values: Object.freeze({ ...w.values }),
	});
}

/**
 * One waybill per real actionable item, priority-ordered:
 * station.open → connection.authorize → rail.approve/rail.activate →
 * doctor.fix. Bootstrap rails are excluded, matching entity-state's wave rule
 * (an activated real rail demotes the bootstrap rail to "approved" as its
 * steady state, which needs no operator action).
 */
export function deriveWaybills(snap: YardProjectionSnapshot): Waybill[] {
	const waybills: Waybill[] = [];

	if (snap.occupancy.status !== "open") {
		// Doubles as the first-run bell: no Station yet, everything starts here.
		waybills.push(
			waybill({
				id: "waybill:station.open",
				kind: "station.open",
				title: "Open the Station",
				summary:
					"The Station is closed. Stamp to open it and start occupying — same as `hobo station init` + `hobo station up`.",
				fields: [
					field(
						"station",
						"Station",
						snap.occupancy.stationId || "station:local",
					),
					field("status", "Status", String(snap.occupancy.status)),
				],
				confirmOp: "init-up",
				values: {},
				blastRadius: "station",
			}),
		);
	}

	for (const c of snap.connections) {
		if (String(c.status) !== "pending") continue;
		const idOrAlias = c.alias ?? c.id;
		const scopes = c.requestedScopes ?? [];
		waybills.push(
			waybill({
				id: `waybill:connection.authorize:${c.id}`,
				kind: "connection.authorize",
				title: "Authorize Connection",
				summary: `Connection ${idOrAlias} (${c.provider}) is pending. Stamping grants exactly the scopes on this placard.`,
				fields: [
					field("idOrAlias", "Connection", idOrAlias),
					field("provider", "Provider", c.provider),
					...(scopes.length > 0
						? [field("scopes", "Requested scopes", scopes.join(", "))]
						: []),
				],
				confirmOp: "connectionAuthorize",
				values: { idOrAlias },
				blastRadius: "connection",
			}),
		);
	}

	for (const r of snap.rails) {
		if (r.isBootstrap) continue;
		if (r.activationStatus === "draft") {
			waybills.push(
				waybill({
					id: `waybill:rail.approve:${r.id}`,
					kind: "rail.approve",
					title: "Approve Rail",
					summary: `Rail ${r.name} is a draft awaiting approval. Stamping approves this exact content hash.`,
					fields: [
						field("hashOrId", "Rail", r.contentHash),
						field("name", "Name", r.name),
					],
					confirmOp: "stationRailsApprove",
					values: { hashOrId: r.contentHash },
					blastRadius: "rail",
				}),
			);
		} else if (r.activationStatus === "approved") {
			waybills.push(
				waybill({
					id: `waybill:rail.activate:${r.id}`,
					kind: "rail.activate",
					title: "Activate Rail",
					summary: `Rail ${r.name} is approved but not active. Stamping puts it on the track.`,
					fields: [
						field("hashOrId", "Rail", r.contentHash),
						field("name", "Name", r.name),
					],
					confirmOp: "stationRailsActivate",
					values: { hashOrId: r.contentHash },
					blastRadius: "rail",
				}),
			);
		}
	}

	snap.doctor.hazards.forEach((hazard, i) => {
		// Remediation hint display is the value; confirm is a read-only doctor op.
		waybills.push(
			waybill({
				id: `waybill:doctor.fix:${i}:${hazard}`,
				kind: "doctor.fix",
				title: "Fix Hazard",
				summary: `Doctor flagged a real hazard. Read the hint, fix the cause — this stamp only acknowledges the reading.`,
				fields: [
					field("hazard", "Hazard", hazard),
					field("hint", "Doctor hint", snap.doctor.hint ?? "(no hint)"),
				],
				confirmOp: "doctorSnapshot",
				values: {},
				blastRadius: "read-only",
			}),
		);
	});

	return waybills;
}

/**
 * Highball = clean board, from reality only: station open, nothing on the
 * desk, no hazards, no connection needing re-auth (or revoked/expired).
 */
export function isHighball(
	snap: YardProjectionSnapshot,
	waybills: readonly Waybill[],
): boolean {
	if (snap.occupancy.status !== "open") return false;
	if (waybills.length > 0) return false;
	if (snap.doctor.hazards.length > 0) return false;
	const unhealthy = new Set(["needs-reauth", "revoked", "expired"]);
	if (snap.connections.some((c) => unhealthy.has(String(c.status)))) {
		return false;
	}
	return true;
}

/**
 * Zone click routing: a zone with a waybill for its object opens that waybill
 * instead of the legacy info sheet. The Bootstrap Desk is the waybill desk —
 * it always opens the TOP waybill.
 */
export function waybillForZone(
	zone: ZoneId,
	waybills: readonly Waybill[],
): Waybill | null {
	switch (zone) {
		case "bootstrapDesk":
			return waybills[0] ?? null;
		case "connectionBay":
			return waybills.find((w) => w.kind === "connection.authorize") ?? null;
		case "policyBoard":
			return (
				waybills.find(
					(w) => w.kind === "rail.approve" || w.kind === "rail.activate",
				) ?? null
			);
		case "errorBunker":
			return waybills.find((w) => w.kind === "doctor.fix") ?? null;
		default:
			return null;
	}
}

export type SpikeLedger = Readonly<{
	/** Deny a waybill: skip it at the desk until snapshot content changes. */
	spike(id: string): void;
	/** Feed every observed snapshot seq; a seq advance clears all spikes. */
	onSeq(seq: number): void;
	filter(waybills: readonly Waybill[]): Waybill[];
	size(): number;
}>;

/**
 * Session-local spike set. Simplest sound rule: any seq advance means
 * snapshot content changed, so all spikes are reconsidered.
 */
export function createSpikeLedger(): SpikeLedger {
	const spiked = new Set<string>();
	let lastSeq: number | null = null;
	return Object.freeze({
		spike(id: string): void {
			spiked.add(id);
		},
		onSeq(seq: number): void {
			if (lastSeq !== null && seq > lastSeq) spiked.clear();
			lastSeq = seq;
		},
		filter(waybills: readonly Waybill[]): Waybill[] {
			return waybills.filter((w) => !spiked.has(w.id));
		},
		size(): number {
			return spiked.size;
		},
	});
}
