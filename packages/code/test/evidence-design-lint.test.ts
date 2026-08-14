import { describe, expect, it } from "vitest";

import {
	renderEvidenceOverlayBridge,
	renderEvidenceOverlayControls,
	renderEvidenceOverlayWrapper,
	renderEvidenceReportHtml,
} from "../src/index.js";
import { DESIGN_COLOR_VALUES, TUI_FORBIDDEN_HEX } from "../src/tui-tokens.js";

const reportHtml = renderEvidenceReportHtml({
	schemaVersion: "hobo.code.evidence-report/v1",
	reportId: "lint-report",
	title: "Evidence desk lint",
	generatedAt: "2026-08-14T12:00:00.000Z",
	sections: [
		{
			id: "session",
			title: "Session",
			facts: [
				{
					id: "session.one",
					section: "session",
					title: "Local session",
					detail: "running",
					state: "verified",
					observedAt: "2026-08-14T11:59:00.000Z",
				},
			],
			notes: [],
		},
	],
});

const liveReportHtml = renderEvidenceReportHtml(
	{
		schemaVersion: "hobo.code.evidence-report/v1",
		reportId: "lint-live",
		title: "Live evidence",
		generatedAt: "2026-08-14T12:00:00.000Z",
		sections: [],
	},
	{ live: true, controlsHref: "/controls" },
);

const controlsHtml = renderEvidenceOverlayControls({
	parentOrigin: "http://localhost:4173",
	reportUrl: "http://evidence.code.local.hobo.localhost:8788/",
});

const wrapperHtml = renderEvidenceOverlayWrapper({
	appUrl: "http://web.hello.local.hobo.localhost:4173/",
	controlsUrl: "http://evidence.code.local.hobo.localhost:8788/controls",
});

const bridgeScript = renderEvidenceOverlayBridge({
	controlsUrl: "http://evidence.code.local.hobo.localhost:8788/controls",
});

const surfaces: ReadonlyArray<readonly [string, string]> = [
	["evidence report", reportHtml],
	["live evidence report", liveReportHtml],
	["evidence controls", controlsHtml],
	["evidence wrapper", wrapperHtml],
	["evidence bridge", bridgeScript],
];

function expandHex(hex: string): string {
	if (/^#[0-9a-fA-F]{3}$/u.test(hex)) {
		const digits = hex.slice(1);
		return `#${digits
			.split("")
			.map((digit) => `${digit}${digit}`)
			.join("")}`.toLowerCase();
	}
	return hex.toLowerCase();
}

function hexLiterals(source: string): string[] {
	return source.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/gu) ?? [];
}

describe("Evidence SPA follows DESIGN.md tokens", () => {
	it("keeps every Evidence surface on the rubberhose palette", () => {
		for (const [name, source] of surfaces) {
			for (const hex of TUI_FORBIDDEN_HEX) {
				expect(source, `${name} must not use ${hex}`).not.toContain(hex);
			}
			for (const hex of hexLiterals(source)) {
				expect(
					DESIGN_COLOR_VALUES.has(expandHex(hex)),
					`${name} hex ${hex} must be a DESIGN.md token`,
				).toBe(true);
			}
			expect(source, `${name} must not use 1px hairlines`).not.toMatch(
				/(?:border(?:-[a-z]+)?:\s*1px|1px\s+(?:solid|dashed|dotted))/iu,
			);
			expect(source, `${name} must not use soft rgba elevation`).not.toMatch(
				/rgba\(/u,
			);
		}
	});

	it("paints the report as ink-on-paper title-card chrome", () => {
		expect(reportHtml).toContain("color-scheme:light");
		expect(reportHtml).toContain("font-family:Chewy");
		expect(reportHtml).toContain("box-shadow:4px 4px 0");
		expect(reportHtml).toMatch(/border:\s*3px solid/u);
		expect(reportHtml).toContain("prefers-reduced-motion: reduce");
		expect(reportHtml).not.toContain("color-scheme: dark");
		expect(reportHtml).toContain("system-ui");
		expect(liveReportHtml).toContain('class="action"');
	});

	it("paints the desk with thick ink and Chewy signage", () => {
		expect(controlsHtml).toContain("font-family:Chewy");
		expect(controlsHtml).toContain("Evidence desk");
		expect(controlsHtml).toMatch(/border(?:-bottom)?:\s*3px solid/u);
		expect(controlsHtml).toContain("box-shadow:4px 4px 0");
		expect(wrapperHtml).toContain("box-shadow:4px 4px 0");
		expect(bridgeScript).toContain("box-shadow:4px 4px 0");
	});
});
