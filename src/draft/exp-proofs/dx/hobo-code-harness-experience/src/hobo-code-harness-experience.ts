/**
 * DX experience proof for `hobo code` / `@hobo/code` (ADR-0139).
 * Exercises: high-value template, visual lock-in, isolation + cleanup.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyInContextEdit,
	assertEvidenceTripleComplete,
	createOpenUiSession,
	emitEvidenceTriple,
	linkGherkinToOpenFeature,
	listSandboxOrphans,
	lockVisualArtifact,
	scaffoldHighValueTemplate,
	startCodeSession,
	validateLockedVisual,
} from "@hobo/code";

export const EXPERIENCE_ID = "hobo-code-harness-experience" as const;

// domain-view: richer parse-don't-validate view over ExperienceResult wire form
export interface ExperienceResult {
	readonly isolationClean: boolean;
	readonly templateOk: boolean;
	readonly visualOk: boolean;
	readonly evidenceOk: boolean;
	readonly orphans: readonly string[];
}

/**
 * Parse, don't validate: untrusted experience outcome becomes a frozen derived
 * domain type or throws.
 */
export function parseExperienceResult(input: unknown): ExperienceResult {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new TypeError("ExperienceResult must be an object");
	}
	const source = input as Record<string, unknown>;
	const orphans = Array.isArray(source.orphans)
		? source.orphans.filter((o): o is string => typeof o === "string")
		: [];
	if (typeof source.isolationClean !== "boolean") {
		throw new TypeError("isolationClean must be boolean");
	}
	if (typeof source.templateOk !== "boolean") {
		throw new TypeError("templateOk must be boolean");
	}
	if (typeof source.visualOk !== "boolean") {
		throw new TypeError("visualOk must be boolean");
	}
	if (typeof source.evidenceOk !== "boolean") {
		throw new TypeError("evidenceOk must be boolean");
	}
	return Object.freeze({
		isolationClean: source.isolationClean,
		templateOk: source.templateOk,
		visualOk: source.visualOk,
		evidenceOk: source.evidenceOk,
		orphans: Object.freeze(orphans),
	});
}

export async function runHoboCodeHarnessExperience(): Promise<ExperienceResult> {
	const home = mkdtempSync(join(tmpdir(), "hobo-code-exp-home-"));
	const project = mkdtempSync(join(tmpdir(), "hobo-code-exp-proj-"));
	const scaffoldOut = join(project, "demo-app");

	try {
		const template = scaffoldHighValueTemplate({
			outputDir: scaffoldOut,
			appName: "demo",
		});
		const templateOk =
			template.templateId === "openui-astryx-bindle" &&
			template.respectsKonsistent &&
			template.gherkinFeature.includes("visual.feature");

		const session = await startCodeSession({
			projectRoot: project,
			hoboHome: home,
			stationId: "station:local",
		});
		session.setAgentState("dx-proof", "working", "visual lock-in");

		let visual = createOpenUiSession({
			durableRoot: session.isolation.durableRoot,
			prompt: "DX proof surface",
		});
		visual = applyInContextEdit(visual, "locked-for-codegen");
		const locked = lockVisualArtifact(visual);
		const visualOk = validateLockedVisual(locked).ok;

		const link = linkGherkinToOpenFeature(
			"Primary surface renders and is lockable",
			"app.visual.primary",
		);
		// `emitEvidenceTriple` requires the capture media to already exist — it
		// refuses to fabricate evidence, which is the behaviour worth having. This
		// proof runs headlessly and drives no browser, so it stands in the two
		// captures a real Playwright run would have produced. They are structurally
		// valid (an mp4 `ftyp` box, a PNG signature) and nothing more: this proof
		// demonstrates that the harness wires the triple together, NOT that any
		// real recording or screenshot was ever taken.
		const captureDir = mkdtempSync(join(tmpdir(), "hobo-dx-capture-"));
		const recordingMp4Path = join(captureDir, "recording.mp4");
		const screenshotPath = join(captureDir, "primary.png");
		writeFileSync(recordingMp4Path, Buffer.from("\0\0\0\u0018ftypisom"));
		writeFileSync(
			screenshotPath,
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
		);

		const triple = emitEvidenceTriple({
			durableRoot: session.isolation.durableRoot,
			flagKey: link.flagKey,
			scenario: link.scenario,
			passed: true,
			recordingMp4Path,
			screenshotPaths: [screenshotPath],
			htmlPath: locked.htmlPath,
		});
		const evidenceOk = assertEvidenceTripleComplete(triple);

		const handback = await session.complete(true, [
			"experience:template",
			"experience:visual",
			"experience:evidence",
		]);
		const orphans = listSandboxOrphans(home);

		return {
			isolationClean: handback.isolationStatus === "cleaned" && orphans.length === 0,
			templateOk,
			visualOk,
			evidenceOk,
			orphans,
		};
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(project, { recursive: true, force: true });
	}
}
