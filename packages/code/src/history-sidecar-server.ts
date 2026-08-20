/**
 * Station-local shell-memory sidecar. SQLite history + aliases + env.
 * Occupancy host for hobo-code, not an Atuin deploy.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

import { occupancyNamedOrigin } from "./occupancy-endpoints.js";
import {
	openSessionShellStore,
	type SessionShellStore,
} from "./session-shell-store.js";

// public-contract: occupancy name of the station history sidecar
export const HISTORY_SIDECAR_NAME = "history" as const;
// public-contract: history sidecar is occupancy-hosted, not a Bindle kind
export const HISTORY_SIDECAR_HOSTING = "station" as const;

export interface HistorySidecarServer {
	readonly url: string;
	readonly port: number;
	readonly store: SessionShellStore;
	readonly close: () => Promise<void>;
}

export async function startHistorySidecar(options: {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly environment: string;
	readonly port?: number;
}): Promise<HistorySidecarServer> {
	const store = openSessionShellStore({
		hoboHome: options.hoboHome,
		stationId: options.stationId,
		environment: options.environment,
	});
	const server = createServer((request, response) => {
		void handle(request, response, store);
	});
	const port = await listen(server, options.port ?? 0);
	return {
		url: occupancyNamedOrigin("history", port),
		port,
		store,
		close: async () => {
			store.close();
			await closeServer(server);
		},
	};
}

async function handle(
	request: IncomingMessage,
	response: import("node:http").ServerResponse,
	store: SessionShellStore,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const method = (request.method ?? "GET").toUpperCase();
	const path = url.pathname.replace(/\/+$/u, "") || "/";
	try {
		if (method === "GET" && (path === "/" || path === "/health")) {
			writeJson(response, 200, {
				name: HISTORY_SIDECAR_NAME,
				hosting: HISTORY_SIDECAR_HOSTING,
				live: true,
				engine: "SessionShellStore",
			});
			return;
		}
		if (method === "GET" && path === "/commands") {
			const author = url.searchParams.get("author");
			writeJson(response, 200, {
				commands: store.search({
					...(url.searchParams.get("q")
						? { q: url.searchParams.get("q") ?? "" }
						: undefined),
					...(url.searchParams.get("cwd")
						? { cwd: url.searchParams.get("cwd") ?? "" }
						: undefined),
					failedOnly: url.searchParams.get("failed") === "1",
					...(author === "human" ||
					author === "agent" ||
					author === "automation"
						? { authorKind: author }
						: undefined),
				}),
			});
			return;
		}
		if (method === "POST" && path === "/commands") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as JsonObject;
			const command = String(body.command ?? "");
			const cwd = String(body.cwd ?? "");
			const sessionId = String(body.sessionId ?? "cli");
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const actor = body.actor as
				| {
						kind?: string;
						name?: string;
						instanceId?: string;
						generation?: number;
				  }
				| undefined;
			const recorded = store.recordCommand({
				sessionId,
				cwd,
				command,
				actor: {
					kind:
						actor?.kind === "agent" || actor?.kind === "automation"
							? actor.kind
							: "human",
					name: actor?.name ?? "cli",
					instanceId: actor?.instanceId ?? "cli",
					generation: actor?.generation ?? 1,
				},
				...(isJsonString(body.paneId) ? { paneId: body.paneId } : undefined),
				...(body.outcome && isJsonObject(body.outcome)
					? {
							outcome: {
								exitCode: Number(
									// SAFETY: parsed or fixture value is the named domain type after this assertion.
									(body.outcome as { exitCode?: number }).exitCode ?? 0,
								),
								durationMs: Number(
									// SAFETY: parsed or fixture value is the named domain type after this assertion.
									(body.outcome as { durationMs?: number }).durationMs ?? 0,
								),
							},
						}
					: undefined),
			});
			writeJson(response, 201, recorded);
			return;
		}
		if (method === "GET" && path === "/aliases") {
			writeJson(response, 200, { aliases: store.listAliases() });
			return;
		}
		if (method === "PUT" && path.startsWith("/aliases/")) {
			const name = decodeURIComponent(path.slice("/aliases/".length));
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as { body?: unknown };
			writeJson(response, 200, store.setAlias(name, String(body.body ?? "")));
			return;
		}
		if (method === "DELETE" && path.startsWith("/aliases/")) {
			store.removeAlias(decodeURIComponent(path.slice("/aliases/".length)));
			writeJson(response, 200, { ok: true });
			return;
		}
		if (method === "GET" && path === "/env") {
			writeJson(response, 200, { env: store.listEnv() });
			return;
		}
		if (method === "PUT" && path.startsWith("/env/")) {
			const name = decodeURIComponent(path.slice("/env/".length));
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as { value?: unknown };
			writeJson(response, 200, store.setEnv(name, String(body.value ?? "")));
			return;
		}
		if (method === "DELETE" && path.startsWith("/env/")) {
			store.removeEnv(decodeURIComponent(path.slice("/env/".length)));
			writeJson(response, 200, { ok: true });
			return;
		}
		if (method === "GET" && path === "/dotfiles") {
			writeJson(response, 200, {
				script: store.exportDotfiles("bash"),
				aliases: store.listAliases(),
				env: store.listEnv(),
			});
			return;
		}
		writeJson(response, 404, { error: "not found" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const code =
			error instanceof Error && "code" in error
				? String(
						// SAFETY: `code` in Error after the in-guard.
						(error as Error & { code: string }).code,
					)
				: "shell-failed";
		writeJson(response, code.includes("secret") ? 400 : 400, {
			error: message,
			code,
		});
	}
}

function writeJson<T>(
	response: import("node:http").ServerResponse,
	status: number,
	body: T,
): void {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(payload);
}

function readJson(request: IncomingMessage): Promise<JsonValue> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		request.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf8");
			if (raw.trim().length === 0) {
				resolve({});
				return;
			}
			try {
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				resolve(parseJsonValue(raw));
			} catch (error) {
				reject(error);
			}
		});
		request.on("error", reject);
	});
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
