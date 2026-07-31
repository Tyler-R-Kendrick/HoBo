/**
 * Decide whether bare `/optimizexp` should bootstrap via init before reviewing.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { optimizexpRoot, repoRoot } from "./paths.mts";

export type NeedsInitResult = {
	needsInit: boolean;
	reasons: string[];
	personaCount: number;
	featureCount: number;
	hasProductPersona: boolean;
	hasInitReport: boolean;
};

function countPersonas(root: string): {
	count: number;
	hasProduct: boolean;
} {
	const dir = path.join(optimizexpRoot(root), "personas");
	if (!existsSync(dir)) return { count: 0, hasProduct: false };
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
	const hasProduct = files.some(
		(f) => f.startsWith("product-") || f.startsWith("role-"),
	);
	return { count: files.length, hasProduct };
}

function countFeatures(root: string): number {
	const dir = path.join(optimizexpRoot(root), "features");
	if (!existsSync(dir)) return 0;
	let n = 0;
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		if (!name.isDirectory()) continue;
		if (existsSync(path.join(dir, name.name, "feature.json"))) n++;
	}
	return n;
}

/**
 * Init is needed when OptimizeXP has nothing useful to review yet:
 * missing personas, missing features, or never product-bootstrapped.
 */
export function assessNeedsInit(root = repoRoot()): NeedsInitResult {
	const { count: personaCount, hasProduct: hasProductPersona } =
		countPersonas(root);
	const featureCount = countFeatures(root);
	const hasInitReport = existsSync(
		path.join(optimizexpRoot(root), "init-report.json"),
	);
	const reasons: string[] = [];

	if (personaCount === 0) {
		reasons.push("no personas under .optimizexp/personas/");
	}
	if (featureCount === 0) {
		reasons.push("no feature folders with feature.json under .optimizexp/features/");
	}
	// Personas exist (e.g. hand-authored) but never ran product init and no journeys
	if (personaCount > 0 && featureCount === 0) {
		reasons.push("personas present but no features — init can scaffold journeys");
	}
	// Completely fresh optimizexp tree
	if (
		personaCount === 0 &&
		featureCount === 0 &&
		!hasInitReport
	) {
		reasons.push("OptimizeXP not bootstrapped (no init-report.json)");
	}
	// Has only legacy/sample setup without product-* personas and no init
	if (
		personaCount > 0 &&
		!hasProductPersona &&
		!hasInitReport &&
		featureCount < 2
	) {
		reasons.push(
			"no product-* personas and sparse features — recommend product init",
		);
	}

	// Deduplicate reasons that always pair
	const unique = [...new Set(reasons)];
	const needsInit =
		personaCount === 0 ||
		featureCount === 0 ||
		(!hasProductPersona && !hasInitReport && featureCount < 2);

	return {
		needsInit,
		reasons: unique,
		personaCount,
		featureCount,
		hasProductPersona,
		hasInitReport,
	};
}
