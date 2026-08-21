/**
 * Discovering Eve-shaped agents in a project.
 *
 * A project can declare agents in two places: the current `.hobo/agents/` and
 * a legacy `agent/` directory that older projects still use. Both are walked
 * so that neither kind of project silently has no agents, and the rule when
 * they collide is fixed: **`.hobo/agents` wins**. A legacy tree shadowing the
 * current one would make an edit under `.hobo/agents` appear to do nothing.
 *
 * **A directory is an agent only if it carries `instructions.md` or
 * `agent.ts`.** Everything else under those roots — a `README`, a stray
 * `node_modules`, a half-created directory — is skipped. Admitting them would
 * populate the catalog with entries that cannot be run.
 *
 * **The subtree is recursive through `subagents/`**, and the recursion applies
 * the same test at every level, so a subagent directory that is not an agent
 * does not truncate its siblings.
 *
 * **Creation validates the id before touching the filesystem.** The id becomes
 * a directory name and a catalog key, so a path separator or an uppercase
 * letter in it is refused rather than normalized — normalizing would let two
 * different requested ids land on one directory.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	type AgentsCatalogFs,
	createProjectEveAgent,
	discoverProjectEveAgents,
	isValidEveAgentId,
} from "../src/agents-catalog.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agents-"));
	dirs.push(dir);
	return dir;
}

/**
 * An in-memory filesystem built from a path → contents map.
 *
 * A value of `null` marks a directory; a string is a file's text. Directories
 * are also implied by any path beneath them, so a tree is written as its
 * leaves.
 */
function fakeFs(tree: Record<string, string | null>): AgentsCatalogFs {
	const files = new Map<string, string>();
	const directories = new Set<string>();
	for (const [path, contents] of Object.entries(tree)) {
		const normalized = path.replaceAll("/", "/");
		if (contents === null) directories.add(normalized);
		else files.set(normalized, contents);
		// Every ancestor of an entry is a directory.
		const parts = normalized.split("/");
		for (let i = 1; i < parts.length; i += 1) {
			directories.add(parts.slice(0, i).join("/") || "/");
		}
	}
	return {
		exists: (path) => files.has(path) || directories.has(path),
		isDirectory: (path) => directories.has(path),
		readdir: (path) => {
			const prefix = `${path}/`;
			const names = new Set<string>();
			for (const key of [...files.keys(), ...directories]) {
				if (!key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				const name = rest.split("/")[0];
				if (name) names.add(name);
			}
			return [...names].sort();
		},
		readText: (path) => files.get(path) ?? null,
	};
}

const PROJECT = "/project";
const hoboAgent = (id: string, body = `# ${id}\n\nDoes things.\n`) => ({
	[`${PROJECT}/.hobo/agents/${id}/instructions.md`]: body,
});

describe("discovery roots", () => {
	it("finds nothing in a project with neither root", () => {
		// A project with no agents is normal. Inventing one would put an
		// unrunnable entry in every catalog.
		expect(discoverProjectEveAgents(PROJECT, fakeFs({}))).toEqual([]);
	});

	it("finds agents under .hobo/agents", () => {
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({ ...hoboAgent("planner"), ...hoboAgent("builder") }),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["builder", "planner"]);
		expect(agents[0]?.source).toBe("hobo-agents");
	});

	it("sorts by id so the catalog is stable across runs", () => {
		// Directory order is filesystem-dependent. An unstable catalog would
		// reorder the picker under the user between two identical sessions.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("zeta"),
				...hoboAgent("alpha"),
				...hoboAgent("mid"),
			}),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["alpha", "mid", "zeta"]);
	});

	it("accepts agent.ts as the marker as well as instructions.md", () => {
		// A code-defined agent has no markdown. Requiring instructions.md would
		// make it invisible.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				[`${PROJECT}/.hobo/agents/coded/agent.ts`]: "export default 1;",
			}),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["coded"]);
		expect(agents[0]?.description).toBeUndefined();
	});

	it("skips a directory carrying neither marker", () => {
		// `node_modules`, a README directory, a half-created agent — none of
		// these can be run, and listing them would offer the user a dead entry.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				[`${PROJECT}/.hobo/agents/not-an-agent/README.md`]: "hello",
				...hoboAgent("real"),
			}),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["real"]);
	});
});

describe("descriptions", () => {
	it("takes the first non-empty line, stripping heading markers", () => {
		// The file almost always opens with `# name`. Showing the hash and the
		// name would waste the one line the picker has for each agent.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs(hoboAgent("planner", "\n\n### Plans the work\n\nmore text\n")),
		);
		expect(agents[0]?.description).toBe("Plans the work");
	});

	it("truncates a long first line", () => {
		// The description shares a row with the id. An unbounded one would wrap
		// the picker and push every later row off screen.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs(hoboAgent("planner", "x".repeat(200))),
		);
		expect(agents[0]?.description).toHaveLength(96);
	});

	it("omits the description when the file is empty or unreadable", () => {
		// An absent description is a missing field, not an empty string —
		// callers render the row differently rather than showing a blank.
		for (const body of ["", "\n\n   \n"]) {
			const agents = discoverProjectEveAgents(
				PROJECT,
				fakeFs(hoboAgent("planner", body)),
			);
			expect(agents[0]?.description).toBeUndefined();
		}
	});

	it("handles CRLF line endings", () => {
		// Agent files are edited on Windows too; splitting only on \n would put
		// a stray carriage return into every description.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs(hoboAgent("planner", "# planner\r\nPlans the work\r\n")),
		);
		expect(agents[0]?.description).toBe("planner");
	});
});

describe("subagent trees", () => {
	it("nests subagents under their parent, recording the parent id", () => {
		// The parent id is what builds the catalog's node path. Without it two
		// subagents with the same name under different parents would collide.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("planner"),
				[`${PROJECT}/.hobo/agents/planner/subagents/scout/instructions.md`]:
					"# scout\n",
			}),
		);
		expect(agents[0]?.children.map((child) => child.id)).toEqual(["scout"]);
		expect(agents[0]?.children[0]?.parentId).toBe("planner");
	});

	it("recurses through nested subagent levels", () => {
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("planner"),
				[`${PROJECT}/.hobo/agents/planner/subagents/scout/instructions.md`]:
					"# scout\n",
				[`${PROJECT}/.hobo/agents/planner/subagents/scout/subagents/deep/instructions.md`]:
					"# deep\n",
			}),
		);
		expect(agents[0]?.children[0]?.children.map((c) => c.id)).toEqual(["deep"]);
	});

	it("skips a subagent directory that is not an agent, keeping its siblings", () => {
		// One malformed subagent must not truncate the list — the others are
		// perfectly runnable.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("planner"),
				[`${PROJECT}/.hobo/agents/planner/subagents/notes/README.md`]: "x",
				[`${PROJECT}/.hobo/agents/planner/subagents/scout/instructions.md`]:
					"# scout\n",
			}),
		);
		expect(agents[0]?.children.map((child) => child.id)).toEqual(["scout"]);
	});

	it("gives a top-level agent no parent id", () => {
		const agents = discoverProjectEveAgents(PROJECT, fakeFs(hoboAgent("solo")));
		expect(agents[0]?.parentId).toBeUndefined();
		expect(agents[0]?.children).toEqual([]);
	});
});

describe("the legacy agent/ root", () => {
	const legacy = (path: string, body: string) => ({
		[`${PROJECT}/agent/${path}`]: body,
	});

	it("discovers a legacy agent as the id `agent`", () => {
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs(legacy("instructions.md", "# legacy\nDoes old things.\n")),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["agent"]);
		expect(agents[0]?.source).toBe("legacy-agent");
		expect(agents[0]?.description).toBe("legacy");
	});

	it("carries the legacy agent's subagents beneath it", () => {
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...legacy("instructions.md", "# legacy\n"),
				...legacy("subagents/scout/instructions.md", "# scout\n"),
			}),
		);
		expect(agents[0]?.children.map((child) => child.id)).toEqual(["scout"]);
		expect(agents[0]?.children[0]?.parentId).toBe("agent");
	});

	it("promotes legacy subagents to the top level when agent/ itself is not an agent", () => {
		// A project that kept only `agent/subagents/` still has runnable agents.
		// Requiring the parent to be one would hide all of them.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				[`${PROJECT}/agent/README.md`]: "not an agent",
				...legacy("subagents/scout/instructions.md", "# scout\n"),
			}),
		);
		expect(agents.map((agent) => agent.id)).toEqual(["scout"]);
		expect(agents[0]?.source).toBe("legacy-agent");
	});

	it("lets .hobo/agents win a name collision with the legacy root", () => {
		// This is the migration path: a project copies its agent into
		// `.hobo/agents` and leaves the old one behind. The legacy copy
		// shadowing the new one would make edits appear to do nothing.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("agent", "# new\n"),
				...legacy("instructions.md", "# old\n"),
			}),
		);
		expect(agents).toHaveLength(1);
		expect(agents[0]?.source).toBe("hobo-agents");
		expect(agents[0]?.description).toBe("new");
	});

	it("keeps legacy subagents that do not collide, even when `agent` itself does", () => {
		// Half-migrated is the common state. Dropping the whole legacy subtree
		// because its root collided would lose the subagents nobody moved yet.
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("agent", "# new\n"),
				...legacy("instructions.md", "# old\n"),
				...legacy("subagents/scout/instructions.md", "# scout\n"),
			}),
		);
		expect(agents.map((a) => a.id)).toEqual(["agent", "scout"]);
	});

	it("does not re-add a legacy subagent whose id already exists", () => {
		const agents = discoverProjectEveAgents(
			PROJECT,
			fakeFs({
				...hoboAgent("scout", "# new scout\n"),
				...legacy("instructions.md", "# old\n"),
				...legacy("subagents/scout/instructions.md", "# old scout\n"),
			}),
		);
		const scout = agents.find((agent) => agent.id === "scout");
		expect(scout?.source).toBe("hobo-agents");
		expect(agents.filter((agent) => agent.id === "scout")).toHaveLength(1);
	});
});

describe("isValidEveAgentId", () => {
	it("accepts a DNS-ish lowercase id", () => {
		for (const id of ["a", "planner", "code-reviewer", `a${"b".repeat(62)}`]) {
			expect(isValidEveAgentId(id), id).toBe(true);
		}
	});

	it("refuses anything that would not survive as a directory name or key", () => {
		// The id becomes a path segment and a catalog key. A separator, a dot,
		// or a leading digit each break one of those in a different way.
		for (const id of [
			"",
			"Planner",
			"1planner",
			"-planner",
			"plan ner",
			"plan/ner",
			"plan.ner",
			"plan_ner",
			`a${"b".repeat(63)}`,
		]) {
			expect(isValidEveAgentId(id), id).toBe(false);
		}
	});
});

describe("createProjectEveAgent", () => {
	it("creates the directory and a starter instructions file", () => {
		// The file is what makes discovery recognise the new directory as an
		// agent. Creating an empty directory would leave it invisible.
		const project = tmp();
		const result = createProjectEveAgent(project, "planner");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.agent.id).toBe("planner");
		expect(result.agent.source).toBe("hobo-agents");
		expect(
			readFileSync(
				join(project, ".hobo", "agents", "planner", "instructions.md"),
				"utf8",
			),
		).toContain("# planner");
	});

	it("makes the new agent immediately discoverable", () => {
		const project = tmp();
		createProjectEveAgent(project, "planner");
		expect(discoverProjectEveAgents(project).map((a) => a.id)).toEqual([
			"planner",
		]);
	});

	it("normalizes case and surrounding whitespace before validating", () => {
		// A user typing `  Planner ` meant `planner`. Trimming is safe because
		// it cannot make two distinct valid ids collide.
		const project = tmp();
		const result = createProjectEveAgent(project, "  Planner  ");
		expect(result.ok).toBe(true);
		expect(result.ok && result.agent.id).toBe("planner");
	});

	it("refuses an invalid id before touching the filesystem", () => {
		// The refusal states the whole rule rather than just "invalid", because
		// the constraint is not guessable from the name.
		const project = tmp();
		const result = createProjectEveAgent(project, "plan/ner");
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toContain("lowercase");
		expect(result.ok === false && result.error).toContain("63");
		expect(discoverProjectEveAgents(project)).toEqual([]);
	});

	it("refuses to overwrite an existing agent, naming the path", () => {
		// The existing directory holds instructions someone wrote. Overwriting
		// would replace them with the starter template silently.
		const project = tmp();
		createProjectEveAgent(project, "planner");
		const second = createProjectEveAgent(project, "planner");
		expect(second.ok).toBe(false);
		expect(second.ok === false && second.error).toContain(
			".hobo/agents/planner",
		);
	});

	it("reports a filesystem error rather than throwing", () => {
		// Creation happens from an interactive picker. An exception there would
		// take down the shell instead of showing the user why it failed. Here
		// `.hobo` is a regular file, so `mkdir -p` beneath it cannot succeed.
		const project = tmp();
		writeFileSync(join(project, ".hobo"), "not a directory", "utf8");
		const result = createProjectEveAgent(project, "planner");
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error.length).toBeGreaterThan(0);
	});
});
