import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
		expect(reportHtml).toContain("prefers-color-scheme: dark");
		expect(reportHtml).toContain("data-theme");
		expect(reportHtml).toContain("theme-toggle");
		expect(reportHtml).toContain("hobo-theme");
		expect(reportHtml).toContain("system-ui");
		expect(liveReportHtml).toContain('class="action"');
	});

	it("keeps the occupancy dashboard on DESIGN.md tokens", () => {
		const source = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), "../src/session-dashboard.ts"),
			"utf8",
		);
		expect(source).toContain("evidenceDocumentCss");
		expect(source).toContain("rubberhoseThemeBootScript");
		expect(source).toContain("theme-toggle");
		expect(source).toContain(":focus-visible");
		expect(source).not.toContain("window.alert");
		for (const hex of TUI_FORBIDDEN_HEX) {
			expect(source, `dashboard must not use ${hex}`).not.toContain(hex);
		}
		for (const hex of hexLiterals(source)) {
			expect(
				DESIGN_COLOR_VALUES.has(expandHex(hex)),
				`dashboard hex ${hex} must be a DESIGN.md token`,
			).toBe(true);
		}
	});

	it("enforces pressable-raised and icon-verb affordance laws on the dashboard", () => {
		const source = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), "../src/session-dashboard.ts"),
			"utf8",
		);
		// pressable = raised: only button.ico wears the plank costume.
		expect(source).toContain("filter: drop-shadow(3px 3px 0 var(--ink))");
		expect(
			source,
			"the plank sticker shadow must be scoped to button.ico, never span.ico",
		).not.toMatch(/span\.ico/u);
		const inertBlocks = [".lamp {", ".mark {", ".tree-kind {", ".sig {"];
		for (const opener of inertBlocks) {
			const start = source.indexOf(opener);
			expect(start, `${opener} rule must exist`).toBeGreaterThan(-1);
			const block = source.slice(start, source.indexOf("}", start));
			expect(
				block,
				`${opener} is an inert marker and must stay flat (no shadow)`,
			).not.toMatch(/shadow/u);
		}
		// icon verbs: action buttons speak in glyphs; words live in aria-label/title.
		expect(source).toMatch(/data-act='[^']*'[^>]*aria-label='/u);
		expect(source).toMatch(/aria-label='" \+ esc\(label\)/u);
		expect(source).not.toMatch(/>(start|stop|restart|copy|play)</u);
		// control-plane liveness: signal counts + re-projection, not a static page.
		expect(source).toContain("/api/telemetry");
		expect(source).toContain("visibilitychange");
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
