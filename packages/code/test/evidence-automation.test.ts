import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { exportEvidenceRecordingAutomation } from "../src/index.js";

describe("evidence recording automation export", () => {
	it("turns a completed browser path into a reusable agent skill and Playwright spec", () => {
		const exported = exportEvidenceRecordingAutomation({
			id: "recording-checkout-17",
			title: "Checkout as a returning customer",
			status: "completed",
			startUrl: "https://shop.example/cart?draft=1",
			steps: [
				{
					type: "click",
					target: {
						role: "button",
						name: "Checkout",
						testId: "checkout",
					},
				},
				{
					type: "fill",
					target: { label: "Email" },
					value: { kind: "literal", text: "dev@example.com" },
				},
			],
		});

		expect(exported).toMatchObject({
			schemaVersion: "hobo.code.evidence-automation/v1",
			capabilityId: "checkout-as-a-returning-customer",
			sourceRecordingId: "recording-checkout-17",
			commands: [
				"pnpm exec playwright test automations/checkout-as-a-returning-customer/automation.spec.ts --workers=1",
			],
		});
		expect(exported.artifacts.map(({ path }) => path)).toEqual([
			"automations/checkout-as-a-returning-customer/SKILL.md",
			"automations/checkout-as-a-returning-customer/automation.spec.ts",
		]);

		const skill = exported.artifacts[0]?.contents ?? "";
		const spec = exported.artifacts[1]?.contents ?? "";
		expect(skill).toContain("name: checkout-as-a-returning-customer");
		expect(skill).toContain("Source recording: `recording-checkout-17`");
		expect(skill).toContain("Checkout as a returning customer");
		expect(skill).toContain(exported.commands[0]);
		expect(spec).toContain('from "playwright/test"');
		expect(spec).toContain("HOBO_AUTOMATION_BASE_URL");
		expect(spec).toContain(
			'getByRole("button", { name: "Checkout", exact: true })',
		);
		expect(spec).toContain('getByTestId("checkout")');
		expect(spec).toContain('.fill("dev@example.com")');

		for (const artifact of exported.artifacts) {
			expect(artifact.id).toBe(`sha256:${artifact.sha256}`);
			expect(createHash("sha256").update(artifact.contents).digest("hex")).toBe(
				artifact.sha256,
			);
		}
	});
});
