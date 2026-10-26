import { describe, expect, it } from "vitest";
import * as integration from "../src/index.js";

describe("HoBo CI Dagger readiness", () => {
	it("cannot be mistaken for an execution provider", () => {
		expect(integration.INTEGRATION_STATUS).toBe("planned");
		expect(integration.EXECUTION_AVAILABLE).toBe(false);
		expect(integration).not.toHaveProperty("execute");
		expect(integration).not.toHaveProperty("run");
		expect(integration.getReadiness().executionAvailable).toBe(false);
	});

	it("keeps pending acceptance gates immutable for consumers", () => {
		expect(Object.isFrozen(integration.PENDING_GATES)).toBe(true);
		expect(Reflect.set(integration.PENDING_GATES, "0", "complete")).toBe(false);
		expect(integration.PENDING_GATES.join(" ")).toContain(
			"budget reservations",
		);
		expect(integration.PENDING_GATES.join(" ")).toContain("PACT");
	});

	it("returns a deeply frozen generated readiness view", () => {
		const view = integration.getReadiness();
		expect(Object.isFrozen(view)).toBe(true);
		expect(Object.isFrozen(view.pendingGates)).toBe(true);
		expect(Reflect.set(view, "executionAvailable", true)).toBe(false);
		expect(Reflect.set(view.pendingGates, "0", "complete")).toBe(false);
	});
});
