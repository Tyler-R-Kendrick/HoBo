import { describe, expect, it } from "vitest";

import {
	createStatusPageProjection,
	escapeHtml,
	parseStatusScope,
	renderStatusPageHtml,
	STATUS_SIGNAL_EVENTS,
	statusEnvelope,
	toStatusPageModel,
} from "../src/index.js";

const SCOPE = parseStatusScope({
	kind: "bindle",
	id: "shop",
	label: "shop status",
});

function modelWith(
	events: Parameters<ReturnType<typeof createStatusPageProjection>["fold"]>[0],
	evaluatedAt: string,
) {
	const projection = createStatusPageProjection();
	const row = projection.fold(events).rows["project:shop"];
	return toStatusPageModel(row, { scope: SCOPE, evaluatedAt });
}

describe("renderStatusPageHtml", () => {
	it("escapes hostile incident text (no markup injection)", () => {
		const model = modelWith(
			[
				statusEnvelope(
					STATUS_SIGNAL_EVENTS.IncidentOpened,
					{
						incidentId: "INC-1",
						title: `<script>alert("xss")</script>`,
						impact: "minor",
						affectedComponents: ['<img src=x onerror="alert(1)">'],
						currentStatus: "investigating",
					},
					{
						streamId: "status:test",
						seq: 1,
						ts: "2026-08-17T00:00:00.000Z",
						project: "shop",
					},
				),
			],
			"2026-08-17T00:05:00.000Z",
		);
		const html = renderStatusPageHtml(model);
		expect(html).not.toContain(`<script>alert`);
		expect(html).not.toContain(`onerror="alert(1)"`);
		expect(html).toContain("&lt;script&gt;");
	});

	it("ships a strict inline CSP and no external requests", () => {
		const model = modelWith([], "2026-08-17T00:00:00.000Z");
		const html = renderStatusPageHtml(model);
		expect(html).toContain(`http-equiv="Content-Security-Policy"`);
		expect(html).toContain("default-src 'none'");
		expect(html).not.toMatch(/src="https?:\/\//);
		expect(html).not.toMatch(/href="https?:\/\//);
	});

	it("renders the banner from the overall indicator", () => {
		const model = modelWith([], "2026-08-17T00:00:00.000Z");
		const html = renderStatusPageHtml(model);
		expect(html).toContain(`data-indicator="unknown"`);
		expect(html).toContain("Status delayed / unknown");
		expect(html).toContain(`role="status"`);
	});

	it("renders components with flat lamps, states, and uptime bars", () => {
		const model = modelWith(
			[
				statusEnvelope(
					STATUS_SIGNAL_EVENTS.SloMeasured,
					{
						componentId: "kit-web",
						sloName: "availability",
						attainment: 0.9995,
						target: 0.999,
						measuredAt: "2026-08-17T00:00:00.000Z",
					},
					{
						streamId: "status:test",
						seq: 1,
						ts: "2026-08-17T00:00:00.000Z",
						project: "shop",
					},
				),
			],
			"2026-08-17T00:05:00.000Z",
		);
		const html = renderStatusPageHtml(model);
		expect(html).toContain(`data-state="operational"`);
		expect(html).toContain("99.95");
		expect(html).toContain(`class="uptime"`);
		expect(html).toContain(`data-day="operational"`);
		expect(html).toContain("aria-label");
	});

	it("renders empty states honestly", () => {
		const html = renderStatusPageHtml(
			modelWith([], "2026-08-17T00:00:00.000Z"),
		);
		expect(html).toContain("No components registered yet");
		expect(html).toContain("No active incidents");
	});

	it("includes the day/night theme machinery", () => {
		const html = renderStatusPageHtml(
			modelWith([], "2026-08-17T00:00:00.000Z"),
		);
		expect(html).toContain("data-theme");
		expect(html).toContain("hobo-theme");
		expect(html).toContain("theme-toggle");
		expect(html).toContain("prefers-color-scheme: dark");
		expect(html).toContain("prefers-reduced-motion: reduce");
	});

	it("escapeHtml covers the five metacharacters", () => {
		expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
	});
});
