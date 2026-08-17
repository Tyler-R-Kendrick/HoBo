import { describe, expect, it } from "vitest";

import {
	CODE_DEV_SCENARIOS,
	codeDevStation,
	DEFAULT_LOCALHOST_CAPABILITIES,
	isCodeDevScenario,
	stationInitArgsFromDeclaration,
} from "../src/dev-stations.js";

describe("dev-station declarations (ADR-0155 dogfood)", () => {
	it("local-dev keeps the historical station:local identity and defaults", () => {
		const declared = codeDevStation("local-dev");
		expect(declared.kind).toBe("station");
		expect(declared.id).toBe("station:local");
		expect(declared.isolation.tenant).toBe("local");
		expect(declared.isolation.residency).toBe("local");
		expect(declared.isolation.trustDomain).toBe("local.hobo.local");
		expect(declared.isolation.isolationClass).toBe("local-dev");
		expect(declared.metadata.surface).toBe("hobo-code");
	});

	it("every scenario declares a frozen station with the localhost capability set", () => {
		for (const scenario of CODE_DEV_SCENARIOS) {
			const declared = codeDevStation(scenario);
			expect(Object.isFrozen(declared)).toBe(true);
			expect(declared.isolation.isolationClass).toBe(scenario);
			expect(declared.capabilities).toEqual(DEFAULT_LOCALHOST_CAPABILITIES);
		}
	});

	it("required localhost capabilities are exactly runtime, vcs, and worktree isolation", () => {
		const required = DEFAULT_LOCALHOST_CAPABILITIES.filter(
			(c) => c.required,
		).map((c) => c.id);
		expect(required).toEqual([
			"capability:runtime:node",
			"capability:vcs:git",
			"capability:isolation-backend:worktree",
		]);
	});

	it("default-supplied rows are the facilities hobo-code itself ships", () => {
		const supplied = DEFAULT_LOCALHOST_CAPABILITIES.filter(
			(c) => c.provenance === "default",
		).map((c) => c.id);
		expect(supplied).toEqual([
			"capability:sidecar:dashboard",
			"capability:sidecar:status",
			"capability:replay:session-replay",
		]);
	});

	it("init args derive verbatim from the declaration (the only bridge)", () => {
		const declared = codeDevStation("ephemeral", { tenant: "acme" });
		expect(stationInitArgsFromDeclaration(declared)).toEqual({
			id: "station:code-ephemeral",
			name: "code-ephemeral",
			tenant: "acme",
			residency: "local",
			airgap: false,
			trustDomain: "code-ephemeral.hobo.local",
		});
	});

	it("scenario guard accepts the closed set only", () => {
		expect(isCodeDevScenario("local-dev")).toBe(true);
		expect(isCodeDevScenario("production")).toBe(false);
	});
});
