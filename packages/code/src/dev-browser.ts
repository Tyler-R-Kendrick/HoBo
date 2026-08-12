import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";

import {
	EVIDENCE_OVERLAY_BO_PATH,
	evidenceOverlayBoIdleResponse,
	renderEvidenceOverlayBridge,
} from "./evidence-overlay.js";
import { startSessionControlServer } from "./session-control-server.js";

export interface DevBrowserSessionOptions {
	readonly projectDir: string;
	readonly hoboHome: string;
	readonly appPort?: number;
	readonly debugPort?: number;
	readonly sessionId?: string;
}

export interface DevBrowserSession {
	readonly sessionId: string;
	readonly appUrl: string;
	readonly debugUrl: string;
	readonly controlsUrl: string;
	readonly reportUrl: string;
	readonly evidencePath: string;
	readonly close: () => Promise<void>;
}

const MIME: Readonly<Record<string, string>> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".wasm": "application/wasm",
	".webp": "image/webp",
};

function portOf(server: Server): number {
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("hobo-code dev server did not bind a TCP port");
	}
	return address.port;
}

function listen(server: Server, port: number): Promise<void> {
	return new Promise((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			server.off("error", reject);
			resolveListen();
		});
	});
}

function close(server: Server): Promise<void> {
	if (!server.listening) return Promise.resolve();
	return new Promise((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
}

function publicFile(publicDir: string, pathname: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	const requested =
		decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
	const candidate = resolve(publicDir, requested);
	if (candidate !== publicDir && !candidate.startsWith(`${publicDir}${sep}`)) {
		return null;
	}
	if (!existsSync(candidate)) return null;
	const canonicalRoot = realpathSync(publicDir);
	const canonical = realpathSync(candidate);
	if (
		canonical !== canonicalRoot &&
		!canonical.startsWith(`${canonicalRoot}${sep}`)
	) {
		return null;
	}
	const served = statSync(canonical).isDirectory()
		? join(canonical, "index.html")
		: canonical;
	if (!existsSync(served)) return null;
	const canonicalServed = realpathSync(served);
	return canonicalServed === canonicalRoot ||
		canonicalServed.startsWith(`${canonicalRoot}${sep}`)
		? canonicalServed
		: null;
}

function serveStatic(publicDir: string, request: IncomingMessage): Response {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method not allowed", { status: 405 });
	}
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const path = publicFile(publicDir, url.pathname);
	if (path === null || !existsSync(path))
		return new Response("Not found", { status: 404 });
	let bytes: Buffer | null =
		request.method === "HEAD" ? null : readFileSync(path);
	if (
		bytes &&
		url.searchParams.has("__hobo_debug") &&
		extname(path) === ".html"
	) {
		const html = bytes.toString("utf8");
		const script = '<script src="/__hobo/evidence/bridge.js"></script>';
		bytes = Buffer.from(
			html.includes("</body>")
				? html.replace("</body>", `${script}</body>`)
				: `${html}${script}`,
		);
	}
	return new Response(bytes ? new Uint8Array(bytes) : null, {
		headers: {
			"cache-control": "no-store",
			"content-type":
				MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
		},
	});
}

async function send(
	nodeResponse: import("node:http").ServerResponse,
	response: Response,
): Promise<void> {
	nodeResponse.writeHead(response.status, Object.fromEntries(response.headers));
	nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

/** Serve an in-development app with the existing evidence controls injected on demand. */
export async function startDevBrowserSession(
	options: DevBrowserSessionOptions,
): Promise<DevBrowserSession> {
	const publicDir = resolve(options.projectDir, "public");
	const indexPath = join(publicDir, "index.html");
	if (!existsSync(indexPath)) {
		throw new Error(
			`hobo-code dev needs ${relative(options.projectDir, indexPath)}`,
		);
	}
	const sessionId = options.sessionId ?? `dev-${randomUUID()}`;
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(sessionId)) {
		throw new Error("hobo-code dev session id is invalid");
	}

	let bridge = "";
	const appServer = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const result =
			(request.method === "GET" || request.method === "HEAD") &&
			url.pathname === EVIDENCE_OVERLAY_BO_PATH
				? evidenceOverlayBoIdleResponse(request.method === "HEAD")
				: request.method === "GET" &&
						url.pathname === "/__hobo/evidence/bridge.js"
					? new Response(bridge, {
							headers: {
								"cache-control": "no-store",
								"content-type": "text/javascript; charset=utf-8",
							},
						})
					: serveStatic(publicDir, request);
		void send(response, result).catch((error) =>
			response.destroy(error as Error),
		);
	});
	await listen(appServer, options.appPort ?? 4173);
	const appUrl = `http://127.0.0.1:${portOf(appServer)}/`;

	try {
		const evidence = await startSessionControlServer({
			hoboHome: options.hoboHome,
			projectRoot: options.projectDir,
			port: options.debugPort ?? 4174,
		});
		const controlsUrl = evidence.controlsUrl(new URL(appUrl).origin, sessionId);
		bridge = renderEvidenceOverlayBridge({ controlsUrl });
		let closed = false;
		return {
			sessionId,
			appUrl,
			debugUrl: `${appUrl}?__hobo_debug=1`,
			controlsUrl,
			reportUrl: evidence.reportUrl,
			evidencePath: join(options.hoboHome, "durable", "code", "evidence"),
			close: async () => {
				if (closed) return;
				closed = true;
				await Promise.all([evidence.close(), close(appServer)]);
			},
		};
	} catch (error) {
		await close(appServer);
		throw error;
	}
}
