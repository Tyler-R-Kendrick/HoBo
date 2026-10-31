import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { constants, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
	stationRoot,
} from "@hobo/stations";
import { afterEach, describe, expect, it } from "vitest";

import { type JsonObject, parseJsonObject } from "../src/json.js";
import { testEnv } from "./test-env.js";

// The interactive shell's `/sessions serve --host <machine>` opens a Station
// authorization and runs a forward over it, as `hobo-code session serve
// --host` does. The shell holds the ending signals across it, as the entry
// does: SIGTERM or SIGHUP to hobo-code while the forward runs closes the
// authorization, saying `shell-quit`, stops ssh, and the shell ends by the
// signal. Here the shell runs as a person runs it, under util-linux script(1),
// against a real Station, with a stand-in `ssh` that runs until signalled.

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(pkgRoot, "bin", "hobo-code.mjs");
const STATION = "station:local";
const ESC = String.fromCharCode(0x1b);
const SHELL_DRAWN = `${ESC}[?1049h`;
const CONTROL_SEQUENCES = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "gu");
/**
 * A preload that hands its process each SIGTERM 300 ms late, as a loaded
 * machine can: the launcher passes the signal on late, and hobo-code hears it
 * only after what else the group signal reached (ssh) has ended.
 */
const LATE_SIGTERM = `const emit = process.emit;
process.emit = function (event, ...rest) {
	if (event !== "SIGTERM") return emit.call(this, event, ...rest);
	setTimeout(() => emit.call(process, event, ...rest), 300);
	return process.listenerCount(event) > 0;
};
`;
/** Bounds on a failure, never waits to sit out: each step goes on at its event. */
const STEP_BOUND_MS = 60_000;
const RUN_TIMEOUT_MS = 4 * STEP_BOUND_MS;

function needsScript(): string | false {
	const probe = spawnSync("script", ["--version"], { encoding: "utf8" });
	if (probe.error !== undefined) return "needs util-linux script(1)";
	return /util-linux/u.test(`${probe.stdout}${probe.stderr}`)
		? false
		: "needs util-linux script(1)";
}
const skipReason = needsScript();

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

/** The Station's audit, as `type` or `type(reason)` for a session's end. */
function audit(hoboHome: string): readonly string[] {
	const path = join(stationRoot(hoboHome, STATION), "pam-audit.jsonl");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line): JsonObject => parseJsonObject(line))
		.map((event) =>
			event.type === "pam.SessionEnded"
				? `${String(event.type)}(${String(event.reason)})`
				: String(event.type),
		);
}

interface Ended {
	/** hobo-code's status, as the terminal's shell saw it. */
	readonly code: number | null;
	readonly audit: readonly string[];
	readonly sshEnded: boolean;
	readonly sockets: readonly string[];
	readonly screen: string;
}

/**
 * Start hobo-code's shell, run `/sessions serve --host box` in it, and once
 * the stand-in ssh runs, send hobo-code `signal`.
 */
async function forwardInShellThenSignal(
	signal: "SIGTERM" | "SIGHUP",
	options: { readonly lateSignal?: boolean } = {},
): Promise<Ended> {
	// Short paths: the Station's agent proxy is a Unix socket under HOBO_HOME.
	const root = mkdtempSync(join(tmpdir(), "z"));
	roots.push(root);
	const at = (name: string): string => join(root, name);
	const hoboHome = at("h");
	const project = at("p");
	const bin = at("b");
	const tmp = at("t");
	const tmux = at("x");
	for (const dir of [project, bin, tmp, tmux]) mkdirSync(dir);
	stationWithPam(hoboHome);
	writeFileSync(
		join(project, "devenv.machines.json"),
		`${JSON.stringify({
			machines: [
				{ id: "box", host: "box.ts.net", isolationClass: "development" },
			],
		})}\n`,
	);
	writeFileSync(
		join(bin, "ssh"),
		`#!/bin/sh\necho $$ > '${at("ssh.pid")}'\nwhile :; do sleep 0.1; done\n`,
	);
	chmodSync(join(bin, "ssh"), 0o755);
	writeFileSync(at("late.mjs"), LATE_SIGTERM);
	const agentSocket = at("a.sock");
	const agent = createServer((socket) => socket.end());
	servers.push(agent);
	await new Promise<void>((resolve) => agent.listen(agentSocket, resolve));
	const command = [
		"stty cols 120 rows 40",
		`sh -c "echo \\$\\$ > '${at("pid")}'; exec '${process.execPath}' '${launcher}'"`,
		`echo $? > '${at("status")}'`,
		`while [ ! -e '${at("done")}' ]; do sleep 0.1; done`,
	].join("; ");
	const script = spawn("script", ["-qfec", command, "/dev/null"], {
		cwd: project,
		env: testEnv({
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			HOME: root,
			HOBO_HOME: hoboHome,
			TMPDIR: tmp,
			TMUX_TMPDIR: tmux,
			SSH_AUTH_SOCK: agentSocket,
			TERM: "xterm-256color",
			HOBO_CODE_ENGINE: "none",
			HOBO_CODE_FROM_SOURCE: "0",
			HOBO_CODE_SKIP_STALE_REBUILD: "1",
			HOBO_CODE_REDUCED_MOTION: "1",
			HOBO_CODE_SIDECAR_POLL_MS: "250",
			NODE_NO_WARNINGS: "1",
			...(options.lateSignal === true
				? { NODE_OPTIONS: `--import=${pathToFileURL(at("late.mjs")).href}` }
				: undefined),
		}),
		stdio: ["pipe", "pipe", "pipe"],
	});
	let screen = "";
	const draw = (chunk: Buffer): void => {
		screen = `${screen}${chunk.toString("utf8")}`.slice(-64 * 1024);
	};
	script.stdout.on("data", draw);
	script.stderr.on("data", draw);
	let closed = false;
	script.once("close", () => {
		closed = true;
	});
	const sockets = (): readonly string[] => {
		const dir = join(stationRoot(hoboHome, STATION), "ssh-agent");
		return existsSync(dir) ? readdirSync(dir) : [];
	};
	try {
		if (
			!(await until(
				() => closed || screen.includes(SHELL_DRAWN),
				STEP_BOUND_MS,
			))
		)
			throw new Error(
				`the shell never drew:\n${screen.replace(CONTROL_SEQUENCES, "").slice(-2000)}`,
			);
		script.stdin.write(
			`/sessions serve --host box --port 4242 --station ${STATION}`,
		);
		await sleep(500);
		script.stdin.write("\r");
		if (!(await until(() => existsSync(at("ssh.pid")), STEP_BOUND_MS)))
			throw new Error(
				`ssh never started:\n${screen.replace(CONTROL_SEQUENCES, "").slice(-2000)}`,
			);
		const ssh = Number(readFileSync(at("ssh.pid"), "utf8"));
		standIns.push(ssh);
		process.kill(Number(readFileSync(at("pid"), "utf8")), signal);
		await until(() => existsSync(at("status")), STEP_BOUND_MS);
		await until(() => !running(ssh), STEP_BOUND_MS);
		return {
			code: existsSync(at("status"))
				? Number(readFileSync(at("status"), "utf8").trim())
				: null,
			audit: audit(hoboHome),
			sshEnded: !running(ssh),
			sockets: sockets(),
			screen: screen.replace(CONTROL_SEQUENCES, ""),
		};
	} finally {
		writeFileSync(at("done"), "");
		if (!(await until(() => closed, STEP_BOUND_MS))) script.kill("SIGKILL");
		spawnSync("tmux", ["kill-server"], {
			env: { PATH: process.env.PATH ?? "", TMUX_TMPDIR: tmux },
			stdio: "ignore",
		});
	}
}

describe.skipIf(skipReason !== false)(
	"hobo-code's shell, signalled while its /sessions serve --host forward runs",
	() => {
		for (const signal of ["SIGTERM", "SIGHUP"] as const) {
			it(
				`${signal}: closes the authorization saying shell-quit, stops ssh, and ends by the signal`,
				async () => {
					const ended = await forwardInShellThenSignal(signal);
					expect(ended.audit, ended.screen.slice(-2000)).toEqual([
						"pam.GatewayStarted",
						"pam.SessionStarted",
						"pam.SessionEnded(shell-quit)",
						"pam.GatewayStopped",
					]);
					expect(ended.sshEnded).toBe(true);
					expect(ended.sockets).toEqual([]);
					expect(ended.code).toBe(128 + constants.signals[signal]);
				},
				RUN_TIMEOUT_MS,
			);
		}

		it(
			"SIGTERM that hobo-code hears only once the group signal has ended ssh: still shell-quit, and ends by the signal",
			async () => {
				const ended = await forwardInShellThenSignal("SIGTERM", {
					lateSignal: true,
				});
				expect(ended.audit, ended.screen.slice(-2000)).toEqual([
					"pam.GatewayStarted",
					"pam.SessionStarted",
					"pam.SessionEnded(shell-quit)",
					"pam.GatewayStopped",
				]);
				expect(ended.sshEnded).toBe(true);
				expect(ended.sockets).toEqual([]);
				expect(ended.code).toBe(128 + constants.signals.SIGTERM);
			},
			RUN_TIMEOUT_MS,
		);
	},
);
