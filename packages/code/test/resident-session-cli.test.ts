import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStationEvents } from "@hobo/stations";
import { describe, expect, it } from "vitest";

import {
	AgentLifecycleState,
	SessionLifecycleState,
} from "../src/_generated/code_harness_pb.js";
import { runHoboCodeCli } from "../src/cli.js";
import { DEV_MACHINES_FILE } from "../src/dev-machines.js";
import {
	authorizationLeaseDelay,
	remoteSessionServeSshArgs,
	shouldWaitForResidentSession,
} from "../src/resident-session-cli.js";

describe("resident session remote browser", () => {
	it("does not wait on stale agent state after a session is terminal", () => {
		expect(
			shouldWaitForResidentSession(SessionLifecycleState.RUNNING, [
				AgentLifecycleState.WORKING,
			]),
		).toBe(true);
		expect(
			shouldWaitForResidentSession(SessionLifecycleState.STOPPED, [
				AgentLifecycleState.WORKING,
			]),
		).toBe(false);
	});
	it("fails closed at the Station authorization deadline", () => {
		expect(
			authorizationLeaseDelay(
				"2026-08-12T00:00:00.000Z",
				Date.parse("2026-08-11T23:59:59.000Z"),
			),
		).toBe(1_000);
		expect(() =>
			authorizationLeaseDelay(
				"2026-08-11T23:59:59.000Z",
				Date.parse("2026-08-12T00:00:00.000Z"),
			),
		).toThrow("expired or invalid");
	});
	it("constructs one fixed loopback SSH forward to the declared machine", () => {
		expect(
			remoteSessionServeSshArgs(
				{
					id: "build-box",
					host: "build-box.ts.net",
					user: "agent",
					isolationClass: "development",
				},
				4242,
			),
		).toEqual([
			"-T",
			"-o",
			"ExitOnForwardFailure=yes",
			"-L",
			"127.0.0.1:4242:127.0.0.1:4242",
			"agent@build-box.ts.net",
			"hobo-code",
			"session",
			"serve",
			"--port",
			"4242",
		]);
	});

	it("requires a fixed port before resolving a remote machine", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-session-home-"));
		try {
			const result = await runHoboCodeCli(
				["session", "serve", "--host", "build-box"],
				{ hoboHome: home },
			);
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_CODE_SESSION_REMOTE_PORT_REQUIRED");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does not self-initialize a Station to authorize remote access", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-session-home-"));
		const project = mkdtempSync(join(tmpdir(), "hobo-session-project-"));
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
		try {
			const result = await runHoboCodeCli(
				["session", "serve", "--host", "build-box", "--port", "4242"],
				{ hoboHome: home, cwd: project },
			);
			expect(result.ok).toBe(false);
			expect(result.message).toMatch(/station .* not found/);
			expect(loadStationEvents(home, "station:local")).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});

	it("authorizes and audits a declared machine before returning the forward", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-session-home-"));
		const project = mkdtempSync(join(tmpdir(), "hobo-session-project-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "build-box",
						host: "build-box.ts.net",
						user: "agent",
						isolationClass: "development",
					},
				],
			}),
		);
		const registered: unknown[] = [];
		const requests: unknown[] = [];
		let closed = false;
		try {
			const result = await runHoboCodeCli(
				["session", "serve", "--host", "build-box", "--port", "4242"],
				{
					hoboHome: home,
					cwd: project,
					openStationGateway: async () => ({
						broker: {
							registerTarget(target) {
								registered.push(target);
							},
							async brokerSession(request) {
								requests.push(request);
								return {
									sessionId: "pam-session-1",
									expiresAt: "2026-08-12T00:00:00.000Z",
									credentialRef: "tokenref://must-not-leak",
									protocol: "hobo-svid",
								};
							},
						},
						auditTypes: () => ["pam.SessionStarted"],
						close: async () => {
							closed = true;
						},
					}),
				},
			);
			expect(result.ok).toBe(true);
			expect(registered).toEqual([
				{
					id: "ssh:build-box",
					kind: "ssh",
					isolationClass: "development",
					address: "agent@build-box.ts.net",
				},
			]);
			expect(requests).toEqual([
				expect.objectContaining({
					subject: "hobo-code",
					target: "ssh:build-box",
					preferSecretless: true,
				}),
			]);
			expect(result.data).toEqual(
				expect.objectContaining({
					terminalAction: expect.objectContaining({
						kind: "forward-sessions",
						machine: expect.objectContaining({ id: "build-box" }),
						port: 4242,
						authorizationSessionId: "pam-session-1",
						authorizationExpiresAt: "2026-08-12T00:00:00.000Z",
						auditTypes: ["pam.SessionStarted"],
						credentialMode: "user-ssh-key",
					}),
				}),
			);
			expect(JSON.stringify(result.data)).not.toContain("tokenref://");
			expect(closed).toBe(false);
			const closeAuthorization = (
				result.data as {
					terminalAction: { closeAuthorization: () => Promise<void> };
				}
			).terminalAction.closeAuthorization;
			await closeAuthorization();
			expect(closed).toBe(true);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});

	it("refuses an undeclared machine before opening the Station gateway", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-session-home-"));
		const project = mkdtempSync(join(tmpdir(), "hobo-session-project-"));
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
		let opened = false;
		try {
			const result = await runHoboCodeCli(
				["session", "serve", "--host", "other-box", "--port", "4242"],
				{
					hoboHome: home,
					cwd: project,
					openStationGateway: async () => {
						opened = true;
						throw new Error("must not open");
					},
				},
			);
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_CODE_SESSION_UNKNOWN_MACHINE");
			expect(result.message).toContain("no fallback");
			expect(opened).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});

	it("does not open a forward when the Station denies the declared machine", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-session-home-"));
		const project = mkdtempSync(join(tmpdir(), "hobo-session-project-"));
		writeFileSync(
			join(project, DEV_MACHINES_FILE),
			JSON.stringify({
				machines: [
					{
						id: "build-box",
						host: "build-box.ts.net",
						isolationClass: "production",
					},
				],
			}),
		);
		let closed = false;
		try {
			const result = await runHoboCodeCli(
				["session", "serve", "--host", "build-box", "--port", "4242"],
				{
					hoboHome: home,
					cwd: project,
					openStationGateway: async () => ({
						broker: {
							registerTarget() {},
							async brokerSession() {
								throw new Error("policy denied production browser access");
							},
						},
						auditTypes: () => ["pam.SessionDenied"],
						close: async () => {
							closed = true;
						},
					}),
				},
			);
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_CODE_SESSION_REMOTE_DENIED");
			expect(result.message).toContain(
				"policy denied production browser access",
			);
			expect(result.data).not.toEqual(
				expect.objectContaining({
					terminalAction: expect.objectContaining({ kind: "forward-sessions" }),
				}),
			);
			expect(closed).toBe(true);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(project, { recursive: true, force: true });
		}
	});
});
