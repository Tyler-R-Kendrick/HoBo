import { describe, expect, it } from "vitest";

import {
	parseEvidenceOverlayMessage,
	renderEvidenceOverlayBridge,
	renderEvidenceOverlayControls,
	renderEvidenceOverlayWrapper,
} from "../src/evidence-overlay.js";

const controlsOrigin = "http://127.0.0.1:4319";

describe("evidence overlay message boundary", () => {
	it.each([
		{
			type: "annotate",
			selector: "main > button",
			note: "The approval state is unclear.",
		},
		{ type: "capture", kind: "screenshot" },
		{ type: "record", action: "start" },
		{ type: "record", action: "stop" },
		{ type: "save-capability", recordingId: "recording-17", name: "Checkout" },
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
		{ type: "record", action: "pause" },
		{ type: "save-capability", recordingId: "", name: "Checkout" },
		{ type: "annotate", selector: "", note: "note" },
		{ type: "edit-request", selector: "main", prompt: "x".repeat(8_193) },
	])("rejects malformed or over-broad payloads", (data) => {
		expect(() =>
			parseEvidenceOverlayMessage(
				{ origin: controlsOrigin, data },
				controlsOrigin,
			),
		).toThrow(/message|type|field|length|capture|recording/);
	});
});

describe("evidence overlay bridge", () => {
	it("mounts a dormant accessible launcher and isolated controls", () => {
		const script = renderEvidenceOverlayBridge({
			controlsUrl: "http://127.0.0.1:4319/__hobo/evidence/controls",
		});

		expect(script).toContain('attachShadow({ mode: "closed" })');
		expect(script).toContain('aria-label=\\"Open Evidence\\"');
		expect(script).toContain('class=\\"bo\\"');
		expect(script).toContain("/__hobo/evidence/bo-idle.png");
		expect(script).not.toContain(">HoBo evidence</button>");
		expect(script).toContain('title=\\"HoBo evidence controls\\"');
		expect(script).toContain("event.origin !== controlsOrigin");
		expect(script).toContain("event.source !== frame.contentWindow");
		expect(script).toContain("target.dataset.hoboEvidenceAnnotation");
		expect(script).toContain('target.style.outline = "3px solid #c5301c"');
		expect(script).toContain("await blob.arrayBuffer()");
		expect(script).toContain("await video.arrayBuffer()");
		expect(script).toContain('headers:{"content-type":"text/plain"}');
		expect(script).toContain("prefers-reduced-motion: reduce");
		expect(script).toContain("@media (max-width: 42rem)");
		expect(script).not.toContain('postMessage(message, "*")');
		expect(() => new Function(script)).not.toThrow();
	});

	it("escapes URL source text and fails closed on a same-origin mount", () => {
		const script = renderEvidenceOverlayBridge({
			controlsUrl: "https://controls.example/evidence?label=</script>",
		});

		expect(script).not.toContain("</script>");
		expect(script).toContain("controlsOrigin === window.location.origin");
	});

	it.each([
		"/relative",
		"javascript:alert(1)",
		"file:///tmp/control.html",
	])("rejects an unsafe controls URL: %s", (controlsUrl) => {
		expect(() => renderEvidenceOverlayBridge({ controlsUrl })).toThrow(
			/controls URL/,
		);
	});
});

describe("evidence overlay privileged controls", () => {
	it("renders every approved action without exposing credentials", () => {
		const html = renderEvidenceOverlayControls({
			parentOrigin: "http://localhost:4173",
			reportUrl: "http://127.0.0.1:4319/__hobo/evidence?report=read-only",
			sessionId: "session-17",
		});

		for (const type of [
			"annotate",
			"capture",
			"record",
			"save-capability",
			"report",
			"replay",
			"edit-request",
		]) {
			expect(html).toContain(type);
		}
		expect(html).toContain("Content-Security-Policy");
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("prefers-reduced-motion: reduce");
		expect(html).toContain("@media (max-width: 32rem)");
		expect(html).toContain("postMessage(message,parentOrigin)");
		expect(html).toContain(
			'href="http://127.0.0.1:4319/__hobo/evidence?report=read-only"',
		);
		expect(html).toContain('target="_blank"');
		expect(html).toContain("Open Evidence");
		expect(html).toContain("[hidden]{display:none!important}");
		expect(html).toContain("Recording actions, navigation, and state changes.");
		expect(html).toContain("Save as capability…");
		expect(html).not.toContain('postMessage(message, "*")');
		expect(html).not.toMatch(/bearer|token|credential/iu);
	});

	it("requires an exact parent origin", () => {
		expect(() =>
			renderEvidenceOverlayControls({
				parentOrigin: "https://app.example/x",
				reportUrl: "https://controls.example/report",
			}),
		).toThrow(/parent origin/);
	});

	it("keeps repository-write authorization inside the controls document", () => {
		const html = renderEvidenceOverlayControls({
			parentOrigin: "http://localhost:4173",
			reportUrl: "http://127.0.0.1:4319/__hobo/evidence?report=read-only",
			capabilityAuthorization: "Bearer controls-only",
		});

		expect(html).toContain("Bearer controls-only");
		expect(html).toContain('fetch(location.pathname.replace("/controls/"');
		expect(html).toContain("event.source!==window.parent");
	});

	it("preserves the message-based report action for callers without a report URL", () => {
		const html = renderEvidenceOverlayControls({
			parentOrigin: "http://localhost:4173",
		});

		expect(html).toContain('data-command="report"');
		expect(html).toContain('post({type:"report"},command)');
	});
});

describe("evidence overlay iframe-wrapper fallback", () => {
	it("keeps the application and privileged controls on separate origins", () => {
		const html = renderEvidenceOverlayWrapper({
			appUrl: "http://localhost:4173/demo",
			controlsUrl: "http://127.0.0.1:4319/__hobo/evidence/controls",
		});

		expect(html).toContain('title="Development application"');
		expect(html).toContain('title="HoBo evidence controls"');
		expect(html).toContain('aria-label="Open Evidence"');
		expect(html).toContain('class="bo"');
		expect(html).toContain(".launcher[hidden]{display:none}");
		expect(html).toContain("allow-popups");
		expect(html).not.toContain("allow-popups-to-escape-sandbox");
		expect(html).toContain("event.origin !== controlsOrigin");
		expect(html).toContain("event.source !== controls.contentWindow");
		expect(html).toContain("@media (max-width: 42rem)");
		expect(html).toContain("prefers-reduced-motion: reduce");
		expect(html).not.toContain('postMessage(message, "*")');
	});

	it("rejects same-origin controls and unsafe application URLs", () => {
		expect(() =>
			renderEvidenceOverlayWrapper({
				appUrl: "https://app.example/demo",
				controlsUrl: "https://app.example/controls",
			}),
		).toThrow(/separate origin/);
		expect(() =>
			renderEvidenceOverlayWrapper({
				appUrl: "data:text/html,hello",
				controlsUrl: "https://controls.example/controls",
			}),
		).toThrow(/application URL/);
	});
});
