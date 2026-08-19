/**
 * Detached Station Evidence worker. Occupancy owns this process;
 * the hobo-code TTY / Bindle /dev / session.complete() must not.
 */
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { startSessionControlServer } from "./session-control-server.js";

const hoboHome = process.env.HOBO_HOME?.trim();
const readyPath = process.env.HOBO_CODE_SIDECAR_READY?.trim();
const projectRoot = process.env.HOBO_CODE_SIDECAR_ROOT?.trim() || process.cwd();
if (!hoboHome || !readyPath) {
	process.stderr.write(
		"evidence sidecar requires HOBO_HOME and HOBO_CODE_SIDECAR_READY\n",
	);
	process.exit(1);
}

const requested = Number.parseInt(
	process.env.HOBO_CODE_EVIDENCE_PORT ?? "8788",
	10,
);
const port =
	Number.isInteger(requested) && requested >= 0 && requested <= 65_535
		? requested
		: 8788;

const server = await startSessionControlServer({
	hoboHome,
	projectRoot,
	port,
}).catch(() =>
	startSessionControlServer({
		hoboHome,
		projectRoot,
		port: 0,
	}),
);

writeFileSync(
	readyPath,
	`${JSON.stringify({
		url: server.url,
		reportUrl: server.reportUrl,
		controlsUrl: server.controlsUrlTemplate,
		pid: process.pid,
	})}\n`,
	{ mode: 0o600 },
);

const shutdown = (): void => {
	void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

/**
 * Reaper. This worker is deliberately spawned `detached` and `unref`ed so it
 * outlives the hobo session that started it — `station-sidecars.test.ts`
 * asserts exactly that — which also means nothing in the OS will ever collect
 * it. A vitest worker killed mid-file orphans a ~135 MB sidecar permanently,
 * and a machine that runs the sweep repeatedly accumulates them until builds
 * start getting OOM-killed.
 *
 * A Station Evidence worker exists to serve one Station home, so when that home
 * is gone its reason to run is gone: poll for the directory and exit with it.
 * Homes under the OS temp directory are ephemeral by construction (every test
 * builds one with `mkdtemp`), so those additionally get a hard lifetime cap for
 * the case where the worker died hard enough that its home was never cleaned
 * up. A durable home — `~/.hobo` and friends — is never capped.
 */
const DEFAULT_POLL_MS = 30_000;
const EPHEMERAL_MAX_MS = 30 * 60 * 1000;

function positiveIntEnv(name: string): number | undefined {
	const parsed = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const home = resolve(hoboHome);
const ephemeral = home.startsWith(`${resolve(tmpdir())}/`);
const maxMs = positiveIntEnv("HOBO_CODE_SIDECAR_MAX_MS");
const deadline =
	maxMs !== undefined
		? Date.now() + maxMs
		: ephemeral
			? Date.now() + EPHEMERAL_MAX_MS
			: undefined;
const pollMs =
	positiveIntEnv("HOBO_CODE_SIDECAR_POLL_MS") ??
	(deadline === undefined
		? DEFAULT_POLL_MS
		: Math.max(50, Math.min(DEFAULT_POLL_MS, deadline - Date.now())));

const reaper = setInterval(() => {
	if (!existsSync(home)) {
		shutdown();
		return;
	}
	if (deadline !== undefined && Date.now() >= deadline) {
		shutdown();
	}
}, pollMs);
reaper.unref();
