/**
 * Station-local OpenExperiment sidecar. Hosts the real hobo:experiment
 * engine next to occupancy so experiments are not a Camp capability row.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	analyzeExperimentFromEngine,
	EXPERIMENT_PORT,
	type ExperimentDefinition,
	FeatureFlagStore,
	type FlagEvalContext,
	OpenExperimentEngine,
} from "@hobo/identity";
import {
	isJsonObject,
	isJsonString,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

import { occupancyNamedOrigin } from "./occupancy-endpoints.js";

// public-contract: occupancy name of the station experiment sidecar
export const EXPERIMENT_SIDECAR_NAME = "experiment" as const;
// public-contract: experiment sidecar is occupancy-hosted, not a Bindle kind
export const EXPERIMENT_SIDECAR_HOSTING = "station" as const;

export interface ExperimentSidecarServer {
	readonly url: string;
	readonly port: number;
	readonly engine: OpenExperimentEngine;
	readonly close: () => Promise<void>;
}

export interface StartExperimentSidecarOptions {
	readonly port?: number;
	readonly store?: FeatureFlagStore;
	readonly now?: () => string;
}

export function createStationExperimentEngine(options?: {
	readonly store?: FeatureFlagStore;
	readonly now?: () => string;
}): OpenExperimentEngine {
	return new OpenExperimentEngine({
		store: options?.store ?? new FeatureFlagStore(),
		...(options?.now !== undefined ? { now: options.now } : undefined),
	});
}

export async function startExperimentSidecar(
	options: StartExperimentSidecarOptions = {},
): Promise<ExperimentSidecarServer> {
	const engine = createStationExperimentEngine({
		...(options.store !== undefined ? { store: options.store } : undefined),
		...(options.now !== undefined ? { now: options.now } : undefined),
	});
	const server = createServer((request, response) => {
		void handle(request, response, engine);
	});
	const port = await listen(server, options.port ?? 0);
	return {
		url: occupancyNamedOrigin("experiment", port),
		port,
		engine,
		close: () => closeServer(server),
	};
}

async function handle(
	request: IncomingMessage,
	response: import("node:http").ServerResponse,
	engine: OpenExperimentEngine,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const method = (request.method ?? "GET").toUpperCase();
	const path = url.pathname.replace(/\/+$/u, "") || "/";
	try {
		if (method === "GET" && (path === "/" || path === "/health")) {
			writeJson(response, 200, {
				name: EXPERIMENT_SIDECAR_NAME,
				hosting: EXPERIMENT_SIDECAR_HOSTING,
				port: EXPERIMENT_PORT,
				engine: "OpenExperimentEngine",
				live: true,
				fidelity: "real",
				experiments: engine.list(),
			});
			return;
		}
		if (method === "GET" && path === "/experiments") {
			writeJson(response, 200, { experiments: engine.list() });
			return;
		}
		if (method === "GET" && path === "/events") {
			writeJson(response, 200, { events: engine.events });
			return;
		}
		if (method === "POST" && path === "/experiments") {
			writeJson(
				response,
				201,
				engine.define(asDefinition(await readJson(request))),
			);
			return;
		}
		const match = /^\/experiments\/([^/]+)(?:\/([^/]+))?$/u.exec(path);
		if (!match) {
			writeJson(response, 404, { ok: false, error: "not found" });
			return;
		}
		const name = decodeURIComponent(match[1] ?? "");
		const action = match[2];
		if (method === "GET" && action === undefined) {
			const def = engine.list().find((row) => row.name === name);
			if (!def) {
				writeJson(response, 404, {
					ok: false,
					error: `experiment not defined: ${name}`,
					code: "experiment-missing",
				});
				return;
			}
			writeJson(response, 200, def);
			return;
		}
		if (method === "GET" && action === "assignment") {
			const subject = url.searchParams.get("subject") ?? "";
			const assignment = engine.getAssignment(name, subject);
			if (!assignment) {
				writeJson(response, 404, {
					ok: false,
					error: `assignment not found: ${name}`,
					code: "experiment-assignment-missing",
				});
				return;
			}
			writeJson(response, 200, assignment);
			return;
		}
		if (method === "GET" && action === "analyze") {
			const analysis = analyzeExperimentFromEngine(engine, name);
			if (!analysis) {
				writeJson(response, 404, {
					ok: false,
					error: `experiment not defined: ${name}`,
					code: "experiment-missing",
				});
				return;
			}
			writeJson(response, 200, analysis);
			return;
		}
		if (method === "POST" && action === "assign") {
			writeJson(
				response,
				200,
				engine.assign(name, asContext(await readJson(request))),
			);
			return;
		}
		if (method === "POST" && action === "expose") {
			const context = asContext(await readJson(request));
			engine.expose(name, context);
			writeJson(
				response,
				200,
				engine.getAssignment(name, context.targetingKey),
			);
			return;
		}
		if (method === "POST" && action === "evaluate") {
			writeJson(
				response,
				200,
				engine.evaluateAndExpose(name, asContext(await readJson(request))),
			);
			return;
		}
		if (method === "POST" && action === "conclude") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as {
				verdict?: JsonValue;
				reason?: JsonValue;
			};
			const verdict = asVerdict(body.verdict);
			engine.conclude(
				name,
				verdict,
				isJsonString(body.reason) ? body.reason : undefined,
			);
			writeJson(response, 200, { ok: true, experiment: name, verdict });
			return;
		}
		writeJson(response, 404, { ok: false, error: "not found" });
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		const mapped = mapEngineError(error);
		writeJson(response, mapped.status, mapped.body);
	}
}

function asDefinition(body: JsonValue | undefined): ExperimentDefinition {
	if (!body || !isJsonObject(body)) {
		throw Object.assign(new TypeError("experiment definition required"), {
			code: "experiment-definition-invalid",
		});
	}
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const value = body as Partial<ExperimentDefinition>;
	if (!isJsonString(value.name) || value.name.length === 0) {
		throw Object.assign(new TypeError("experiment name required"), {
			code: "experiment-definition-invalid",
		});
	}
	if (!isJsonString(value.flag) || value.flag.length === 0) {
		throw Object.assign(new TypeError("experiment.flag required"), {
			code: "experiment-definition-invalid",
		});
	}
	if (!Array.isArray(value.variants) || value.variants.length === 0) {
		throw Object.assign(new TypeError("experiment.variants required"), {
			code: "experiment-definition-invalid",
		});
	}
	return {
		name: value.name,
		flag: value.flag,
		variants: value.variants,
		...(value.allocation !== undefined
			? { allocation: value.allocation }
			: undefined),
		...(value.metrics !== undefined ? { metrics: value.metrics } : undefined),
	};
}

function asContext(body: JsonValue | undefined): FlagEvalContext {
	if (!body || !isJsonObject(body)) {
		throw Object.assign(new TypeError("experiment context required"), {
			code: "experiment-context-invalid",
		});
	}
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const value = body as Partial<FlagEvalContext>;
	if (!isJsonString(value.targetingKey) || value.targetingKey.length === 0) {
		throw Object.assign(new TypeError("targetingKey required"), {
			code: "experiment-context-invalid",
		});
	}
	return {
		targetingKey: value.targetingKey,
		...(isJsonString(value.tenant) ? { tenant: value.tenant } : undefined),
		...(value.attributes !== undefined
			? { attributes: value.attributes }
			: undefined),
	};
}

function asVerdict(
	value: JsonValue | undefined,
): "ship" | "do-not-ship" | "inconclusive" {
	if (value === "ship" || value === "do-not-ship" || value === "inconclusive") {
		return value;
	}
	throw Object.assign(new TypeError("experiment verdict required"), {
		code: "experiment-verdict-invalid",
	});
}

function mapEngineError(error: Error) {
	const code =
		"code" in error
			? String(
					// SAFETY: `code` in Error after the in-guard.
					(error as Error & { code?: string }).code ?? "",
				)
			: "";
	const message = error instanceof Error ? error.message : "experiment failed";
	if (
		code === "experiment-missing" ||
		code === "experiment-assignment-missing"
	) {
		return { status: 404, body: { ok: false, error: message, code } };
	}
	if (error instanceof TypeError || code.endsWith("-invalid")) {
		return {
			status: 400,
			body: { ok: false, error: message, ...(code ? { code } : undefined) },
		};
	}
	if (code.startsWith("experiment-")) {
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
