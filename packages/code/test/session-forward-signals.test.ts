import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
	stationRoot,
} from "@hobo/stations";
import { afterEach, describe, expect, it } from "vitest";

import { isJsonString, parseJsonObject } from "../src/json.js";

// `hobo-code session serve --host <machine>` forwards a resident browser over
// SSH under a Station authorization, and closes that authorization when the
// forward ends. However hobo-code is ended, it must close it, and its ssh
// must not outlive it. Here the Station is real, the machine is declared, and
// `ssh` is a stand-in on PATH that runs until it is told to stop.

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(pkgRoot, "bin", "hobo-code.mjs");
const STATION = "station:local";
const FORWARD_DEADLINE_MS = 120_000;
const END_GRACE_MS = 30_000;

const roots: string[] = [];
const servers: Server[] = [];
const standIns: number[] = [];
afterEach(async () => {
	for (const pid of standIns.splice(0)) {
		if (running(pid)) process.kill(pid, "SIGKILL");
	}
	for (const server of servers.splice(0)) {
		await new Promise((resolve) => server.close(resolve));
	}
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** The process exists and is not a zombie. */
function running(pid: number): boolean {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
	} catch {
		return false;
	}
}

async function until(done: () => boolean, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (!done()) {
		if (Date.now() > deadline) return false;
		await sleep(100);
	}
	return true;
}

/** A local Station whose active Rail enables privileged access. */
function stationWithPam(hoboHome: string): void {
	initStation({ hoboHome, id: STATION, tenant: "acme" });
	const service = StationService.fromEvents(
		loadStationEvents(hoboHome, STATION),
		{ stationId: STATION },
	);
	const rail = service.publishRail({
		id: "rail-pam",
		name: "PAM",
		version: "1.0.0",
		stationId: STATION,
		policyPacks: [PAM_RAIL_CAPABILITY],
	});
	service.approveRail(rail.contentHash);
	service.activateRail(rail.contentHash);
	persistStationEvents(hoboHome, STATION, service.events);
}

interface Forwarded {
	readonly forwarded: boolean;
	/** hobo-code's status, 128+n when it ended by signal n. */
	readonly code: number | null;
	/** The Station's durable audit types, in order. */
	readonly audit: readonly string[];
	readonly standInEnded: boolean;
	readonly output: string;
}

/**
 * Start the forward, and once the stand-in `ssh` runs, end hobo-code with
 * `signal`, or with "ssh ends" let the stand-in exit by itself.
 */
async function forwardThenEnd(
	ending: NodeJS.Signals | "ssh ends",
): Promise<Forwarded> {
	// Short paths: the Station's agent proxy is a Unix socket under HOBO_HOME.
	const root = mkdtempSync(join(tmpdir(), "f"));
	roots.push(root);
	const hoboHome = join(root, "h");
	const project = join(root, "p");
	const bin = join(root, "bin");
	mkdirSync(project);
	mkdirSync(bin);
	stationWithPam(hoboHome);
	writeFileSync(
		join(project, "devenv.machines.json"),
		`${JSON.stringify({
			machines: [
				{ id: "box", host: "box.ts.net", isolationClass: "development" },
			],
		})}\n`,
	);
	// The upstream agent the Station's lease-bound proxy fronts.
	const agentSocket = join(root, "a.sock");
	const agent = createServer((socket) => socket.end());
	servers.push(agent);
	await new Promise<void>((resolve) => agent.listen(agentSocket, resolve));
	const ssh = join(bin, "ssh");
	const pidFile = join(root, "ssh.pid");
	const release = join(root, "ssh.release");
	writeFileSync(
		ssh,
		`#!/bin/sh\necho $$ > '${pidFile}'\nwhile [ ! -e '${release}' ]; do sleep 0.1; done\nexit 0\n`,
	);
	chmodSync(ssh, 0o755);

	const run = spawn(
		process.execPath,
		[
			launcher,
			"session",
			"serve",
			"--host",
			"box",
			"--port",
			"4242",
			"--station",
			STATION,
		],
		{
			cwd: project,
			env: {
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				HOME: root,
				HOBO_HOME: hoboHome,
				TMPDIR: root,
				SSH_AUTH_SOCK: agentSocket,
				HOBO_CODE_FROM_SOURCE: "0",
				HOBO_CODE_SKIP_STALE_REBUILD: "1",
				NODE_NO_WARNINGS: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let output = "";
	run.stdout.on("data", (chunk) => {
		output = `${output}${chunk}`;
	});
	run.stderr.on("data", (chunk) => {
		output = `${output}${chunk}`;
	});
	let code: number | null = null;
	let closed = false;
	run.once("close", (status, signal) => {
		code = status ?? (signal === null ? null : -1);
		closed = true;
	});
	const forwarded = await until(
		() => closed || (/^browser: /mu.test(output) && existsSync(pidFile)),
		FORWARD_DEADLINE_MS,
	);
	let standIn: number | undefined;
	if (forwarded && !closed) {
		standIn = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
		standIns.push(standIn);
		if (ending === "ssh ends") writeFileSync(release, "");
		else run.kill(ending);
	}
	if (!(await until(() => closed, END_GRACE_MS))) run.kill("SIGKILL");
	await until(() => closed, END_GRACE_MS);
	const auditPath = join(stationRoot(hoboHome, STATION), "pam-audit.jsonl");
	const audit = existsSync(auditPath)
		? readFileSync(auditPath, "utf8")
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => {
					const type = parseJsonObject(line).type;
					return isJsonString(type) ? type : "";
				})
		: [];
	return {
		forwarded,
		code,
		audit,
		standInEnded: standIn !== undefined && !running(standIn),
		output,
	};
}

describe.skipIf(process.platform !== "linux")(
	"hobo-code forwarding a resident browser, ended",
	() => {
		for (const ending of [
			"SIGINT",
			"SIGTERM",
			"SIGHUP",
			"SIGQUIT",
			"ssh ends",
		] as const) {
			it(
				`by ${ending}: closes the Station authorization, and ssh is gone`,
				async () => {
					const ended = await forwardThenEnd(ending);
					expect(ended.forwarded, ended.output).toBe(true);
					expect(ended.audit, ended.output).toContain("pam.SessionStarted");
					expect(ended.audit, ended.output).toContain("pam.SessionEnded");
					expect(ended.standInEnded).toBe(true);
				},
				FORWARD_DEADLINE_MS + 3 * END_GRACE_MS,
			);
		}
	},
);
