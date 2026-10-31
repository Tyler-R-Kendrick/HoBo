/**
 * `HOBO_HOME_ENTRIES` (`@hobo/core/hobo-home`) names every top-level entry a
 * user-level HoBo home holds. CLI project discovery skips a `.hobo` holding
 * only those, so an entry missing from the list makes a stray HoBo home (an old
 * `/tmp/.hobo`, a `HOBO_HOME` a user once exported) count as a project again.
 *
 * The list is kept complete by reading the code that writes the home: every
 * `join(…, "<name>")` or `resolve(…, "<name>")` whose first argument names a
 * HoBo home — `hoboHome`, `options.hoboHome`, `ctx.hoboHome`,
 * `resolveHoboHome(…)`, `defaultHoboHome(…)` — in a package's `src/`. A literal
 * first segment it finds there must be in the list. What it cannot see: a home
 * held under another name (`home`, `root`), a segment from a constant, and a
 * path built another way; those entries are listed by hand.
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

/** The `src/` trees of every package, nested ones (`packages/runtimes/*`) included. */
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
