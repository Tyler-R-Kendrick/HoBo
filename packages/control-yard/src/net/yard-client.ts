/**
 * Typed control-api client for the browser host.
 * SSE (/v1/yard/stream) primary, polling fallback — commands POST to the
 * same management-backed endpoints the CLI uses (ADR-0135/ADR-0140 parity).
 */

import type { YardProjectionSnapshot } from "@hobo/management";

import type { DeploymentsWireView } from "../trains.js";

export type YardAction =
	| "init"
	| "up"
	| "down"
	| "publish-rail"
	| "activate-rail"
	| "create-conn"
	| "authorize-conn";

export type ConfirmOp =
	| "connectionCreate"
	| "connectionAuthorize"
	| "stationRailsPublish"
	| "stationRailsApprove"
	| "stationRailsActivate"
	| "doctorSnapshot"
	| "noop";

export type ApiEnvelope<T> = {
	ok: boolean;
	data?: T;
	message?: string;
	code?: string;
};

export type YardClient = {
	readonly apiBase: string;
	readonly stationId: string;
	snapshot(): Promise<YardProjectionSnapshot>;
	/** SSE with poll fallback; returns unsubscribe. */
	subscribe(
		onSnapshot: (snap: YardProjectionSnapshot) => void,
		onError?: (message: string) => void,
		opts?: { pollMs?: number },
	): () => void;
	runAction(action: YardAction): Promise<string>;
	confirm(op: ConfirmOp, values: Record<string, string>): Promise<string>;
	/**
	 * Deployment saga view for Train Traffic. Resolves to an unavailable view
	 * (never throws, never invents rows) when no durable yard store exists.
	 */
	deployments(): Promise<DeploymentsWireView>;
};

export function createYardClient(opts: {
	apiBase: string;
	stationId?: string;
	fetchImpl?: typeof fetch;
	/** Injectable for tests; defaults to global EventSource when present. */
	eventSourceImpl?: typeof EventSource | null;
}): YardClient {
	const apiBase = opts.apiBase.replace(/\/$/, "");
	const stationId = opts.stationId ?? "station:local";
	const doFetch = opts.fetchImpl ?? fetch;
	const ES =
		opts.eventSourceImpl !== undefined
			? opts.eventSourceImpl
			: typeof EventSource !== "undefined"
				? EventSource
				: null;

	async function api<T>(
		path: string,
		init?: RequestInit,
	): Promise<ApiEnvelope<T>> {
		const res = await doFetch(`${apiBase}${path}`, {
			...init,
			headers: {
				"content-type": "application/json",
				...(init?.headers || {}),
			},
		});
		const body = (await res.json()) as ApiEnvelope<T>;
		if (!body.ok && res.status >= 400) {
			throw new Error(body.message || `API ${res.status}`);
		}
		return body;
	}

	const client: YardClient = {
		apiBase,
		stationId,
		async snapshot() {
			const body = await api<YardProjectionSnapshot>(
				`/v1/yard/snapshot?stationId=${encodeURIComponent(stationId)}`,
			);
			if (!body.ok || !body.data) {
				throw new Error(body.message || "no snapshot");
			}
			return body.data;
		},
		subscribe(onSnapshot, onError, subOpts) {
			const pollMs = subOpts?.pollMs ?? 800;
			let stopped = false;
			let pollTimer: ReturnType<typeof setInterval> | null = null;

			const startPolling = () => {
				if (stopped || pollTimer) return;
				const tick = () => {
					client
						.snapshot()
						.then((snap) => {
							if (!stopped) onSnapshot(snap);
						})
						.catch((err) => onError?.(String(err?.message ?? err)));
				};
				tick();
				pollTimer = setInterval(tick, pollMs);
			};

			let es: EventSource | null = null;
			if (ES) {
				try {
					es = new ES(
						`${apiBase}/v1/yard/stream?stationId=${encodeURIComponent(stationId)}`,
					);
					es.addEventListener("yard", (ev) => {
						try {
							onSnapshot(
								JSON.parse((ev as MessageEvent).data) as YardProjectionSnapshot,
							);
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
		async runAction(action) {
			switch (action) {
				case "init":
					await api("/v1/station/init", {
						method: "POST",
						body: JSON.stringify({ name: "local", tenant: "local" }),
					});
					return "Station open.";
				case "up":
					await api("/v1/station/up", {
						method: "POST",
						body: JSON.stringify({ stationId }),
					});
					return "Occupying.";
				case "down":
					await api("/v1/station/down", {
						method: "POST",
						body: JSON.stringify({ stationId }),
					});
					return "Idle.";
				case "publish-rail":
					await api("/v1/station/rails/publish", {
						method: "POST",
						body: JSON.stringify({
							stationId,
							id: "rail-prod",
							name: "prod",
							version: "1.0.0",
						}),
					});
					return "Rail draft.";
				case "activate-rail": {
					const list = await api<{
						rails?: { contentHash: string; isBootstrap?: boolean }[];
					}>(`/v1/station/rails?stationId=${encodeURIComponent(stationId)}`);
					const rails = list.data?.rails || [];
					const rail = rails.find((r) => !r.isBootstrap) || rails[0];
					if (!rail) throw new Error("no rail");
					await client.confirm("stationRailsActivate", {
						hashOrId: rail.contentHash,
					});
					return "Rail active.";
				}
				case "create-conn":
					await client.confirm("connectionCreate", {
						provider: "asana",
						alias: "work",
						stationId,
					});
					return "Connection pending.";
				case "authorize-conn":
					await client.confirm("connectionAuthorize", { idOrAlias: "work" });
					return "Connection active.";
			}
		},
		async deployments() {
			try {
				const body = await api<DeploymentsWireView>("/v1/deployments/view");
				return body.data ?? { available: false };
			} catch {
				// A control plane without the route is simply a yard with no
				// trains — the rail stays honestly empty.
				return { available: false };
			}
		},
		async confirm(op, values) {
			switch (op) {
				case "connectionCreate":
					await api("/v1/connection/create", {
						method: "POST",
						body: JSON.stringify({
							provider: values.provider,
							alias: values.alias,
							stationId: values.stationId || stationId,
						}),
					});
					return "Created.";
				case "connectionAuthorize":
					await api("/v1/connection/authorize", {
						method: "POST",
						body: JSON.stringify({ idOrAlias: values.idOrAlias }),
					});
					return "Authorized.";
				case "stationRailsPublish":
					await api("/v1/station/rails/publish", {
						method: "POST",
						body: JSON.stringify({
							stationId,
							id: values.id || "rail-prod",
							name: values.name || "prod",
							version: values.version || "1.0.0",
						}),
					});
					return "Rail draft.";
				case "stationRailsApprove":
					await api("/v1/station/rails/approve", {
						method: "POST",
						body: JSON.stringify({ stationId, hashOrId: values.hashOrId }),
					});
					return "Approved.";
				case "stationRailsActivate":
					await api("/v1/station/rails/approve", {
						method: "POST",
						body: JSON.stringify({ stationId, hashOrId: values.hashOrId }),
					});
					await api("/v1/station/rails/activate", {
						method: "POST",
						body: JSON.stringify({ stationId, hashOrId: values.hashOrId }),
					});
					return "Rail activated.";
				case "doctorSnapshot":
				case "noop":
					return "Noted.";
			}
		},
	};
	return client;
}
