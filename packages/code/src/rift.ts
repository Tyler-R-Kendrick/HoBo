/**
 * Virtual worktrees via rift (https://github.com/anomalyco/rift).
 *
 * Agents should not share one checkout — each needs its own tree so parallel
 * work cannot collide. rift gives copy-on-write workspaces that are near
 * instant and cheap in space, which is why it is the default here.
 *
 * The previous "rift backend" was a placeholder: it created an empty directory
 * containing a `.hobo-rift.json` marker, so an agent opening it found nothing
 * at all. This drives the real CLI, and when rift cannot run — it needs btrfs,
 * XFS/reflinks or APFS, and ships no binary for every platform — it says why
 * and the caller falls back to a git worktree rather than pretending.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface RiftRunner {
	readonly run: (
		args: readonly string[],
		cwd: string,
	) => Promise<{ code: number | null; stdout: string; stderr: string }>;
}

/**
 * Binaries we will drive, in preference order.
 *
 * `hobo-rift` is our sidecar (`packages/rift`): it keeps upstream's CLI shape
 * but adds an unprivileged-overlayfs tier, so it works on the ext4 machines
 * where upstream — which needs btrfs/XFS-reflink/APFS and ships no binary for
 * every platform — cannot run at all.
 */
export const RIFT_BINARIES = ["hobo-rift", "rift"] as const;

export type RiftFlavor = "hobo" | "upstream";

export interface RiftBinary {
	readonly path: string;
	readonly flavor: RiftFlavor;
}

/** First rift-compatible binary on PATH, sidecar preferred. */
export function resolveRiftBinary(
	env: NodeJS.ProcessEnv = process.env,
): RiftBinary | null {
	const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
	for (const name of RIFT_BINARIES) {
		for (const dir of dirs) {
			const candidate = join(dir, name);
			if (existsSync(candidate)) {
				return { path: candidate, flavor: name === "hobo-rift" ? "hobo" : "upstream" };
			}
		}
	}
	return null;
}

export function riftRunner(
	binary: string = resolveRiftBinary()?.path ?? "rift",
): RiftRunner {
	return {
		run: (args, cwd) =>
			new Promise((resolve) => {
				const child = spawn(binary, [...args], {
					cwd,
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stdout = "";
				let stderr = "";
				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (c: string) => {
					stdout += c;
				});
				child.stderr.on("data", (c: string) => {
					stderr += c;
				});
				child.on("error", (err) =>
					resolve({ code: null, stdout, stderr: String(err) }),
				);
				child.on("close", (code) => resolve({ code, stdout, stderr }));
			}),
	};
}

export function riftOnPath(
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	return resolveRiftBinary(env)?.path ?? null;
}

export interface RiftCapability {
	readonly usable: boolean;
	readonly binary: string | null;
	readonly flavor?: RiftFlavor;
	readonly reason?: string;
}

/**
 * Is rift actually usable here?
 *
 * Presence on PATH is not enough: the npm package ships per-platform binaries
 * and will happily install without one, and CoW needs a filesystem that
 * supports it. `rift list` exercises both without mutating anything.
 */
export async function probeRift(
	workspace: string,
	runner: RiftRunner,
	env: NodeJS.ProcessEnv = process.env,
): Promise<RiftCapability> {
	const found = resolveRiftBinary(env);
	if (!found) {
		return {
			usable: false,
			binary: null,
			reason: "no rift binary on PATH (build packages/rift, or npm install -g rift-snapshot)",
		};
	}
	const { path: binary, flavor } = found;
	const probe = await runner.run(["list"], workspace);
	const output = `${probe.stdout}${probe.stderr}`;
	if (/unable to locate the rift binary/i.test(output)) {
		return {
			usable: false,
			binary,
			flavor,
			reason: `rift ships no binary for this platform — ${output.trim().split("\n")[0]}`,
		};
	}
	if (probe.code === null) {
		return {
			usable: false,
			binary,
			flavor,
			reason: "rift could not be executed",
		};
	}
	return { usable: true, binary, flavor };
}

export interface RiftWorkspace {
	readonly path: string;
	readonly name: string;
}

/** Parse the workspace path rift prints on stdout. */
export function parseCreatedPath(stdout: string): string | null {
	const lines = stdout
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const last = lines[lines.length - 1];
	return last && last.startsWith("/") ? last : null;
}

/**
 * Create a virtual worktree named for the agent. `rift init` is idempotent —
 * it registers an existing root rather than converting twice — so it is safe
 * to call before every create.
 */
export async function createRiftWorkspace(
	workspace: string,
	name: string,
	runner: RiftRunner,
): Promise<{ workspace: RiftWorkspace | null; reason?: string }> {
	const init = await runner.run(["init"], workspace);
	if (init.code !== 0) {
		return {
			workspace: null,
			reason: `rift init failed: ${(init.stderr || init.stdout).trim().split("\n")[0]}`,
		};
	}
	const created = await runner.run(["create", "--name", name], workspace);
	if (created.code !== 0) {
		return {
			workspace: null,
			reason: `rift create failed: ${(created.stderr || created.stdout).trim().split("\n")[0]}`,
		};
	}
	const path = parseCreatedPath(created.stdout);
	if (!path) {
		return { workspace: null, reason: "rift create printed no workspace path" };
	}
	return { workspace: { path, name } };
}
