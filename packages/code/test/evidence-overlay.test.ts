import { describe, expect, it } from "vitest";

import { parseEvidenceOverlayMessage } from "../src/evidence-overlay.js";

const controlsOrigin = "http://127.0.0.1:4319";

describe("evidence overlay message boundary", () => {
	it.each([
		{
			type: "annotate",
			selector: "main > button",
			note: "The approval state is unclear.",
		},
		{ type: "capture", kind: "screenshot" },
		{ type: "report" },
		{ type: "replay", sessionId: "session-17" },
		{
			type: "edit-request",
			selector: "main > button",
			prompt: "Make the approval state explicit.",
		},
	] as const)("accepts a strict $type command", (data) => {
		expect(
			parseEvidenceOverlayMessage(
				{ origin: controlsOrigin, data },
				controlsOrigin,
			),
		).toEqual(data);
	});

	it("rejects the wrong origin before inspecting the payload", () => {
		expect(() =>
			parseEvidenceOverlayMessage(
				{ origin: "https://attacker.example", data: { type: "report" } },
				controlsOrigin,
			),
		).toThrow(/origin/);
	});

	it.each([
		null,
		{},
		{ type: "delete-project" },
		{ type: "report", extra: true },
		{ type: "capture", kind: "screen-and-audio" },
		{ type: "annotate", selector: "", note: "note" },
		{ type: "edit-request", selector: "main", prompt: "x".repeat(8_193) },
	])("rejects malformed or over-broad payloads", (data) => {
		expect(() =>
			parseEvidenceOverlayMessage(
				{ origin: controlsOrigin, data },
				controlsOrigin,
			),
		).toThrow(/message|type|field|length|capture/);
	});
});
