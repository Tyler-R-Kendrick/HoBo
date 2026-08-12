import { describe, expect, it } from "vitest";

import {
	createDebugTrackEnvelope,
	resolveDebugReplayLevel,
} from "../src/index.js";

describe("debug replay contract", () => {
	it("defaults to observable and keeps the kill switch authoritative", () => {
		expect(resolveDebugReplayLevel()).toBe("observable");
		expect(resolveDebugReplayLevel({ level: "diagnostic" })).toBe("diagnostic");
		expect(
			resolveDebugReplayLevel({
				level: "diagnostic",
				env: { HOBO_REPLAY: "0" },
			}),
		).toBe("off");
	});

	it("builds level-scoped envelopes and redacts diagnostic secrets", () => {
		const observable = createDebugTrackEnvelope({
			track: "agent",
			sequence: 4,
			timestamp: 123,
			metadata: { tool: "exec" },
			observable: { result: "ok" },
			diagnostic: { trace: "verbose" },
		});
		expect(observable?.data).toMatchObject({
			track: "agent",
			sequence: 4,
			level: "observable",
			payload: {
				metadata: { tool: "exec" },
				observable: { result: "ok" },
			},
		});
		expect(JSON.stringify(observable)).not.toContain("verbose");

		const diagnostic = createDebugTrackEnvelope({
			track: "approval",
			sequence: 5,
			timestamp: 124,
			level: "diagnostic",
			metadata: { action: "apply" },
			diagnostic: {
				password: "hunter2",
				reasoning: "hidden chain of thought",
				headers: { Authorization: "Bearer secret-token" },
			},
		});
		const serialized = JSON.stringify(diagnostic);
		expect(serialized).not.toContain("hunter2");
		expect(serialized).not.toContain("hidden chain of thought");
		expect(serialized).not.toContain("secret-token");
	});
});
