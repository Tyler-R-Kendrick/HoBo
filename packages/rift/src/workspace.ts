/**
 * Virtual worktrees, built on whatever this machine can actually do.
 *
 * A workspace is a directory an agent can work in without disturbing the
 * source. How it is produced depends on the tier (see capability.ts):
 *
 * - reflink / hardlink / copy → a real directory on disk, ready to `cd` into.
 * - overlayfs → layers on disk plus a merged path that only exists inside a
 *   mount namespace, so the caller runs commands through `exec`.
 *
 * Regenerable artifacts (node_modules, target, dist, .venv, caches) are
 * excluded by default, matching rift: they are the bulk of the bytes and the
 * cheapest thing to rebuild. `--copy-all` keeps them.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Capability, type CowTier, detectCapability } from "./capability.js";
import {
	abandonedCreations,
	appendEvent,
	journalPath,
	projectWorkspaces,
	readEvents,
	type WorkspaceEvent,
} from "./journal.js";
import { parseWorkspaceName, type WorkspaceName } from "./names.js";

// public-contract: marker identifying a registered rift root.
export const RIFT_DIR = ".hobo-rift";

/** Bulk that rebuilds itself; excluded unless the caller asks for everything. */
export const REGENERABLE = [
	"node_modules",
	"target",
	"dist",
	"build",
	"coverage",
	".venv",
	".turbo",
	".next",
	".cache",
] as const;

// Carries a branded WorkspaceName (names.ts) and overlay layers present only
// for the overlay tier — neither of which proto3 can express.
// domain-view: wire form is hobo.rift.v1.WorkspaceRecord; src/wire.ts converts.
export interface WorkspaceRecord {
	readonly name: string;
	readonly path: string;
	readonly tier: CowTier;
	readonly source: string;
	/** Overlay layers, when the tier needs them. */
	readonly upper?: string;
	readonly work?: string;
	readonly createdAt: string;
}

// Holds the derived WorkspaceRecord above rather than the generated one.
// domain-view: wire form is hobo.rift.v1.Registry; src/wire.ts converts.
export interface Registry {
	readonly root: string;
	readonly workspaces: readonly WorkspaceRecord[];
}

function registryPath(root: string): string {
	return join(root, RIFT_DIR, "registry.json");
}

function riftDir(root: string): string {
	return join(root, RIFT_DIR);
}

/**
 * Current workspaces, projected from the journal.
 *
 * The journal is the authority, always. An earlier version preferred
 * `registry.json` whenever it *parsed*, which is wrong in the exact window
 * `record()` creates: the event is appended and the snapshot rewritten as two
 * steps, so a crash between them leaves a snapshot that is stale but perfectly
 * valid — and preferring it made a real workspace invisible to `list`, `exec`
 * and `remove` until someone thought to run `repair`. The snapshot is a
 * convenience for other readers, not a source of truth; the journal is small
 * enough that reading it is not worth being wrong over.
 */
export function readRegistry(root: string): Registry {
	const abs = resolve(root);
	const dir = riftDir(abs);
	if (existsSync(journalPath(dir))) {
		return { root: abs, workspaces: projectWorkspaces(readEvents(dir)) };
	}
	// No journal: a root from before journalling, or one that was never
	// initialised. The snapshot is all there is.
	const file = registryPath(abs);
	if (existsSync(file)) {
		try {
			const snapshot = JSON.parse(readFileSync(file, "utf8")) as Registry;
			if (Array.isArray(snapshot.workspaces)) {
				return { root: abs, workspaces: snapshot.workspaces };
			}
		} catch {
			/* unreadable and no journal — report empty rather than guessing */
		}
	}
	return { root: abs, workspaces: [] };
}

/** Rebuild the snapshot from the journal. Exposed as `hobo-rift repair`. */
export function rebuildRegistry(root: string): Registry {
	const abs = resolve(root);
	const registry: Registry = {
		root: abs,
		workspaces: projectWorkspaces(readEvents(riftDir(abs))),
	};
	writeRegistry(registry);
	return registry;
}

/** Append a creation event and refresh the snapshot. */
function recordCreated(root: string, workspace: WorkspaceRecord): void {
	record(root, {
		type: "WorkspaceCreated",
		at: workspace.createdAt,
		workspace,
	});
}

/** Append the event, then refresh the snapshot it projects to. */
function record(root: string, event: WorkspaceEvent): void {
	appendEvent(riftDir(root), event);
	writeRegistry({
		root,
		workspaces: projectWorkspaces(readEvents(riftDir(root))),
	});
}

function writeRegistry(registry: Registry): void {
	mkdirSync(join(registry.root, RIFT_DIR), { recursive: true });
	writeFileSync(
		registryPath(registry.root),
		`${JSON.stringify(registry, null, 2)}\n`,
		"utf8",
	);
}

export function initRoot(root: string): { root: string; created: boolean } {
	const abs = resolve(root);
	const created = !existsSync(join(abs, RIFT_DIR));
	mkdirSync(join(abs, RIFT_DIR, "workspaces"), { recursive: true });
	if (created) {
		writeRegistry({ root: abs, workspaces: [] });
		record(abs, {
			type: "RootInitialized",
			at: new Date().toISOString(),
			root: abs,
		});
	}
	return { root: abs, created };
}

/** Entries to clone, honouring the regenerable-artifact exclusion. */
export function entriesToClone(
	source: string,
	copyAll: boolean,
	list: (dir: string) => string[] = (d) => readdirSync(d),
): string[] {
	return list(source).filter((entry) => {
		if (entry === RIFT_DIR) return false;
		if (copyAll) return true;
		return !REGENERABLE.includes(entry as (typeof REGENERABLE)[number]);
	});
}

function cloneArgs(tier: CowTier): string[] {
	if (tier === "reflink") return ["-a", "--reflink=always"];
	if (tier === "hardlink") return ["-al"];
	return ["-a"];
}

export interface CreateOptions {
	readonly root: string;
	readonly name: string;
	readonly copyAll?: boolean;
	readonly capability?: Capability;
}

export interface CreateResult {
	readonly workspace: WorkspaceRecord | null;
	readonly reason?: string;
}

export function createWorkspace(options: CreateOptions): CreateResult {
	const root = resolve(options.root);
	// Parse before the name is ever joined onto a path: an unchecked name is a
	// traversal primitive, not just bad input.
	const parsed = parseWorkspaceName(options.name);
	if (!parsed.ok) {
		return { workspace: null, reason: `invalid workspace name: ${parsed.reason}` };
	}
	const name: WorkspaceName = parsed.value;
	if (!existsSync(join(root, RIFT_DIR))) initRoot(root);
	const capability = options.capability ?? detectCapability(root);
	const base = join(root, RIFT_DIR, "workspaces", name);
	if (existsSync(base)) {
		// A directory with no completed creation is debris from a crash during
		// the clone, not a workspace. Refusing forever would be the wrong answer.
		const abandoned = abandonedCreations(readEvents(riftDir(root))).some(
			(a) => a.name === name,
		);
		if (!abandoned) {
			return { workspace: null, reason: `workspace "${name}" already exists` };
		}
		rmSync(base, { recursive: true, force: true });
	}
	// Intent first: the filesystem work below can take seconds and can die.
	record(root, {
		type: "WorkspaceCreating",
		at: new Date().toISOString(),
		name,
		path: base,
	});

	if (capability.tier === "overlayfs") {
		// The merged view only exists inside a mount namespace, so we lay down
		// the layers now and mount them per-exec.
		const upper = join(base, "upper");
		const work = join(base, "work");
		const merged = join(base, "merged");
		for (const dir of [upper, work, merged]) mkdirSync(dir, { recursive: true });
		const made: WorkspaceRecord = {
			name,
			path: merged,
			tier: "overlayfs",
			source: root,
			upper,
			work,
			createdAt: new Date().toISOString(),
		};
		recordCreated(root, made);
		return { workspace: made };
	}

	mkdirSync(base, { recursive: true });
	for (const entry of entriesToClone(root, options.copyAll === true)) {
		const copied = spawnSync(
			"cp",
			[...cloneArgs(capability.tier), join(root, entry), join(base, entry)],
			{ stdio: "ignore" },
		);
		if (copied.status !== 0) {
			rmSync(base, { recursive: true, force: true });
			return {
				workspace: null,
				reason: `clone failed for "${entry}" using ${capability.tier}`,
			};
		}
	}
	const made: WorkspaceRecord = {
		name,
		path: base,
		tier: capability.tier,
		source: root,
		createdAt: new Date().toISOString(),
	};
	recordCreated(root, made);
	return { workspace: made };
}

export function removeWorkspace(root: string, name: string): boolean {
	const abs = resolve(root);
	const parsed = parseWorkspaceName(name);
	if (!parsed.ok) return false;
	const registry = readRegistry(abs);
	const existing = registry.workspaces.find((w) => w.name === parsed.value);
	const base = join(abs, RIFT_DIR, "workspaces", parsed.value);
	// Record the removal before deleting: a crash mid-rm then leaves debris
	// that `create` can clear, rather than a workspace the registry still
	// advertises and `exec` cannot enter.
	record(abs, {
		type: "WorkspaceRemoved",
		at: new Date().toISOString(),
		name: parsed.value,
	});
	if (existsSync(base)) rmSync(base, { recursive: true, force: true });
	return existing !== undefined;
}

/**
 * POSIX single-quoting. `JSON.stringify` looks close enough and is not: it
 * produces double quotes, inside which `$`, backticks and backslashes are
 * still interpreted by the shell.
 */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/gu, `'\\''`)}'`;
}

/**
 * Escape a path for use inside a mount option list.
 *
 * `-o` options are comma-separated and `key=value` colon-separated, so a path
 * containing either has to be backslash-escaped or the kernel sees a different
 * option list than intended. A space simply split the argument and the mount
 * failed outright.
 */
export function escapeMountPath(path: string): string {
	return path.replace(/([\\,:])/gu, "\\$1");
}

/**
 * Build the command that runs `command` inside a workspace.
 *
 * For directory-backed tiers this is just a `cd`. For overlayfs it enters a
 * user namespace, mounts the overlay, and execs — which is what makes the
 * isolation real without needing root.
 */
export function execCommand(
	record: WorkspaceRecord,
	command: string,
): string {
	if (record.tier !== "overlayfs") {
		return `cd ${shellQuote(record.path)} && ${command}`;
	}
	const options = [
		`lowerdir=${escapeMountPath(record.source)}`,
		`upperdir=${escapeMountPath(record.upper ?? "")}`,
		`workdir=${escapeMountPath(record.work ?? "")}`,
	].join(",");
	const mount = `mount -t overlay overlay -o ${shellQuote(options)} ${shellQuote(record.path)}`;
	// Every step is joined with `&&`, and the caller's command is `exec`d as a
	// nested `sh -c` so that a compound command cannot partially run when the
	// mount fails. A `;` here is a data-loss bug, not a style choice: with an
	// unmounted workspace the agent's command would run in whatever directory
	// the shell happened to be in — outside the isolation entirely.
	// The whole source is the lower layer, so the merged view would otherwise
	// expose `.hobo-rift/workspaces/<every other agent>/upper` — one agent
	// reading (and with the upper layer, effectively watching) another's work.
	// An empty tmpfs over that path hides it inside this namespace only.
	const hide = `mkdir -p ${shellQuote(join(record.path, RIFT_DIR))} && mount -t tmpfs none ${shellQuote(join(record.path, RIFT_DIR))}`;
	const inner = `${mount} && ${hide} && cd ${shellQuote(record.path)} && exec sh -c ${shellQuote(command)}`;
	return `unshare -Urm sh -c ${shellQuote(inner)}`;
}

export function runInWorkspace(
	record: WorkspaceRecord,
	command: string,
): Promise<number | null> {
	return new Promise((resolvePromise) => {
		const child = spawn("sh", ["-c", execCommand(record, command)], {
			stdio: "inherit",
		});
		child.on("error", () => resolvePromise(null));
		child.on("exit", (code) => resolvePromise(code));
	});
}
