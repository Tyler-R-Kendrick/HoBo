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
		| "status"
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
			sensitive?: boolean;
			value:
				| Readonly<{ kind: "literal"; text: string }>
				| Readonly<{ kind: "environment"; name: string }>;
	  }>
	| Readonly<{
			type: "move";
			target: EvidenceAutomationTarget;
			position: Readonly<{ x: number; y: number }>;
	  }>
	| Readonly<{
			type: "press";
			target: EvidenceAutomationTarget;
			key: string;
	  }>
	| Readonly<{
			type: "assert";
			target: EvidenceAutomationTarget;
			expectation:
				| Readonly<{
						kind: "visible" | "hidden" | "enabled" | "disabled";
				  }>
				| Readonly<{ kind: "text" | "value"; value: string }>
				| Readonly<{ kind: "checked"; value: boolean }>;
	  }>
	| Readonly<{ type: "assert-url"; path: string }>
	| Readonly<{ type: "screenshot"; name: string }>;

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
	return `import { expect, test, type Locator } from "playwright/test";

const baseURL = process.env.HOBO_AUTOMATION_BASE_URL ?? ${quote(startUrl.origin)};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(\`Required automation environment variable is missing: \${name}\`);
  return value;
}

async function recordedTarget(candidates: readonly Locator[], label: string): Promise<Locator> {
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
	if (step.type === "assert-url") {
		if (!step.path.startsWith("/") || step.path.length > 4_096) {
			throw new TypeError("recorded URL assertion path is invalid");
		}
		return `await expect(page).toHaveURL(new URL(${quote(step.path)}, baseURL).href);`;
	}
	if (step.type === "screenshot") {
		if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(step.name)) {
			throw new TypeError("recorded screenshot name is invalid");
		}
		return `await page.screenshot({ path: test.info().outputPath(${quote(`${step.name}.png`)}), animations: "disabled", caret: "hide", fullPage: true });`;
	}
	const target = renderTarget(step.target);
	const declaration = `const ${variable} = await recordedTarget([${target.candidates.join(", ")}], ${quote(target.label)});`;
	if (step.type === "click") {
		return `${declaration}\nawait ${variable}.click();`;
	}
	if (step.type === "fill") {
		if (step.sensitive && step.value.kind !== "environment") {
			throw new TypeError(
				"sensitive recorded values must use an environment variable",
			);
		}
		const value =
			step.value.kind === "environment"
				? `requiredEnv(${quote(environmentName(step.value.name))})`
				: quote(boundedText(step.value.text, "fill value", 8_192));
		return `${declaration}\nawait ${variable}.fill(${value});`;
	}
	if (step.type === "move") {
		const x = ratio(step.position.x, "pointer x");
		const y = ratio(step.position.y, "pointer y");
		return `${declaration}\nconst ${variable}Box = await ${variable}.boundingBox();\nif (!${variable}Box) throw new Error(${quote(`Recorded target has no layout box: ${target.label}`)});\nawait page.mouse.move(${variable}Box.x + ${variable}Box.width * ${x}, ${variable}Box.y + ${variable}Box.height * ${y});`;
	}
	if (step.type === "press") {
		return `${declaration}\nawait ${variable}.press(${quote(boundedText(step.key, "pressed key", 128))});`;
	}
	const assertion = renderAssertion(variable, step.expectation);
	return `${declaration}\n${assertion}`;
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
	if (step.type === "assert-url") {
		return `${index + 1}. Verify the browser URL is ${step.path}.`;
	}
	if (step.type === "screenshot") {
		return `${index + 1}. Capture screenshot evidence ${step.name}.png.`;
	}
	const target = renderTarget(step.target).label;
	if (step.type === "click") return `${index + 1}. Click ${target}.`;
	if (step.type === "fill") {
		return `${index + 1}. Fill ${target}${step.value.kind === "environment" ? ` from \`${environmentName(step.value.name)}\`` : ""}.`;
	}
	if (step.type === "move") {
		return `${index + 1}. Move within ${target} at ${ratio(step.position.x, "pointer x") * 100}%, ${ratio(step.position.y, "pointer y") * 100}%.`;
	}
	if (step.type === "press") {
		return `${index + 1}. Press ${boundedText(step.key, "pressed key", 128)} on ${target}.`;
	}
	return `${index + 1}. Verify ${target} ${describeExpectation(step.expectation)}.`;
}

function renderAssertion(
	variable: string,
	expectation: Extract<
		EvidenceAutomationStep,
		{ type: "assert" }
	>["expectation"],
): string {
	switch (expectation.kind) {
		case "visible":
			return `await expect(${variable}).toBeVisible();`;
		case "hidden":
			return `await expect(${variable}).toBeHidden();`;
		case "enabled":
			return `await expect(${variable}).toBeEnabled();`;
		case "disabled":
			return `await expect(${variable}).toBeDisabled();`;
		case "text":
			return `await expect(${variable}).toHaveText(${quote(boundedText(expectation.value, "expected text", 8_192))});`;
		case "value":
			return `await expect(${variable}).toHaveValue(${quote(boundedText(expectation.value, "expected value", 8_192))});`;
		case "checked":
			return expectation.value
				? `await expect(${variable}).toBeChecked();`
				: `await expect(${variable}).not.toBeChecked();`;
	}
}

function describeExpectation(
	expectation: Extract<
		EvidenceAutomationStep,
		{ type: "assert" }
	>["expectation"],
): string {
	if (expectation.kind === "text" || expectation.kind === "value") {
		return `${expectation.kind} is ${boundedText(expectation.value, `expected ${expectation.kind}`, 8_192)}`;
	}
	if (expectation.kind === "checked") {
		return expectation.value ? "is checked" : "is not checked";
	}
	return `is ${expectation.kind}`;
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

function environmentName(value: unknown): string {
	const name = boundedText(value, "environment variable name", 128);
	if (!/^[A-Z_][A-Z0-9_]*$/u.test(name)) {
		throw new TypeError("environment variable name is invalid");
	}
	return name;
}

function ratio(value: unknown, label: string): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > 1
	) {
		throw new TypeError(`${label} must be between 0 and 1`);
	}
	return value;
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
