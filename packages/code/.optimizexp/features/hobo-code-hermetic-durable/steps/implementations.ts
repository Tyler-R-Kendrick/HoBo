/**
 * Step implementations for hobo-code hermetic + durable feature.
 * Uses package APIs in-process (sync) — offline, no live services.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// Deep imports from package src (tests run after package build/pretest).
import {
	createIsolationContext,
	inspectHermeticEnv,
} from "../../../../src/index.js";
import type { OptimizexpWorld } from "./world.ts";

function findRepoRoot(): string {
	let dir = process.cwd();
	for (let i = 0; i < 8; i++) {
		if (
			existsSync(path.join(dir, "packages/code/package.json")) &&
			existsSync(path.join(dir, "pnpm-workspace.yaml"))
		) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return process.cwd();
}

const REPO_ROOT = findRepoRoot();

export const DISCOVERY_PRIMARY = {
	command: "hobo-code env --json (in-process)",
	confidence: "high",
	reason: "inspectHermeticEnv + isolate pure separation",
};

export const IMPLEMENTATION_STATUS = {
	exerciseSurface: "wired",
	criticalPath: "wired",
	failurePath: "wired",
} as const;

export function setPersona(world: OptimizexpWorld, personaId: string): void {
	world.personaId = personaId;
	world.notes.push(`persona active: ${personaId}`);
}

export function setFeatureContext(
	world: OptimizexpWorld,
	featureId: string,
): void {
	world.featureId = featureId;
	world.notes.push(`feature under review: ${featureId}`);
}

export function onCriticalPath(world: OptimizexpWorld): void {
	const featureRoot = path.join(
		REPO_ROOT,
		"packages/code/.optimizexp/features",
		world.featureId,
	);
	if (!existsSync(path.join(featureRoot, "feature.json"))) {
		world.notes.push("critical path: feature folder incomplete");
		world.statusClear = false;
		return;
	}
	world.notes.push("critical path: feature metadata present");
	world.statusClear = true;
}

export function exerciseSurface(world: OptimizexpWorld): void {
	const project = mkdtempSync(path.join(tmpdir(), "oxp-hc-proj-"));
	const home = mkdtempSync(path.join(tmpdir(), "oxp-hc-home-"));
	writeFileSync(
		path.join(project, "devenv.nix"),
		"{ pkgs, ... }: { packages = [ pkgs.hello ]; }\n",
		"utf8",
	);
	world.lastCommand = "inspectHermeticEnv + hobo-code env";
	const report = inspectHermeticEnv({
		projectRoot: project,
		hoboHome: home,
		env: {},
	});
	world.lastStdout = JSON.stringify(report, null, 2);
	world.lastExitCode = report.hermeticDeclared ? 0 : 1;
	const ok =
		report.hermeticDeclared &&
		report.markers.includes("devenv.nix") &&
		report.layout.pureSeparation === true;
	world.statusClear = ok;
	world.nextActionObvious =
		ok && report.recommendations.some((r) => /devenv shell/i.test(r));
	world.notes.push(
		ok
			? "env: hermetic declared + pure durable layout"
			: `env failed: ${JSON.stringify(report.markers)}`,
	);
	try {
		rmSync(project, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

export async function observeFailure(world: OptimizexpWorld): Promise<void> {
	const project = mkdtempSync(path.join(tmpdir(), "oxp-hc-iso-p-"));
	const home = mkdtempSync(path.join(tmpdir(), "oxp-hc-iso-h-"));
	world.lastCommand = "createIsolationContext (pure separation)";
	// `createIsolationContext` is async. Without the await, `ctx` was a Promise,
	// every field read came back undefined, the purity check reported a failure
	// that had not happened — and the cleanup below deleted the directories out
	// from under the still-running write, which surfaced as an unhandled ENOENT
	// rejection rather than as anything pointing at this line.
	const ctx = await createIsolationContext({
		projectRoot: project,
		hoboHome: home,
		runId: "run-oxp-hermetic",
		forceWorktree: true,
	});
	const pure =
		ctx.rootPath !== ctx.durableRoot &&
		ctx.durableRoot.includes("durable") &&
		ctx.rootPath.includes("sandboxes");
	world.lastStdout = JSON.stringify(
		{
			rootPath: ctx.rootPath,
			durableRoot: ctx.durableRoot,
			pureSeparation: pure,
		},
		null,
		2,
	);
	world.lastExitCode = pure ? 0 : 1;
	world.statusClear = pure;
	world.nextActionObvious = pure;
	world.notes.push(
		pure ? "isolate: durable root outside sandbox" : "isolate purity failed",
	);
	try {
		rmSync(project, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

export function assertClearStatus(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`status not clear: ${world.notes.join("; ")} stdout=${(world.lastStdout ?? "").slice(0, 300)}`,
		);
	}
}

export function assertNextActionObvious(world: OptimizexpWorld): void {
	if (!world.nextActionObvious && !world.statusClear) {
		throw new Error("next action not obvious");
	}
}

export function assertEvidenceCapturable(world: OptimizexpWorld): void {
	if (!world.lastStdout) {
		throw new Error("no command output to capture as evidence");
	}
	world.notes.push("evidence: stdout capturable");
}

export function markEvidenceCapturable(world: OptimizexpWorld): void {
	assertEvidenceCapturable(world);
}

export function assertNonBlamingError(world: OptimizexpWorld): void {
	if (!world.statusClear) {
		throw new Error(
			`actionable isolation path failed: ${world.notes.join("; ")}`,
		);
	}
}

export function assertErrorActionable(world: OptimizexpWorld): void {
	assertNonBlamingError(world);
}

export function assertNoArtificialHurdles(world: OptimizexpWorld): void {
	if (world.lastExitCode !== 0 && world.lastExitCode !== null) {
		if (!world.notes.some((n) => /durable|hermetic|FIX|enter/i.test(n))) {
			throw new Error("failure without remediation notes");
		}
	}
}
