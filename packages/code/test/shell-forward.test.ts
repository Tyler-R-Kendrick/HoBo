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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
	stationRoot,
} from "@hobo/stations";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellHost } from "../src/interactive-shell.js";
import { slashItemForInput } from "../src/interactive-shell.js";
import { type JsonObject, parseJsonObject } from "../src/json.js";
import { openStationGateway } from "../src/machine-sessions.js";
import { createDefaultShellHost } from "../src/shell-host.js";

// The interactive shell's `/sessions serve --host <machine>` runs the same
// verb as `hobo-code session serve --host`, which opens a Station
// authorization and hands it, with the forward, to its caller. The shell is
// that caller: it must run the forward and close the authorization however
// the forward ends, its own exit included. It printed the hand-off and ran
// nothing, and the authorization stayed open with a live agent socket.

const STATION = "station:local";

const roots: string[] = [];
const servers: Server[] = [];
const hosts: ShellHost[] = [];
const standIns: number[] = [];
afterEach(async () => {
	for (const host of hosts.splice(0)) await host.dispose?.();
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
		await sleep(50);
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

const CLOSED = [
	"pam.GatewayStarted",
	"pam.SessionStarted",
	"pam.SessionEnded(gateway-stop)",
	"pam.GatewayStopped",
];

/**
 * A shell host over a real local Station, a declared machine `box`, and a
 * stand-in `ssh` on its PATH that runs until it is released or signalled.
 */
async function shell(options: { readonly ssh?: boolean } = {}) {
	const root = mkdtempSync(join(tmpdir(), "s"));
	roots.push(root);
	const hoboHome = join(root, "h");
	const project = join(root, "p");
	const bin = join(root, "b");
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
	const pidFile = join(root, "ssh.pid");
	const release = join(root, "ssh.release");
	if (options.ssh !== false) {
		writeFileSync(
			join(bin, "ssh"),
			`#!/bin/sh\necho $$ > '${pidFile}'\nwhile [ ! -e '${release}' ]; do sleep 0.1; done\nexit 0\n`,
		);
		chmodSync(join(bin, "ssh"), 0o755);
	}
	const agentSocket = join(root, "a.sock");
	const agent = createServer((socket) => socket.end());
	servers.push(agent);
	await new Promise<void>((resolve) => agent.listen(agentSocket, resolve));
	const closes: (string | undefined)[] = [];
	const host = createDefaultShellHost({
		hoboHome,
		cwd: project,
		env: {
			// No stand-in: no ssh at all, so the forward cannot start one.
			PATH: options.ssh === false ? bin : `${bin}:/usr/bin:/bin`,
			HOBO_HOME: hoboHome,
		},
		openStationGateway: async (context) => {
			const gateway = await openStationGateway({
				...context,
				sshAuthSock: agentSocket,
			});
			return {
				...gateway,
				close: async (reason) => {
					closes.push(reason);
					await gateway.close(reason);
				},
			};
		},
	});
	hosts.push(host);
	const sockets = (): readonly string[] => {
		const dir = join(stationRoot(hoboHome, STATION), "ssh-agent");
		return existsSync(dir) ? readdirSync(dir) : [];
	};
	const sshPid = (): number | undefined => {
		if (!existsSync(pidFile)) return undefined;
		const pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
		if (!standIns.includes(pid)) standIns.push(pid);
		return pid;
	};
	return { host, hoboHome, closes, release, sockets, sshPid };
}

async function serveInShell(host: ShellHost): Promise<string> {
	const item = slashItemForInput(
		`/sessions serve --host box --port 4242 --station ${STATION}`,
	);
	expect(item?.argv).toEqual([
		"session",
		"serve",
		"--host",
		"box",
		"--port",
		"4242",
		"--station",
		STATION,
	]);
	return host.runVerb(item?.argv ?? []);
}

describe("the shell's /sessions serve --host", () => {
	it("forwards, and its exit closes the authorization and ends ssh", async () => {
		const s = await shell();
		const text = await serveInShell(s.host);
		expect(text).toMatch(/^browser: /mu);
		expect(await until(() => s.sshPid() !== undefined, 30_000)).toBe(true);
		const ssh = s.sshPid() ?? 0;
		expect(running(ssh)).toBe(true);
		await s.host.dispose?.();
		expect(s.closes).toEqual([undefined]);
		expect(audit(s.hoboHome)).toEqual(CLOSED);
		expect(await until(() => !running(ssh), 10_000)).toBe(true);
		expect(s.sockets()).toEqual([]);
	}, 60_000);

	it("closes the authorization when ssh ends by itself", async () => {
		const s = await shell();
		await serveInShell(s.host);
		expect(await until(() => s.sshPid() !== undefined, 30_000)).toBe(true);
		writeFileSync(s.release, "");
		expect(await until(() => s.closes.length > 0, 30_000)).toBe(true);
		expect(audit(s.hoboHome)).toEqual(CLOSED);
		expect(s.sockets()).toEqual([]);
		await s.host.dispose?.();
		expect(s.closes).toEqual([undefined]);
	}, 60_000);

	it("closes the authorization when the forward cannot start ssh", async () => {
		const s = await shell({ ssh: false });
		await serveInShell(s.host);
		expect(await until(() => s.closes.length > 0, 30_000)).toBe(true);
		expect(audit(s.hoboHome)).toEqual(CLOSED);
		expect(s.sockets()).toEqual([]);
	}, 60_000);
});
