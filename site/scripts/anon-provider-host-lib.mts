/**
 * Same-origin anonymous Environment Station + OpenSaaS host for providers that
 * lack password-free Temporary Accounts (Railway / Vercel today; Netlify anon is
 * password-gated). Cloudflare keeps Temporary Accounts Workers.
 *
 * URLs are real HTTP under astro dev — never blob:.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, cp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const HOST_ROOT = path.join(REPO_ROOT, "site/.hobo-anon-hosts");
const OPENSAAS_BUILD = path.join(
	REPO_ROOT,
	"examples/wasp-opensaas/app/.wasp/out/web-app/build",
);

export type AnonProviderId =
	| "railway"
	| "netlify"
	| "vercel"
	| "webernetes"
	| "lakebed"
	| "kubernetes"
	| "browser-wasm";

export type AnonHostResult = {
	readonly ok: true;
	readonly providerId: AnonProviderId;
	readonly stationId: string;
	readonly endpointUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
	readonly hostKind: "same-origin-agent";
};

export type AnonShipResult = {
	readonly ok: true;
	readonly providerId: AnonProviderId;
	readonly exampleId: "opensaas";
	readonly stationId: string;
	readonly clientUrl: string;
	readonly serverUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
	readonly hostKind: "same-origin-agent";
};

function slug(input: string): string {
	return input.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "").slice(0, 48).toLowerCase() || "anon";
}

function stationHtml(providerId: string, stationId: string): string {
	const body = {
		ok: true,
		kind: "hobo-environment-station",
		provider: providerId,
		stationId,
		anonymous: true,
		temporary: true,
		hostKind: "same-origin-agent",
		note: `${providerId} has no password-free Temporary Accounts API; HoBo serves a same-origin agent anonymous Environment Station.`,
	};
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>HoBo Environment Station · ${providerId}</title></head>
<body data-hobo-station="${providerId}" data-anonymous="true" data-host-kind="same-origin-agent">
  <h1>HoBo Environment Station</h1>
  <p>provider=${providerId} · same-origin agent anonymous host</p>
  <pre>${JSON.stringify(body, null, 2)}</pre>
</body>
</html>`;
}

export async function provisionSameOriginAnonStation(input: {
	readonly providerId: AnonProviderId;
	readonly stationId: string;
	readonly origin: string;
	readonly basePath?: string;
}): Promise<AnonHostResult> {
	const base = (input.basePath ?? "/HoBo").replace(/\/$/u, "");
	const id = slug(`${input.providerId}-${input.stationId}`);
	const dir = path.join(HOST_ROOT, id);
	await mkdir(dir, { recursive: true });
	await writeFile(
		path.join(dir, "index.html"),
		stationHtml(input.providerId, input.stationId),
		"utf8",
	);
	await writeFile(
		path.join(dir, "health"),
		JSON.stringify({
			ok: true,
			kind: "hobo-environment-station",
			provider: input.providerId,
			anonymous: true,
			temporary: true,
		}),
		"utf8",
	);
	const endpointUrl = `${input.origin.replace(/\/$/u, "")}${base}/api/anon/host/${id}/`;
	const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	return {
		ok: true,
		providerId: input.providerId,
		stationId: input.stationId,
		endpointUrl,
		claimUrl: `${endpointUrl}#claim-local-agent-host`,
		expiresAt,
		anonymous: true,
		temporary: true,
		hostKind: "same-origin-agent",
	};
}

export async function shipOpenSaasSameOrigin(input: {
	readonly providerId: AnonProviderId;
	readonly stationId: string;
	readonly origin: string;
	readonly basePath?: string;
}): Promise<AnonShipResult> {
	await access(path.join(OPENSAAS_BUILD, "index.html")).catch(() => {
		throw new Error(
			"OpenSaaS client build missing. Run wasp build + REACT_APP_API_URL=https://example.com npx vite build in examples/wasp-opensaas/app",
		);
	});
	const base = (input.basePath ?? "/HoBo").replace(/\/$/u, "");
	const id = slug(`${input.providerId}-opensaas-${input.stationId}`);
	const dir = path.join(HOST_ROOT, id);
	await mkdir(dir, { recursive: true });
	await cp(OPENSAAS_BUILD, dir, { recursive: true });
	const clientUrl = `${input.origin.replace(/\/$/u, "")}${base}/api/anon/host/${id}/`;
	const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	return {
		ok: true,
		providerId: input.providerId,
		exampleId: "opensaas",
		stationId: input.stationId,
		clientUrl,
		serverUrl: clientUrl,
		claimUrl: `${clientUrl}#claim-local-agent-host`,
		expiresAt,
		anonymous: true,
		temporary: true,
		hostKind: "same-origin-agent",
	};
}

export type NetlifyAnonDeployResult = {
	readonly ok: true;
	readonly siteUrl: string;
	readonly claimUrl: string;
	readonly password?: string;
	readonly siteId: string;
};

export async function deployNetlifyAnonymous(dir: string): Promise<NetlifyAnonDeployResult> {
	const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
		(resolve) => {
			const proc = spawn(
				"npx",
				[
					"--yes",
					"netlify-cli@latest",
					"deploy",
					"--dir",
					dir,
					"--allow-anonymous",
					"--no-build",
					"--json",
				],
				{ cwd: dir, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] },
			);
			let stdout = "";
			let stderr = "";
			proc.stdout.on("data", (c) => {
				stdout += String(c);
			});
			proc.stderr.on("data", (c) => {
				stderr += String(c);
			});
			proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
			proc.on("error", (error) =>
				resolve({ code: 1, stdout: "", stderr: error.message }),
			);
		},
	);
	const line = result.stdout.trim().split("\n").filter(Boolean).at(-1);
	if (!line) {
		throw new Error(
			result.stderr.trim() || "netlify deploy --allow-anonymous produced no JSON",
		);
	}
	const parsed = JSON.parse(line) as {
		site_url?: string;
		claim_url?: string;
		password?: string;
		site_id?: string;
	};
	if (!parsed.site_url || !parsed.claim_url || !parsed.site_id) {
		throw new Error(`netlify anonymous deploy missing fields: ${line}`);
	}
	const siteUrl = parsed.site_url.replace(/^http:\/\//u, "https://");
	return {
		ok: true,
		siteUrl,
		claimUrl: parsed.claim_url,
		...(parsed.password ? { password: parsed.password } : {}),
		siteId: parsed.site_id,
	};
}

/** Resolve host directory id from URL path segment. */
export function resolveHostDir(id: string): string {
	const safe = slug(id);
	return path.join(HOST_ROOT, safe);
}

export async function serveAnonHostFile(
	hostId: string,
	relPath: string,
): Promise<{ status: number; contentType: string; body: Buffer | string } | null> {
	const dir = resolveHostDir(hostId);
	const cleaned = relPath.replace(/^\/+/u, "") || "index.html";
	const candidate = path.normalize(path.join(dir, cleaned));
	if (!candidate.startsWith(dir)) return null;
	try {
		const body = await readFile(candidate);
		const ext = path.extname(candidate).toLowerCase();
		const contentType =
			ext === ".html"
				? "text/html; charset=utf-8"
				: ext === ".js"
					? "application/javascript"
					: ext === ".css"
						? "text/css"
						: ext === ".json" || cleaned === "health"
							? "application/json"
							: "application/octet-stream";
		return { status: 200, contentType, body };
	} catch {
		try {
			const body = await readFile(path.join(dir, "index.html"));
			return { status: 200, contentType: "text/html; charset=utf-8", body };
		} catch {
			return null;
		}
	}
}

/** Unused helper kept for tests that want a tiny standalone server. */
export function createAnonHostProbeServer(port: number): Promise<number> {
	return new Promise((resolve) => {
		const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
			res.statusCode = 200;
			res.end("ok");
		});
		server.listen(port, "127.0.0.1", () => resolve(port));
	});
}
