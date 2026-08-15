import { createHash } from "node:crypto";

import {
	evidenceDocumentCss,
	rubberhoseThemeBootScript,
	rubberhoseThemeToggleMarkup,
	rubberhoseThemeToggleScript,
} from "./evidence-chrome.js";
import type { EvidenceJournal } from "./session-evidence.js";

// public-contract: deterministic portable evidence-report schema identifier.
export const EVIDENCE_REPORT_SCHEMA = "hobo.code.evidence-report/v1" as const;

export const EVIDENCE_REPORT_SECTIONS = [
	"session",
	"git",
	"tests",
	"features",
	"adrs",
	"diagrams",
	"progress",
	"replay",
] as const;

export type EvidenceReportSectionId = (typeof EVIDENCE_REPORT_SECTIONS)[number];
export type EvidenceState =
	| "claimed"
	| "captured"
	| "verified"
	| "stale"
	| "missing";

export interface EvidenceArtifact {
	readonly id: string;
	readonly label: string;
	readonly mediaType: string;
	readonly path: string;
	readonly sha256: string;
}

export interface EvidenceFact {
	readonly id: string;
	readonly section: EvidenceReportSectionId;
	readonly title: string;
	readonly detail: string;
	readonly state: EvidenceState;
	readonly observedAt: string;
	readonly artifacts?: readonly EvidenceArtifact[];
}

export interface SignedEvidenceNote {
	readonly id: string;
	readonly sequence: number;
	readonly section: EvidenceReportSectionId;
	readonly body: string;
	readonly createdAt: string;
	readonly signer: string;
	readonly signature: string;
}

export interface EvidenceReportInput {
	readonly reportId: string;
	readonly title: string;
	readonly generatedAt: string;
	readonly facts: readonly EvidenceFact[];
	readonly notes: readonly SignedEvidenceNote[];
}

export interface EvidenceReportSection {
	readonly id: EvidenceReportSectionId;
	readonly title: string;
	readonly facts: readonly EvidenceFact[];
	readonly notes: readonly SignedEvidenceNote[];
}

export interface EvidenceReport {
	readonly schemaVersion: typeof EVIDENCE_REPORT_SCHEMA;
	readonly reportId: string;
	readonly title: string;
	readonly generatedAt: string;
	readonly sections: readonly EvidenceReportSection[];
}

export interface PortableEvidenceReportExport {
	readonly html: string;
	readonly manifest: string;
	readonly assets: readonly PortableEvidenceAsset[];
}

export interface PortableEvidenceAsset {
	readonly path: string;
	readonly mediaType: string;
	readonly sha256: string;
	readonly bytesBase64: string;
}

export interface EvidenceReportHtmlOptions {
	readonly live?: boolean;
	readonly controlsHref?: string;
}

export interface EvidenceJournalHtmlOptions {
	readonly live?: boolean;
	readonly controlsHref?: string;
	readonly journalHref?: string;
}

const SECTION_TITLES: Record<EvidenceReportSectionId, string> = {
	session: "Session",
	git: "Git",
	tests: "Tests",
	features: "Features",
	adrs: "ADRs",
	diagrams: "Diagrams",
	progress: "Progress",
	replay: "Replay",
};

export function appendSignedEvidenceNote(
	notes: readonly SignedEvidenceNote[],
	note: SignedEvidenceNote,
): readonly SignedEvidenceNote[] {
	assertSignedNote(note);
	if (notes.some(({ id }) => id === note.id)) {
		throw new Error(`duplicate evidence note: ${note.id}`);
	}
	const lastSequence = notes.at(-1)?.sequence ?? 0;
	if (!Number.isSafeInteger(note.sequence) || note.sequence <= lastSequence) {
		throw new Error("evidence note sequence must increase");
	}
	return [...notes, note];
}

export function projectEvidenceReport(
	input: EvidenceReportInput,
): EvidenceReport {
	for (const note of input.notes) assertSignedNote(note);
	return {
		schemaVersion: EVIDENCE_REPORT_SCHEMA,
		reportId: input.reportId,
		title: input.title,
		generatedAt: input.generatedAt,
		sections: EVIDENCE_REPORT_SECTIONS.map((id) => ({
			id,
			title: SECTION_TITLES[id],
			facts: input.facts
				.filter((fact) => fact.section === id)
				.sort((left, right) => compareText(left.id, right.id)),
			notes: input.notes
				.filter((note) => note.section === id)
				.sort(
					(left, right) =>
						left.sequence - right.sequence || compareText(left.id, right.id),
				),
		})),
	};
}

export function renderEvidenceReportExport(
	report: EvidenceReport,
	readArtifact?: (id: string) => Uint8Array | undefined,
): PortableEvidenceReportExport {
	const artifacts = collectPortableArtifacts(report);
	const assets = readArtifact
		? artifacts.map((artifact) => {
				const bytes = readArtifact(artifact.id);
				if (!bytes)
					throw new Error(`portable artifact is missing: ${artifact.id}`);
				if (
					createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
				) {
					throw new Error(`artifact digest mismatch: ${artifact.id}`);
				}
				return {
					path: artifact.path,
					mediaType: artifact.mediaType,
					sha256: artifact.sha256,
					bytesBase64: Buffer.from(bytes).toString("base64"),
				};
			})
		: [];
	const manifest = `${JSON.stringify(
		{
			schemaVersion: report.schemaVersion,
			reportId: report.reportId,
			generatedAt: report.generatedAt,
			controlsEnabled: false,
			sections: report.sections,
			artifacts,
		},
		null,
		2,
	)}\n`;

	return { html: renderEvidenceReportHtml(report), manifest, assets };
}

export function renderEvidenceReportHtml(
	report: EvidenceReport,
	options: EvidenceReportHtmlOptions = {},
): string {
	const sections = report.sections.map(renderSection).join("\n");
	const live = options.live === true;
	const counts = report.sections
		.flatMap(({ facts }) => facts)
		.reduce<Record<EvidenceState, number>>(
			(accumulator, { state }) => {
				accumulator[state] += 1;
				return accumulator;
			},
			{ claimed: 0, captured: 0, verified: 0, stale: 0, missing: 0 },
		);
	const actions =
		live && options.controlsHref
			? `<a class="action" href="${escapeHtml(options.controlsHref)}">Open session controls</a>`
			: '<button class="action" type="button" disabled aria-disabled="true">Live controls unavailable in export</button>';
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(report.title)}</title>
  <script>${rubberhoseThemeBootScript()}</script>
  <style>${evidenceDocumentCss()}</style>
</head>
<body class="report">
  <header>
    <div class="chrome-bar"><p class="eyebrow">HoBo evidence report · ${live ? "live projection" : "portable export"}</p>${rubberhoseThemeToggleMarkup()}</div>
    <h1>${escapeHtml(report.title)}</h1>
    <p class="meta">Generated <time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(report.generatedAt)}</time></p>
    <p><strong>Trust summary:</strong> ${counts.verified} verified · ${counts.captured} captured · ${counts.claimed} claimed · ${counts.stale} stale · ${counts.missing} missing</p>
    <dl class="trust" aria-label="Evidence trust states">
      <div data-state="claimed"><dt>Claimed</dt><dd>Submitted assertion; not independently checked.</dd></div>
      <div data-state="captured"><dt>Captured</dt><dd>Content-addressed artifact recorded by the host.</dd></div>
      <div data-state="verified"><dt>Verified</dt><dd>Acceptance evidence passed against this state.</dd></div>
      <div data-state="stale"><dt>Stale</dt><dd>Evidence predates the current state.</dd></div>
      <div data-state="missing"><dt>Missing</dt><dd>Required evidence has not been supplied.</dd></div>
    </dl>
    <nav class="actions">${actions}${live ? '<a class="action" href="">Refresh evidence</a>' : ""}</nav>
    ${live ? '<p class="meta">Live report updates when this page is refreshed.</p>' : ""}
  </header>
  <main>${sections}</main>
  <script>${rubberhoseThemeToggleScript()}</script>
</body>
</html>
`;
}

export function renderEvidenceJournalEventHtml(
	event: EvidenceJournal["events"][number],
): string {
	return renderJournalEvent(event);
}

export function renderEvidenceJournalHtml(
	journal: EvidenceJournal,
	options: EvidenceJournalHtmlOptions = {},
): string {
	const live = options.live === true;
	const session = journal.sessionId ?? "unattached";
	const occupancy = journal.occupancy ?? "occupancy unknown";
	const cwd = journal.cwd ?? "cwd unknown";
	const counts = journal.events.reduce(
		(acc, event) => {
			acc[event.kind] = (acc[event.kind] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);
	const scoreboard = (["ask", "decision", "look", "impact"] as const)
		.map(
			(kind) =>
				`<div><dt>${kind}</dt><dd>${counts[kind] ?? 0}</dd></div>`,
		)
		.join("");
	const events = journal.events.map(renderJournalEvent).join("\n");
	const empty = journal.events.length
		? ""
		: '<li class="empty">No session work yet. Tasks and Evidence fill as you talk and capture looks.</li>';
	const actions =
		live && options.controlsHref
			? `<a class="action" href="${escapeHtml(options.controlsHref)}">Open session controls</a>`
			: '<button class="action" type="button" disabled aria-disabled="true">Live controls unavailable in export</button>';
	const poll =
		live && options.journalHref
			? `<script>
const journalHref=${JSON.stringify(options.journalHref)};
const stream=document.getElementById("journal");
const seen=new Set([...stream.querySelectorAll("[data-id]")].map((node)=>node.getAttribute("data-id")));
const render=(event)=>{
  if(seen.has(event.id))return;
  seen.add(event.id);
  stream.insertAdjacentHTML("beforeend",event.html);
  if(!document.body.dataset.hold)stream.lastElementChild?.scrollIntoView({block:"end"});
};
const pull=async()=>{
  try{
    const response=await fetch(journalHref,{headers:{accept:"application/json"}});
    if(!response.ok)return;
    const body=await response.json();
    for(const event of body.events||[])render(event);
  }catch{}
};
setInterval(pull,1500);
</script>`
			: "";
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; font-src data:; base-uri 'none'; form-action 'none'">
  <title>Evidence · ${escapeHtml(session)}</title>
  <script>${rubberhoseThemeBootScript()}</script>
  <style>${evidenceDocumentCss()}</style>
</head>
<body class="report journal"${live ? " data-live" : ""}>
  <header>
    <div class="chrome-bar"><p class="eyebrow">HoBo evidence · ${live ? "live work report" : "portable work report"}</p>${rubberhoseThemeToggleMarkup()}</div>
    <h1>${escapeHtml(session)}</h1>
    <p class="meta">${escapeHtml(occupancy)} · ${escapeHtml(cwd)}</p>
    <p>Visual Tasks with provenance — why each step happened and what we looked at.</p>
    <dl class="scoreboard trust">${scoreboard}</dl>
    <nav class="actions">${actions}</nav>
  </header>
  <ol class="stream report-board" id="journal">${events}${empty}</ol>
  ${poll}
  <script>${rubberhoseThemeToggleScript()}</script>
</body>
</html>
`;
}

function formatJournalTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date
		.toISOString()
		.replace("T", " ")
		.replace(/\.\d{3}Z$/u, " UTC");
}

function renderJournalEvent(event: EvidenceJournal["events"][number]): string {
	const media = event.artifacts
		.map((artifact) => {
			if (artifact.mediaType.startsWith("image/")) {
				return `<figure class="look"><img src="${escapeHtml(artifact.path)}" alt="${escapeHtml(artifact.label)}"></figure>`;
			}
			if (artifact.mediaType.startsWith("video/")) {
				return `<figure class="look"><video controls src="${escapeHtml(artifact.path)}"></video></figure>`;
			}
			return `<p class="artifact"><a href="${escapeHtml(artifact.path)}">${escapeHtml(artifact.label)}</a></p>`;
		})
		.join("");
	const looks = event.artifacts.length;
	return `<li class="event report-card" data-id="${escapeHtml(event.id)}" data-kind="${event.kind}" data-state="${event.state}">
  <p class="meta"><time datetime="${escapeHtml(event.at)}">${escapeHtml(formatJournalTime(event.at))}</time> · ${event.kind} · ${escapeHtml(event.actor)} · ${event.state}</p>
  <h2>${escapeHtml(event.title)}</h2>
  <p class="reason">${escapeHtml(event.reason)}</p>
  <p class="provenance">provenance · ${escapeHtml(event.actor)} · ${looks} look${looks === 1 ? "" : "s"} · ${escapeHtml(event.sourceKind ?? event.kind)}</p>
  ${media}
</li>`;
}

function renderSection(section: EvidenceReportSection): string {
	const facts = section.facts.length
		? section.facts.map(renderFact).join("\n")
		: "<p>No factual evidence recorded.</p>";
	const notes = section.notes.length
		? `<h3>Signed notes</h3>\n${section.notes.map(renderNote).join("\n")}`
		: "";
	return `<section id="${section.id}">
  <h2>${escapeHtml(section.title)}</h2>
  ${facts}
  ${notes}
</section>`;
}

function renderFact(fact: EvidenceFact): string {
	const artifacts = [...(fact.artifacts ?? [])]
		.sort((left, right) => compareText(left.id, right.id))
		.map(
			(artifact) =>
				`<li><a href="${escapeHtml(artifact.path)}">${escapeHtml(artifact.label)}</a> · <code>sha256:${escapeHtml(artifact.sha256)}</code></li>`,
		)
		.join("\n");
	return `<article data-state="${fact.state}">
  <h3>${escapeHtml(fact.title)}</h3>
  <p class="state">${fact.state}</p>
  <p>${escapeHtml(fact.detail)}</p>
  <p>Observed <time datetime="${escapeHtml(fact.observedAt)}">${escapeHtml(fact.observedAt)}</time></p>
  ${artifacts ? `<ul>${artifacts}</ul>` : ""}
</article>`;
}

function renderNote(note: SignedEvidenceNote): string {
	return `<aside>
  <p>${escapeHtml(note.body)}</p>
  <p>Signed by ${escapeHtml(note.signer)} at <time datetime="${escapeHtml(note.createdAt)}">${escapeHtml(note.createdAt)}</time></p>
  <code>${escapeHtml(note.signature)}</code>
</aside>`;
}

function collectPortableArtifacts(
	report: EvidenceReport,
): readonly EvidenceArtifact[] {
	const artifacts = report.sections.flatMap(({ facts }) =>
		facts.flatMap(({ artifacts: factArtifacts = [] }) => factArtifacts),
	);
	for (const artifact of artifacts) assertPortableArtifact(artifact);
	return artifacts.sort((left, right) => compareText(left.id, right.id));
}

function assertPortableArtifact(artifact: EvidenceArtifact): void {
	const parts = artifact.path.split("/");
	if (
		parts[0] !== "assets" ||
		parts.some((part) => part === "" || part === "." || part === "..") ||
		artifact.path.includes("\\") ||
		artifact.path.includes("?") ||
		artifact.path.includes("#") ||
		[...artifact.path].some((character) => character.charCodeAt(0) < 32) ||
		!/^[a-f0-9]{64}$/u.test(artifact.sha256)
	) {
		throw new Error(`unsafe portable artifact: ${artifact.id}`);
	}
}

function assertSignedNote(note: SignedEvidenceNote): void {
	if (note.signer.trim() === "" || note.signature.trim() === "") {
		throw new Error(`evidence note is not signed: ${note.id}`);
	}
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
