#!/usr/bin/env node
/**
 * hobo-rift — virtual worktrees that work on this machine.
 *
 * Speaks the same shape as upstream rift (`init`, `create --name`, printing
 * the workspace path on stdout) so callers can use either, but picks the best
 * copy-on-write primitive the kernel offers instead of requiring btrfs.
 */
import { detectCapability } from "../capability.js";
import {
	createWorkspace,
	execCommand,
	initRoot,
	readRegistry,
	rebuildRegistry,
	removeWorkspace,
	runInWorkspace,
} from "../workspace.js";

const argv = process.argv.slice(2);

/**
 * Everything before `--`. The tail belongs to the command being exec'd, so a
 * `--name` inside it is the caller's argument, not ours.
 */
const sep = argv.indexOf("--");
const ours = sep >= 0 ? argv.slice(0, sep) : argv;

/** Flags that consume the next token; needed to tell a flag value from the verb. */
const VALUE_FLAGS = new Set(["--root", "--name"]);

function flag(name: string): string | undefined {
	const i = ours.indexOf(`--${name}`);
	return i >= 0 ? ours[i + 1] : undefined;
}

/**
 * The verb, wherever it sits. `hobo-rift --root /x create` and
 * `hobo-rift create --root /x` are the same request; treating argv[0] as the
 * verb silently turned the first into a help screen with exit 0.
 */
function verb(): string {
	for (let i = 0; i < ours.length; i += 1) {
		const token = ours[i] as string;
		if (token.startsWith("-")) {
			if (VALUE_FLAGS.has(token)) i += 1;
			continue;
		}
		return token;
	}
	return "help";
}

const command = verb();
const root = flag("root") ?? process.cwd();
const json = ours.includes("--json");

function emit(human: string, data: unknown): void {
	process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${human}\n`);
}

if (command === "capability") {
	const cap = detectCapability(root);
	emit(
		`${cap.tier} · ${cap.reason}${cap.isolatesInPlaceWrites ? "" : " · WARNING: in-place writes reach the source"}`,
		cap,
	);
} else if (command === "init") {
	const result = initRoot(root);
	emit(`${result.created ? "initialized" : "already registered"} ${result.root}`, result);
} else if (command === "create") {
	const name = flag("name") ?? `ws-${Date.now()}`;
	const created = createWorkspace({
		root,
		name,
		copyAll: ours.includes("--copy-all"),
	});
	if (!created.workspace) {
		process.stderr.write(`${created.reason ?? "create failed"}\n`);
		process.exit(1);
	}
	// Path on stdout, matching rift, so callers can capture it directly.
	emit(created.workspace.path, created.workspace);
} else if (command === "list") {
	const registry = readRegistry(root);
	emit(
		registry.workspaces.map((w) => `${w.name}\t${w.tier}\t${w.path}`).join("\n"),
		registry,
	);
} else if (command === "repair") {
	// Rebuild the snapshot from the journal after a torn write.
	const registry = rebuildRegistry(root);
	emit(`rebuilt ${registry.workspaces.length} workspace(s) from the journal`, registry);
} else if (command === "remove") {
	const name = flag("name");
	if (!name) {
		process.stderr.write("remove needs --name\n");
		process.exit(2);
	}
	const removed = removeWorkspace(root, name);
	emit(removed ? `removed ${name}` : `no workspace named ${name}`, {
		removed,
		name,
	});
	// Reporting success for a workspace that was never there would let a caller
	// believe it had cleaned up something it had not.
	if (!removed) process.exitCode = 1;
} else if (command === "exec") {
	const name = flag("name");
	const inner = sep >= 0 ? argv.slice(sep + 1).join(" ") : "";
	if (!name || inner.length === 0) {
		process.stderr.write("exec needs --name <name> -- <command>\n");
		process.exit(2);
	}
	const record = readRegistry(root).workspaces.find((w) => w.name === name);
	if (!record) {
		// Falling back to the source would run an agent's command against the
		// very tree the workspace exists to protect.
		process.stderr.write(`no workspace named ${name} under ${root}\n`);
		process.exit(1);
	}
	if (ours.includes("--print-cmd")) {
		process.stdout.write(`${execCommand(record, inner)}\n`);
	} else {
		process.exitCode = (await runInWorkspace(record, inner)) ?? 1;
	}
} else {
	// An unrecognised verb is a caller error; only an explicit request for help
	// is a success.
	if (command !== "help") process.exitCode = 2;
	process.stdout.write(
		[
			"hobo-rift — virtual worktrees for agent workspaces",
			"",
			"  hobo-rift capability [--root DIR] [--json]   which CoW primitive is available",
			"  hobo-rift init       [--root DIR]            register a source root",
			"  hobo-rift create --name NAME [--copy-all]    make a workspace, print its path",
			"  hobo-rift list       [--root DIR] [--json]   list workspaces",
			"  hobo-rift remove --name NAME                 delete a workspace",
			"  hobo-rift exec --name NAME -- CMD            run CMD inside the workspace",
			"  hobo-rift repair     [--root DIR]            rebuild the registry from the journal",
			"",
			"Tiers, best first: reflink · overlayfs · hardlink · copy.",
			"",
		].join("\n"),
	);
}
