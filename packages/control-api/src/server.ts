import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { URL } from "node:url";

import {
	brokerStatus,
	connectionAuthorize,
	connectionCreate,
	connectionGet,
	connectionList,
	connectionRevoke,
	connectionRotate,
	createManagementContext,
	doctorSnapshot,
	projectYardSnapshot,
	stationDown,
	stationInit,
	stationRailsActivate,
	stationRailsApprove,
	stationRailsList,
	stationRailsPublish,
	stationStatus,
	stationUp,
	type ManagementContext,
	type ManagementResult,
} from "@hobo/management";

export type ControlApiServerOptions = Readonly<{
	hoboHome: string;
	host?: string;
	port?: number;
	/** SSE poll interval ms (default 500). */
	streamIntervalMs?: number;
	/** Injectable context for tests. */
	context?: ManagementContext;
}>;

export type ControlApiServer = Readonly<{
	server: Server;
	url: string;
	port: number;
	host: string;
	close: () => Promise<void>;
	context: ManagementContext;
}>;

async function readJson(
	req: IncomingMessage,
): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw.trim()) return {};
	return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(
	res: ServerResponse,
	status: number,
	body: ManagementResult | Record<string, unknown>,
): void {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"access-control-allow-origin": "*",
		"access-control-allow-headers":
			"content-type, x-hobo-principal, x-hobo-tenant",
		"access-control-allow-methods": "GET, POST, OPTIONS",
	});
	res.end(payload);
}

function queryOf(url: URL): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of url.searchParams.entries()) out[k] = v;
	return out;
}

export async function createControlApiServer(
	options: ControlApiServerOptions,
): Promise<ControlApiServer> {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 0;
	const streamIntervalMs = options.streamIntervalMs ?? 500;
	const context =
		options.context ??
		createManagementContext({ hoboHome: options.hoboHome });

	const server = createServer(async (req, res) => {
		try {
			if (!req.url || !req.method) {
				sendJson(res, 400, { ok: false, code: "bad-request", message: "missing url" });
				return;
			}
			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"access-control-allow-origin": "*",
					"access-control-allow-headers":
						"content-type, x-hobo-principal, x-hobo-tenant",
					"access-control-allow-methods": "GET, POST, OPTIONS",
				});
				res.end();
				return;
			}

			const url = new URL(req.url, `http://${host}`);
			const path = url.pathname;
			const q = queryOf(url);

			// Health
			if (req.method === "GET" && path === "/health") {
				sendJson(res, 200, { ok: true, service: "@hobo/control-api" });
				return;
			}

			// OpenAPI-ish surface description
			if (req.method === "GET" && path === "/v1/openapi.json") {
				sendJson(res, 200, controlApiOpenApi());
				return;
			}

			if (req.method === "GET" && path === "/v1/yard/stream") {
				handleYardSse(res, context, q, streamIntervalMs);
				return;
			}

			const result = await dispatch(req.method, path, q, req, context);
			if (result === null) {
				sendJson(res, 404, {
					ok: false,
					code: "not-found",
					message: `no route ${req.method} ${path}`,
				});
				return;
			}
			sendJson(res, result.ok ? 200 : 400, result);
		} catch (err) {
			sendJson(res, 500, {
				ok: false,
				code: "internal",
				message: err instanceof Error ? err.message : String(err),
			});
		}
	});

	await new Promise<void>((resolve) => {
		server.listen(port, host, () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("control-api failed to bind");
	}

	return {
		server,
		host,
		port: address.port,
		url: `http://${host}:${address.port}`,
		context,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

async function dispatch(
	method: string,
	path: string,
	q: Record<string, string>,
	req: IncomingMessage,
	ctx: ManagementContext,
): Promise<ManagementResult | null> {
	const body =
		method === "POST" || method === "PUT" ? await readJson(req) : {};

	if (method === "POST" && path === "/v1/station/init") {
		return stationInit(
			ctx,
			opt({
				name: str(body.name),
				id: str(body.id),
				tenant: str(body.tenant),
			}),
		);
	}
	if (method === "POST" && path === "/v1/station/up") {
		return stationUp(ctx, str(body.stationId) ?? q.stationId);
	}
	if (method === "POST" && path === "/v1/station/down") {
		return stationDown(ctx, str(body.stationId) ?? q.stationId);
	}
	if (method === "GET" && path === "/v1/station/status") {
		return stationStatus(ctx, q.stationId);
	}
	if (method === "GET" && path === "/v1/station/rails") {
		return stationRailsList(ctx, q.stationId);
	}
	if (method === "POST" && path === "/v1/station/rails/publish") {
		return stationRailsPublish(
			ctx,
			opt({
				stationId: str(body.stationId),
				id: str(body.id),
				name: str(body.name),
				version: str(body.version),
				docPath: str(body.docPath),
				raw: body.raw as Record<string, unknown> | undefined,
			}),
		);
	}
	if (method === "POST" && path === "/v1/station/rails/approve") {
		return stationRailsApprove(
			ctx,
			opt({
				stationId: str(body.stationId),
				hashOrId: String(body.hashOrId ?? ""),
			}),
		);
	}
	if (method === "POST" && path === "/v1/station/rails/activate") {
		return stationRailsActivate(
			ctx,
			opt({
				stationId: str(body.stationId),
				hashOrId: String(body.hashOrId ?? ""),
			}),
		);
	}
	if (method === "POST" && path === "/v1/connection/create") {
		const scopesRaw = body.scopes;
		const scopes = Array.isArray(scopesRaw)
			? scopesRaw.map(String)
			: typeof scopesRaw === "string"
				? scopesRaw.split(",").map((s) => s.trim()).filter(Boolean)
				: undefined;
		return connectionCreate(
			ctx,
			opt({
				provider: String(body.provider ?? ""),
				stationId: str(body.stationId),
				alias: str(body.alias),
				scopes,
				flow: str(body.flow),
				tenant: str(body.tenant),
			}) as Parameters<typeof connectionCreate>[1],
		);
	}
	if (method === "POST" && path === "/v1/connection/authorize") {
		return connectionAuthorize(
			ctx,
			opt({
				idOrAlias: String(body.idOrAlias ?? body.id ?? ""),
				tenant: str(body.tenant),
				grantedScopes: Array.isArray(body.grantedScopes)
					? body.grantedScopes.map(String)
					: undefined,
				installationId: str(body.installationId),
			}) as Parameters<typeof connectionAuthorize>[1],
		);
	}
	if (method === "GET" && path === "/v1/connection") {
		return connectionList(
			ctx,
			opt({
				tenant: q.tenant,
				provider: q.provider,
				status: q.status,
				subjectId: q.subjectId,
			}),
		);
	}
	const connGet = path.match(/^\/v1\/connection\/([^/]+)$/);
	if (method === "GET" && connGet) {
		return connectionGet(
			ctx,
			opt({
				idOrAlias: decodeURIComponent(connGet[1]!),
				tenant: q.tenant,
			}) as Parameters<typeof connectionGet>[1],
		);
	}
	const connRevoke = path.match(/^\/v1\/connection\/([^/]+)\/revoke$/);
	if (method === "POST" && connRevoke) {
		return connectionRevoke(
			ctx,
			opt({
				idOrAlias: decodeURIComponent(connRevoke[1]!),
				tenant: str(body.tenant) ?? q.tenant,
				reason: str(body.reason),
			}) as Parameters<typeof connectionRevoke>[1],
		);
	}
	const connRotate = path.match(/^\/v1\/connection\/([^/]+)\/rotate$/);
	if (method === "POST" && connRotate) {
		return connectionRotate(
			ctx,
			opt({
				idOrAlias: decodeURIComponent(connRotate[1]!),
				tenant: str(body.tenant) ?? q.tenant,
			}) as Parameters<typeof connectionRotate>[1],
		);
	}
	if (method === "GET" && path === "/v1/broker/status") {
		return brokerStatus(ctx, opt({ stationId: q.stationId }));
	}
	if (method === "GET" && path === "/v1/doctor") {
		return doctorSnapshot(ctx, opt({ stationId: q.stationId }));
	}
	if (method === "GET" && path === "/v1/yard/snapshot") {
		return projectYardSnapshot(
			ctx,
			opt({
				stationId: q.stationId,
				tenant: q.tenant,
			}),
		);
	}
	return null;
}

function handleYardSse(
	res: ServerResponse,
	ctx: ManagementContext,
	q: Record<string, string>,
	intervalMs: number,
): void {
	res.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-cache, no-transform",
		connection: "keep-alive",
		"access-control-allow-origin": "*",
	});
	res.write(": control-api yard stream\n\n");

	let lastSeq = -1;
	const tick = () => {
		const snap = projectYardSnapshot(
			ctx,
			opt({
				stationId: q.stationId,
				tenant: q.tenant,
			}),
		);
		if (!snap.ok || !snap.data) {
			res.write(
				`event: error\ndata: ${JSON.stringify({ message: snap.message, code: snap.code })}\n\n`,
			);
			return;
		}
		if (snap.data.seq !== lastSeq) {
			lastSeq = snap.data.seq;
			res.write(
				`event: yard\ndata: ${JSON.stringify(snap.data)}\n\n`,
			);
		} else {
			res.write(
				`event: heartbeat\ndata: ${JSON.stringify({ seq: lastSeq })}\n\n`,
			);
		}
	};
	tick();
	const timer = setInterval(tick, intervalMs);
	res.on("close", () => clearInterval(timer));
}

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** exactOptionalPropertyTypes-safe: drop undefined values. */
function opt<T extends Record<string, unknown>>(
	obj: T,
): { [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined> } {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== undefined) out[k] = v;
	}
	return out as never;
}

function controlApiOpenApi(): Record<string, unknown> {
	return {
		openapi: "3.0.3",
		info: {
			title: "HoBo Control API",
			version: "0.1.0",
			description:
				"Local-first control-plane HTTP+SSE surface over @hobo/management (ADR-0135).",
		},
		paths: {
			"/v1/station/init": { post: { summary: "station init" } },
			"/v1/station/up": { post: { summary: "station up" } },
			"/v1/station/down": { post: { summary: "station down" } },
			"/v1/station/status": { get: { summary: "station status" } },
			"/v1/station/rails": { get: { summary: "rails list" } },
			"/v1/station/rails/publish": { post: { summary: "rails publish" } },
			"/v1/station/rails/approve": { post: { summary: "rails approve" } },
			"/v1/station/rails/activate": { post: { summary: "rails activate" } },
			"/v1/connection/create": { post: { summary: "connection create" } },
			"/v1/connection/authorize": { post: { summary: "connection authorize" } },
			"/v1/connection": { get: { summary: "connection list" } },
			"/v1/broker/status": { get: { summary: "broker status" } },
			"/v1/doctor": { get: { summary: "doctor" } },
			"/v1/yard/snapshot": { get: { summary: "yard projection snapshot" } },
			"/v1/yard/stream": { get: { summary: "yard projection SSE" } },
		},
	};
}
