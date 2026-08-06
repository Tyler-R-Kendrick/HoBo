/**
 * Same-origin APIs for Examples Temporary / anonymous hosting:
 *   CF Temporary Accounts: /api/cf-temp/*
 *   Agent same-origin hosts: /api/anon/*
 *
 * Never returns cloud API tokens to the browser. Never uses blob: as remote.
 */
import type { Connect, Plugin } from "vite";
import { spawn } from "node:child_process";
import path from "node:path";
import { provisionTemporaryEnvironmentStation } from "../../packages/providers/provider-cloudflare/src/temporary-station.ts";
import {
	provisionSameOriginAnonStation,
	serveAnonHostFile,
	shipOpenSaasSameOrigin,
	type AnonProviderId,
} from "./anon-provider-host-lib.mts";

const DEPLOY_OPENSAAS_CLI = path.resolve(
	process.cwd(),
	"scripts/deploy-opensaas-temporary.mts",
);

const ANON_PROVIDERS = new Set<AnonProviderId>([
	"railway",
	"netlify",
	"vercel",
	"webernetes",
	"lakebed",
	"kubernetes",
	"browser-wasm",
]);

function json(
	res: Connect.ServerResponse,
	status: number,
	body: unknown,
): void {
	const payload = JSON.stringify(body);
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(payload);
}

async function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) return {};
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
	} catch {
		return {};
	}
}

function stripPermanentCloudflareEnv(): void {
	for (const key of [
		"CLOUDFLARE_API_TOKEN",
		"CLOUDFLARE_API_KEY",
		"CF_API_TOKEN",
		"CLOUDFLARE_ACCOUNT_ID",
	] as const) {
		if (process.env[key]) delete process.env[key];
	}
}

function matchCfTemp(
	pathname: string,
): "health" | "station" | "opensaas" | null {
	const cleaned = pathname.replace(/\/+$/u, "") || "/";
	for (const base of ["/api/cf-temp", "/HoBo/api/cf-temp"]) {
		if (cleaned === base) return "health";
		if (cleaned === `${base}/station`) return "station";
		if (cleaned === `${base}/opensaas`) return "opensaas";
	}
	return null;
}

function matchAnon(
	pathname: string,
):
	| { kind: "health" }
	| { kind: "station"; providerId: AnonProviderId }
	| { kind: "opensaas"; providerId: AnonProviderId }
	| { kind: "host"; hostId: string; relPath: string }
	| null {
	const cleaned = pathname.replace(/\/+$/u, "") || "/";
	for (const base of ["/api/anon", "/HoBo/api/anon"]) {
		if (cleaned === base) return { kind: "health" };
		const station = cleaned.match(
			new RegExp(`^${base}/([^/]+)/station$`, "u"),
		);
		if (station?.[1] && ANON_PROVIDERS.has(station[1] as AnonProviderId)) {
			return { kind: "station", providerId: station[1] as AnonProviderId };
		}
		const ship = cleaned.match(
			new RegExp(`^${base}/([^/]+)/opensaas$`, "u"),
		);
		if (ship?.[1] && ANON_PROVIDERS.has(ship[1] as AnonProviderId)) {
			return { kind: "opensaas", providerId: ship[1] as AnonProviderId };
		}
		const host = cleaned.match(
			new RegExp(`^${base}/host/([^/]+)(?:/(.*))?$`, "u"),
		);
		if (host?.[1]) {
			return {
				kind: "host",
				hostId: host[1],
				relPath: host[2] ?? "index.html",
			};
		}
	}
	return null;
}

function requestOrigin(req: Connect.IncomingMessage): string {
	const host = req.headers.host ?? "127.0.0.1:4321";
	const proto = host.includes("localhost") || host.startsWith("127.")
		? "http"
		: "https";
	return `${proto}://${host}`;
}

async function runOpenSaasCfTemp(): Promise<{
	clientUrl: string;
	serverUrl: string;
	claimUrl: string;
	expiresAt: string;
	exampleId: string;
}> {
	const env = { ...process.env };
	delete env.CLOUDFLARE_API_TOKEN;
	delete env.CLOUDFLARE_API_KEY;
	delete env.CF_API_TOKEN;
	delete env.CLOUDFLARE_ACCOUNT_ID;
	if (!env.HOBO_OPENSAAS_SKIP_BUILD) env.HOBO_OPENSAAS_SKIP_BUILD = "1";
	const child = await new Promise<{
		code: number;
		stdout: string;
		stderr: string;
	}>((resolve) => {
		const proc = spawn(
			process.execPath,
			["--import", "tsx", DEPLOY_OPENSAAS_CLI, "--json"],
			{ cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		proc.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
		proc.on("error", (error) =>
			resolve({ code: 1, stdout: "", stderr: error.message }),
		);
	});
	const line = child.stdout.trim().split("\n").filter(Boolean).at(-1);
	const parsed = line
		? (JSON.parse(line) as {
				ok?: boolean;
				error?: string;
				clientUrl?: string;
				serverUrl?: string;
				claimUrl?: string;
				expiresAt?: string;
				exampleId?: string;
			})
		: null;
	if (child.code !== 0 || !parsed?.ok || !parsed.clientUrl || !parsed.claimUrl) {
		throw new Error(
			parsed?.error ||
				child.stderr.trim() ||
				child.stdout.trim() ||
				"OpenSaaS Temporary Accounts deploy failed",
		);
	}
	return {
		clientUrl: parsed.clientUrl,
		serverUrl: parsed.serverUrl ?? parsed.clientUrl,
		claimUrl: parsed.claimUrl,
		expiresAt: parsed.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
		exampleId: parsed.exampleId ?? "opensaas",
	};
}

function temporaryStationMiddleware(): Connect.NextHandleFunction {
	return async (req, res, next) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const anon = matchAnon(url.pathname);
		const cf = matchCfTemp(url.pathname);

		if (!anon && !cf) {
			next();
			return;
		}

		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
			res.setHeader("access-control-allow-headers", "content-type");
			res.end();
			return;
		}

		if (anon?.kind === "host" && req.method === "GET") {
			const file = await serveAnonHostFile(anon.hostId, anon.relPath);
			if (!file) {
				json(res, 404, { ok: false, error: "host-not-found" });
				return;
			}
			res.statusCode = file.status;
			res.setHeader("content-type", file.contentType);
			res.setHeader("cache-control", "no-store");
			res.end(file.body);
			return;
		}

		if (anon?.kind === "health" && req.method === "GET") {
			json(res, 200, {
				ok: true,
				service: "hobo-anon-host-api",
				providers: [...ANON_PROVIDERS],
				sameOrigin: true,
			});
			return;
		}

		if (cf === "health" && req.method === "GET") {
			json(res, 200, {
				ok: true,
				service: "hobo-temporary-station-api",
				temporaryAccounts: true,
				sameOrigin: true,
				opensaas: true,
			});
			return;
		}

		if (anon?.kind === "station" && req.method === "POST") {
			const body = (await readJsonBody(req)) as { stationId?: unknown };
			const stationId =
				typeof body.stationId === "string" && body.stationId.length > 0
					? body.stationId.slice(0, 128)
					: `station:anon:${crypto.randomUUID()}`;
			try {
				const provisioned = await provisionSameOriginAnonStation({
					providerId: anon.providerId,
					stationId,
					origin: requestOrigin(req),
					basePath: "/HoBo",
				});
				json(res, 200, {
					ok: true,
					stationId: provisioned.stationId,
					stationUrl: provisioned.endpointUrl,
					endpointUrl: provisioned.endpointUrl,
					claimUrl: provisioned.claimUrl,
					expiresAt: provisioned.expiresAt,
					anonymous: true,
					temporary: true,
					hostKind: provisioned.hostKind,
					providerId: provisioned.providerId,
				});
			} catch (error) {
				json(res, 502, {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			return;
		}

		if (anon?.kind === "opensaas" && req.method === "POST") {
			const body = (await readJsonBody(req)) as { stationId?: unknown };
			const stationId =
				typeof body.stationId === "string" && body.stationId.length > 0
					? body.stationId.slice(0, 128)
					: `station:anon:${crypto.randomUUID()}`;
			try {
				const shipped = await shipOpenSaasSameOrigin({
					providerId: anon.providerId,
					stationId,
					origin: requestOrigin(req),
					basePath: "/HoBo",
				});
				json(res, 200, {
					ok: true,
					exampleId: shipped.exampleId,
					clientUrl: shipped.clientUrl,
					serverUrl: shipped.serverUrl,
					claimUrl: shipped.claimUrl,
					expiresAt: shipped.expiresAt,
					anonymous: true,
					temporary: true,
					hostKind: shipped.hostKind,
					providerId: shipped.providerId,
				});
			} catch (error) {
				json(res, 502, {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					remediation:
						"Same-origin OpenSaaS ship failed. Build examples/wasp-opensaas client first.",
				});
			}
			return;
		}

		if (cf === "opensaas" && req.method === "POST") {
			stripPermanentCloudflareEnv();
			try {
				const deployed = await runOpenSaasCfTemp();
				json(res, 200, { ok: true, ...deployed, anonymous: true, temporary: true });
			} catch (error) {
				json(res, 502, {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					remediation:
						"OpenSaaS Temporary Accounts deploy failed. Ensure wasp CLI (^0.25) is installed and no permanent CLOUDFLARE_API_TOKEN is set.",
				});
			}
			return;
		}

		if (cf === "station" && req.method === "POST") {
			stripPermanentCloudflareEnv();
			const body = (await readJsonBody(req)) as { stationId?: unknown };
			const stationId =
				typeof body.stationId === "string" && body.stationId.length > 0
					? body.stationId.slice(0, 128)
					: `station:anon:${crypto.randomUUID()}`;
			try {
				const provisioned = await provisionTemporaryEnvironmentStation({
					stationId,
				});
				json(res, 200, {
					ok: true,
					stationId: provisioned.stationId,
					scriptName: provisioned.scriptName,
					stationUrl: provisioned.stationUrl,
					claimUrl: provisioned.claimUrl,
					expiresAt: provisioned.expiresAt,
					anonymous: true,
					temporary: true,
				});
			} catch (error) {
				json(res, 502, {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					remediation:
						"Same-origin Temporary Accounts provision failed. Confirm network access to api.cloudflare.com.",
				});
			}
			return;
		}

		json(res, 404, { ok: false, error: "not-found" });
	};
}

export function temporaryStationApiPlugin(): Plugin {
	const attach = (server: { middlewares: Connect.Server }) => {
		server.middlewares.use(temporaryStationMiddleware());
	};
	return {
		name: "hobo-temporary-station-api",
		configureServer: attach,
		configurePreviewServer: attach,
	};
}
