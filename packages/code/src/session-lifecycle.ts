/**
 * Local dashboard lifecycle. Ready means started + health probe pass.
 * Provisioned / IaC success is never Ready.
 */
import { loopbackFetchUrl } from "./occupancy-endpoints.js";

export type LifecycleState =
	| "stopped"
	| "starting"
	| "started"
	| "unhealthy"
	| "ready";

export interface ManagedResource {
	readonly id: string;
	readonly kind: string;
	readonly healthUrl?: string;
	readonly provisioned?: boolean;
	/** Local Yard/Camp/Station start ready so develop is not a stop board. */
	readonly initiallyStarted?: boolean;
}

export interface HealthProbeResult {
	readonly ok: boolean;
	readonly reason?: string;
}

export interface LifecycleSnapshot {
	readonly id: string;
	readonly kind: string;
	readonly state: LifecycleState;
	readonly ready: boolean;
	readonly provisioned: boolean;
	readonly started: boolean;
	readonly healthy: boolean;
	readonly lastError?: string;
}

export type HealthProbe = (
	id: string,
	healthUrl?: string,
) => Promise<HealthProbeResult>;

interface Internal extends ManagedResource {
	started: boolean;
	healthy: boolean;
	lastError?: string;
}

export interface ResourceLifecycle {
	register(resource: ManagedResource): void;
	start(id: string): Promise<LifecycleSnapshot>;
	stop(id: string): Promise<LifecycleSnapshot>;
	restart(id: string): Promise<LifecycleSnapshot>;
	snapshot(id: string): LifecycleSnapshot;
	list(): readonly LifecycleSnapshot[];
}

function requireResource(
	resources: Map<string, Internal>,
	id: string,
): Internal {
	const row = resources.get(id);
	if (!row) {
		throw new Error(`unknown resource ${id}`);
	}
	return row;
}

function toSnapshot(row: Internal): LifecycleSnapshot {
	const started = row.started;
	const healthy = row.healthy;
	const ready = started && healthy;
	const state: LifecycleState = !started
		? "stopped"
		: ready
			? "ready"
			: "unhealthy";
	return {
		id: row.id,
		kind: row.kind,
		state,
		ready,
		provisioned: row.provisioned === true,
		started,
		healthy,
		...(row.lastError ? { lastError: row.lastError } : {}),
	};
}

export function createResourceLifecycle(
	options: { readonly probe?: HealthProbe } = {},
): ResourceLifecycle {
	const resources = new Map<string, Internal>();
	const probe: HealthProbe =
		options.probe ??
		(async (_id, healthUrl): Promise<HealthProbeResult> => {
			if (!healthUrl) return { ok: true };
			try {
				const response = await fetch(loopbackFetchUrl(healthUrl));
				if (response.ok) return { ok: true };
				return { ok: false, reason: `http ${response.status}` };
			} catch (error) {
				return {
					ok: false,
					reason: error instanceof Error ? error.message : String(error),
				};
			}
		});

	return {
		register(resource) {
			const existing = resources.get(resource.id);
			const initial = resource.initiallyStarted === true;
			resources.set(resource.id, {
				...resource,
				started: existing?.started ?? initial,
				healthy: existing?.healthy ?? initial,
				...(existing?.lastError ? { lastError: existing.lastError } : {}),
			});
		},
		async start(id) {
			const row = requireResource(resources, id);
			row.started = true;
			const result = await probe(id, row.healthUrl);
			row.healthy = result.ok;
			if (result.ok) delete row.lastError;
			else row.lastError = result.reason ?? "unhealthy";
			return toSnapshot(row);
		},
		async stop(id) {
			const row = requireResource(resources, id);
			row.started = false;
			row.healthy = false;
			delete row.lastError;
			return toSnapshot(row);
		},
		async restart(id) {
			await this.stop(id);
			return this.start(id);
		},
		snapshot(id) {
			return toSnapshot(requireResource(resources, id));
		},
		list() {
			return [...resources.values()].map(toSnapshot);
		},
	};
}
