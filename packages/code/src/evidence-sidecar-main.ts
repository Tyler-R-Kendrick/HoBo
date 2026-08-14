/**
 * Detached Station Evidence worker. Occupancy owns this process;
 * the hobo-code TTY / Bindle /dev / session.complete() must not.
 */
import { writeFileSync } from "node:fs";

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
