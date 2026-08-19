import { first, must } from "@hobo/core/total-access";
import {
	IdentityMigrationControlPlane,
	type IdentityMigrationEvent,
} from "@hobo/identity";
import { describe, expect, it } from "vitest";
import { rebindAgentsOnMigrationEvents } from "../src/auth.js";

describe("MCP zero-config agent rebind on identity.Migrated", () => {
	it("rebinds agents from migration events without agent configuration", () => {
		const plane = new IdentityMigrationControlPlane({ tenant: "local" });
		plane.onMatchingDecision({
			tenant: "local",
			sourceAdapter: "a",
			targetAdapter: "b",
		});
		plane.linkPrincipalJit();
		plane.advanceRamp(100);
		const pref = first(
			Object.keys(must(plane.service.snapshot()).links),
			"Object.keys(must(plane.service.snapshot()).links)",
		);
		plane.service.markMigrated(pref);
		const actions = rebindAgentsOnMigrationEvents(
			plane.events as IdentityMigrationEvent[],
		);
		expect(actions).toHaveLength(1);
		expect(actions[0]?.action).toBe("re-attest-svid");
		expect(actions[0]?.principalRef).toBe(pref);
	});
});
