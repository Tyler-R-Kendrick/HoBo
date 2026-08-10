import { describe, expect, it } from "vitest";

import {
	advanceAgentPrincipal,
	advanceHumanSession,
	advanceInfrastructure,
	isWorkClaimedByHumanWithRevokedAgent,
	planeSnapshot,
} from "../src/index.js";

describe("the three state machines stay independent", () => {
	it("authenticating a human does not advance the agent or the infrastructure", () => {
		const before = planeSnapshot("anonymous", "pre-claim", "temporary");
		const after = planeSnapshot(
			advanceHumanSession(before.humanSession, "authenticate"),
			before.agentPrincipal,
			before.infrastructure,
		);

		expect(after.humanSession).toBe("authenticated");
		expect(after.agentPrincipal).toBe("pre-claim");
		expect(after.infrastructure).toBe("temporary");
	});

	it("claiming infrastructure does not bind the agent to a human", () => {
		const before = planeSnapshot("authenticated", "pre-claim", "temporary");
		const after = planeSnapshot(
			before.humanSession,
			before.agentPrincipal,
			advanceInfrastructure(before.infrastructure, "claimOwnership"),
		);

		expect(after.infrastructure).toBe("owner-controlled");
		expect(after.agentPrincipal).toBe("pre-claim");
	});

	it("binding an agent to a human does not claim infrastructure", () => {
		const after = planeSnapshot(
			"authenticated",
			advanceAgentPrincipal("pre-claim", "bindToHuman"),
			"temporary",
		);

		expect(after.agentPrincipal).toBe("human-bound");
		expect(after.infrastructure).toBe("temporary");
	});

	it("represents claimed work with a revoked agent", () => {
		expect(
			isWorkClaimedByHumanWithRevokedAgent(
				planeSnapshot("authenticated", "revoked", "owner-controlled"),
			),
		).toBe(true);
		expect(
			isWorkClaimedByHumanWithRevokedAgent(
				planeSnapshot("authenticated", "human-bound", "owner-controlled"),
			),
		).toBe(false);
	});
});

describe("illegal transitions fail closed", () => {
	it("cannot bind an unregistered agent to a human", () => {
		expect(() =>
			advanceAgentPrincipal("unregistered", "bindToHuman"),
		).toThrow();
	});

	it("cannot revoke an already-revoked agent", () => {
		expect(() => advanceAgentPrincipal("revoked", "revoke")).toThrow();
	});

	it("re-registration is the only way back from revoked", () => {
		expect(advanceAgentPrincipal("revoked", "reRegister")).toBe("pre-claim");
	});

	it("owner-controlled infrastructure cannot revert to temporary", () => {
		expect(() =>
			advanceInfrastructure("owner-controlled", "claimOwnership"),
		).toThrow();
		expect(() => advanceInfrastructure("expired", "claimOwnership")).toThrow();
	});

	it("cannot authenticate an already-authenticated session", () => {
		expect(() =>
			advanceHumanSession("authenticated", "authenticate"),
		).toThrow();
	});
});
