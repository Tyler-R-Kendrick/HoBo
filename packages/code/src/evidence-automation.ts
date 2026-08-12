import { createHash } from "node:crypto";

// public-contract: deterministic reusable browser-automation export schema.
export const EVIDENCE_AUTOMATION_SCHEMA =
	"hobo.code.evidence-automation/v1" as const;

export type EvidenceAutomationTarget = Readonly<{
	role?:
		| "button"
		| "checkbox"
		| "combobox"
		| "heading"
		| "link"
		| "menuitem"
		| "option"
		| "radio"
		| "switch"
		| "tab"
		| "textbox";
	name?: string;
	label?: string;
	testId?: string;
	text?: string;
	css?: string;
}>;

export type EvidenceAutomationStep =
	| Readonly<{ type: "click"; target: EvidenceAutomationTarget }>
	| Readonly<{
			type: "fill";
			target: EvidenceAutomationTarget;
			value: Readonly<{ kind: "literal"; text: string }>;
	  }>;

export interface CompletedEvidenceBrowserRecording {
	readonly id: string;
	readonly title: string;
	readonly status: "completed";
	readonly startUrl: string;
	readonly steps: readonly EvidenceAutomationStep[];
}

export interface EvidenceAutomationArtifact {
	readonly id: `sha256:${string}`;
	readonly path: string;
	readonly mediaType: "text/markdown" | "text/typescript";
	readonly sha256: string;
	readonly contents: string;
}

export interface EvidenceRecordingAutomationExport {
	readonly schemaVersion: typeof EVIDENCE_AUTOMATION_SCHEMA;
	readonly capabilityId: string;
	readonly sourceRecordingId: string;
	readonly artifacts: readonly EvidenceAutomationArtifact[];
	readonly commands: readonly string[];
}

/** Convert a completed semantic browser recording into a portable capability. */
export function exportEvidenceRecordingAutomation(
	recording: CompletedEvidenceBrowserRecording,
): EvidenceRecordingAutomationExport {
	const id = boundedText(recording.id, "recording id", 256);
	const title = boundedText(recording.title, "recording title", 256);
	if (recording.status !== "completed") {
		throw new TypeError("evidence automation requires a completed recording");
	}
	const startUrl = httpUrl(recording.startUrl);
	if (!Array.isArray(recording.steps) || recording.steps.length === 0) {
		throw new TypeError("evidence automation requires recorded steps");
	}

	const capabilityId = slug(title) || slug(id);
	if (!capabilityId) throw new TypeError("recording needs a reusable name");
	const root = `automations/${capabilityId}`;
	const specPath = `${root}/automation.spec.ts`;
	const command = `pnpm exec playwright test ${specPath} --workers=1`;
	const steps = recording.steps.map((step, index) => renderStep(step, index));
	const instructions = recording.steps.map(describeStep);
	const spec = renderSpec(title, startUrl, steps);
	const skill = renderSkill({
		capabilityId,
		command,
		instructions,
		recordingId: id,
		title,
	});

	return Object.freeze({
		schemaVersion: EVIDENCE_AUTOMATION_SCHEMA,
		capabilityId,
		sourceRecordingId: id,
		artifacts: Object.freeze([
			artifact(`${root}/SKILL.md`, "text/markdown", skill),
			artifact(specPath, "text/typescript", spec),
		]),
		commands: Object.freeze([command]),
	});
}

function renderSpec(
	title: string,
	startUrl: URL,
	steps: readonly string[],
): string {
	const path = `${startUrl.pathname}${startUrl.search}${startUrl.hash}`;
	return `import { test, type Locator, type Page } from "playwright/test";

const baseURL = process.env.HOBO_AUTOMATION_BASE_URL ?? ${quote(startUrl.origin)};

async function recordedTarget(page: Page, candidates: readonly Locator[], label: string): Promise<Locator> {
  for (const candidate of candidates) {
    if (await candidate.count() === 1) return candidate;
  }
  throw new Error(\`Recorded target is missing or ambiguous: \${label}\`);
}

test(${quote(title)}, async ({ page }) => {
  await page.goto(new URL(${quote(path)}, baseURL).href, { waitUntil: "domcontentloaded" });
${steps.map((step) => indent(step, 2)).join("\n")}
});
`;
}

function renderStep(step: EvidenceAutomationStep, index: number): string {
	const variable = `step${index + 1}`;
	const target = renderTarget(step.target);
	if (step.type === "click") {
		return `const ${variable} = await recordedTarget(page, [${target.candidates.join(", ")}], ${quote(target.label)});\nawait ${variable}.click();`;
	}
	if (step.value.kind !== "literal") {
		throw new TypeError("unsupported recorded fill value");
	}
	return `const ${variable} = await recordedTarget(page, [${target.candidates.join(", ")}], ${quote(target.label)});\nawait ${variable}.fill(${quote(boundedText(step.value.text, "fill value", 8_192))});`;
}

function renderTarget(target: EvidenceAutomationTarget): {
	readonly candidates: readonly string[];
	readonly label: string;
} {
	const candidates: string[] = [];
	if (target.role) {
		candidates.push(
			target.name
				? `page.getByRole(${quote(target.role)}, { name: ${quote(boundedText(target.name, "target name", 512))}, exact: true })`
				: `page.getByRole(${quote(target.role)})`,
		);
	}
	if (target.label)
		candidates.push(
			`page.getByLabel(${quote(boundedText(target.label, "target label", 512))}, { exact: true })`,
		);
	if (target.testId)
		candidates.push(
			`page.getByTestId(${quote(boundedText(target.testId, "target test id", 512))})`,
		);
	if (target.text)
		candidates.push(
			`page.getByText(${quote(boundedText(target.text, "target text", 512))}, { exact: true })`,
		);
	if (target.css)
		candidates.push(
			`page.locator(${quote(boundedText(target.css, "target CSS", 2_048))})`,
		);
	if (candidates.length === 0) {
		throw new TypeError("recorded target requires a semantic locator or CSS");
	}
	return {
		candidates,
		label:
			target.name ??
			target.label ??
			target.testId ??
			target.text ??
			target.css ??
			"target",
	};
}

function describeStep(step: EvidenceAutomationStep, index: number): string {
	const target = renderTarget(step.target).label;
	return `${index + 1}. ${step.type === "click" ? "Click" : "Fill"} ${target}.`;
}

function renderSkill(input: {
	readonly capabilityId: string;
	readonly command: string;
	readonly instructions: readonly string[];
	readonly recordingId: string;
	readonly title: string;
}): string {
	return `---
name: ${input.capabilityId}
description: ${quote(`Reproduce the recorded browser path: ${input.title}`)}
---

# ${input.title}

Source recording: \`${input.recordingId}\`

Use this capability when an agent needs to reproduce this browser path. Prefer the generated semantic locators; do not replace them with coordinates.

## Recorded path

${input.instructions.join("\n")}

## Run

\`${input.command}\`

Set \`HOBO_AUTOMATION_BASE_URL\` to replay against another deployment. Run with one worker so the recorded path remains ordered and deterministic.
`;
}

function artifact(
	path: string,
	mediaType: EvidenceAutomationArtifact["mediaType"],
	contents: string,
): EvidenceAutomationArtifact {
	const sha256 = createHash("sha256").update(contents).digest("hex");
	return Object.freeze({
		id: `sha256:${sha256}`,
		path,
		mediaType,
		sha256,
		contents,
	});
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		value.length > maximum
	) {
		throw new TypeError(`${label} is invalid`);
	}
	return value;
}

function httpUrl(value: unknown): URL {
	const text = boundedText(value, "recording start URL", 4_096);
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		throw new TypeError("recording start URL must be absolute");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new TypeError("recording start URL must use HTTP(S)");
	}
	return url;
}

function quote(value: string): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function slug(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-|-$/gu, "")
		.slice(0, 64)
		.replace(/-$/u, "");
}

function indent(value: string, spaces: number): string {
	const prefix = " ".repeat(spaces);
	return value
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}
