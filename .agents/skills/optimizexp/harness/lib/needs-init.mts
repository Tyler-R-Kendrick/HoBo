/**
 * Decide whether bare `/optimizexp` should bootstrap via init before reviewing.
 * Counts personas/features across **global** and discovered **project** `.optimizexp` trees.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
	discoverProjectOptimizexpDirs,
	globalOptimizexpRoot,
	listFeatures,
	repoRoot,
	scopesForSelection,
} from "./paths.mts";
import { listPersonaMetas } from "./persona-resolve.mts";
import { resolveProjects } from "./projects.mts";

export type NeedsInitResult = {
	needsInit: boolean;
	reasons: string[];
	personaCount: number;
	featureCount: number;
	hasProductPersona: boolean;
	hasInitReport: boolean;
	/** global + project scope counts for diagnostics */
	scopes: { id: string; personas: number; features: number }[];
};

function countInDir(
	dir: string,
	kind: "personas" | "features",
): number {
	if (!existsSync(dir)) return 0;
	if (kind === "personas") {
		return readdirSync(dir).filter((f) => f.endsWith(".md")).length;
	}
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
	const selection = resolveProjects("all", root);
	const personas = listPersonaMetas(root, selection);
	const features = listFeatures(root, selection);
	const personaCount = personas.length;
	const featureCount = features.length;
	const hasProductPersona = personas.some(
		(p) => p.id.startsWith("product-") || p.id.startsWith("role-"),
	);
	const hasInitReport = existsSync(
		path.join(globalOptimizexpRoot(root), "init-report.json"),
	);

	const scopes = scopesForSelection(selection, root).map((s) => ({
		id: s.id,
		personas: countInDir(path.join(s.optimizexpDir, "personas"), "personas"),
		features: countInDir(path.join(s.optimizexpDir, "features"), "features"),
	}));
	// Include empty-but-present project dirs not in listProjects? discover helps
	for (const s of discoverProjectOptimizexpDirs(root)) {
		if (!scopes.some((x) => x.id === s.id)) {
			scopes.push({
				id: s.id,
				personas: countInDir(
					path.join(s.optimizexpDir, "personas"),
					"personas",
				),
				features: countInDir(
					path.join(s.optimizexpDir, "features"),
					"features",
				),
			});
		}
	}

	const reasons: string[] = [];

	if (personaCount === 0) {
		reasons.push(
			"no personas under global .optimizexp/personas/ or <project>/.optimizexp/personas/",
		);
	}
	if (featureCount === 0) {
		reasons.push(
			"no feature folders with feature.json under global or project .optimizexp/features/",
		);
	}
	if (personaCount > 0 && featureCount === 0) {
		reasons.push("personas present but no features — init can scaffold journeys");
	}
	if (personaCount === 0 && featureCount === 0 && !hasInitReport) {
		reasons.push("OptimizeXP not bootstrapped (no global init-report.json)");
	}
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
		scopes,
	};
}
