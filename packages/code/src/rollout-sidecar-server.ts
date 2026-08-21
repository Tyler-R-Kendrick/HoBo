/**
 * Station-local OpenDelivery sidecar. Hosts the real hobo:delivery engine
 * next to occupancy so Bindle `rollout` is not a Camp/cloud mock.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	DELIVERY_PORT,
	type DeliveryHealthSignal,
	FeatureFlagStore,
	OpenDeliveryEngine,
	type RolloutPolicy,
	type RolloutState,
	type RolloutTargetOutcome,
} from "@hobo/identity";
import {
	isJsonObject,
	isJsonString,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

import { occupancyNamedOrigin } from "./occupancy-endpoints.js";

// public-contract: occupancy name of the station rollout sidecar
export const ROLLOUT_SIDECAR_NAME = "rollout" as const;
// public-contract: rollout sidecar is occupancy-hosted, not a Bindle kind
export const ROLLOUT_SIDECAR_HOSTING = "station" as const;

export interface RolloutSidecarServer {
	readonly url: string;
	readonly port: number;
	readonly engine: OpenDeliveryEngine;
	readonly close: () => Promise<void>;
}

export interface StartRolloutSidecarOptions {
	readonly port?: number;
	readonly store?: FeatureFlagStore;
	readonly now?: () => string;
}

export function createStationRolloutEngine(options?: {
	readonly store?: FeatureFlagStore;
	readonly now?: () => string;
}): OpenDeliveryEngine {
	return new OpenDeliveryEngine({
		store: options?.store ?? new FeatureFlagStore(),
		...(options?.now !== undefined ? { now: options.now } : undefined),
	});
}

/** Promote only when the engine is on its last running stage. */
export function promoteStationRollout(
	engine: OpenDeliveryEngine,
	rolloutId: string,
): RolloutState {
	const prev = engine.get(rolloutId);
	if (!prev) {
		throw Object.assign(new Error(`rollout not found: ${rolloutId}`), {
			code: "rollout-missing",
		});
	}
	if (prev.status === "promoted") return prev;
	if (prev.status !== "running") {
		throw Object.assign(
			new Error(`rollout cannot promote from ${prev.status}: ${rolloutId}`),
			{ code: "rollout-not-running" },
		);
	}
	if (prev.staged !== undefined) {
		throw Object.assign(
			new Error(
				`staged stage in progress — drive it with nextBatch/reportOutcomes: ${rolloutId}`,
			),
			{ code: "rollout-staged-pending" },
		);
	}
	if (prev.stageIndex + 1 < prev.policy.stages.length) {
		throw Object.assign(
			new Error(`rollout is not on its last stage: ${rolloutId}`),
			{ code: "rollout-not-final-stage" },
		);
	}
	return engine.step(rolloutId);
}

export async function startRolloutSidecar(
	options: StartRolloutSidecarOptions = {},
): Promise<RolloutSidecarServer> {
	const engine = createStationRolloutEngine({
		...(options.store !== undefined ? { store: options.store } : undefined),
		...(options.now !== undefined ? { now: options.now } : undefined),
	});
	const server = createServer((request, response) => {
		void handle(request, response, engine);
	});
	const port = await listen(server, options.port ?? 0);
	return {
		url: occupancyNamedOrigin("rollout", port),
		port,
		engine,
		close: () => closeServer(server),
	};
}

async function handle(
	request: IncomingMessage,
	response: import("node:http").ServerResponse,
	engine: OpenDeliveryEngine,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const method = (request.method ?? "GET").toUpperCase();
	const path = url.pathname.replace(/\/+$/u, "") || "/";
	try {
		if (method === "GET" && (path === "/" || path === "/health")) {
			writeJson(response, 200, {
				name: ROLLOUT_SIDECAR_NAME,
				hosting: ROLLOUT_SIDECAR_HOSTING,
				port: DELIVERY_PORT,
				engine: "OpenDeliveryEngine",
				live: true,
				fidelity: "real",
				rollouts: engine.list(),
			});
			return;
		}
		if (method === "GET" && path === "/rollouts") {
			writeJson(response, 200, { rollouts: engine.list() });
			return;
		}
		if (method === "GET" && path === "/events") {
			writeJson(response, 200, { events: engine.events });
			return;
		}
		if (method === "POST" && path === "/rollouts") {
			const body = await readJson(request);
			writeJson(response, 201, engine.start(asPolicy(body)));
			return;
		}
		const match = /^\/rollouts\/([^/]+)(?:\/([^/]+))?$/u.exec(path);
		if (!match) {
			writeJson(response, 404, { ok: false, error: "not found" });
			return;
		}
		const id = decodeURIComponent(match[1] ?? "");
		const action = match[2];
		if (method === "GET" && action === undefined) {
			const state = engine.get(id);
			if (!state) {
				writeJson(response, 404, {
					ok: false,
					error: `rollout not found: ${id}`,
					code: "rollout-missing",
				});
				return;
			}
			writeJson(response, 200, state);
			return;
		}
		if (method === "GET" && action === "batch") {
			writeJson(response, 200, { targets: engine.nextBatch(id) });
			return;
		}
		if (method === "POST" && action === "step") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as DeliveryHealthSignal;
			writeJson(response, 200, engine.step(id, body));
			return;
		}
		if (method === "POST" && action === "promote") {
			writeJson(response, 200, promoteStationRollout(engine, id));
			return;
		}
		if (method === "POST" && action === "rollback") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as Record<
				string,
				boolean | string
			>;
			writeJson(
				response,
				200,
				engine.rollback(
					id,
					Object.keys(body).length > 0 ? body : { operator: true },
				),
			);
			return;
		}
		if (method === "POST" && action === "approve") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as { approver?: unknown };
			const approver =
				isJsonString(body.approver) && body.approver.length > 0
					? body.approver
					: "station";
			writeJson(response, 200, engine.grantApproval(id, approver));
			return;
		}
		if (method === "POST" && action === "resume") {
			writeJson(response, 200, engine.resume(id));
			return;
		}
		if (method === "POST" && action === "outcomes") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as {
				outcomes?: readonly RolloutTargetOutcome[];
			};
			writeJson(response, 200, engine.reportOutcomes(id, body.outcomes ?? []));
			return;
		}
		writeJson(response, 404, { ok: false, error: "not found" });
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		const mapped = mapEngineError(error);
		writeJson(response, mapped.status, mapped.body);
	}
}

function asPolicy(body: JsonValue | undefined): RolloutPolicy {
	if (!body || !isJsonObject(body)) {
		throw Object.assign(new TypeError("rollout policy required"), {
			code: "rollout-policy-invalid",
		});
	}
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const value = body as Partial<RolloutPolicy>;
	if (!isJsonString(value.name) || value.name.length === 0) {
		throw Object.assign(new TypeError("rollout requires name"), {
			code: "rollout-policy-invalid",
		});
	}
	if (!isJsonString(value.flag) || value.flag.length === 0) {
		throw Object.assign(new TypeError("rollout requires flag"), {
			code: "rollout-policy-invalid",
		});
	}
	if (!Array.isArray(value.stages) || value.stages.length === 0) {
		throw Object.assign(new TypeError("rollout requires at least one stage"), {
			code: "rollout-policy-invalid",
		});
	}
	if (value.traffic !== "flag-only" && value.traffic !== "gateway-weighted") {
		throw Object.assign(new TypeError("rollout.traffic required"), {
			code: "rollout-policy-invalid",
		});
	}
	return {
		name: value.name,
		flag: value.flag,
		stages: value.stages,
		traffic: value.traffic,
		autoRollback: value.autoRollback === true,
		...(value.gatewayWeightPercent !== undefined
			? { gatewayWeightPercent: value.gatewayWeightPercent }
			: undefined),
	};
}

function mapEngineError(error: Error) {
	const code =
		"code" in error
			? String(
					// SAFETY: `code` in Error after the in-guard.
					(error as Error & { code?: string }).code ?? "",
				)
			: "";
	const message = error instanceof Error ? error.message : "rollout failed";
	if (code === "rollout-missing") {
		return { status: 404, body: { ok: false, error: message, code } };
	}
	if (error instanceof TypeError || code === "rollout-policy-invalid") {
		return {
			status: 400,
			body: { ok: false, error: message, ...(code ? { code } : undefined) },
		};
	}
	if (code.startsWith("rollout-")) {
		return { status: 409, body: { ok: false, error: message, code } };
	}
	return { status: 500, body: { ok: false, error: message } };
}

async function readJson(request: IncomingMessage): Promise<JsonValue> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8").trim();
	if (raw.length === 0) return {};
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return parseJsonValue(raw);
}

function writeJson<T>(
	response: import("node:http").ServerResponse,
	status: number,
	body: T,
): void {
	const payload = `${JSON.stringify(body)}\n`;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	response.end(payload);
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}
