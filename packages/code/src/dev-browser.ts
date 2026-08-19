import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	explicitHoboBinOverride,
	loadServeProjectOnLocalYard,
	resolveHoboBin,
} from "./composed-hobo.js";
import { debugViewUrl } from "./evidence-overlay.js";
import { linkGeneratedAppRuntime } from "./generated-app-runtime.js";
import { preferNamedEndpoint } from "./occupancy-endpoints.js";
import { attachStationSidecars } from "./station-sidecars.js";

export { resolveHoboBin } from "./composed-hobo.js";

export interface DevBrowserSessionOptions {
	readonly projectDir: string;
	readonly hoboHome: string;
	readonly appPort?: number;
	readonly debugPort?: number;
	readonly sessionId?: string;
	readonly hoboBin?: string;
	/** Walk-up start for workspace `hobo` discovery. Tests pass a fake tree. */
	readonly from?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly stationId?: string;
	readonly tenant?: string;
	readonly environment?: string;
	readonly startupTimeoutMs?: number;
}

export interface DevBrowserSession {
	readonly sessionId: string;
	readonly appUrl: string;
	readonly debugUrl: string;
	readonly controlsUrl: string;
	readonly reportUrl: string;
	readonly evidencePath: string;
	readonly namedUrl?: string;
	readonly stationId?: string;
	readonly environment?: string;
	readonly pid?: number;
	readonly close: () => Promise<void>;
}

/**
 * How the rare child-process escape hatch spawns composed `hobo`.
 * Prefer in-process `serveProjectOnLocalYard` / `runComposedHobo` — spawn only
 * when `HOBO_CODE_HOBO_BIN` / `HOBO_BIN` / `hoboBin` is set explicitly.
 */
export function resolveHoboSpawn(options: {
	readonly env?: NodeJS.ProcessEnv;
	readonly from?: string;
	readonly hoboBin?: string;
	readonly argv?: readonly string[];
}): {
	readonly command: string;
	readonly args: readonly string[];
	readonly bin: string;
} {
	const bin =
		options.hoboBin ??
		resolveHoboBin({
			...(options.env !== undefined ? { env: options.env } : {}),
			...(options.from !== undefined ? { from: options.from } : {}),
		});
	const argv = options.argv ?? [];
	if (spawnsViaNode(bin)) {
		const tsx = resolveTsxLoader(bin);
		const prefix = tsx !== undefined ? ["--import", tsx] : [];
		return { command: process.execPath, args: [...prefix, bin, ...argv], bin };
	}
	return { command: bin, args: argv, bin };
}

function resolveTsxLoader(hoboBin: string): string | undefined {
	let dir = dirname(hoboBin);
	for (let i = 0; i < 8; i += 1) {
		const loader = join(dir, "node_modules", "tsx", "dist", "loader.mjs");
		if (existsSync(loader)) return loader;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	const repo = dirname(fileURLToPath(import.meta.url));
	let walk = repo;
	for (let i = 0; i < 8; i += 1) {
		const loader = join(walk, "node_modules", "tsx", "dist", "loader.mjs");
		if (existsSync(loader)) return loader;
		const parent = dirname(walk);
		if (parent === walk) break;
		walk = parent;
	}
	return undefined;
}

function spawnsViaNode(bin: string): boolean {
	if (/\.(m?js|cjs)$/u.test(bin)) return true;
	if (!bin.includes("/") && !bin.includes("\\")) return false;
	if (!existsSync(bin)) return false;
	try {
		return /^#!.*\bnode\b/u.test(readFileSync(bin, "utf8").slice(0, 80));
	} catch {
		return false;
	}
}

/** Exported for tests: never accept a :0 listen URL as a real endpoint. */
export function extractListenUrl(output: string): string | undefined {
	const candidates = [
		...output.matchAll(/hobo dev: listening on (https?:\/\/[^\s)]+)/gu),
		...output.matchAll(/Yard exposed \S+ at (https?:\/\/127\.0\.0\.1:\d+)/gu),
		...output.matchAll(/at (https?:\/\/127\.0\.0\.1:[1-9]\d*)/gu),
	].map((match) => match[1]);
	return candidates.find(
		(url) => url !== undefined && !/:0(?:\/|$)/u.test(url),
	);
}

async function allocateLoopbackPort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port =
				address !== null && typeof address === "object" ? address.port : 0;
			server.close((error) => {
				if (error) reject(error);
				else if (port <= 0)
					reject(new Error("could not allocate a loopback port"));
				else resolvePort(port);
			});
		});
	});
}

function waitForAppUrl(
	child: ChildProcessWithoutNullStreams,
	timeoutMs: number,
): Promise<{ readonly appUrl: string; readonly namedUrl?: string }> {
	return new Promise((resolveUrl, reject) => {
		let output = "";
		let settled = false;
		let appUrl: string | undefined;
		let namedUrl: string | undefined;
		let grace: ReturnType<typeof setTimeout> | undefined;
		const finish = (
			error?: Error,
			urls?: { readonly appUrl: string; readonly namedUrl?: string },
		): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (grace) clearTimeout(grace);
			if (error) reject(error);
			else if (urls) resolveUrl(urls);
			else reject(new Error("hobo dev did not report a URL"));
		};
		const maybeFinish = (): void => {
			if (!appUrl) return;
			if (namedUrl) finish(undefined, { appUrl, namedUrl });
			else {
				grace ??= setTimeout(() => {
					if (!appUrl) return;
					finish(undefined, namedUrl ? { appUrl, namedUrl } : { appUrl });
				}, 400);
			}
		};
		const inspect = (chunk: Buffer): void => {
			output = `${output}${chunk.toString("utf8")}`.slice(-8192);
			const listen = extractListenUrl(output);
			if (listen) appUrl = listen;
			const named = /named=(https?:\/\/[^\s)]+)/u.exec(output);
			if (named?.[1] && !/:0(?:\/|$)/u.test(named[1])) namedUrl = named[1];
			maybeFinish();
		};
		child.stdout.on("data", inspect);
		child.stderr.on("data", inspect);
		child.once("error", (error) => {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				finish(
					new Error(
						`hobo override binary not found (${err.path ?? "hobo"}). Unset HOBO_CODE_HOBO_BIN to use in-process @hobo/hobo, or point it at a real binary`,
					),
				);
				return;
			}
			finish(error);
		});
		child.once("exit", (code, signal) =>
			finish(
				new Error(
					`hobo dev exited before serving (${signal ?? code ?? "unknown"})${output.trim() ? `: ${output.trim()}` : ""}`,
				),
			),
		);
		const timer = setTimeout(
			() =>
				finish(
					new Error(
						`hobo dev did not start within ${timeoutMs}ms${output.trim() ? `: ${output.trim()}` : ""}`,
					),
				),
			timeoutMs,
		);
	});
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolveExit) => {
		const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
		child.once("exit", () => {
			clearTimeout(force);
			resolveExit();
		});
		child.kill("SIGTERM");
	});
}

/** Run the project's real Bindle on its local Yard and attach Evidence controls. */
export async function startDevBrowserSession(
	options: DevBrowserSessionOptions,
): Promise<DevBrowserSession> {
	const sessionId = options.sessionId ?? `dev-${randomUUID()}`;
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(sessionId)) {
		throw new Error("hobo-code dev session id is invalid");
	}
	const projectDir = resolve(options.projectDir);
	linkGeneratedAppRuntime(projectDir);
	const occupied = await attachStationSidecars({
		hoboHome: options.hoboHome,
		projectRoot: projectDir,
		...(options.env !== undefined ? { env: options.env } : {}),
		...(options.debugPort !== undefined
			? { evidencePort: options.debugPort }
			: {}),
	});
	const evidence = {
		port: Number(new URL(occupied.evidenceUrl).port),
		token: "",
		url: occupied.evidenceUrl,
		reportUrl: occupied.evidenceReportUrl,
		controlsUrlTemplate: occupied.evidenceControlsUrl,
		controlsUrl: (parentOrigin: string, sid?: string) => {
			const url = new URL(occupied.evidenceControlsUrl);
			url.searchParams.set("parentOrigin", parentOrigin);
			if (sid) url.searchParams.set("sessionId", sid);
			return url.href;
		},
		close: async () => {},
	};
	const controlsTemplate = new URL(evidence.controlsUrlTemplate);
	controlsTemplate.searchParams.set("sessionId", sessionId);
	const env = { ...process.env, ...options.env };
	const stationId = options.stationId ?? env.HOBO_STATION;
	const tenant = options.tenant ?? env.HOBO_TENANT;
	const environment = options.environment ?? env.HOBO_ENV;
	const appPort =
		options.appPort !== undefined && options.appPort > 0
			? options.appPort
			: await allocateLoopbackPort();
	const forceSpawn =
		options.hoboBin !== undefined || explicitHoboBinOverride(env) !== undefined;

	if (!forceSpawn) {
		return startDevBrowserSessionInProcess({
			sessionId,
			projectDir,
			appPort,
			env,
			options,
			evidence,
			controlsTemplateHref: controlsTemplate.href,
			...(stationId ? { stationId } : {}),
			...(tenant ? { tenant } : {}),
			...(environment ? { environment } : {}),
		});
	}

	const spawned = resolveHoboSpawn({
		env,
		...(options.hoboBin !== undefined ? { hoboBin: options.hoboBin } : {}),
		...(options.from !== undefined ? { from: options.from } : {}),
		argv: ["dev", "--cwd", projectDir, "--port", String(appPort)],
	});
	const child = spawn(spawned.command, [...spawned.args], {
		cwd: projectDir,
		env: {
			...env,
			HOBO_HOME: options.hoboHome,
			HOBO_CODE_DEV_BRIDGE: "1",
			HOBO_CODE_EVIDENCE_CONTROLS_URL: controlsTemplate.href,
			...(stationId ? { HOBO_STATION: stationId } : {}),
			...(tenant ? { HOBO_TENANT: tenant } : {}),
			...(environment ? { HOBO_ENV: environment } : {}),
		},
		stdio: ["pipe", "pipe", "pipe"],
	});

	try {
		const started = await waitForAppUrl(
			child,
			options.startupTimeoutMs ?? 60_000,
		);
		const publicApp =
			started.namedUrl ?? preferNamedEndpoint(started.appUrl, "web");
		const controlsUrl = evidence.controlsUrl(
			new URL(publicApp).origin,
			sessionId,
		);
		let closed = false;
		return {
			sessionId,
			appUrl: started.appUrl,
			debugUrl: debugViewUrl(started.namedUrl ?? started.appUrl),
			controlsUrl,
			reportUrl: evidence.reportUrl,
			evidencePath: join(options.hoboHome, "durable", "code", "evidence"),
			...(started.namedUrl !== undefined ? { namedUrl: started.namedUrl } : {}),
			...(stationId ? { stationId } : {}),
			...(environment ? { environment } : {}),
			...(child.pid !== undefined ? { pid: child.pid } : {}),
			close: async () => {
				if (closed) return;
				closed = true;
				await stop(child);
				await evidence.close();
			},
		};
	} catch (error) {
		await stop(child);
		await evidence.close();
		throw error;
	}
}

async function startDevBrowserSessionInProcess(input: {
	readonly sessionId: string;
	readonly projectDir: string;
	readonly appPort: number;
	readonly env: NodeJS.ProcessEnv;
	readonly options: DevBrowserSessionOptions;
	readonly evidence: {
		readonly reportUrl: string;
		readonly controlsUrl: (parentOrigin: string, sid?: string) => string;
		readonly close: () => Promise<void>;
	};
	readonly controlsTemplateHref: string;
	readonly stationId?: string;
	readonly tenant?: string;
	readonly environment?: string;
}): Promise<DevBrowserSession> {
	const previous = { ...process.env };
	Object.assign(process.env, {
		...input.env,
		HOBO_HOME: input.options.hoboHome,
		HOBO_CODE_DEV_BRIDGE: "1",
		HOBO_CODE_EVIDENCE_CONTROLS_URL: input.controlsTemplateHref,
		...(input.stationId ? { HOBO_STATION: input.stationId } : {}),
		...(input.tenant ? { HOBO_TENANT: input.tenant } : {}),
		...(input.environment ? { HOBO_ENV: input.environment } : {}),
	});
	try {
		const serveProjectOnLocalYard = await loadServeProjectOnLocalYard(
			input.options.from,
		);
		const timeoutMs = input.options.startupTimeoutMs ?? 60_000;
		const serve = await Promise.race([
			serveProjectOnLocalYard({
				projectDir: input.projectDir,
				port: input.appPort,
				hoboHome: input.options.hoboHome,
				emitProgress: () => {},
			}),
			new Promise<never>((_, reject) => {
				setTimeout(
					() =>
						reject(
							new Error(
								`hobo-code dev (in-process serve) did not start within ${timeoutMs}ms`,
							),
						),
					timeoutMs,
				);
			}),
		]);
		const namedCandidate =
			typeof serve.primaryNamedUrl === "string" &&
			serve.primaryNamedUrl.length > 0 &&
			!/:0(?:\/|$)/u.test(serve.primaryNamedUrl)
				? serve.primaryNamedUrl
				: serve.namedEndpoints?.find((row) => row.external)?.url;
		const namedUrl =
			namedCandidate !== undefined && !/:0(?:\/|$)/u.test(namedCandidate)
				? namedCandidate
				: undefined;
		const appUrl = serve.primaryUrl;
		if (!appUrl || /:0(?:\/|$)/u.test(appUrl)) {
			await serve.close();
			await input.evidence.close();
			throw new Error(
				`hobo-code dev serve returned an invalid URL (${appUrl ?? "missing"})`,
			);
		}
		const publicApp = namedUrl ?? preferNamedEndpoint(appUrl, "web");
		const controlsUrl = input.evidence.controlsUrl(
			new URL(publicApp).origin,
			input.sessionId,
		);
		let closed = false;
		return {
			sessionId: input.sessionId,
			appUrl,
			debugUrl: debugViewUrl(namedUrl ?? appUrl),
			controlsUrl,
			reportUrl: input.evidence.reportUrl,
			evidencePath: join(input.options.hoboHome, "durable", "code", "evidence"),
			...(namedUrl !== undefined ? { namedUrl } : {}),
			...(input.stationId ? { stationId: input.stationId } : {}),
			...(input.environment ? { environment: input.environment } : {}),
			close: async () => {
				if (closed) return;
				closed = true;
				await serve.close();
				await input.evidence.close();
			},
		};
	} catch (error) {
		await input.evidence.close();
		throw error;
	} finally {
		for (const key of Object.keys(process.env)) {
			if (!(key in previous)) delete process.env[key];
		}
		Object.assign(process.env, previous);
	}
}
