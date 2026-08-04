/**
 * One virtual worktree per agent.
 *
 * Agents sharing a single checkout stomp on each other: two of them editing
 * the same file is a merge conflict nobody asked for. Each agent therefore
 * gets its own tree, rooted at the devenv workspace so they all start from
 * the same declared environment.
 *
 * rift is the default because copy-on-write makes per-agent trees cheap. When
 * rift cannot run — no binary for the platform, or a filesystem without
 * reflink/btrfs support — this falls back to a git worktree, which is slower
 * and heavier but works everywhere, and the reason is reported rather than
 * swallowed.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	createRiftWorkspace,
	probeRift,
	type RiftRunner,
	riftRunner,
} from "./rift.js";

/**
 * How to enter a workspace that is not a plain directory.
 *
 * The sidecar's overlayfs tier mounts inside an unprivileged user namespace,
 * so its merged path does not exist to anyone outside that namespace — `cd`
 * would land in an empty directory. Commands must be run through
 * `hobo-rift exec`, which re-establishes the mount around them.
 */
export interface WorkspaceExec {
	readonly binary: string;
	readonly root: string;
	readonly name: string;
}

export type WorkspaceBackend = "rift" | "git-worktree" | "shared";

export interface AgentWorkspace {
	readonly agentId: string;
	readonly path: string;
	readonly backend: WorkspaceBackend;
	/** Why this backend, especially when it is not the preferred one. */
	readonly note?: string;
	/** Present when the tree can only be entered through a wrapper. */
	readonly exec?: WorkspaceExec;
}

export interface AllocateOptions {
	readonly workspaceRoot: string;
	readonly agentIds: readonly string[];
	/** Where git-worktree fallbacks live (rift manages its own location). */
	readonly fallbackRoot: string;
	readonly runner?: RiftRunner;
	readonly git?: (
		args: readonly string[],
		cwd: string,
	) => Promise<{ code: number | null; stderr: string }>;
	readonly env?: NodeJS.ProcessEnv;
	/** Skip isolation entirely and share the workspace root. */
	readonly shared?: boolean;
	/** Seam for tests: where the bundled sidecar binary is found. */
	readonly bundled?: () => string | null;
}

function defaultGit(
	args: readonly string[],
	cwd: string,
): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn("git", [...args], {
			cwd,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (c: string) => {
			stderr += c;
		});
		child.on("error", (err) => resolve({ code: null, stderr: String(err) }));
		child.on("close", (code) => resolve({ code, stderr }));
	});
}

export interface AllocationResult {
	readonly workspaces: readonly AgentWorkspace[];
	readonly backend: WorkspaceBackend;
	readonly reason?: string;
}

export async function allocateAgentWorkspaces(
	options: AllocateOptions,
): Promise<AllocationResult> {
	const {
		workspaceRoot,
		agentIds,
		fallbackRoot,
		runner = riftRunner(),
		git = defaultGit,
		env = process.env,
	} = options;

	if (options.shared) {
		return {
			backend: "shared",
			reason: "--shared: every agent uses the workspace root",
			workspaces: agentIds.map((agentId) => ({
				agentId,
				path: workspaceRoot,
				backend: "shared" as const,
			})),
		};
	}

	const capability = await probeRift(
		workspaceRoot,
		runner,
		env,
		options.bundled ?? undefined,
	);
	if (capability.usable) {
		const workspaces: AgentWorkspace[] = [];
		let failure: string | undefined;
		for (const agentId of agentIds) {
			const created = await createRiftWorkspace(workspaceRoot, agentId, runner);
			if (created.workspace) {
				workspaces.push({
					agentId,
					path: created.workspace.path,
					backend: "rift",
					// Only the sidecar has tiers that need a wrapper; upstream rift
					// always hands back a directory you can simply cd into.
					...(capability.flavor === "hobo" && capability.binary
						? {
								exec: {
									binary: capability.binary,
									root: workspaceRoot,
									name: agentId,
								},
							}
						: {}),
				});
				continue;
			}
			failure = created.reason;
			break;
		}
		if (!failure) return { backend: "rift", workspaces };
		// Partial rift success is worse than none: fall through wholesale so
		// every agent gets the same kind of tree.
		return fallbackToWorktrees(
			workspaceRoot,
			agentIds,
			fallbackRoot,
			git,
			`rift unusable: ${failure}`,
		);
	}

	return fallbackToWorktrees(
		workspaceRoot,
		agentIds,
		fallbackRoot,
		git,
		capability.reason ?? "rift unavailable",
	);
}

/** Nearest ancestor containing .git, or null. */
export function findGitRoot(
	startDir: string,
	exists: (p: string) => boolean = existsSync,
): string | null {
	let dir = resolve(startDir);
	for (;;) {
		if (exists(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

async function fallbackToWorktrees(
	workspaceRoot: string,
	agentIds: readonly string[],
	fallbackRoot: string,
	git: NonNullable<AllocateOptions["git"]>,
	reason: string,
): Promise<AllocationResult> {
	// The devenv workspace is often a package inside a larger repo, so the
	// worktree has to be cut from the enclosing git root — requiring .git in
	// the workspace itself silently downgraded everyone to a shared tree.
	const gitRoot = findGitRoot(workspaceRoot);
	if (!gitRoot) {
		// Not a git repo either — sharing is the only honest option left.
		return {
			backend: "shared",
			reason: `${reason}; workspace is not a git repository, so agents share it`,
			workspaces: agentIds.map((agentId) => ({
				agentId,
				path: workspaceRoot,
				backend: "shared" as const,
				note: reason,
			})),
		};
	}
	mkdirSync(fallbackRoot, { recursive: true });
	const workspaces: AgentWorkspace[] = [];
	for (const agentId of agentIds) {
		const path = join(fallbackRoot, agentId);
		if (existsSync(path)) {
			workspaces.push({ agentId, path, backend: "git-worktree", note: reason });
			continue;
		}
		const added = await git(
			["worktree", "add", "--detach", path, "HEAD"],
			gitRoot,
		);
		workspaces.push({
			agentId,
			path: added.code === 0 ? path : workspaceRoot,
			backend: added.code === 0 ? "git-worktree" : "shared",
			note: added.code === 0 ? reason : `${reason}; worktree add failed`,
		});
	}
	return { backend: "git-worktree", workspaces, reason };
}
