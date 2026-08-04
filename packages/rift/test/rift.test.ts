/**
 * Virtual worktrees on a machine upstream rift cannot serve.
 *
 * Upstream needs btrfs/XFS-reflink/APFS and ships per-platform binaries; on
 * plain ext4 arm64 it does not run, and hobo-code was falling back to giving
 * every agent the same checkout. These tests pin the ladder that replaces it,
 * and in particular the property that matters: an agent writing in place must
 * not reach the source.
 */
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectCapability, probeOverlayfs } from "../src/capability.js";
import { projectWorkspaces, readEvents } from "../src/journal.js";
import { parseWorkspaceName } from "../src/names.js";
import { CowTier as CowTierPb } from "../src/_generated/rift_workspace_pb.js";
import {
	capabilityToWire,
	tierFromWire,
	tierToWire,
	workspaceToWire,
} from "../src/wire.js";
import {
	createWorkspace,
	rebuildRegistry,
	entriesToClone,
	execCommand,
	initRoot,
	readRegistry,
	REGENERABLE,
	removeWorkspace,
	RIFT_DIR,
} from "../src/workspace.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function source(): string {
	const d = mkdtempSync(join(tmpdir(), "rift-src-"));
	dirs.push(d);
	mkdirSync(join(d, "src"), { recursive: true });
	mkdirSync(join(d, "node_modules", "junk"), { recursive: true });
	writeFileSync(join(d, "src", "app.ts"), "original content\n");
	writeFileSync(join(d, "README.md"), "keep\n");
	writeFileSync(join(d, "node_modules", "junk", "big.bin"), "x".repeat(50_000));
	return d;
}

describe("capability ladder", () => {
	it("prefers reflink, then overlayfs, then hardlink, then copy", () => {
		const all = detectCapability("/x", {
			reflink: () => true,
			overlayfs: () => true,
			hardlink: () => true,
		});
		expect(all.tier).toBe("reflink");
		expect(all.available).toEqual(["reflink", "overlayfs", "hardlink", "copy"]);

		const noReflink = detectCapability("/x", {
			reflink: () => false,
			overlayfs: () => true,
			hardlink: () => true,
		});
		expect(noReflink.tier).toBe("overlayfs");
	});

	it("ranks hardlink below overlayfs because in-place writes escape it", () => {
		const hard = detectCapability("/x", {
			reflink: () => false,
			overlayfs: () => false,
			hardlink: () => true,
		});
		expect(hard.tier).toBe("hardlink");
		// The whole reason for the ordering: this tier is not safe against
		// `>>` or `sed -i`, so it must announce that rather than look equal.
		expect(hard.isolatesInPlaceWrites).toBe(false);
		expect(hard.reason).toMatch(/in-place writes reach the source/);
	});

	it("always has a working last resort", () => {
		const copy = detectCapability("/x", {
			reflink: () => false,
			overlayfs: () => false,
			hardlink: () => false,
		});
		expect(copy.tier).toBe("copy");
		expect(copy.isolatesInPlaceWrites).toBe(true);
	});
});

describe("workspace creation", () => {
	it("excludes regenerable bulk by default and keeps it with copyAll", () => {
		const root = source();
		const lean = entriesToClone(root, false);
		expect(lean).toContain("src");
		expect(lean).toContain("README.md");
		expect(lean).not.toContain("node_modules");
		expect(entriesToClone(root, true)).toContain("node_modules");
		// Its own bookkeeping is never cloned into a child.
		expect(entriesToClone(root, true)).not.toContain(RIFT_DIR);
		expect(REGENERABLE).toContain("node_modules");
	});

	it("registers the root and records each workspace", () => {
		const root = source();
		expect(initRoot(root).created).toBe(true);
		expect(initRoot(root).created).toBe(false);
		const made = createWorkspace({ root, name: "claude" });
		expect(made.workspace).not.toBeNull();
		const registry = readRegistry(root);
		expect(registry.workspaces.map((w) => w.name)).toEqual(["claude"]);
		expect(removeWorkspace(root, "claude")).toBe(true);
		expect(readRegistry(root).workspaces).toEqual([]);
	});

	it("refuses to clobber an existing workspace", () => {
		const root = source();
		createWorkspace({ root, name: "dup" });
		const again = createWorkspace({ root, name: "dup" });
		expect(again.workspace).toBeNull();
		expect(again.reason).toMatch(/already exists/);
	});

	it("copy tier produces a real, independent directory", () => {
		const root = source();
		const made = createWorkspace({
			root,
			name: "copied",
			capability: {
				tier: "copy",
				available: ["copy"],
				reason: "forced",
				isolatesInPlaceWrites: true,
			},
		});
		const path = made.workspace!.path;
		expect(existsSync(join(path, "src", "app.ts"))).toBe(true);
		writeFileSync(join(path, "src", "app.ts"), "changed\n");
		expect(readFileSync(join(root, "src", "app.ts"), "utf8")).toBe(
			"original content\n",
		);
	});
});

describe("exec wrapper", () => {
	it("is a plain cd for directory-backed tiers", () => {
		expect(
			execCommand(
				{
					name: "a",
					path: "/ws/a",
					tier: "copy",
					source: "/src",
					createdAt: "",
				},
				"claude",
			),
		).toBe("cd '/ws/a' && claude");
	});

	it("single-quotes paths so the shell cannot expand them", () => {
		// JSON.stringify produces double quotes, inside which `$(…)`, backticks
		// and `\` are still interpreted — the path was an injection point.
		const cmd = execCommand(
			{
				name: "a",
				path: "/ws/$(touch pwned)",
				tier: "copy",
				source: "/src",
				createdAt: "",
			},
			"claude",
		);
		expect(cmd).toBe("cd '/ws/$(touch pwned)' && claude");
		expect(cmd).not.toContain('"');
	});

	it("survives a source path containing a space", () => {
		// Unquoted mount options split on the space, so `mount: bad usage` — and
		// because the chain used `;`, the agent's command then ran anyway, in
		// whatever directory the shell happened to be in.
		const cmd = execCommand(
			{
				name: "a",
				path: "/ws with space/merged",
				tier: "overlayfs",
				source: "/src dir",
				upper: "/ws with space/upper",
				work: "/ws with space/work",
				createdAt: "",
			},
			"claude",
		);
		expect(cmd).toContain("'lowerdir=/src dir,");
		expect(cmd).not.toMatch(/-o lowerdir=\/src dir/);
	});

	it("aborts instead of running the command when the mount fails", () => {
		const cmd = execCommand(
			{
				name: "a",
				path: "/ws/merged",
				tier: "overlayfs",
				source: "/src",
				upper: "/ws/upper",
				work: "/ws/work",
				createdAt: "",
			},
			"echo one; echo two",
		);
		// Every step joined with && and the command exec'd as a nested sh -c:
		// a `;` here would let a compound command partially run unmounted.
		expect(cmd).not.toMatch(/mount[^&]*;/);
		expect(cmd).toContain("&& exec sh -c");
	});

	it("hides the rift directory so agents cannot read each other's trees", () => {
		const cmd = execCommand(
			{
				name: "a",
				path: "/ws/merged",
				tier: "overlayfs",
				source: "/src",
				upper: "/ws/upper",
				work: "/ws/work",
				createdAt: "",
			},
			"claude",
		);
		// The whole source is the lower layer, which includes every other
		// agent's upper layer.
		expect(cmd).toContain("mount -t tmpfs none ");
		expect(cmd).toContain("/ws/merged/.hobo-rift");
	});

	it("enters a user namespace and mounts the overlay", () => {
		const cmd = execCommand(
			{
				name: "a",
				path: "/ws/a/merged",
				tier: "overlayfs",
				source: "/src",
				upper: "/ws/a/upper",
				work: "/ws/a/work",
				createdAt: "",
			},
			"claude",
		);
		expect(cmd).toContain("unshare -Urm");
		expect(cmd).toContain("lowerdir=/src");
		expect(cmd).toContain("upperdir=/ws/a/upper");
		expect(cmd).toContain("claude");
	});
});

describe("overlay availability is reported, not silently skipped", () => {
	it("says so when this machine cannot grant an unprivileged overlay", () => {
		// runIf drops the block below with no skip count in the report, so a CI
		// box without user namespaces would print "all passed" while proving
		// nothing about the tier this package exists to add.
		const available = probeOverlayfs();
		if (!available) {
			console.warn(
				"[rift] unprivileged overlayfs unavailable here — the isolation property test did NOT run",
			);
		}
		expect(typeof available).toBe("boolean");
	});
});

// The property that justifies the whole package. Skipped where the kernel
// will not give us an unprivileged overlay.
describe.runIf(probeOverlayfs())("overlayfs isolation", () => {
	it("keeps an in-place write inside the workspace", () => {
		const root = source();
		const made = createWorkspace({ root, name: "agent" });
		expect(made.workspace!.tier).toBe("overlayfs");
		execSync(`sh -c ${JSON.stringify(execCommand(made.workspace!, "echo EDIT >> src/app.ts"))}`);
		// An append is exactly what hardlinks leak; the source must be intact.
		expect(readFileSync(join(root, "src", "app.ts"), "utf8")).toBe(
			"original content\n",
		);
		expect(
			readFileSync(join(made.workspace!.upper!, "src", "app.ts"), "utf8"),
		).toContain("EDIT");
	});
});

describe("workspace names are parsed, not trusted", () => {
	it("refuses names that would escape the workspaces directory", () => {
		for (const bad of ["../evil", "..", ".", "a/b", "a\\b", "", "   "]) {
			expect(parseWorkspaceName(bad).ok).toBe(false);
		}
	});

	it("refuses every shell metacharacter, not just path separators", () => {
		// `create --name 'ws$(touch INJECTED)x'` executed the substitution in
		// the SOURCE tree — the exact tree a workspace exists to protect.
		for (const bad of [
			"ws$(touch INJECTED)x",
			"ws`id`",
			"ws;rm -rf /",
			"ws|cat",
			"ws&bg",
			"ws>out",
			"ws'q",
			'ws"q',
			"ws x",
			"ws\nx",
		]) {
			expect(parseWorkspaceName(bad).ok, bad).toBe(false);
		}
	});

	it("refuses a leading dash, which reads as a flag downstream", () => {
		expect(parseWorkspaceName("-rf").ok).toBe(false);
	});

	it("accepts ordinary agent ids", () => {
		for (const good of ["claude", "codex", "hobo-code", "agent_1"]) {
			const parsed = parseWorkspaceName(good);
			expect(parsed.ok).toBe(true);
			if (parsed.ok) expect(parsed.value).toBe(good);
		}
	});

	it("create refuses a traversing name instead of writing outside the root", () => {
		const root = source();
		const made = createWorkspace({ root, name: "../escaped" });
		expect(made.workspace).toBeNull();
		expect(made.reason).toMatch(/invalid workspace name/);
		// Nothing may have been produced next to the root.
		expect(existsSync(join(root, "..", "escaped"))).toBe(false);
	});
});

describe("registry is a projection of the journal", () => {
	it("records one event per lifecycle step", () => {
		const root = source();
		createWorkspace({ root, name: "one" });
		createWorkspace({ root, name: "two" });
		removeWorkspace(root, "one");
		const events = readEvents(join(root, RIFT_DIR));
		expect(events.map((e) => e.type)).toEqual([
			"RootInitialized",
			// Intent is recorded before the clone, which can take seconds and die.
			"WorkspaceCreating",
			"WorkspaceCreated",
			"WorkspaceCreating",
			"WorkspaceCreated",
			"WorkspaceRemoved",
		]);
		expect(projectWorkspaces(events).map((w) => w.name)).toEqual(["two"]);
	});

	it("survives a torn snapshot by replaying the journal", () => {
		const root = source();
		createWorkspace({ root, name: "alive" });
		// The crash shape: a half-written snapshot. It must cost time, not data.
		writeFileSync(join(root, RIFT_DIR, "registry.json"), '{"root":"/x","works');
		expect(readRegistry(root).workspaces.map((w) => w.name)).toEqual(["alive"]);
		expect(rebuildRegistry(root).workspaces.map((w) => w.name)).toEqual(["alive"]);
		// And the snapshot is valid again afterwards.
		expect(
			JSON.parse(readFileSync(join(root, RIFT_DIR, "registry.json"), "utf8"))
				.workspaces,
		).toHaveLength(1);
	});

	it("skips a truncated tail line rather than losing the whole journal", () => {
		const root = source();
		createWorkspace({ root, name: "kept" });
		const journal = join(root, RIFT_DIR, "events.jsonl");
		writeFileSync(journal, `${readFileSync(journal, "utf8")}{"type":"Workspace`);
		expect(projectWorkspaces(readEvents(join(root, RIFT_DIR))).map((w) => w.name)).toEqual([
			"kept",
		]);
	});
});

describe("wire boundary", () => {
	it("maps every domain tier to a distinct generated enum value", () => {
		const tiers = ["reflink", "overlayfs", "hardlink", "copy"] as const;
		const wire = tiers.map(tierToWire);
		expect(new Set(wire).size).toBe(tiers.length);
		// Round-trip: the schema and the domain cannot drift apart silently.
		expect(wire.map(tierFromWire)).toEqual([...tiers]);
		expect(tierFromWire(CowTierPb.UNSPECIFIED)).toBeNull();
	});

	it("converts a workspace record without losing the tier or the layers", () => {
		const wire = workspaceToWire({
			name: "claude",
			path: "/ws/merged",
			tier: "overlayfs",
			source: "/src",
			upper: "/ws/upper",
			work: "/ws/work",
			createdAt: "2026-08-03T00:00:00.000Z",
		});
		expect(wire.tier).toBe(CowTierPb.OVERLAYFS);
		expect(wire.upper).toBe("/ws/upper");
		// A directory-backed tier has no layers; proto3 carries that as empty.
		expect(
			workspaceToWire({
				name: "codex",
				path: "/ws/codex",
				tier: "copy",
				source: "/src",
				createdAt: "2026-08-03T00:00:00.000Z",
			}).upper,
		).toBe("");
	});

	it("reports the hardlink hazard across the wire boundary", () => {
		const wire = capabilityToWire({
			tier: "hardlink",
			available: ["hardlink", "copy"],
			reason: "no reflinks",
			isolatesInPlaceWrites: false,
		});
		expect(wire.tier).toBe(CowTierPb.HARDLINK);
		expect(wire.isolatesInPlaceWrites).toBe(false);
	});
});

describe("crash windows", () => {
	it("prefers the journal over a stale-but-valid snapshot", () => {
		// record() appends the event then rewrites the snapshot. A crash in
		// between leaves a snapshot that parses perfectly and is wrong; trusting
		// it made a real workspace invisible to list, exec and remove.
		const root = source();
		createWorkspace({ root, name: "alpha" });
		const stale = readFileSync(join(root, RIFT_DIR, "registry.json"), "utf8");
		createWorkspace({ root, name: "beta" });
		writeFileSync(join(root, RIFT_DIR, "registry.json"), stale);
		expect(readRegistry(root).workspaces.map((w) => w.name).sort()).toEqual([
			"alpha",
			"beta",
		]);
	});

	it("clears debris from a creation that never finished", () => {
		// The clone is the long part; a crash inside it left a directory that
		// nothing knew about but that blocked the name forever.
		const root = source();
		const made = createWorkspace({ root, name: "half" });
		const path = made.workspace!.path;
		expect(existsSync(path)).toBe(true);
		// Rewind the journal to just the intent, as a crash mid-clone would.
		const journal = join(root, RIFT_DIR, "events.jsonl");
		const kept = readFileSync(journal, "utf8")
			.split("\n")
			.filter((l) => l.length > 0 && !l.includes('"WorkspaceCreated"'));
		writeFileSync(journal, `${kept.join("\n")}\n`);
		expect(readRegistry(root).workspaces).toEqual([]);
		// The name is reusable rather than poisoned.
		const retry = createWorkspace({ root, name: "half" });
		expect(retry.workspace).not.toBeNull();
		expect(retry.reason).toBeUndefined();
	});
});
