/**
 * A remote pane used to be `ssh -t <whatever the user typed>` — an arbitrary
 * host, an ambient key, and no record. These tests pin the replacement: the
 * reachable set is declared, every field that reaches a command line is
 * allowlisted, and a malformed entry is reported rather than dropped.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
} from "@hobo/stations";
import { describe, expect, it } from "vitest";
import { runHoboCodeCli } from "../src/cli.js";
import {
	DEV_MACHINES_FILE,
	loadDevMachines,
	machinesForAgent,
	pamTarget,
	parseDevMachine,
	resolveMachine,
	sshDestination,
} from "../src/dev-machines.js";

function loader(contents: string) {
	return loadDevMachines(
		"/pkg",
		() => contents,
		(p) => p.endsWith(DEV_MACHINES_FILE),
	);
}

function enablePam(home: string): void {
	initStation({ hoboHome: home, id: "station:local", tenant: "local" });
	const service = StationService.fromEvents(
		loadStationEvents(home, "station:local"),
		{ stationId: "station:local" },
	);
	const rail = service.publishRail({
		id: "rail-pam",
		name: "PAM",
		version: "1.0.0",
		stationId: "station:local",
		policyPacks: [PAM_RAIL_CAPABILITY],
	});
	service.approveRail(rail.contentHash);
	service.activateRail(rail.contentHash);
	persistStationEvents(home, "station:local", service.events);
}

describe("declared dev machines", () => {
	it("reads the registry beside the devenv files", () => {
		const loaded = loader(
			JSON.stringify({
				schemaVersion: "hobo.code.dev-machines/v1",
				machines: [
					{
						id: "build-box",
						host: "build-box.tail1234.ts.net",
						isolationClass: "development",
					},
					{
						id: "gpu",
						host: "gpu.tail1234.ts.net",
						user: "agent",
						isolationClass: "ephemeral",
						agents: ["ollama"],
						note: "inference only",
					},
				],
			}),
		);
		expect(loaded.declared).toBe(true);
		expect(loaded.machines.map((m) => m.id)).toEqual(["build-box", "gpu"]);
		expect(loaded.rejected).toEqual([]);
		expect(sshDestination(loaded.machines[1] as never)).toBe(
			"agent@gpu.tail1234.ts.net",
		);
	});

	it("reports an absent registry without inventing machines", () => {
		const loaded = loadDevMachines(
			"/pkg",
			() => "",
			() => false,
		);
		expect(loaded.declared).toBe(false);
		expect(loaded.machines).toEqual([]);
	});

	it("says why a malformed file yielded nothing", () => {
		expect(loader("{not json").rejected[0]?.problem).toMatch(/unreadable/);
		expect(
			loader(JSON.stringify({ machines: "nope" })).rejected[0]?.problem,
		).toMatch(/no machines array/);
	});
});

describe("fields that reach a command line are allowlisted", () => {
	it("refuses a host that could smuggle an argument", () => {
		for (const host of [
			"box; rm -rf /",
			"box $(id)",
			"box`id`",
			"box with space",
			"-oProxyCommand=evil",
			"",
		]) {
			const parsed = parseDevMachine(
				{ id: "m", host, isolationClass: "development" },
				0,
			);
			expect("problem" in parsed, host).toBe(true);
		}
	});

	it("refuses an id that is not a safe pane name", () => {
		for (const id of ["../x", "a b", "a;b", "-flag", ""]) {
			const parsed = parseDevMachine(
				{ id, host: "box.ts.net", isolationClass: "development" },
				0,
			);
			expect("problem" in parsed, id).toBe(true);
		}
	});

	it("refuses an unknown isolation class rather than defaulting", () => {
		// Defaulting would silently place an agent on a production host under
		// whatever policy the gateway applies to the weakest class.
		const parsed = parseDevMachine(
			{ id: "m", host: "box.ts.net", isolationClass: "whatever" },
			0,
		);
		expect("problem" in parsed && parsed.problem.problem).toMatch(
			/isolationClass/,
		);
	});

	it("rejects a duplicate id instead of letting one pane mean two hosts", () => {
		const loaded = loader(
			JSON.stringify({
				machines: [
					{ id: "box", host: "a.ts.net", isolationClass: "development" },
					{ id: "box", host: "b.ts.net", isolationClass: "production" },
				],
			}),
		);
		expect(loaded.machines).toHaveLength(1);
		expect(loaded.rejected[0]?.problem).toMatch(/duplicate id/);
	});

	it("keeps the good entries when one is bad", () => {
		const loaded = loader(
			JSON.stringify({
				machines: [
					{ id: "good", host: "a.ts.net", isolationClass: "development" },
					{ id: "bad", host: "b ts net", isolationClass: "development" },
				],
			}),
		);
		expect(loaded.machines.map((m) => m.id)).toEqual(["good"]);
		expect(loaded.rejected.map((r) => r.machine)).toEqual(["bad"]);
	});
});

describe("placement and brokering", () => {
	const machines = [
		{ id: "any", host: "a.ts.net", isolationClass: "development" as const },
		{
			id: "gpu",
			host: "g.ts.net",
			isolationClass: "ephemeral" as const,
			agents: ["ollama"],
		},
	];

	it("restricts a machine to its declared agents", () => {
		expect(machinesForAgent(machines, "claude").map((m) => m.id)).toEqual([
			"any",
		]);
		expect(machinesForAgent(machines, "ollama").map((m) => m.id)).toEqual([
			"any",
			"gpu",
		]);
	});

	it("registers as a PAM target carrying the declared isolation class", () => {
		// The gateway's policy keys off this, so a machine and its brokered
		// session must not be two different notions of "which host".
		expect(pamTarget(machines[1] as never)).toEqual({
			id: "ssh:gpu",
			kind: "ssh",
			isolationClass: "ephemeral",
			address: "g.ts.net",
		});
	});
});

describe("mux resolves --host against the registry", () => {
	it("refuses an undeclared host with the known set", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "build-box",
						host: "build-box.ts.net",
						isolationClass: "development",
					},
				],
			}),
		);
		const result = await runHoboCodeCli(
			["mux", "--dry-run", "--host", "evil.example"],
			{
				hoboHome: home,
				cwd: project,
			},
		);
		// An arbitrary ssh destination is exactly what the registry exists to
		// stop, so this must not reach tmux at all.
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_MUX_UNKNOWN_MACHINE");
		expect(result.message).toContain("build-box");
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	});

	// Asserts on the resolved host in `data` rather than on `ok`, which depends
	// on a detected agent binary and so fails on a clean CI container.
	it("accepts a declared id and uses its tailnet host", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		enablePam(home);
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "build-box",
						host: "build-box.ts.net",
						isolationClass: "development",
					},
				],
			}),
		);
		const result = await runHoboCodeCli(
			["mux", "--dry-run", "--host", "build-box"],
			{
				hoboHome: home,
				cwd: project,
			},
		);
		expect(result.code).not.toBe("HOBO_CODE_MUX_UNKNOWN_MACHINE");
		expect(JSON.stringify(result.data)).toContain("build-box.ts.net");
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	});

	it("lists declared machines and names the rejected ones", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{ id: "ok", host: "ok.ts.net", isolationClass: "development" },
					{
						id: "bad",
						host: "-oProxyCommand=evil",
						isolationClass: "development",
					},
				],
			}),
		);
		const result = await runHoboCodeCli(["machines"], {
			hoboHome: home,
			cwd: project,
		});
		expect(result.message).toContain("ok.ts.net");
		expect(result.message).toMatch(/rejected · bad/);
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	});
});

describe("resolving --host is unambiguous", () => {
	const machines = [
		{
			id: "jump",
			host: "dev-box",
			user: "root",
			isolationClass: "production" as const,
		},
		{
			id: "dev-box",
			host: "sandbox.ts.net",
			user: "agent",
			isolationClass: "ephemeral" as const,
		},
	];

	it("an exact id beats an earlier entry's host", () => {
		// The old single-pass `id === x || host === x` selected `jump` here: the
		// operator named one machine and got another, as another user, under a
		// production policy instead of an ephemeral one.
		const resolved = resolveMachine(machines, "dev-box");
		expect(resolved && "machine" in resolved && resolved.machine.id).toBe(
			"dev-box",
		);
		expect(
			resolved && "machine" in resolved && resolved.machine.isolationClass,
		).toBe("ephemeral");
	});

	it("resolves by host when no id matches", () => {
		const resolved = resolveMachine(machines, "sandbox.ts.net");
		expect(resolved && "machine" in resolved && resolved.machine.id).toBe(
			"dev-box",
		);
	});

	it("refuses to choose when two machines share a host", () => {
		const shared = [
			{ id: "a", host: "same.ts.net", isolationClass: "development" as const },
			{ id: "b", host: "same.ts.net", isolationClass: "production" as const },
		];
		const resolved = resolveMachine(shared, "same.ts.net");
		expect(resolved && "ambiguous" in resolved).toBe(true);
	});

	it("returns null for an unknown name", () => {
		expect(resolveMachine(machines, "nope")).toBeNull();
	});
});

describe("declared agent placement is enforced", () => {
	it("stops a handed-off identity when a sibling pane is denied", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		const bin = join(project, "bin");
		mkdirSync(bin);
		writeFileSync(join(bin, "claude"), "");
		writeFileSync(join(bin, "codex"), "");
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "box",
						host: "box.ts.net",
						isolationClass: "development",
						agents: ["claude", "codex"],
					},
				],
			}),
		);
		let stopped = 0;
		try {
			const result = await runHoboCodeCli(["mux", "--host", "box"], {
				hoboHome: home,
				cwd: project,
				env: { HOME: join(project, "empty-home"), PATH: bin },
				openStationGateway: async () => ({
					broker: {
						registerTarget() {},
						async brokerSession(request) {
							if (request.reason?.includes("codex")) {
								throw new Error("policy denied codex");
							}
							return {
								sessionId: "session-claude",
								expiresAt: new Date(Date.now() + 60_000).toISOString(),
								credentialRef: "tokenref://session-claude",
								protocol: "hobo-svid",
							};
						},
					},
					auditTypes: () => ["pam.SessionStarted", "pam.SessionDenied"],
					yardDrainCount: () => 2,
					resolveSshIdentity: async (pane) => ({
						pane: { ...pane, identityAgent: "/tmp/unused.sock" },
						stop: async () => {},
					}),
					handoffSshIdentity: async (pane) => ({
						pane: { ...pane, identityAgent: "/tmp/session-claude.sock" },
						stop: async () => {
							stopped++;
						},
					}),
					close: async () => {},
				}),
			});
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_CODE_MUX_UNBROKERED_PANES");
			expect(stopped).toBe(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});

	it("retains authorization for a remote pane that survives failed rollback", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		const bin = join(project, "bin");
		mkdirSync(bin);
		writeFileSync(join(bin, "claude"), "");
		writeFileSync(join(bin, "codex"), "");
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "box",
						host: "box.ts.net",
						isolationClass: "development",
						agents: ["claude", "codex"],
					},
				],
			}),
		);
		let stopped = 0;
		try {
			const result = await runHoboCodeCli(["mux", "--host", "box"], {
				hoboHome: home,
				cwd: project,
				env: { HOME: join(project, "empty-home"), PATH: bin },
				muxRunner: {
					run: async (args) => {
						if (args[0] === "has-session") return { code: 1, stdout: "" };
						if (args[0] === "new-session") return { code: 0, stdout: "" };
						if (args[0] === "new-window") return { code: 1, stdout: "" };
						if (args[0] === "kill-session") return { code: 1, stdout: "" };
						return { code: 0, stdout: "" };
					},
				},
				openStationGateway: async () => ({
					broker: {
						registerTarget() {},
						async brokerSession(request) {
							const agent = request.reason?.includes("claude")
								? "claude"
								: "codex";
							return {
								sessionId: `session-${agent}`,
								expiresAt: new Date(Date.now() + 60_000).toISOString(),
								credentialRef: `tokenref://session-${agent}`,
								protocol: "hobo-svid",
							};
						},
					},
					auditTypes: () => ["pam.SessionStarted", "pam.SessionStarted"],
					yardDrainCount: () => 2,
					resolveSshIdentity: async (pane) => ({
						pane: { ...pane, identityAgent: "/tmp/unused.sock" },
						stop: async () => {},
					}),
					handoffSshIdentity: async (pane) => ({
						pane: {
							...pane,
							identityAgent: `/tmp/${pane.agentId}.sock`,
						},
						stop: async () => {
							stopped++;
						},
					}),
					close: async () => {},
				}),
			});
			expect(result.code).toBe("HOBO_CODE_MUX_FAILED");
			expect(result.ok).toBe(false);
			expect(stopped).toBe(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});

	it("refuses when no detected agent may use the machine", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "gpu",
						host: "gpu.ts.net",
						isolationClass: "ephemeral",
						// A machine that hosts nothing detectable here.
						agents: ["no-such-agent"],
					},
				],
			}),
		);
		const result = await runHoboCodeCli(["mux", "--dry-run", "--host", "gpu"], {
			hoboHome: home,
			cwd: project,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_MUX_NO_PLACEABLE_AGENTS");
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	});

	it("refuses --virtual with --host rather than failing per pane", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-m-"));
		const project = mkdtempSync(join(tmpdir(), "proj-m-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{ id: "box", host: "box.ts.net", isolationClass: "development" },
				],
			}),
		);
		// A vshell command names a local path; on the remote it does not exist,
		// and the panes would fail after sessions had already been brokered.
		const result = await runHoboCodeCli(
			["mux", "--dry-run", "--host", "box", "--virtual"],
			{ hoboHome: home, cwd: project },
		);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_MUX_VIRTUAL_REMOTE");
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	});
});
