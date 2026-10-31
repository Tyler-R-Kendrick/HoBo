/**
 * `HOBO_HOME_ENTRIES` (`@hobo/core/hobo-home`) names every top-level entry a
 * user-level HoBo home holds. CLI project discovery skips a `.hobo` holding
 * only those, so an entry missing from the list makes a stray HoBo home (an old
 * `/tmp/.hobo`, a `HOBO_HOME` a user once exported) count as a project again.
 *
 * The list is kept complete by reading the code that writes the home: every
 * `join(…, "<name>")` or `resolve(…, "<name>")` whose first argument names a
 * HoBo home — `hoboHome`, `options.hoboHome`, `ctx.hoboHome`,
 * `resolveHoboHome(…)`, `defaultHoboHome(…)` — in a package's or an example's
 * `src/`. A literal first segment it finds there must be in the list. What it
 * cannot see: a home held under another name (`home`, `root`), a segment from a
 * constant, and a path built another way; those entries are listed by hand.
 *
 * A path built another way is also what the second check refuses: a source
 * that joins `.hobo` onto `homedir()` or HOME by hand skips the resolver
 * (`HOBO_HOME`, a leading `~`, no temp fallback) and this scan alike.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HOBO_HOME_ENTRIES } from "../packages/core/src/hobo-home.js";

const repo = fileURLToPath(new URL("..", import.meta.url));

/** `join(<a HoBo home>, "<segment>"` — the segment up to its first `/`. */
const JOINED_UNDER_HOME =
	/\b(?:join|resolve)\(\s*((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$]*[hH]oboHome\w*(?:\([^()]*\))?)\s*,\s*(["'`])([^"'`$/]+)/gu;

/** Every first segment `source` joins under a HoBo home, with the expression it joined to. */
function homeSegments(
	source: string,
): { readonly segment: string; readonly home: string }[] {
	return [...source.matchAll(JOINED_UNDER_HOME)].map((match) => ({
		segment: match[3] ?? "",
		home: match[1] ?? "",
	}));
}

/** `join(homedir(), ".hobo"` or `join(env.HOME, ".hobo"`: a HoBo home built by hand. */
const HAND_BUILT_HOME =
	/\b(?:join|resolve)\(\s*([^,()]*(?:homedir\(\)|\bHOME\b)[^,()]*)\s*,\s*(["'`])\.hobo\2/gu;

/** The one place that builds a HoBo home from HOME: the resolver itself. */
const RESOLVER = join("packages", "core", "src", "hobo-home.ts");

/**
 * The `src/` trees of every package, nested ones (`packages/runtimes/*`)
 * included, and of every example (`examples/*\/src`).
 */
function sourceRoots(): string[] {
	const roots: string[] = [];
	const visit = (dir: string, depth: number) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === "node_modules") continue;
			const path = join(dir, entry.name);
			if (entry.name === "src") roots.push(path);
			else if (depth > 0) visit(path, depth - 1);
		}
	};
	visit(join(repo, "packages"), 2);
	visit(join(repo, "examples"), 1);
	return roots;
}

function sourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules" && entry.name !== "_generated")
				files.push(...sourceFiles(path));
		} else if (/\.(?:ts|mts|tsx)$/u.test(entry.name)) files.push(path);
	}
	return files;
}

describe("the scan", () => {
	it("finds a segment joined under each form of a HoBo home, across lines", () => {
		expect(
			homeSegments(`
				join(hoboHome, "durable", "code");
				join(
					options.hoboHome,
					"stations",
				);
				resolve(resolveHoboHome(env), 'tools');
				join(defaultHoboHome(), \`yard.json\`);
				join(home, "not-a-hobo-home");
				join(hoboHomeDir, "runtime/code");
			`).map(({ segment }) => segment),
		).toEqual(["durable", "stations", "tools", "yard.json", "runtime"]);
	});
});

describe("a HoBo home", () => {
	it("is never built by hand from HOME in a package or an example", () => {
		const byHand: string[] = [];
		for (const root of sourceRoots()) {
			for (const file of sourceFiles(root)) {
				if (relative(repo, file) === RESOLVER) continue;
				for (const match of readFileSync(file, "utf8").matchAll(
					HAND_BUILT_HOME,
				))
					byHand.push(`${relative(repo, file)}: ${match[0]}`);
			}
		}
		expect(byHand).toEqual([]);
	});

	it("is found built by hand however it is spelled", () => {
		expect(
			[
				`path.join(homedir(), ".hobo", "x")`,
				`join(os.homedir(), '.hobo')`,
				`resolve(process.env.HOME ?? "/", \`.hobo\`)`,
				`join(resolveHoboHome(), "x")`,
				`join(home, ".hobo")`,
			].map((source) => [...source.matchAll(HAND_BUILT_HOME)].length),
		).toEqual([1, 1, 1, 0, 0]);
	});

	it("is looked for in examples too", () => {
		expect(sourceRoots()).toContain(
			join(repo, "examples", "ci-runner-balancing", "src"),
		);
	});
});

describe("HOBO_HOME_ENTRIES", () => {
	it("lists every entry a package joins under a HoBo home", () => {
		const missing: string[] = [];
		let found = 0;
		for (const root of sourceRoots()) {
			for (const file of sourceFiles(root)) {
				for (const { segment, home } of homeSegments(
					readFileSync(file, "utf8"),
				)) {
					found += 1;
					if (!HOBO_HOME_ENTRIES.has(segment))
						missing.push(
							`${relative(repo, file)}: join(${home}, "${segment}")`,
						);
				}
			}
		}
		// A scan that matches nothing would pass vacuously.
		expect(found).toBeGreaterThan(50);
		expect(missing).toEqual([]);
	});
});
