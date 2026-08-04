/**
 * World-model client for control-api's /v1/world endpoints.
 * SSE (/v1/world/stream) primary: a full `world-snapshot` first, then `world`
 * deltas folded locally with @hobo/yard-world's pure reducer. Poll fallback
 * mirrors yard-client (ADR-0145: net is a thin typed edge, logic stays pure).
 */

import { type AgentEvent, applyEvent, type WorldState } from "@hobo/yard-world";

export type WorldEnvelope = {
	ok: boolean;
	data?: { world: WorldState; demo: boolean; seed: number | null };
	message?: string;
};

export type WorldDelta = Readonly<{
	events: readonly AgentEvent[];
	tick: number;
	demo: boolean;
}>;

export type WorldClient = {
	readonly apiBase: string;
	/** Latest folded world state; null before the first snapshot lands. */
	getWorld(): WorldState | null;
	/** True when the server labels the stream as simulator-fed. */
	isDemo(): boolean;
	snapshot(): Promise<{ world: WorldState; demo: boolean }>;
	/** SSE with poll fallback; returns unsubscribe. */
	subscribe(
		onWorld: (world: WorldState, demo: boolean) => void,
		onError?: (message: string) => void,
		opts?: { pollMs?: number },
	): () => void;
};

/** Pure fold: apply a delta's events on top of a world state. */
export function foldWorldDelta(
	world: WorldState,
	events: readonly AgentEvent[],
): WorldState {
	let next = world;
	for (const event of events) next = applyEvent(next, event);
	return next;
}

export function createWorldClient(opts: {
	apiBase: string;
	fetchImpl?: typeof fetch;
	/** Injectable for tests; defaults to global EventSource when present. */
	eventSourceImpl?: typeof EventSource | null;
}): WorldClient {
	const apiBase = opts.apiBase.replace(/\/$/, "");
	const doFetch = opts.fetchImpl ?? fetch;
	const ES =
		opts.eventSourceImpl !== undefined
			? opts.eventSourceImpl
			: typeof EventSource !== "undefined"
				? EventSource
				: null;

	let world: WorldState | null = null;
	let demo = false;

	async function fetchSnapshot(): Promise<{
		world: WorldState;
		demo: boolean;
	}> {
		const res = await doFetch(`${apiBase}/v1/world/snapshot`, {
			headers: { "content-type": "application/json" },
		});
		const body = (await res.json()) as WorldEnvelope;
		if (!body.ok || !body.data) {
			throw new Error(body.message || "no world snapshot");
		}
		world = body.data.world;
		demo = body.data.demo;
		return { world: body.data.world, demo: body.data.demo };
	}

	const client: WorldClient = {
		apiBase,
		getWorld: () => world,
		isDemo: () => demo,
		snapshot: fetchSnapshot,
		subscribe(onWorld, onError, subOpts) {
			const pollMs = subOpts?.pollMs ?? 1000;
			let stopped = false;
			let pollTimer: ReturnType<typeof setInterval> | null = null;

			const emit = () => {
				if (!stopped && world) onWorld(world, demo);
			};

			const startPolling = () => {
				if (stopped || pollTimer) return;
				const tick = () => {
					fetchSnapshot()
						.then(emit)
						.catch((err) => onError?.(String(err?.message ?? err)));
				};
				tick();
				pollTimer = setInterval(tick, pollMs);
			};

			let es: EventSource | null = null;
			if (ES) {
				try {
					es = new ES(`${apiBase}/v1/world/stream`);
					es.addEventListener("world-snapshot", (ev) => {
						try {
							const data = JSON.parse((ev as MessageEvent).data) as {
								world: WorldState;
								demo: boolean;
							};
							world = data.world;
							demo = data.demo;
							emit();
						} catch (err) {
							onError?.(String(err));
						}
					});
					es.addEventListener("world", (ev) => {
						try {
							const delta = JSON.parse((ev as MessageEvent).data) as WorldDelta;
							if (world) {
								world = foldWorldDelta(world, delta.events);
								demo = delta.demo;
								emit();
							}
						} catch (err) {
							onError?.(String(err));
						}
					});
					es.addEventListener("error", () => {
						// SSE degraded — fall back to polling but keep ES retrying.
						startPolling();
					});
				} catch {
					es = null;
				}
			}
			if (!es) startPolling();

			return () => {
				stopped = true;
				if (pollTimer) clearInterval(pollTimer);
				es?.close();
			};
		},
	};
	return client;
}
