import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as ts from "typescript";
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

	it("replays movement and state changes while capturing new screenshot evidence", () => {
		const exported = exportEvidenceRecordingAutomation({
			id: "recording-profile-4",
			title: "Update profile",
			status: "completed",
			startUrl: "http://127.0.0.1:4173/profile",
			steps: [
				{
					type: "move",
					target: { testId: "profile-card" },
					position: { x: 0.25, y: 0.75 },
				},
				{
					type: "fill",
					target: { label: "Password" },
					sensitive: true,
					value: { kind: "environment", name: "HOBO_TEST_PASSWORD" },
				},
				{
					type: "press",
					target: { label: "Password" },
					key: "Enter",
				},
				{
					type: "assert",
					target: { role: "status", name: "Profile status" },
					expectation: { kind: "text", value: "Profile saved" },
				},
				{ type: "assert-url", path: "/profile?saved=1" },
				{ type: "screenshot", name: "profile-saved" },
			],
		});

		const skill = exported.artifacts[0]?.contents ?? "";
		const spec = exported.artifacts[1]?.contents ?? "";
		expect(skill).toContain("Move within profile-card at 25%, 75%.");
		expect(skill).toContain("Fill Password from `HOBO_TEST_PASSWORD`.");
		expect(skill).toContain("Verify Profile status text is Profile saved.");
		expect(skill).not.toContain("Password value");
		expect(spec).toContain('requiredEnv("HOBO_TEST_PASSWORD")');
		expect(spec).toMatch(/Box\.width \* 0\.25/u);
		expect(spec).toMatch(/Box\.height \* 0\.75/u);
		expect(spec).toContain('.press("Enter")');
		expect(spec).toContain('.toHaveText("Profile saved")');
		expect(spec).toContain(
			'toHaveURL(new URL("/profile?saved=1", baseURL).href)',
		);
		expect(spec).toContain('test.info().outputPath("profile-saved.png")');
		expect(spec).toContain('animations: "disabled"');
	});

	it("emits a Playwright bundle the installed compiler can load", () => {
		const exported = exportEvidenceRecordingAutomation({
			id: "recording-runnable",
			title: "Runnable checkout",
			status: "completed",
			startUrl: "http://127.0.0.1:4173/checkout",
			steps: [{ type: "click", target: { role: "button", name: "Pay" } }],
		});
		const root = mkdtempSync(
			join(process.cwd(), "test", "evidence-automation-test-"),
		);
		try {
			for (const artifact of exported.artifacts) {
				const path = join(root, artifact.path);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, artifact.contents);
			}
			const specPath = join(root, exported.artifacts[1]?.path ?? "");
			const program = ts.createProgram([specPath], {
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				noEmit: true,
				skipLibCheck: true,
				strict: true,
				target: ts.ScriptTarget.ES2022,
				types: ["node"],
			});
			const diagnostics = ts
				.getPreEmitDiagnostics(program)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, "\n"),
				);
			expect(diagnostics).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("refuses incomplete recordings and literal sensitive values", () => {
		expect(() =>
			exportEvidenceRecordingAutomation({
				id: "recording-active",
				title: "Still recording",
				status: "recording",
				startUrl: "https://example.test",
				steps: [{ type: "click", target: { text: "Continue" } }],
			} as never),
		).toThrow(/completed recording/);
		expect(() =>
			exportEvidenceRecordingAutomation({
				id: "recording-secret",
				title: "Secret entry",
				status: "completed",
				startUrl: "https://example.test",
				steps: [
					{
						type: "fill",
						target: { label: "Password" },
						sensitive: true,
						value: { kind: "literal", text: "do-not-export" },
					},
				],
			}),
		).toThrow(/environment variable/);
	});
});
