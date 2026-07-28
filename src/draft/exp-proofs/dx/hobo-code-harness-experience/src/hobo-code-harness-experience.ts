/**
 * DX experience proof for `hobo code` / `@hobo/code` (ADR-0139).
 * Exercises: high-value template, visual lock-in, isolation + cleanup.
 */
import { mkdtempSync, rmSync } from "node:fs";
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

export function runHoboCodeHarnessExperience(): ExperienceResult {
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

		const session = startCodeSession({
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
		const triple = emitEvidenceTriple({
			durableRoot: session.isolation.durableRoot,
			flagKey: link.flagKey,
			scenario: link.scenario,
			passed: true,
			htmlPath: locked.htmlPath,
		});
		const evidenceOk = assertEvidenceTripleComplete(triple);

		const handback = session.complete(true, [
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
