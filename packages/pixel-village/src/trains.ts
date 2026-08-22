/**
 * Train Traffic — the deployment saga rendered as rolling stock on the rail.
 *
 * One deployment = one train; one resource = one car whose visual is its
 * ResourceLifecycle. A failed resource derails: per the design pillars a
 * derail is the loudest event on screen and the only place spark red is
 * spent here. Nothing is invented — when the control plane has no durable
 * deployment store the view reports unavailable and we draw no trains at
 * all rather than faking traffic.
 */

import { YARD_LAYOUT } from "./layout.js";

/** Wire shape of GET /v1/deployments/view (parse-don't-validate boundary). */
export type DeploymentsWireView = Readonly<{
	available: boolean;
	/** Yard stores that exist but could not be read — the view is partial. */
	skippedYards?: readonly string[];
	source?: string;
	yards?: readonly string[];
	deployments?: readonly DeploymentWireRow[];
	count?: number;
	seq?: number;
}>;

export type DeploymentWireRow = Readonly<{
	deploymentId: string;
	status: "requested" | "planned" | "rejected" | "deployed" | "rolled-back";
	resources?: Readonly<Record<string, ResourceLifecycleWire>>;
	rejection?: { reason: string };
	rollback?: { reason: string; targetSetId: string };
}>;

export type ResourceLifecycleWire =
	| "provisioning"
	| "provisioned"
	| "failed"
	| "destroying"
	| "destroyed";

/** How a train reads on the rail. Derived only from saga facts. */
export type TrainPhase =
	| "assembling" // requested — cars being coupled at the yard throat
	| "running" // planned — underway
	| "arrived" // deployed — at the platform
	| "derailed" // rejected, or any resource failed
	| "backing"; // rolled-back — reversing, cars destroyed in reverse order

export type CarVisual =
	| "outline" // provisioning
	| "solid" // provisioned
	| "failed" // failed — spark
	| "hatched" // destroying
	| "ghost"; // destroyed

export type TrainCarView = Readonly<{
	id: string;
	resource: string;
	visual: CarVisual;
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type TrainView = Readonly<{
	id: string;
	deploymentId: string;
	phase: TrainPhase;
	/** 0..1 along the rail; drives the locomotive x. */
	progress: number;
	locomotiveX: number;
	y: number;
	cars: readonly TrainCarView[];
	/** Present only for derailed/backing trains — the real reason string. */
	reason: string | null;
}>;

const CAR_W = 46;
const CAR_H = 26;
const CAR_GAP = 6;
/** Trains ride just above the rail bed so ties stay readable underneath. */
const RAIL_Y_OFFSET = -6;
const MAX_TRAINS = 3;
const MAX_CARS = 8;
/** Keep the consist clear of the track ends. */
const EDGE_MARGIN = 12;

const CAR_VISUAL = {
	provisioning: "outline",
	provisioned: "solid",
	failed: "failed",
	destroying: "hatched",
	destroyed: "ghost",
} satisfies Record<ResourceLifecycleWire, CarVisual>;

const PHASE_PROGRESS = {
	assembling: 0.06,
	running: 0.5,
	arrived: 0.94,
	derailed: 0.62,
	backing: 0.32,
} satisfies Record<TrainPhase, number>;

export function phaseForRow(row: DeploymentWireRow): TrainPhase {
	const lifecycles = Object.values(row.resources ?? {});
	// A failed resource derails the train regardless of the header status:
	// the saga graph is the truth, not the summary field.
	if (row.status === "rejected" || lifecycles.includes("failed")) {
		return "derailed";
	}
	if (row.status === "rolled-back") return "backing";
	if (row.status === "deployed") return "arrived";
	if (row.status === "planned") return "running";
	return "assembling";
}

export function reasonForRow(row: DeploymentWireRow): string | null {
	if (row.rejection?.reason) return row.rejection.reason;
	if (row.rollback?.reason) return row.rollback.reason;
	const failed = Object.entries(row.resources ?? {})
		.filter(([, lifecycle]) => lifecycle === "failed")
		.map(([resource]) => resource);
	return failed.length > 0 ? `failed: ${failed.join(", ")}` : null;
}

/**
 * True when the deployments view is missing part of the estate (a yard store
 * was unreadable). The rail must say so: a partial view drawn as complete is
 * fabrication by omission.
 */
export function isPartialView(view: DeploymentsWireView | null): boolean {
	return (view?.skippedYards?.length ?? 0) > 0;
}

/**
 * Derive trains from the deployments view. Returns an empty list when the
 * projection is unavailable — an honest empty rail, never fabricated traffic.
 */
export function deriveTrains(view: DeploymentsWireView | null): TrainView[] {
	if (!view?.available) return [];
	const rows = (view.deployments ?? []).slice(0, MAX_TRAINS);
	const track = YARD_LAYOUT.zones.activeRailTrack;
	const railY = track.y + 20 + RAIL_Y_OFFSET;

	return rows.map((row, index) => {
		const phase = phaseForRow(row);
		const progress = PHASE_PROGRESS[phase];
		// Stack concurrent trains on parallel sidings so none overlap.
		const y = railY - index * (CAR_H + 8);
		const entries = Object.entries(row.resources ?? {}).slice(0, MAX_CARS);
		// Backing trains destroy in reverse order, so read the consist backwards.
		const ordered = phase === "backing" ? [...entries].reverse() : entries;
		// Place the locomotive so the whole consist fits on the rail: a long
		// deployment must not trail cars off the west end of the track.
		const consistLength = entries.length * (CAR_W + CAR_GAP);
		const minX = track.x + consistLength + EDGE_MARGIN;
		const maxX = track.x + track.width - EDGE_MARGIN;
		const usable = track.width - 120;
		const locomotiveX = Math.round(
			Math.min(maxX, Math.max(minX, track.x + 60 + usable * progress)),
		);

		const cars = ordered.map(([resource, lifecycle], carIndex) =>
			Object.freeze({
				id: `train-${row.deploymentId}-car-${carIndex}`,
				resource,
				visual: CAR_VISUAL[lifecycle] ?? "outline",
				// Cars trail behind the locomotive (west of it).
				x: Math.round(locomotiveX - (carIndex + 1) * (CAR_W + CAR_GAP)),
				y,
				w: CAR_W,
				h: CAR_H,
			}),
		);

		return Object.freeze({
			id: `train-${row.deploymentId}`,
			deploymentId: row.deploymentId,
			phase,
			progress,
			locomotiveX,
			y,
			cars: Object.freeze(cars),
			reason: reasonForRow(row),
		});
	});
}

/** True when any train is derailed — drives hit-stop and the hurt clip. */
export function anyDerailed(trains: readonly TrainView[]): boolean {
	return trains.some((t) => t.phase === "derailed");
}
