import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { startSessionControlServer } from "./session-control-server.js";

export interface DevBrowserSessionOptions {
	readonly projectDir: string;
	readonly hoboHome: string;
	readonly appPort?: number;
	readonly debugPort?: number;
	readonly sessionId?: string;
	readonly hoboBin?: string;
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
	readonly close: () => Promise<void>;
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
			const listen = /hobo dev: listening on (https?:\/\/\S+)/u.exec(output);
			if (listen?.[1]) appUrl = listen[1];
			const named = /named=(https?:\/\/\S+)/u.exec(output);
			if (named?.[1]) namedUrl = named[1];
			maybeFinish();
		};
		child.stdout.on("data", inspect);
		child.stderr.on("data", inspect);
		child.once("error", (error) => finish(error));
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
	const evidence = await startSessionControlServer({
		hoboHome: options.hoboHome,
		projectRoot: projectDir,
		port: options.debugPort ?? 4174,
	});
	const controlsTemplate = new URL(evidence.controlsUrlTemplate);
	controlsTemplate.searchParams.set("sessionId", sessionId);
	const env = { ...process.env, ...options.env };
	const stationId = options.stationId ?? env.HOBO_STATION;
	const tenant = options.tenant ?? env.HOBO_TENANT;
	const environment = options.environment ?? env.HOBO_ENV;
	const child = spawn(
		options.hoboBin ?? env.HOBO_CODE_HOBO_BIN ?? env.HOBO_BIN ?? "hobo",
		["dev", "--cwd", projectDir, "--port", String(options.appPort ?? 4173)],
		{
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
		},
	);

	try {
		const started = await waitForAppUrl(
			child,
			options.startupTimeoutMs ?? 60_000,
		);
		const controlsUrl = evidence.controlsUrl(
			new URL(started.appUrl).origin,
			sessionId,
		);
		let closed = false;
		return {
			sessionId,
			appUrl: started.appUrl,
			debugUrl: started.appUrl,
			controlsUrl,
			reportUrl: evidence.reportUrl,
			evidencePath: join(options.hoboHome, "durable", "code", "evidence"),
			...(started.namedUrl !== undefined ? { namedUrl: started.namedUrl } : {}),
			...(stationId ? { stationId } : {}),
			...(environment ? { environment } : {}),
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
