/**
 * Where `hobo-code` looks for skills, and how it reports what it found.
 *
 * A skill root is a directory an agent loads instructions from. Getting the
 * search wrong is quiet in the worst way: the harness starts, runs, and simply
 * behaves as though the skills were never written — no error, no missing file,
 * just an agent that does not know things it was taught.
 *
 * So three decisions carry the weight:
 *
 * **The search walks up to the monorepo root.** `hobo-code` is normally run
 * from a package worktree, and the repo's skills live at the top. Searching
 * only the working directory would find nothing in the case that matters most.
 * The walk stops at a `pnpm-workspace.yaml` or a `.git`, and falls back to the
 * starting directory when it reaches the filesystem root — a `hobo-code` run
 * outside any repo must still produce an inventory rather than climbing to `/`.
 *
 * **Absent roots are reported, not omitted.** "`.agents/skills` — not present"
 * is the answer to "why aren't my skills loading?"; a list of only what exists
 * cannot answer that question at all.
 *
 * **Each root says where it came from.** The same relative path can resolve
 * under the working directory and under the repo root, and they are different
 * directories with different contents. A reader debugging a missing skill needs
 * to know which one was searched, so the role is annotated `(cwd)` or
 * `(repo root)` rather than left ambiguous.
 *
 * Everything here runs against temporary directories, so no result depends on
 * the layout of the machine the tests run on.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CODE_HARNESS_SURFACE_SCHEMA,
	findRepoRoot,
	harnessHumanSummary,
	inspectHarnessSurface,
} from "../src/harness-surface.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-"));
	dirs.push(dir);
	return dir;
}

/** A directory tree with the given relative paths created as directories. */
function treeWith(...rels: readonly string[]): string {
	const root = tempDir();
	for (const rel of rels) mkdirSync(join(root, rel), { recursive: true });
	return root;
}

const inspect = (cwd: string, hoboHome = "/tmp/hobo-home") =>
	inspectHarnessSurface({ cwd, hoboHome });

const rootNamed = (cwd: string, rel: string) =>
	inspect(cwd).skillRoots.filter((entry) => entry.root.includes(rel));

describe("finding the repo root", () => {
	it("stops at a pnpm workspace marker", () => {
		// The monorepo root is where the repo's own skills live, and a package
		// worktree is where the command is normally run from.
		const root = tempDir();
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");
		const nested = join(root, "packages", "code");
		mkdirSync(nested, { recursive: true });
		expect(findRepoRoot(nested)).toBe(root);
	});

	it("stops at a git directory", () => {
		// Not every repo is a pnpm workspace; `.git` is the general marker.
		const root = tempDir();
		mkdirSync(join(root, ".git"));
		const nested = join(root, "src", "deep");
		mkdirSync(nested, { recursive: true });
		expect(findRepoRoot(nested)).toBe(root);
	});

	it("stops at the nearest marker, not the outermost", () => {
		// A nested repo (a vendored checkout, a worktree) is its own root;
		// climbing past it would load the outer repo's skills into it.
		const outer = tempDir();
		mkdirSync(join(outer, ".git"));
		const inner = join(outer, "vendor", "thing");
		mkdirSync(join(inner, ".git"), { recursive: true });
		expect(findRepoRoot(inner)).toBe(inner);
	});

	it("returns the starting directory when there is no marker at all", () => {
		// A `hobo-code` run outside any repo must still produce an inventory
		// rather than climbing to the filesystem root and searching there.
		const bare = tempDir();
		expect(findRepoRoot(bare)).toBe(bare);
	});

	it("returns the directory itself when it is the root", () => {
		const root = tempDir();
		mkdirSync(join(root, ".git"));
		expect(findRepoRoot(root)).toBe(root);
	});
});

describe("skill roots", () => {
	it("reports a root that exists as present", () => {
		const cwd = treeWith(".agents/skills");
		expect(
			rootNamed(cwd, ".agents/skills").some((entry) => entry.present),
		).toBe(true);
	});

	it("reports a root that does not exist rather than omitting it", () => {
		// "`.agents/skills` — not present" is the answer to "why aren't my
		// skills loading?". A list of only what exists cannot answer it.
		const cwd = tempDir();
		expect(rootNamed(cwd, ".agents/skills").length).toBeGreaterThan(0);
		expect(rootNamed(cwd, ".agents/skills").every((e) => !e.present)).toBe(
			true,
		);
	});

	it("resolves a path only for a root that is there", () => {
		// A resolved path for a directory that does not exist would send a
		// reader to check a location nothing ever reads.
		const cwd = treeWith(".claude/skills");
		const found = rootNamed(cwd, ".claude/skills").find((e) => e.present);
		expect(found?.resolvedPath).toContain(".claude/skills");
		const absent = inspect(tempDir()).skillRoots.find((e) => !e.present);
		expect(absent).not.toHaveProperty("resolvedPath");
	});

	it("looks under the working directory", () => {
		const cwd = treeWith(".agents/skills");
		expect(inspect(cwd).skillRoots.some((entry) => entry.present)).toBe(true);
	});

	it("also looks under the repo root when the cwd is a package", () => {
		// The case the walk exists for: skills at the top of the monorepo,
		// command run from a package worktree.
		const root = tempDir();
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");
		mkdirSync(join(root, ".agents", "skills"), { recursive: true });
		const cwd = join(root, "packages", "code");
		mkdirSync(cwd, { recursive: true });
		expect(inspect(cwd).skillRoots.some((entry) => entry.present)).toBe(true);
	});

	it("says which of the two a root came from", () => {
		// The same relative path resolves under both, and they are different
		// directories. A reader debugging a missing skill needs to know which
		// one was searched.
		const root = tempDir();
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");
		const cwd = join(root, "packages", "code");
		mkdirSync(cwd, { recursive: true });
		const roles = inspect(cwd).skillRoots.map((entry) => entry.role);
		expect(roles.some((role) => role.includes("(cwd)"))).toBe(true);
		expect(roles.some((role) => role.includes("(repo root)"))).toBe(true);
	});

	it("does not annotate a side when the two are the same directory", () => {
		// Running at the repo root, `(cwd)` and `(repo root)` would be the same
		// place — labelling it twice would imply two searches.
		const root = tempDir();
		mkdirSync(join(root, ".git"));
		const roles = inspect(root).skillRoots.map((entry) => entry.role);
		expect(roles.some((role) => role.includes("(cwd)"))).toBe(false);
	});

	it("lists each distinct location once", () => {
		// The candidate list names `.agents/skills` twice by design (package and
		// repo), so without de-duplication a reader would see the same directory
		// reported twice with different roles.
		const root = tempDir();
		mkdirSync(join(root, ".git"));
		const paths = inspect(root).skillRoots.map(
			(entry) => `${entry.root}::${entry.role}`,
		);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it("covers the three conventional roots", () => {
		// Recordings, repo skills, and the Claude mirror are the three places
		// skills are written; dropping any one would make those skills silently
		// unavailable.
		const roots = inspect(tempDir())
			.skillRoots.map((entry) => entry.root)
			.join(" ");
		expect(roots).toContain(".hobo/recordings");
		expect(roots).toContain(".agents/skills");
		expect(roots).toContain(".claude/skills");
	});

	it("reports the repo root it resolved", () => {
		// The hint is what lets a reader check the walk itself when the roots
		// look wrong.
		const root = tempDir();
		mkdirSync(join(root, ".git"));
		expect(inspect(root).repoRootHint).toBe(root);
	});
});

describe("the surface as a whole", () => {
	it("stamps its schema", () => {
		expect(inspect(tempDir()).schema).toBe(CODE_HARNESS_SURFACE_SCHEMA);
	});

	it("describes both harnesses", () => {
		// Pi and Flue are two entry points into one agent. Reporting only one
		// would hide the surface a reader is not currently using — which is the
		// one they need to be told about.
		const dual = inspect(tempDir()).dualSurface;
		expect(dual.pi.kind).toBe("pi-tui");
		expect(dual.flue.kind).toBe("flue-run");
	});

	it("gives each harness something to run", () => {
		// An inventory that names a surface without showing how to reach it
		// leaves the reader to search the source.
		const dual = inspect(tempDir()).dualSurface;
		expect(dual.pi.try.length).toBeGreaterThan(0);
		expect(dual.flue.try.length).toBeGreaterThan(0);
	});

	it("names the single source of truth both harnesses share", () => {
		// The rule that matters (ADR-0139): the two surfaces must never fork
		// their instructions, and the inventory is where that is stated.
		expect(inspect(tempDir()).dualSurface.sharedCustomization).toContain(
			"harness-customization",
		);
	});

	it("takes the hobo home it was given", () => {
		// Worlds are addressed under HOBO_HOME; reading the ambient one would
		// make this inventory depend on the developer's shell.
		const status = inspectHarnessSurface({
			cwd: tempDir(),
			hoboHome: "/opt/hobo-home",
		});
		expect(JSON.stringify(status.worlds)).toContain("/opt/hobo-home");
	});

	it("lists brain options with an honest status each", () => {
		// One of them is `residual` — not built. Listing it as available would
		// send someone to configure something that does not exist.
		const brain = inspect(tempDir()).brain;
		expect(brain.length).toBeGreaterThan(0);
		expect(brain.some((note) => note.status === "residual")).toBe(true);
	});

	it("marks the durable handback as wired rather than optional", () => {
		// It is the one that ships; conflating it with the MCP options would
		// suggest the local path also needs setting up.
		expect(
			inspect(tempDir()).brain.find((note) => note.id === "durable-handback")
				?.status,
		).toBe("wired");
	});

	it("describes self-improve as a loop with evidence in it", () => {
		// The claim being made is that self-improvement is instrumented rather
		// than asserted, so the loop has to name its gate.
		const loop = inspect(tempDir()).selfImprove.loop.join(" ");
		expect(loop).toMatch(/evidence/);
	});
});

describe("the human summary", () => {
	it("renders without a repo, a marker, or any skills", () => {
		// The empty case is the one a new user hits first.
		expect(harnessHumanSummary(inspect(tempDir())).length).toBeGreaterThan(0);
	});

	it("reads differently once a skill root exists", () => {
		// If present and absent rendered the same, the summary would carry no
		// information about the thing it exists to report.
		const bare = harnessHumanSummary(inspect(tempDir()));
		const withSkills = harnessHumanSummary(inspect(treeWith(".agents/skills")));
		expect(withSkills).not.toBe(bare);
	});

	it("names both harnesses", () => {
		const summary = harnessHumanSummary(inspect(tempDir()));
		expect(summary.toLowerCase()).toContain("pi");
		expect(summary.toLowerCase()).toContain("flue");
	});

	it("carries the legend so a reader knows what the panel covers", () => {
		const status = inspect(tempDir());
		expect(harnessHumanSummary(status)).toContain(status.legend);
	});
});
