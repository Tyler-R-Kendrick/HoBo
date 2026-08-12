import { describe, expect, it } from "vitest";

import { parseBrowserRecording } from "../src/browser-recording.js";

describe("browser recording evidence boundary", () => {
	it("accepts an ordered semantic path and redacts sensitive URL fields", () => {
		const recording = parseBrowserRecording({
			schemaVersion: "hobo.code.browser-recording/v1",
			id: "recording-17",
			title: "Checkout",
			status: "completed",
			startUrl: "https://app.example/cart?token=secret&draft=1",
			endUrl: "https://app.example/complete",
			durationMs: 1200,
			viewport: { width: 1280, height: 720 },
			actions: [
				{
					sequence: 1,
					offsetMs: 20,
					type: "click",
					target: { role: "button", name: "Checkout", testId: "checkout" },
				},
				{
					sequence: 2,
					offsetMs: 80,
					type: "fill",
					target: { label: "Password" },
					value: { kind: "parameter", name: "PASSWORD" },
				},
			],
			checkpoints: [
				{ sequence: 1, afterAction: 2, path: "/complete", title: "Complete" },
			],
		});

		expect(recording.startUrl).toBe(
			"https://app.example/cart?token=%5Bredacted%5D&draft=1",
		);
		expect(recording.actions).toHaveLength(2);
		expect(recording.actions[1]).toMatchObject({
			value: { kind: "parameter", name: "PASSWORD" },
		});
	});

	it("rejects unordered actions, literal fill values, and unsafe URLs", () => {
		const base = {
			schemaVersion: "hobo.code.browser-recording/v1",
			id: "recording-17",
			title: "Checkout",
			status: "completed",
			startUrl: "https://app.example/",
			endUrl: "https://app.example/",
			durationMs: 1,
			viewport: { width: 1, height: 1 },
			checkpoints: [],
		};
		expect(() =>
			parseBrowserRecording({
				...base,
				actions: [
					{
						sequence: 2,
						offsetMs: 0,
						type: "click",
						target: { role: "button" },
					},
				],
			}),
		).toThrow(/sequence/);
		expect(() =>
			parseBrowserRecording({
				...base,
				actions: [
					{
						sequence: 1,
						offsetMs: 0,
						type: "fill",
						target: { label: "Password" },
						value: { kind: "literal", text: "secret" },
					},
				],
			}),
		).toThrow(/runtime parameters/);
		expect(() =>
			parseBrowserRecording({
				...base,
				startUrl: "file:///tmp/app",
				actions: [],
			}),
		).toThrow(/HTTP/);
	});
});
