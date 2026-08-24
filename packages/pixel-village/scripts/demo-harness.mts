/**
 * Reusable e2e harness: boots a control-api server + a static file server for
 * `public/` and `/assets/*`, and serves a freshly-built `dist/yard.js` from a
 * scratch directory so the suite never writes into `public/`.
 *
 * This is deliberately a PARALLEL, self-contained harness: `scripts/play-demo.mts`
 * (the evidence tour) keeps its own copy of the boot logic and is never imported
 * from here, so the two lanes cannot break each other.
 *
 * Usage from a Playwright spec:
 *
 * ```ts
 * const h = await startHarness({ seedFixtures: true });
 * await page.goto(h.gameUrl({ scenario: "quiet-yard" }));
 * ...
 * await h.close();
 * ```
 */

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createControlApiServer } from "@hobo/control-api";
import {
	connectionAuthorize,
	connectionCreate,
	createManagementContext,
	stationInit,
	stationRailsActivate,
	stationRailsApprove,
	stationRailsPublish,
	stationUp,
} from "@hobo/management";
import { isJsonString } from "../src/json.js";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const ASSETS = join(ROOT, "assets");
const ENTRY = join(ROOT, "src/main.ts");

const MIME = new Map<string, string>([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".svg", "image/svg+xml"],
	[".gif", "image/gif"],
	[".webm", "video/webm"],
	[".mp4", "video/mp4"],
]);

function staticHandler(base: string) {
	return (req: IncomingMessage, res: ServerResponse) => {
		try {
			const url = new URL(req.url || "/", "http://127.0.0.1");
			let rel = decodeURIComponent(url.pathname);
			if (rel === "/") rel = "/index.html";
			const file = join(base, rel);
			if (
				!file.startsWith(base) ||
				!existsSync(file) ||
				statSync(file).isDirectory()
			) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			res.writeHead(200, {
				"content-type": MIME.get(extname(file)) ?? "application/octet-stream",
				"cache-control": "no-store",
			});
			res.end(readFileSync(file));
		} catch (err) {
			res.writeHead(500);
			res.end(String(err));
		}
	};
}

/**
 * Bundle `src/main.ts` into a scratch dir (never `public/dist`, which another
 * lane owns). Memoized per process: one esbuild run per Playwright worker.
 */
let bundlePromise: Promise<string> | null = null;

async function ensureBundle(): Promise<string> {
	if (!bundlePromise) {
		bundlePromise = (async () => {
			const outDir = mkdtempSync(join(tmpdir(), "hobo-yard-e2e-bundle-"));
			const outFile = join(outDir, "yard.js");
			try {
				const esbuild = await import("esbuild");
				await esbuild.build({
					entryPoints: [ENTRY],
					bundle: true,
					format: "esm",
					platform: "browser",
					outfile: outFile,
					logLevel: "warning",
				});
				return outFile;
			} catch (err) {
				// Fall back to the committed bundle so the suite still runs when
				// esbuild is unavailable. Never write into public/.
				const committed = join(PUBLIC, "dist/yard.js");
				if (existsSync(committed)) {
					console.warn(
						`[harness] esbuild failed (${String(err)}); using public/dist/yard.js`,
					);
					return committed;
				}
				throw err;
			}
		})();
	}
	return bundlePromise;
}

export type HarnessOptions = Readonly<{
	/** Run the control-api world simulator (SIMULATED provenance). Default false. */
	demo?: boolean;
	/** Seed station/rail/connection management fixtures. Default true. */
	seedFixtures?: boolean;
}>;

export interface GameUrlParams {
	test?: string | number | boolean;
	seed?: string | number | boolean;
	api?: string | number | boolean;
	scenario?: string | number | boolean;
	newsreel?: string | number | boolean;
}

export type Harness = Readonly<{
	/** Static origin, e.g. http://127.0.0.1:41234 */
	origin: string;
	/** control-api base URL */
	apiUrl: string;
	/** HOBO_HOME the fixtures were seeded into */
	hoboHome: string;
	/** True when the control-api world simulator is on. */
	demo: boolean;
	/**
	 * URL for the game page. Defaults to `?test=1&seed=42&api=<apiUrl>`;
	 * extra params (e.g. `{ scenario: "quiet-yard" }`) are merged in, and
	 * passing `test: false` drops the seam's deterministic test mode.
	 */
	gameUrl(params?: GameUrlParams): string;
	/** URL for the standalone animation harness page. */
	animUrl(): string;
	close(): Promise<void>;
}>;

/** Seed the same management fixtures the evidence tour uses. */
function seedManagementFixtures(hoboHome: string): void {
	const ctx = createManagementContext({ hoboHome });
	stationInit(ctx, { name: "local", tenant: "local" });
	stationUp(ctx, "station:local");
	const pub = stationRailsPublish(ctx, {
		stationId: "station:local",
		id: "rail-prod",
		name: "prod",
		version: "1.0.0",
	});
	// SAFETY: `const hash = String((pub.data as { contentHash: string }).contentHash);` is required at this I/O or test boundary.
	const hash = String((pub.data as { contentHash: string }).contentHash);
	stationRailsApprove(ctx, { stationId: "station:local", hashOrId: hash });
	stationRailsActivate(ctx, { stationId: "station:local", hashOrId: hash });
	connectionCreate(ctx, {
		provider: "asana",
		alias: "work",
		stationId: "station:local",
	});
	connectionAuthorize(ctx, { idOrAlias: "work" });
}

export async function startHarness(
	options: HarnessOptions = {},
): Promise<Harness> {
	const demo = options.demo ?? false;
	const seedFixtures = options.seedFixtures ?? true;

	const bundle = await ensureBundle();
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-yard-e2e-"));
	mkdirSync(hoboHome, { recursive: true });
	if (seedFixtures) seedManagementFixtures(hoboHome);

	const api = await createControlApiServer({
		hoboHome,
		port: 0,
		host: "127.0.0.1",
		demo,
		// Deterministic: no wall-clock simulator timer during assertions.
		demoIntervalMs: 0,
	});

	const publicHandler = staticHandler(PUBLIC);
	const assetsHandler = staticHandler(ASSETS);
	const staticSrv: Server = createServer((req, res) => {
		const url = req.url || "/";
		const path = url.split("?")[0] ?? "/";
		if (path === "/dist/yard.js") {
			res.writeHead(200, {
				// SAFETY: `"content-type": MIME[".js"] as string,` is required at this I/O or test boundary.
				"content-type": MIME[".js"] as string,
				"cache-control": "no-store",
			});
			res.end(readFileSync(bundle));
			return;
		}
		if (path.startsWith("/assets/")) {
			req.url = url.slice("/assets".length) || "/";
			assetsHandler(req, res);
			return;
		}
		publicHandler(req, res);
	});
	await new Promise<void>((resolve) =>
		staticSrv.listen(0, "127.0.0.1", () => resolve()),
	);
	const addr = staticSrv.address();
	if (!addr || isJsonString(addr)) throw new Error("static bind failed");
	const origin = `http://127.0.0.1:${addr.port}`;

	return Object.freeze({
		origin,
		apiUrl: api.url,
		hoboHome,
		demo,
		gameUrl(params: GameUrlParams = {}): string {
			const search = new URLSearchParams();
			const merged: GameUrlParams = {
				test: 1,
				seed: 42,
				api: api.url,
				...params,
			};
			for (const [key, value] of Object.entries(merged)) {
				if (value === false || value === undefined || value === null) continue;
				search.set(key, String(value));
			}
			return `${origin}/?${search.toString()}`;
		},
		animUrl: () => `${origin}/anim-test.html`,
		async close(): Promise<void> {
			await api.close();
			await new Promise<void>((resolve) => staticSrv.close(() => resolve()));
			rmSync(hoboHome, { recursive: true, force: true });
		},
	});
}
