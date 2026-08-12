import { describe, expect, it } from "vitest";

import {
	appendSignedEvidenceNote,
	type EvidenceReportInput,
	projectEvidenceReport,
	renderEvidenceReportExport,
	renderEvidenceReportHtml,
} from "../src/index.js";

const input: EvidenceReportInput = {
	reportId: "report-1",
	title: "Resident session evidence",
	generatedAt: "2026-08-11T12:00:00.000Z",
	facts: [
		{
			id: "test.unit",
			section: "tests",
			title: "Unit tests",
			detail: "42 passed",
			state: "verified",
			observedAt: "2026-08-11T11:59:00.000Z",
			artifacts: [
				{
					id: "unit-log",
					label: "Unit <report>",
					mediaType: "text/plain",
					path: "assets/unit.txt",
					sha256: "a".repeat(64),
				},
			],
		},
		{
			id: "git.branch",
			section: "git",
			title: "Branch",
			detail: "agent/evidence-report",
			state: "captured",
			observedAt: "2026-08-11T11:58:00.000Z",
		},
	],
	notes: [],
};

describe("evidence report projection", () => {
	it("keeps deterministic facts separate from append-only signed notes", () => {
		const note = {
			id: "git.branch",
			sequence: 1,
			section: "git" as const,
			body: "Ready for review",
			createdAt: "2026-08-11T12:00:00.000Z",
			signer: "agent:codex",
			signature: "sha256:note-signature",
		};
		const notes = appendSignedEvidenceNote(input.notes, note);
		const report = projectEvidenceReport({ ...input, notes });

		expect(report.sections.map(({ id }) => id)).toEqual([
			"session",
			"git",
			"tests",
			"features",
			"adrs",
			"diagrams",
			"progress",
			"replay",
		]);
		expect(report.sections[1]?.facts[0]?.detail).toBe("agent/evidence-report");
		expect(report.sections[1]?.notes[0]?.body).toBe("Ready for review");
		expect(input.notes).toEqual([]);
		expect(() =>
			appendSignedEvidenceNote(notes, {
				...note,
				id: "unsigned",
				sequence: 2,
				signature: "",
			}),
		).toThrow(/not signed/);
	});

	it("renders a safe portable HTML and manifest export with controls disabled", () => {
		const report = projectEvidenceReport({
			...input,
			title: "Evidence </title><script>alert(1)</script>",
			facts: [
				...input.facts,
				{
					id: "feature.claim",
					section: "features",
					title: "Feature",
					detail: "Claimed",
					state: "claimed",
					observedAt: input.generatedAt,
				},
				{
					id: "adr.stale",
					section: "adrs",
					title: "ADR",
					detail: "Needs refresh",
					state: "stale",
					observedAt: input.generatedAt,
				},
				{
					id: "replay.missing",
					section: "replay",
					title: "Replay",
					detail: "Not captured",
					state: "missing",
					observedAt: input.generatedAt,
				},
			],
		});

		const portable = renderEvidenceReportExport(report);
		const manifest = JSON.parse(portable.manifest) as {
			controlsEnabled: boolean;
			artifacts: Array<{ sha256: string }>;
		};

		expect(portable.html).toContain("Evidence &lt;/title&gt;&lt;script&gt;");
		expect(portable.html).not.toContain("<script>alert(1)</script>");
		expect(portable.html).toContain('href="assets/unit.txt"');
		expect(portable.html).toContain("Unit &lt;report&gt;");
		expect(portable.html).toContain("Live controls unavailable in export");
		expect(
			renderEvidenceReportHtml(report, {
				live: true,
				controlsHref: "/?token=opaque",
			}),
		).toContain("live projection");
		expect(portable.html).toContain("disabled");
		expect(portable.html).toContain("Content-Security-Policy");
		expect(manifest.controlsEnabled).toBe(false);
		expect(manifest.artifacts).toEqual([
			expect.objectContaining({ sha256: "a".repeat(64) }),
		]);
	});

	it("rejects unsafe portable artifact references", () => {
		const sourceFact = input.facts[0];
		if (!sourceFact) throw new Error("test fixture requires one fact");
		const unsafe = projectEvidenceReport({
			...input,
			facts: [
				{
					...sourceFact,
					artifacts: [
						{
							id: "unsafe",
							label: "Unsafe",
							mediaType: "text/html",
							path: "../outside.html",
							sha256: "not-a-hash",
						},
					],
				},
			],
		});

		expect(() => renderEvidenceReportExport(unsafe)).toThrow(
			/portable artifact/,
		);
	});
});
