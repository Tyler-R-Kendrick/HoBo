import { createHash } from "node:crypto";

import type {
	BrowserRecordingAction,
	BrowserRecordingTarget,
	CompletedBrowserRecording,
} from "./browser-recording.js";

// public-contract: deterministic reusable browser-automation export schema.
export const EVIDENCE_AUTOMATION_SCHEMA =
	"hobo.code.evidence-automation/v1" as const;
const RECORDING_CAPABILITY_ROOT = ".hobo/recordings";
const RESERVED_CAPABILITY_IDS = new Set([
	"repo",
	"sdlc",
	"draft",
	"caveman",
	"ponytail",
	"improve",
	"tdd",
	"review",
]);

export interface EvidenceAutomationArtifact {
	readonly id: `sha256:${string}`;
	readonly path: string;
	readonly mediaType: "application/json" | "text/markdown" | "text/typescript";
	readonly sha256: string;
	readonly contents: string;
}

export interface EvidenceRecordingAutomationExport {
	readonly schemaVersion: typeof EVIDENCE_AUTOMATION_SCHEMA;
	readonly capabilityId: string;
	readonly sourceRecordingId: string;
	readonly sourceArtifactRef?: string;
	readonly replayability: "ready" | "needs-input";
	readonly requiredEnvironment: readonly string[];
	readonly artifacts: readonly EvidenceAutomationArtifact[];
	readonly commands: readonly string[];
}

type ReplayableBrowserRecording = CompletedBrowserRecording & {
	readonly __replayableBrowserRecording: unique symbol;
};

/** Compile stored semantic recording evidence into agent instructions and runnable code. */
export function exportEvidenceRecordingAutomation(
	recording: CompletedBrowserRecording,
	options: { readonly name?: string; readonly sourceArtifactRef?: string } = {},
): EvidenceRecordingAutomationExport {
	const replayable = parseReplayableBrowserRecording(recording);
	const requestedId = slug(options.name ?? replayable.title ?? replayable.id);
	if (!requestedId) throw new TypeError("recording needs a reusable name");
	const capabilityId = RESERVED_CAPABILITY_IDS.has(requestedId)
		? `recording-${requestedId}`
		: requestedId;
	const root = `${RECORDING_CAPABILITY_ROOT}/${capabilityId}`;
	const specPath = `${root}/scripts/run.spec.ts`;
	const command = `pnpm exec playwright test ${specPath} --workers=1 --retries=0`;
	const requiredEnvironment = Object.freeze(
		[...new Set(replayable.actions.flatMap(environmentFor))].sort(),
	);
	const skill = renderSkill({
		capabilityId,
		command,
		recording: replayable,
		...(options.sourceArtifactRef
			? { sourceArtifactRef: options.sourceArtifactRef }
			: {}),
	});
	const spec = renderSpec(replayable);
	const source = `${JSON.stringify(replayable, null, 2)}\n`;

	return Object.freeze({
		schemaVersion: EVIDENCE_AUTOMATION_SCHEMA,
		capabilityId,
		sourceRecordingId: replayable.id,
		...(options.sourceArtifactRef
			? { sourceArtifactRef: options.sourceArtifactRef }
			: {}),
		replayability: requiredEnvironment.length > 0 ? "needs-input" : "ready",
		requiredEnvironment,
		artifacts: Object.freeze([
			artifact(`${root}/SKILL.md`, "text/markdown", skill),
			artifact(specPath, "text/typescript", spec),
			artifact(`${root}/references/recording.json`, "application/json", source),
		]),
		commands: Object.freeze([command]),
	});
}

function parseReplayableBrowserRecording(
	recording: CompletedBrowserRecording,
): ReplayableBrowserRecording {
	if (recording.status !== "completed")
		throw new TypeError("evidence automation requires a completed recording");
	if (recording.actions.length === 0)
		throw new TypeError("evidence automation requires recorded actions");
	if (new URL(recording.startUrl).origin !== new URL(recording.endUrl).origin)
		throw new TypeError(
			"cross-origin recordings cannot be exported for playback",
		);
	return recording as ReplayableBrowserRecording;
}

function renderSpec(recording: ReplayableBrowserRecording): string {
	const startUrl = new URL(recording.startUrl);
	const path = `${startUrl.pathname}${startUrl.search}${startUrl.hash}`;
	const endUrl = new URL(recording.endUrl);
	const endPath = `${endUrl.pathname}${endUrl.search}${endUrl.hash}`;
	const checkpoints = new Map(
		recording.checkpoints.map((checkpoint) => [
			checkpoint.afterAction,
			checkpoint,
		]),
	);
	const steps = recording.actions.flatMap((action, index) => {
		const rendered = [renderAction(action, index, recording.viewport)];
		const checkpoint = checkpoints.get(action.sequence);
		if (checkpoint) {
			rendered.push(
				`await expect(page).toHaveURL(new URL(${quote(checkpoint.path)}, baseURL).href);`,
			);
			if (checkpoint.title)
				rendered.push(
					`await expect(page).toHaveTitle(${quote(checkpoint.title)});`,
				);
			rendered.push(
				`await page.screenshot({ path: test.info().outputPath(${quote(`checkpoint-${checkpoint.sequence}.png`)}), animations: "disabled", caret: "hide", fullPage: true });`,
			);
		}
		return rendered;
	});
	steps.push(
		`await expect(page).toHaveURL(new URL(${quote(endPath)}, baseURL).href);`,
	);
	return `import { expect, test, type Locator } from "playwright/test";

const baseURL = process.env.HOBO_AUTOMATION_BASE_URL ?? ${quote(startUrl.origin)};

test.describe.configure({ mode: "serial", retries: 0 });
test.use({
  viewport: { width: ${recording.viewport.width}, height: ${recording.viewport.height} },
  locale: "en-US",
  timezoneId: "UTC",
  colorScheme: "light",
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(\`Required automation environment variable is missing: \${name}\`);
  return value;
}

async function recordedTarget(candidates: readonly Locator[], label: string): Promise<Locator> {
  for (const candidate of candidates) {
    try {
      await expect(candidate, label).toHaveCount(1, { timeout: 5_000 });
      return candidate;
    } catch {}
  }
  throw new Error(\`Recorded target is missing or ambiguous: \${label}\`);
}

test(${quote(recording.title)}, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(new URL(${quote(path)}, baseURL).href, { waitUntil: "domcontentloaded" });
${steps.map((step) => indent(step, 2)).join("\n")}
});
`;
}

function renderAction(
	action: BrowserRecordingAction,
	index: number,
	viewport: CompletedBrowserRecording["viewport"],
): string {
	if (action.type === "navigate")
		return `await page.goto(new URL(${quote(action.path)}, baseURL).href, { waitUntil: "domcontentloaded" });`;
	if (action.type === "scroll")
		return `await page.evaluate(([x, y]) => scrollTo(x, y), [${action.x}, ${action.y}]);`;
	if (action.type === "pointer")
		return `await page.mouse.move((page.viewportSize()?.width ?? ${viewport.width}) * ${ratio(action.x, viewport.width)}, (page.viewportSize()?.height ?? ${viewport.height}) * ${ratio(action.y, viewport.height)});`;
	if (action.type === "press" && !action.target)
		return `await page.keyboard.press(${quote(action.key)});`;
	if (!("target" in action))
		throw new TypeError("recorded action requires a target");
	const variable = `step${index + 1}`;
	const target = renderTarget(action.target);
	const declaration = `const ${variable} = await recordedTarget([${target.candidates.join(", ")}], ${quote(target.label)});`;
	if (action.type === "click")
		return `${declaration}\nawait ${variable}.click();`;
	if (action.type === "hover")
		return `${declaration}\nawait ${variable}.hover();`;
	if (action.type === "fill")
		return `${declaration}\nawait ${variable}.fill(requiredEnv(${quote(action.value.name)}));`;
	if (action.type === "press")
		return `${declaration}\nawait ${variable}.press(${quote(action.key)});`;
	throw new TypeError("recorded action type is unsupported");
}

function renderTarget(target: BrowserRecordingTarget | undefined): {
	readonly candidates: readonly string[];
	readonly label: string;
} {
	if (!target) throw new TypeError("recorded action requires a target");
	const candidates: string[] = [];
	if (target.role)
		candidates.push(
			target.name
				? `page.getByRole(${quote(target.role)}, { name: ${quote(target.name)}, exact: true })`
				: `page.getByRole(${quote(target.role)})`,
		);
	if (target.label)
		candidates.push(`page.getByLabel(${quote(target.label)}, { exact: true })`);
	if (target.testId)
		candidates.push(`page.getByTestId(${quote(target.testId)})`);
	if (target.stableId)
		candidates.push(`page.locator(${quote(`#${cssEscape(target.stableId)}`)})`);
	if (target.css) candidates.push(`page.locator(${quote(target.css)})`);
	if (candidates.length === 0)
		throw new TypeError("recorded target requires a locator");
	return {
		candidates,
		label:
			target.name ??
			target.label ??
			target.testId ??
			target.stableId ??
			target.css ??
			"target",
	};
}

function renderSkill(input: {
	readonly capabilityId: string;
	readonly command: string;
	readonly recording: CompletedBrowserRecording;
	readonly sourceArtifactRef?: string;
}): string {
	const steps = input.recording.actions.map(describeAction).join("\n");
	return `---
name: ${input.capabilityId}
description: ${quote(`Reproduce the recorded browser path: ${input.recording.title}`)}
---

# ${input.recording.title}

Source recording: \`${input.recording.id}\`${input.sourceArtifactRef ? ` (\`${input.sourceArtifactRef}\`)` : ""}

Reproduce this path with the generated semantic Playwright automation. Supply every named environment variable at runtime; never copy secrets into this skill or the recording.

## Recorded path

${steps}

## Run

\`${input.command}\`

Set \`HOBO_AUTOMATION_BASE_URL\` to replay against another deployment and run this command from the project root containing \`.hobo/recordings\`. Playback uses a stable ordered action sequence and fixed-time semantic-locator waits, pins the recorded viewport plus locale, timezone, color scheme, reduced motion, serial execution, and zero retries. Recorded offsets remain evidence rather than sleeps so replay does not depend on workstation timing. New checkpoint screenshots are emitted as test evidence on every run; locator ambiguity or recorded route/title drift fails closed.
`;
}

function describeAction(action: BrowserRecordingAction, index: number): string {
	const prefix = `${index + 1}.`;
	if (action.type === "navigate")
		return `${prefix} Navigate to ${action.path}.`;
	if (action.type === "scroll")
		return `${prefix} Scroll to ${action.x}, ${action.y}.`;
	if (action.type === "pointer")
		return `${prefix} Move the pointer to the recorded viewport-relative position.`;
	if (action.type === "press" && !action.target)
		return `${prefix} Press ${action.key}.`;
	if (!("target" in action))
		throw new TypeError("recorded action requires a target");
	const target = renderTarget(action.target).label;
	if (action.type === "click") return `${prefix} Click ${target}.`;
	if (action.type === "hover") return `${prefix} Hover ${target}.`;
	if (action.type === "fill")
		return `${prefix} Fill ${target} from \`${action.value.name}\`.`;
	if (action.type === "press")
		return `${prefix} Press ${action.key} on ${target}.`;
	throw new TypeError("recorded action type is unsupported");
}

function environmentFor(action: BrowserRecordingAction): readonly string[] {
	return action.type === "fill" ? [action.value.name] : [];
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

function ratio(value: number, dimension: number): number {
	return Number(Math.max(0, Math.min(1, value / dimension)).toFixed(6));
}

function cssEscape(value: string): string {
	return value.replace(
		/[^A-Za-z0-9_-]/gu,
		(character) => `\\${character.codePointAt(0)?.toString(16)} `,
	);
}

function indent(value: string, spaces: number): string {
	const prefix = " ".repeat(spaces);
	return value
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}
