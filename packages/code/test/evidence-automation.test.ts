import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
	BROWSER_RECORDING_SCHEMA,
	type CompletedBrowserRecording,
	exportEvidenceRecordingAutomation,
} from "../src/index.js";

function recording(
	actions: CompletedBrowserRecording["actions"],
): CompletedBrowserRecording {
	return {
		schemaVersion: BROWSER_RECORDING_SCHEMA,
		id: "recording-checkout-17",
		title: "Checkout as a returning customer",
		status: "completed",
		startUrl: "https://shop.example/cart?draft=1",
		endUrl: "https://shop.example/finished",
		durationMs: 1_200,
		viewport: { width: 1_000, height: 800 },
		actions,
		checkpoints: [
			{ sequence: 1, afterAction: 1, path: "/complete", title: "Complete" },
		],
	};
}

describe("evidence recording automation export", () => {
	it("turns stored recording evidence into one reusable skill and deterministic spec", () => {
		const exported = exportEvidenceRecordingAutomation(
			recording([
				{
					sequence: 1,
					offsetMs: 4,
					type: "click",
					target: { role: "button", name: "Checkout", testId: "checkout" },
				},
				{
					sequence: 2,
					offsetMs: 8,
					type: "fill",
					target: { label: "Email" },
					value: { kind: "parameter", name: "CUSTOMER_EMAIL" },
				},
				{ sequence: 3, offsetMs: 9, type: "pointer", x: 250, y: 600 },
			]),
			{ sourceArtifactRef: "sha256:recording", name: "Returning checkout" },
		);

		expect(exported).toMatchObject({
			capabilityId: "returning-checkout",
			sourceRecordingId: "recording-checkout-17",
			sourceArtifactRef: "sha256:recording",
			replayability: "needs-input",
			requiredEnvironment: ["CUSTOMER_EMAIL"],
		});
		expect(exported.artifacts.map(({ path }) => path)).toEqual([
			".hobo/recordings/returning-checkout/SKILL.md",
			".hobo/recordings/returning-checkout/scripts/run.spec.ts",
			".hobo/recordings/returning-checkout/references/recording.json",
		]);
		const skill = exported.artifacts[0]?.contents ?? "";
		const spec = exported.artifacts[1]?.contents ?? "";
		expect(skill).toContain("Source recording: `recording-checkout-17`");
		expect(skill).toContain("`CUSTOMER_EMAIL`");
		expect(spec).toContain('getByRole("button", { name: "Checkout"');
		expect(spec).toContain('requiredEnv("CUSTOMER_EMAIL")');
		expect(spec).toContain("page.viewportSize()?.width ?? 1000");
		expect(spec).toContain(
			'test.describe.configure({ mode: "serial", retries: 0 })',
		);
		expect(spec).toContain("viewport: { width: 1000, height: 800 }");
		expect(spec).toContain('locale: "en-US"');
		expect(spec).toContain('timezoneId: "UTC"');
		expect(spec).toContain('colorScheme: "light"');
		expect(spec).toContain('reducedMotion: "reduce"');
		expect(spec).toContain("toHaveCount(1, { timeout: 5_000 })");
		expect(spec).not.toContain("waitForTimeout");
		expect(spec).toContain('toHaveURL(new URL("/complete", baseURL).href)');
		expect(spec.trimEnd()).toContain(
			'await expect(page).toHaveURL(new URL("/finished", baseURL).href);',
		);
		expect(spec).toContain('outputPath("checkpoint-1.png")');
		for (const artifact of exported.artifacts)
			expect(createHash("sha256").update(artifact.contents).digest("hex")).toBe(
				artifact.sha256,
			);
		expect(
			exportEvidenceRecordingAutomation(
				recording([
					{
						sequence: 1,
						offsetMs: 4,
						type: "click",
						target: {
							role: "button",
							name: "Checkout",
							testId: "checkout",
						},
					},
					{
						sequence: 2,
						offsetMs: 8,
						type: "fill",
						target: { label: "Email" },
						value: { kind: "parameter", name: "CUSTOMER_EMAIL" },
					},
					{ sequence: 3, offsetMs: 9, type: "pointer", x: 250, y: 600 },
				]),
				{ sourceArtifactRef: "sha256:recording", name: "Returning checkout" },
			),
		).toEqual(exported);
	});

	it("emits a Playwright bundle the installed compiler can load", () => {
		const exported = exportEvidenceRecordingAutomation(
			recording([
				{
					sequence: 1,
					offsetMs: 1,
					type: "click",
					target: { role: "button", name: "Pay" },
				},
			]),
		);
		const root = mkdtempSync(join(process.cwd(), "test", "automation-"));
		try {
			for (const artifact of exported.artifacts) {
				const path = join(root, artifact.path);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, artifact.contents);
			}
			const program = ts.createProgram(
				[join(root, exported.artifacts[1]?.path ?? "")],
				{
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: ts.ScriptTarget.ES2022,
					types: ["node"],
				},
			);
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map(({ messageText }) =>
						ts.flattenDiagnosticMessageText(messageText, "\n"),
					),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("refuses interrupted or empty recordings", () => {
		const cue = readFileSync(
			join(import.meta.dirname, "..", "data-models", "code_harness.cue"),
			"utf8",
		);
		expect(cue).toMatch(
			/#ReplayableBrowserRecording:[\s\S]*status:\s+"completed"[\s\S]*action_count:\s+int\s*&\s*>0[\s\S]*end_origin:\s+start_origin/u,
		);
		expect(() =>
			exportEvidenceRecordingAutomation({
				...recording([]),
				status: "interrupted",
			}),
		).toThrow(/completed/);
		expect(() => exportEvidenceRecordingAutomation(recording([]))).toThrow(
			/recorded actions/,
		);
		expect(() =>
			exportEvidenceRecordingAutomation({
				...recording([
					{
						sequence: 1,
						offsetMs: 0,
						type: "navigate",
						path: "/complete",
					},
				]),
				endUrl: "https://payments.example/complete",
			}),
		).toThrow("cross-origin recordings cannot be exported");
	});

	it("keeps recording capabilities from shadowing built-in skills", () => {
		const exported = exportEvidenceRecordingAutomation(
			recording([
				{
					sequence: 1,
					offsetMs: 0,
					type: "navigate",
					path: "/finished",
				},
			]),
			{ name: "repo" },
		);

		expect(exported.capabilityId).toBe("recording-repo");
		expect(exported.artifacts[0]?.path).toBe(
			".hobo/recordings/recording-repo/SKILL.md",
		);
	});
});
