/**
 * HTTP App Kit entrypoint collection + Session Replay wrap (ADR-0137).
 * Kept free of Yard/compose imports so tests and agents can exercise
 * Bindle Kit replay without loading the full host graph.
 *
 * **App Kit** (not "membrane type"): Bindle-declared application surfaces
 * (api, web, service, ui, …). Every HTTP App Kit is Session-Replay wrapped.
 */
import type { BindleDefinition } from "@hobo/bindles";
import {
	applySessionReplayToEntrypoints,
	type BindleSessionReplayPlan,
	type DualFixtureStore,
} from "@hobo/replay";

export type FetchHandler = (input: Request) => Response | Promise<Response>;

export interface ServableEntrypoint {
	readonly name: string;
	readonly kind: string;
	readonly handler: FetchHandler;
	readonly external: boolean;
}

export type ListServableEntrypointsResult = {
	readonly entrypoints: ServableEntrypoint[];
	readonly sessionReplay: BindleSessionReplayPlan;
	readonly sessionReplayStore: DualFixtureStore;
};

/** HTTP App Kits that host fetch handlers on local Yard / Camp. */
function isHttpAppKit(kind: string): boolean {
	return (
		kind === "api" ||
		kind === "web" ||
		kind === "service" ||
		kind === "ui"
	);
}

/**
 * External exposure policy.
 * Default: only `web` is public (ingress). `api`/`service` stay private mesh.
 */
export function isExternalComponent(
	kind: string,
	annotations: readonly {
		readonly option: string;
		readonly config: Record<string, unknown>;
	}[],
): boolean {
	for (const annotation of annotations) {
		if (annotation.option !== "endpoint") continue;
		if (typeof annotation.config.external === "boolean") {
			return annotation.config.external;
		}
	}
	return kind === "web";
}

function asFetchHandler(value: unknown): FetchHandler | null {
	if (typeof value === "function") {
		return value as FetchHandler;
	}
	return null;
}

/**
 * Collect api/web/service entrypoints and wrap replayable web surfaces.
 */
export function listServableEntrypoints(
	definition: BindleDefinition,
	options: {
		readonly env?: NodeJS.ProcessEnv;
		readonly stationId?: string;
	} = {},
): ServableEntrypoint[] {
	return listServableEntrypointsWithReplay(definition, options).entrypoints;
}

export function listServableEntrypointsWithReplay(
	definition: BindleDefinition,
	options: {
		readonly env?: NodeJS.ProcessEnv;
		readonly stationId?: string;
	} = {},
): ListServableEntrypointsResult {
	const entries: ServableEntrypoint[] = [];
	for (const [name, record] of Object.entries(definition.resources)) {
		if (!isHttpAppKit(record.kind)) continue;
		const thunk = definition.entrypoint(name);
		if (typeof thunk !== "function") continue;
		const resolved = asFetchHandler(thunk());
		if (resolved === null) continue;
		entries.push({
			name,
			kind: record.kind,
			handler: resolved,
			external: isExternalComponent(record.kind, record.annotations),
		});
	}
	const rank = (entry: ServableEntrypoint) => {
		if (entry.external) return 0;
		if (entry.kind === "api") return 1;
		return 2;
	};
	const sorted = entries.sort((a, b) => rank(a) - rank(b));
	const applied = applySessionReplayToEntrypoints(sorted, definition, {
		env: options.env ?? process.env,
		...(options.stationId !== undefined
			? { stationId: options.stationId }
			: {}),
	});
	return {
		entrypoints: [...applied.entrypoints],
		sessionReplay: applied.plan,
		sessionReplayStore: applied.store,
	};
}
