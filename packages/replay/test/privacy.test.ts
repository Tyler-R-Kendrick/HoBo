import { describe, expect, it } from "vitest";

import {
	assertNoSensitivePlaintext,
	defaultPrivacyPolicy,
	maskRrwebEvent,
	shouldMaskNode,
} from "../src/privacy.js";

describe("privacy defaults", () => {
	it("masks password/email/tel inputs", () => {
		const policy = defaultPrivacyPolicy();
		expect(shouldMaskNode({ tag: "input", type: "password" }, policy)).toBe(
			true,
		);
		expect(shouldMaskNode({ tag: "input", type: "email" }, policy)).toBe(true);
		expect(shouldMaskNode({ tag: "input", type: "tel" }, policy)).toBe(true);
	});

	it("redacts sensitive values before persistence", () => {
		const event = maskRrwebEvent({
			type: 3,
			timestamp: 1,
			data: {
				tagName: "input",
				type: "password",
				attributes: { type: "password" },
				textContent: "hunter2",
				value: "hunter2",
			},
		});
		const blob = JSON.stringify(event);
		expect(blob).not.toContain("hunter2");
		expect(() =>
			assertNoSensitivePlaintext(blob, ["hunter2"]),
		).not.toThrow();
	});

	it("redacts Authorization headers in network capture", () => {
		const event = maskRrwebEvent({
			type: 6,
			timestamp: 1,
			data: {
				plugin: "network",
				headers: {
					Authorization: "Bearer secret-token",
					"Content-Type": "application/json",
				},
			},
		});
		const headers = (event.data as { headers: Record<string, string> }).headers;
		expect(headers.Authorization).toBe("••••");
		expect(headers["Content-Type"]).toBe("application/json");
	});
});
