import { describe, expect, it } from "vitest";

import {
	createJumpServerPamGatewayStub,
	createTeleportPamGatewayStub,
	PAM_RAIL_CAPABILITY,
	railEnablesPam,
} from "../src/index.js";

describe("Privileged Access Gateway (optional Station capability)", () => {
	it("Teleport stub is env-scoped and requires elevated for production", async () => {
		const gw = createTeleportPamGatewayStub({
			isolationClass: "production",
		});
		await gw.start({
			stationId: "station-prod",
			tenant: "acme",
			isolationClass: "production",
			trustDomain: "yard.local",
		});
		await expect(
			gw.brokerSession({
				subject: "user:alice",
				target: "ssh:db",
				preferSecretless: true,
			}),
		).rejects.toMatchObject({ code: "elevated-required" });

		const session = await gw.brokerSession({
			subject: "user:alice",
			target: "ssh:db",
			preferSecretless: true,
			elevatedToken: "dummy-elevated",
			reason: "incident",
		});
		expect(session.isolationClass).toBe("production");
		expect(session.credentialRef.startsWith("tokenref://pam/")).toBe(true);
		expect(gw.auditEvents.some((e) => e.type === "pam.SessionStarted")).toBe(
			true,
		);
		await gw.stop();
	});

	it("rejects Station context isolation class mismatch", async () => {
		const gw = createJumpServerPamGatewayStub({
			isolationClass: "staging",
		});
		await expect(
			gw.start({
				stationId: "s1",
				tenant: "acme",
				isolationClass: "production",
				trustDomain: "yard.local",
			}),
		).rejects.toMatchObject({ code: "pam-env-mismatch" });
	});

	it("railEnablesPam detects capability packs", () => {
		expect(railEnablesPam([PAM_RAIL_CAPABILITY])).toBe(true);
		expect(railEnablesPam(["hobo.bootstrap.least-privilege/v1"])).toBe(false);
		expect(
			railEnablesPam([], { privilegedAccessGateway: "true" }),
		).toBe(true);
	});
});
