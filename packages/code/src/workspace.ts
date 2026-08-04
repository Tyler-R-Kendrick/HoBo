/**
 * Where agents actually work.
 *
 * Panes used to open in `process.cwd()`, which is wherever you happened to be
 * standing. Work belongs in the **devenv workspace** — the directory that
 * declares the toolchain — so every agent starts from the same declared
 * environment rather than an accident of shell history.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface WorkspaceRoot {
	readonly path: string;
	/** How it was found — shown so the choice is auditable. */
	readonly source: "DEVENV_ROOT" | "devenv-config" | "git-root" | "cwd";
}

const DEVENV_MARKERS = ["devenv.nix", "devenv.yaml"] as const;

/**
 * Resolve the workspace root: an active devenv shell wins, then the nearest
 * ancestor declaring devenv, then the git root, then cwd as a last resort.
 */
export function findWorkspaceRoot(
	startDir: string,
	env: NodeJS.ProcessEnv = process.env,
	exists: (p: string) => boolean = existsSync,
): WorkspaceRoot {
	if (env.DEVENV_ROOT && exists(env.DEVENV_ROOT)) {
		return { path: resolve(env.DEVENV_ROOT), source: "DEVENV_ROOT" };
	}
	let dir = resolve(startDir);
	let gitRoot: string | null = null;
	// Walk up once, remembering the first git root as the fallback.
	for (;;) {
		for (const marker of DEVENV_MARKERS) {
			if (exists(join(dir, marker))) {
				return { path: dir, source: "devenv-config" };
			}
		}
		if (gitRoot === null && exists(join(dir, ".git"))) gitRoot = dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	if (gitRoot) return { path: gitRoot, source: "git-root" };
	return { path: resolve(startDir), source: "cwd" };
}
