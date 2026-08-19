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
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";

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

/**
 * The sidecar as resolved through node, not PATH.
 *
 * `@hobo/rift` is a workspace dependency, so its binary is always present next
 * to this package even when the user never installed anything globally.
 * Relying on PATH alone made the whole feature inert: `hobo-rift` was on
 * nobody's PATH, the probe reported "no rift binary", and every agent fell
 * back to a git worktree — the behaviour this was meant to replace.
 */
export function bundledRiftBinary(): string | null {
	try {
		const require = createRequire(import.meta.url);
		const manifest = require.resolve("@hobo/rift/package.json");
		const binary = join(dirname(manifest), "dist", "bin", "hobo-rift.js");
		return existsSync(binary) ? binary : null;
	} catch {
		return null;
	}
}

/** First rift-compatible binary available, sidecar preferred. */
export function resolveRiftBinary(
	env: NodeJS.ProcessEnv = process.env,
	bundled: () => string | null = bundledRiftBinary,
): RiftBinary | null {
	const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
	// PATH first so an explicitly installed binary still wins.
	for (const name of RIFT_BINARIES) {
		for (const dir of dirs) {
			const candidate = join(dir, name);
			if (existsSync(candidate)) {
				return {
					path: candidate,
					flavor: name === "hobo-rift" ? "hobo" : "upstream",
				};
			}
		}
	}
	const fallback = bundled();
	return fallback ? { path: fallback, flavor: "hobo" } : null;
}

export function riftRunner(
	binary: string = resolveRiftBinary()?.path ?? "rift",
): RiftRunner {
	// The bundled sidecar is a .js file with a shebang that may not be
	// executable in a fresh install, so run it through the current node.
	const [command, prefix] = binary.endsWith(".js")
		? [process.execPath, [binary]]
		: [binary, []];
	return {
		run: (args, cwd) =>
			new Promise((resolve) => {
				const child = spawn(command, [...prefix, ...args], {
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
	/** Behaviours the resolved sidecar advertises. */
	readonly contract?: RiftContract;
}

/**
 * What `hobo-code` needs a sidecar to guarantee.
 *
 * These arrived after the first sidecar release, and an older build accepts the
 * same flags while silently mangling them: `exec -- a "b c"` becomes three
 * words, so a workspace path containing a space or `;` is split — or executed.
 * PATH is searched first so an explicitly installed binary wins, which means
 * a stale one on PATH would otherwise shadow the bundled copy and take the
 * composed commands with it.
 */
export interface RiftContract {
	readonly execArgvVector?: boolean;
	readonly namespaceMarker?: boolean;
}

export function speaksContract(contract: RiftContract | undefined): boolean {
	return (
		contract?.execArgvVector === true && contract?.namespaceMarker === true
	);
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
	bundled: () => string | null = bundledRiftBinary,
): Promise<RiftCapability> {
	const found = resolveRiftBinary(env, bundled);
	if (!found) {
		return {
			usable: false,
			binary: null,
			reason:
				"no rift binary available (bundled @hobo/rift missing and none on PATH)",
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
	// Ask what it guarantees. Upstream rift has no such command and is never
	// composed against, so only the sidecar is held to this.
	let contract: RiftContract | undefined;
	if (flavor === "hobo") {
		const advertised = await runner.run(["capability", "--json"], workspace);
		if (advertised.code === 0) {
			try {
				contract = (
					JSON.parse(advertised.stdout) as { contract?: RiftContract }
				).contract;
			} catch {
				/* an older build prints something else; treated as no contract */
			}
		}
	}
	return contract !== undefined
		? { usable: true, binary, flavor, contract }
		: { usable: true, binary, flavor };
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
	return last?.startsWith("/") ? last : null;
}

/**
 * An already-registered workspace of this name, if the binary can report one.
 *
 * Only the sidecar speaks `list --json`; upstream rift prints a table, so this
 * returns null there and the caller reports the original create failure.
 */
export async function findRiftWorkspace(
	workspace: string,
	name: string,
	runner: RiftRunner,
): Promise<RiftWorkspace | null> {
	const listed = await runner.run(["list", "--json"], workspace);
	if (listed.code !== 0) return null;
	try {
		const registry = JSON.parse(listed.stdout) as {
			workspaces?: { name?: string; path?: string }[];
		};
		const match = registry.workspaces?.find((w) => w.name === name);
		return match?.path ? { path: match.path, name } : null;
	} catch {
		return null;
	}
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
		// A workspace that already exists is the normal case on the second and
		// every later `mux` in a project. Treating it as a failure made rift
		// look broken and silently dropped every agent to a git worktree — the
		// heavier, non-CoW path — from the second run onwards.
		const existing = await findRiftWorkspace(workspace, name, runner);
		if (existing) return { workspace: existing };
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
