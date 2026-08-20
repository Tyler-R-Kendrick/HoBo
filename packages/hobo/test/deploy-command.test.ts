import {
	createContinuousDeliveryPlane,
	createContractAssertedCdFixtures,
} from "@hobo/cloud";
import { describe, expect, it } from "vitest";
import { createDeployCommand } from "../src/deploy-command.js";
import { createIncidentCommand } from "../src/incident-command.js";
import type { JsonObject } from "../src/json.js";

function runInput(args: string[], flags: JsonObject = {}) {
	return {
		args,
		flags,
		context: { cwd: "/tmp", projectDir: "/tmp" },
		emitProgress: () => {},
	};
}

describe("hobo deploy + incident (CD plane)", () => {
	it("deploy status drives real deliver: attested, secret-free, progressive", async () => {
		const plane = createContinuousDeliveryPlane({ mode: "simulate" });
		const fixtures = createContractAssertedCdFixtures({ tenant: "cli-t" });
		const cmd = createDeployCommand({ env: {}, plane, fixtures });
		// SAFETY: assertion required at this I/O or test boundary.
		const result = await cmd.run(runInput(["status"]) as never);
		expect(result.ok).toBe(true);
		expect(result.data?.attestedApply).toBe(true);
		expect(result.data?.ambientCredentials).toBe(false);
		expect(result.data?.attestation).toBe("attested");
		expect(result.data?.secretFree).toBe(true);
		expect(result.data?.activeCredentialsAfter).toBe(0);
		expect(result.data?.planeStatus).toBe("deployed");
		// SAFETY: assertion required at this I/O or test boundary.
		const resources = result.data?.resources as { secretFree: boolean }[];
		expect(resources.every((r) => r.secretFree)).toBe(true);
		// SAFETY: assertion required at this I/O or test boundary.
		const progressive = result.data?.progressive as {
			flagPercent: number;
			gatewayWeightPercent: number;
		};
		expect(progressive.flagPercent).toBe(100);
		expect(progressive.gatewayWeightPercent).toBe(100);
	});

	it("deploy logs come from real apply events, not hardcoded placeholders", async () => {
		const plane = createContinuousDeliveryPlane({ mode: "simulate" });
		const fixtures = createContractAssertedCdFixtures();
		const cmd = createDeployCommand({ env: {}, plane, fixtures });
		// SAFETY: assertion required at this I/O or test boundary.
		await cmd.run(runInput(["status"]) as never);
		// SAFETY: assertion required at this I/O or test boundary.
		const logs = await cmd.run(runInput(["logs"]) as never);
		expect(logs.ok).toBe(true);
		expect(logs.data?.secretFree).toBe(true);
		// SAFETY: assertion required at this I/O or test boundary.
		const lines = logs.data?.lines as string[];
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.some((l) => l.includes("deployment.Apply"))).toBe(true);
		expect(lines.join("\n")).not.toMatch(/should-never-appear-in-projection/);
	});

	it("deploy rollback zeros progressive exposure and opens A2H", async () => {
		const plane = createContinuousDeliveryPlane({ mode: "simulate" });
		const fixtures = createContractAssertedCdFixtures();
		const cmd = createDeployCommand({ env: {}, plane, fixtures });
		// SAFETY: assertion required at this I/O or test boundary.
		const status = await cmd.run(runInput(["status"]) as never);
		// SAFETY: assertion required at this I/O or test boundary.
		const depId = status.data?.deploymentId as string;
		expect(status.data?.planeStatus).toBe("deployed");
		// SAFETY: assertion required at this I/O or test boundary.
		const progressiveBefore = status.data?.progressive as {
			flagPercent: number;
			gatewayWeightPercent: number;
		};
		expect(progressiveBefore.flagPercent).toBe(100);
		expect(progressiveBefore.gatewayWeightPercent).toBe(100);

		const result = await cmd.run(
			// SAFETY: assertion required at this I/O or test boundary.
			runInput(["rollback"], { reason: "test" }) as never,
		);
		expect(result.ok).toBe(true);
		expect(result.data?.disposition).toBe("a2h");
		expect(result.data?.deploymentId).toBe(depId);
		expect(result.data?.obligationId).toContain("a2h");
		// SAFETY: assertion required at this I/O or test boundary.
		const progressive = result.data?.progressive as {
			flagPercent: number;
			gatewayWeightPercent: number;
			flagKillSwitch: boolean;
			status: string;
		};
		expect(progressive.flagPercent).toBe(0);
		expect(progressive.gatewayWeightPercent).toBe(0);
		expect(progressive.flagKillSwitch).toBe(true);
		expect(progressive.status).toBe("rolled_back");
	});

	it("incident open defaults to A2H when blast radius unknown", async () => {
		const cmd = createIncidentCommand({ env: {} });
		const result = await cmd.run(
			// SAFETY: assertion required at this I/O or test boundary.
			runInput(["open"], { signal: "slo-burn" }) as never,
		);
		expect(result.ok).toBe(true);
		expect(result.data?.failureKind).toBe("a2h");
		expect(result.data?.attested).toBe("attested");
		expect(result.data?.secretFree).toBe(true);
	});

	it("incident open with self-heal grants lane + proposed delta", async () => {
		const cmd = createIncidentCommand({ env: {} });
		const result = await cmd.run(
			// SAFETY: assertion required at this I/O or test boundary.
			runInput(["open"], {
				signal: "apply-failed",
				"self-heal": true,
			}) as never,
		);
		expect(result.ok).toBe(true);
		expect(result.data?.failureKind).toBe("self-heal-lane");
		expect(result.data?.promotionPath).toBe("gatekeeper-then-harness");
		expect(result.data?.baselineMutation).toBe(false);
	});
});
