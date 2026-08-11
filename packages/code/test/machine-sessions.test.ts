/**
 * A remote pane's authority used to be whatever key happened to sit in
 * ~/.ssh — unscoped, unexpiring, unaudited. These tests pin that a pane's
 * authority now comes from a Station session, that a denial stops the pane
 * rather than falling back, and that session *material* never leaves the
 * gateway.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
	stationRoot,
} from "@hobo/stations";
import { describe, expect, it } from "vitest";
import type { DevMachine } from "../src/dev-machines.js";
import {
	brokeredSshCommand,
	brokerPaneSession,
	brokerPanes,
	describePane,
	openStationGateway,
	type PaneSessionBroker,
} from "../src/machine-sessions.js";
import { targetCommand } from "../src/mux.js";

const machine: DevMachine = {
	id: "build-box",
	host: "build-box.ts.net",
	isolationClass: "development",
};

function fakeBroker(behaviour: "ok" | "deny"): PaneSessionBroker {
	const registered: string[] = [];
	return {
		registerTarget(target) {
			registered.push(target.id);
		},
		async brokerSession(request) {
			if (behaviour === "deny")
				throw new Error("policy: elevated token required");
			return {
				sessionId: `sess-${request.target}`,
				expiresAt: "2026-08-04T00:00:00.000Z",
				credentialRef: `tokenref://pam/native/${request.target}`,
				protocol: "hobo-svid",
			};
		},
	};
}

describe("brokering a pane", () => {
	it("registers the declared target and returns a scoped session", async () => {
		const outcome = await brokerPaneSession(machine, "claude", {
			broker: fakeBroker("ok"),
			subject: "hobo-code",
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.pane.sessionId).toBe("sess-ssh:build-box");
		expect(outcome.pane.destination).toBe("build-box.ts.net");
	});

	it("reports a denial as an answer, naming the machine", async () => {
		const outcome = await brokerPaneSession(machine, "claude", {
			broker: fakeBroker("deny"),
			subject: "hobo-code",
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.failure.machine.id).toBe("build-box");
		expect(outcome.failure.reason).toMatch(/elevated token/);
	});

	it("keeps successes and failures side by side", async () => {
		const result = await brokerPanes(
			[
				{ machine, agentId: "claude" },
				{ machine, agentId: "codex" },
			],
			{ broker: fakeBroker("ok"), subject: "hobo-code" },
		);
		expect(result.panes).toHaveLength(2);
		expect(result.failures).toHaveLength(0);
	});
});

describe("session material stays in the gateway", () => {
	it("passes a reference to ssh, never a token", async () => {
		const outcome = await brokerPaneSession(machine, "claude", {
			broker: fakeBroker("ok"),
			subject: "hobo-code",
		});
		if (!outcome.ok) throw new Error("expected a brokered pane");
		const cmd = brokeredSshCommand(outcome.pane, "claude");
		expect(cmd).toContain("IdentityAgent=tokenref://");
		// A token on a command line is visible in `ps` on the remote.
		expect(cmd).not.toContain("sessionToken");
	});

	it("does not put session material in the human panel", async () => {
		const outcome = await brokerPaneSession(machine, "claude", {
			broker: fakeBroker("ok"),
			subject: "hobo-code",
		});
		if (!outcome.ok) throw new Error("expected a brokered pane");
		const line = describePane(outcome.pane);
		expect(line).toContain("build-box");
		expect(line).not.toContain("tokenref://");
	});

	it("an ssh pane without a brokered session gets no identity option", () => {
		// Otherwise it would quietly fall back to whatever is in ~/.ssh, which
		// is the ambient authority this replaces.
		const bare = targetCommand({
			name: "claude",
			kind: "ssh",
			host: "box",
			command: "claude",
		});
		expect(bare).not.toContain("IdentityAgent");
		const brokeredPane = targetCommand({
			name: "claude",
			kind: "ssh",
			host: "box",
			command: "claude",
			credentialRef: "tokenref://pam/native/x",
		});
		expect(brokeredPane).toContain("IdentityAgent=tokenref://pam/native/x");
	});
});

describe("the real Station gateway", () => {
	it("refuses a missing or bootstrap-only Station", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-pam-"));
		try {
			await expect(
				openStationGateway({
					hoboHome,
					stationId: "station:missing",
					isolationClass: "development",
				}),
			).rejects.toThrow(/station .* not found/);
			initStation({ hoboHome, id: "station:local", tenant: "acme" });
			await expect(
				openStationGateway({
					hoboHome,
					stationId: "station:local",
					isolationClass: "development",
				}),
			).rejects.toThrow(/does not enable privileged access/);
		} finally {
			rmSync(hoboHome, { recursive: true, force: true });
		}
	});

	it("brokers against the active Rail and durably audits until lease close", async () => {
		// Exercised against @hobo/stations itself, not a fake: the contract that
		// matters is the one the product actually calls.
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-pam-"));
		try {
			initStation({ hoboHome, id: "station:local", tenant: "acme" });
			const service = StationService.fromEvents(
				loadStationEvents(hoboHome, "station:local"),
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
			persistStationEvents(hoboHome, "station:local", service.events);

			const gateway = await openStationGateway({
				hoboHome,
				stationId: "station:local",
				isolationClass: "development",
			});
			const outcome = await brokerPaneSession(machine, "claude", {
				broker: gateway.broker,
				subject: "hobo-code",
				ttlSeconds: 900,
			});
			expect(outcome.ok).toBe(true);
			if (!outcome.ok) return;
			expect(outcome.pane.protocol).toBe("hobo-svid");
			expect(outcome.pane.credentialRef).toMatch(/^tokenref:\/\//);
			expect(gateway.auditTypes()).toContain("pam.SessionStarted");
			expect(gateway.auditTypes()).not.toContain("pam.SessionEnded");
			await gateway.close();
			const durable = readFileSync(
				join(stationRoot(hoboHome, "station:local"), "pam-audit.jsonl"),
				"utf8",
			);
			expect(durable).toContain('"tenant":"acme"');
			expect(durable).toContain('"type":"pam.SessionStarted"');
			expect(durable).toContain('"type":"pam.SessionEnded"');
		} finally {
			rmSync(hoboHome, { recursive: true, force: true });
		}
	});
});
