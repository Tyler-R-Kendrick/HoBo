import { createHash } from "node:crypto";

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
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.5 ui-monospace, monospace; background: #171512; color: #f2eadb; }
    body { margin: 0 auto; max-width: 76rem; padding: 2rem; }
    header, section { border: 2px solid #756954; border-radius: .4rem; margin: 0 0 1rem; padding: 1rem; box-shadow: .35rem .35rem 0 #0c0b09; }
    h1, h2, h3, p { margin-top: 0; }
    ol, ul { padding-left: 1.4rem; }
    article, aside { border-top: 1px dashed #756954; padding-top: .8rem; }
    [data-state] { border-left: .4rem dashed #f2eadb; padding-left: .8rem; }
    [data-state="captured"] { border-left-style: solid; border-color: #d7a84b; }
    [data-state="verified"] { border-color: #7ecb79; }
    [data-state="stale"] { border-style: dotted; border-color: #d7a84b; }
    [data-state="missing"] { border-style: double; border-color: #df6b57; }
    .state { text-transform: uppercase; }
    .trust { display: grid; grid-template-columns: repeat(auto-fit,minmax(13rem,1fr)); gap: .5rem; margin: 1rem 0 0; }
    .trust div { border-left: .35rem solid #f2eadb; padding-left: .6rem; }
    .trust div:nth-child(2) { border-color: #d7a84b; }
    .trust div:nth-child(3) { border-color: #7ecb79; }
    .trust div:nth-child(4) { border-color: #d7a84b; }
    .trust div:nth-child(5) { border-color: #df6b57; }
    .trust dt { font-weight: 800; text-transform: uppercase; }
    .trust dd { margin: .15rem 0 0; }
    a { color: #9bc7ff; }
    button { font: inherit; padding: .5rem .75rem; }
  </style>
</head>
<body>
  <header>
    <p>HoBo evidence report · ${live ? "live projection" : "portable export"}</p>
    <h1>${escapeHtml(report.title)}</h1>
    <p>Generated <time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(report.generatedAt)}</time></p>
    <p><strong>Trust summary:</strong> ${counts.verified} verified · ${counts.captured} captured · ${counts.claimed} claimed · ${counts.stale} stale · ${counts.missing} missing</p>
    <dl class="trust" aria-label="Evidence trust states">
      <div><dt>Claimed</dt><dd>Submitted assertion; not independently checked.</dd></div>
      <div><dt>Captured</dt><dd>Content-addressed artifact recorded by the host.</dd></div>
      <div><dt>Verified</dt><dd>Acceptance evidence passed against this state.</dd></div>
      <div><dt>Stale</dt><dd>Evidence predates the current state.</dd></div>
      <div><dt>Missing</dt><dd>Required evidence has not been supplied.</dd></div>
    </dl>
    ${live && options.controlsHref ? `<a href="${escapeHtml(options.controlsHref)}">Open session controls</a>` : '<button type="button" disabled aria-disabled="true">Live controls unavailable in export</button>'}
    ${live ? '<a href="">Refresh evidence</a><span> · Live report updates when this page is refreshed.</span>' : ""}
  </header>
  <main>${sections}</main>
</body>
</html>
`;
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
