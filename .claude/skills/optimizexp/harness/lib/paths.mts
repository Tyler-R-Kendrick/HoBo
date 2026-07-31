import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export function repoRoot(start = process.cwd()): string {
	let dir = path.resolve(start);
	for (;;) {
		if (existsSync(path.join(dir, ".optimizexp"))) return dir;
		if (existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return process.cwd();
		dir = parent;
	}
}

export function optimizexpRoot(root = repoRoot()): string {
	return path.join(root, ".optimizexp");
}

export function featuresRoot(root = repoRoot()): string {
	return path.join(optimizexpRoot(root), "features");
}

export function featureDir(featureId: string, root = repoRoot()): string {
	return path.join(featuresRoot(root), featureId);
}

export function evidenceDir(
	featureId: string,
	scenario: string,
	root = repoRoot(),
): string {
	return path.join(featureDir(featureId, root), "evidence", scenario);
}

export function skillHarnessDir(root = repoRoot()): string {
	const agents = path.join(
		root,
		".agents/skills/optimizexp/harness",
	);
	if (existsSync(agents)) return agents;
	return path.join(root, ".claude/skills/optimizexp/harness");
}
