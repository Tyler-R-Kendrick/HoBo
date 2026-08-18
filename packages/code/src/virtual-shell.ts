/**
 * A pane gets a virtual terminal over a virtual filesystem, not a real shell.
 *
 * rift already gives each agent its own copy-on-write tree, which stops agents
 * colliding with each other. It does nothing about what a command *is*: an
 * agent in a rift workspace can still `curl | sh`, read `~/.aws/credentials`,
 * or `rm -rf` its way out through an absolute path. The tree is isolated; the
 * process is not.
 *
 * So the pane runs a bash **interpreter** (just-bash) rather than `/bin/bash`.
 * There is no `execve`: every command is a TypeScript implementation dispatched
 * from a registry, so a command that is not on the allow-list does not exist at
 * all — `rm` reports `command not found` rather than being blocked by a rule
 * someone can forget to write. The filesystem underneath is an overlay rooted
 * at the agent's workspace: reads come from the real tree, writes stay in
 * memory until promotion, and paths cannot escape the root.
 *
 * This is not a substitute for a VM. just-bash executes inside this process, so
 * it is a governance and blast-radius boundary — what an agent can name and
 * touch — not a defence against hostile native code. `packages/rift` handles
 * the filesystem side of the same problem; this handles the command side.
 */

import { Bash, MountableFs, OverlayFs, ReadWriteFs } from "just-bash";

import { discoverEveAgentTrees } from "./agent-harness-init.js";

// public-contract: where a workspace is mounted inside the virtual filesystem.
export const VIRTUAL_WORKSPACE = "/workspace";
/** Where registered Eve agents appear inside the virtual filesystem. */
export const VIRTUAL_AGENTS = "/agents";

export interface AgentVfsMount {
	readonly id: string;
	readonly path: string;
}

/**
 * Commands an agent gets by default.
 *
 * Read, search and inspect freely; write within the workspace; nothing that
 * reaches the network, spawns anything, or changes the machine. Everything
 * absent from this list is absent from the shell, which is why the list is the
 * policy rather than a description of one.
 */
export const DEFAULT_COMMANDS = [
	// look around
	"pwd",
	"ls",
	"tree",
	"stat",
	"file",
	"readlink",
	// read
	"cat",
	"head",
	"tail",
	"wc",
	"od",
	"strings",
	// search
	"grep",
	"egrep",
	"fgrep",
	"rg",
	// `find` carries `-delete`, so "rm is absent" does not mean "nothing can
	// delete". In the default overlay that only removes the in-memory copy; with
	// `writable: true` it removes the real file. Kept because searching a tree
	// without it is painful, and named here so the limit is not a surprise.
	"find",
	// transform
	"awk",
	"sed",
	"cut",
	"sort",
	"uniq",
	"tr",
	"tac",
	"rev",
	"paste",
	"join",
	"comm",
	"column",
	"nl",
	"fold",
	"expand",
	"unexpand",
	"split",
	"xargs",
	"printf",
	"echo",
	"diff",
	// structured data
	"jq",
	"yq",
	// write, inside the workspace only
	"touch",
	"mkdir",
	"cp",
	"mv",
	"ln",
	// digests, for evidence
	"md5sum",
	"sha1sum",
	"sha256sum",
	"base64",
] as const;

export type VirtualCommand = (typeof DEFAULT_COMMANDS)[number];

export interface VirtualShellOptions {
	/**
	 * Real directory to mount.
	 *
	 * For a **virtualized** pane this is the project source, not a rift
	 * workspace: rift's overlay tier mounts inside a user namespace, so its
	 * merged path is an empty directory to any process outside that namespace —
	 * including this one. The two mechanisms answer the same question with
	 * different machinery, and a virtualized pane needs only one of them.
	 * `mountFor` below picks correctly given a rift record.
	 */
	readonly workspace: string;
	/**
	 * Persist writes to the real tree. Default false: writes stay in memory, so
	 * an agent's exploration cannot touch the checkout until it is promoted.
	 */
	readonly writable?: boolean;
	/** Override the command allow-list. Anything absent does not exist. */
	readonly commands?: readonly string[];
	/** Environment visible inside the shell. Nothing is inherited. */
	readonly env?: Readonly<Record<string, string>>;
	/** Ceiling on a single command's runtime. */
	readonly timeoutMs?: number;
	/** Explicit Eve/agent trees to mount at `/agents/<id>`. */
	readonly agentMounts?: readonly AgentVfsMount[];
	/** Discover `agent/` under the workspace (default true). */
	readonly mountEve?: boolean;
}

/**
 * Commands that can remove files despite `rm` being absent.
 *
 * Named rather than implied: a reader who sees no `rm` in the allow-list will
 * otherwise conclude that a virtual pane cannot delete anything, and that is
 * not true.
 */
export const DELETION_CAPABLE = ["find"] as const;

export interface VirtualRun {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	/** True when the command did not exist — the usual shape of a denial. */
	readonly refused: boolean;
}

export interface VirtualShell {
	readonly workspace: string;
	readonly writable: boolean;
	readonly commands: readonly string[];
	run(command: string): Promise<VirtualRun>;
}

/**
 * The environment a virtual shell starts with.
 *
 * Deliberately not `process.env`: inheriting it would hand the agent every
 * token the harness happens to hold — `HOBO_*`, cloud credentials, `SSH_AUTH_SOCK`
 * — inside a shell whose whole point is that it holds nothing.
 */
function baseEnv(
	extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
	return {
		HOME: VIRTUAL_WORKSPACE,
		PWD: VIRTUAL_WORKSPACE,
		PATH: "/usr/bin:/bin",
		TERM: "dumb",
		...extra,
	};
}

function resolveAgentMounts(
	options: VirtualShellOptions,
): readonly AgentVfsMount[] {
	if (options.agentMounts) return options.agentMounts;
	if (options.mountEve === false) return [];
	const trees = discoverEveAgentTrees(options.workspace);
	const root = trees.find((tree) => tree.id === "agent");
	return root ? [{ id: "", path: root.path }] : [];
}

export function createVirtualShell(options: VirtualShellOptions): VirtualShell {
	const commands = [...(options.commands ?? DEFAULT_COMMANDS)];
	const writable = options.writable === true;
	// OverlayFs reads the real tree and keeps writes in memory; ReadWriteFs
	// actually writes. Both refuse to resolve a path outside their root and
	// refuse symlinks, so `cat /etc/passwd` and `../../secrets` are both simply
	// not there.
	// ReadWriteFs is rooted at `/` with no mount point of its own, so the
	// writable case composes it under a MountableFs to keep both variants
	// presenting the workspace at the same path.
	// Symlinks are refused, which is right — a symlink is the classic way out
	// of a rooted filesystem — but it has a cost worth knowing: in a pnpm
	// workspace *every* dependency is one, so an agent reading
	// `node_modules/...` gets a bare `No such file or directory` with
	// `refused: false`, i.e. a policy answer that looks like a missing file.
	//
	// just-bash's `allowSymlinks` does not fix that case: it permits only links
	// whose target stays inside the mounted root, and a pnpm dependency link
	// points outside it. Mounting the repository root instead of the package
	// is the thing that actually helps, so the option is deliberately not
	// exposed rather than offered as a fix that is not one.
	const agentMounts = resolveAgentMounts(options);
	const fs =
		agentMounts.length === 0 && !writable
			? new OverlayFs({
					root: options.workspace,
					mountPoint: VIRTUAL_WORKSPACE,
				})
			: new MountableFs({
					mounts: [
						{
							mountPoint: VIRTUAL_WORKSPACE,
							filesystem: writable
								? new ReadWriteFs({ root: options.workspace })
								: new OverlayFs({
										root: options.workspace,
										mountPoint: "/",
									}),
						},
						...agentMounts.map((mount) => {
							const mountPoint = mount.id
								? `${VIRTUAL_AGENTS}/${mount.id}`
								: VIRTUAL_AGENTS;
							return {
								mountPoint,
								filesystem: new OverlayFs({
									root: mount.path,
									mountPoint: "/",
								}),
							};
						}),
					],
				});
	const bash = new Bash({
		fs,
		cwd: VIRTUAL_WORKSPACE,
		env: baseEnv(options.env),
		commands: commands as never,
		// No `network` key at all: without it just-bash does not even define
		// curl/wget, so there is nothing to allow-list around.
		executionLimits: {
			maxExecutionTimeMs: options.timeoutMs ?? 30_000,
		} as never,
	});

	return {
		workspace: options.workspace,
		writable,
		commands,
		async run(command: string): Promise<VirtualRun> {
			try {
				const result = await bash.exec(command);
				const stderr = result.stderr ?? "";
				return {
					stdout: result.stdout ?? "",
					stderr,
					exitCode: result.exitCode,
					// How the allow-list speaks. just-bash reports an absent command
					// as its own dispatch failure prefixed `bash: `, with two
					// different messages depending on why it is absent ("command not
					// found" for one left off the list, "not available in browser
					// environments" for an optional runtime like python3). Both are
					// the same answer to the caller: that command does not exist here.
					refused:
						result.exitCode === 127 &&
						/^bash: \S+: (command not found|command not available)/mu.test(
							stderr,
						),
				};
			} catch (error) {
				// A limit breach or a security violation throws rather than
				// returning; surface it as a failed run instead of a crash so a
				// pane reports it like any other bad command.
				return {
					stdout: "",
					stderr: error instanceof Error ? error.message : String(error),
					exitCode: 1,
					refused: false,
				};
			}
		},
	};
}

/**
 * Which real directory a virtual shell should mount for a rift workspace.
 *
 * Directory-backed tiers (reflink, hardlink, copy) produce a real path that any
 * process can read, so the workspace itself is right. The overlay tier does
 * not: its merged view exists only inside the namespace `hobo-rift exec`
 * creates, and mounting it from outside yields an empty shell that reports
 * `No such file or directory` for every file in the project. There, the source
 * is what to mount — just-bash's own overlay supplies the copy-on-write that
 * rift would otherwise have provided.
 */
export function mountFor(workspace: {
	readonly path: string;
	readonly tier: string;
	readonly source: string;
}): string {
	return workspace.tier === "overlayfs" ? workspace.source : workspace.path;
}

/** Is this command name available in a shell built with these options? */
export function isAllowed(
	command: string,
	commands: readonly string[] = DEFAULT_COMMANDS,
): boolean {
	return commands.includes(command);
}
