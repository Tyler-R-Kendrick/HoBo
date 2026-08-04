/**
 * Publish `site/` to the `gh-pages` branch.
 *
 * GitHub Pages for this repo serves the **`gh-pages` branch at `/`** (legacy
 * build type, https://tyler-r-kendrick.github.io/HoBo/). There was no script
 * for it: the previous deploy was made by hand, which is why the live site sat
 * on a stale commit long after `main` moved — nothing recorded how to redo it,
 * so nobody did.
 *
 * The branch is published as a **single orphan commit** holding the built
 * output, matching what is already there. History on `gh-pages` is worthless —
 * it is generated output, recoverable by rebuilding the source commit it names
 * — and keeping it would grow the clone for every deploy.
 *
 * Usage:
 *   pnpm run site:deploy              # build, then publish
 *   pnpm run site:deploy -- --dry-run # build and show what would publish
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SITE_DIR = join(REPO_ROOT, "site");
const DIST_DIR = join(SITE_DIR, "dist");
const BRANCH = "gh-pages";

const dryRun = process.argv.includes("--dry-run");

function run(cmd: string, args: readonly string[], cwd = REPO_ROOT): string {
	return execFileSync(cmd, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function git(args: readonly string[], cwd = REPO_ROOT): string {
	return run("git", args, cwd).trim();
}

/** Refuse to publish a tree that does not match a recorded commit. */
function assertClean(): string {
	const dirty = git(["status", "--porcelain", "--", "site"]);
	if (dirty.length > 0) {
		throw new Error(
			`site/ has uncommitted changes; publish only what is committed so the deploy commit's "@ <sha>" is true:\n${dirty}`,
		);
	}
	return git(["rev-parse", "HEAD"]);
}

function build(): void {
	console.log("building site…");
	execFileSync("pnpm", ["run", "build"], { cwd: SITE_DIR, stdio: "inherit" });
	if (!existsSync(DIST_DIR) || readdirSync(DIST_DIR).length === 0) {
		throw new Error(`build produced no output at ${DIST_DIR}`);
	}
}

function publish(sha: string): void {
	// A throwaway clone keeps the working tree untouched: a checkout of an
	// orphan branch in place would sweep the repo out from under the build.
	const staging = mkdtempSync(join(tmpdir(), "hobo-pages-"));
	try {
		const remote = git(["remote", "get-url", "origin"]);
		run("git", ["init", "-q", "-b", BRANCH, staging], staging);
		run("git", ["remote", "add", "origin", remote], staging);
		run("cp", ["-a", `${DIST_DIR}/.`, staging]);
		// Astro output is already built; Jekyll must not touch it, and without
		// this file GitHub silently drops every `_astro/*` asset.
		run("touch", [join(staging, ".nojekyll")], staging);

		run("git", ["add", "-A"], staging);
		const message = `deploy: site @ ${sha.slice(0, 9)}`;
		run(
			"git",
			[
				"-c",
				"user.email=deploy@hobo.invalid",
				"-c",
				"user.name=HoBo Deploy",
				"commit",
				"-q",
				"-m",
				message,
			],
			staging,
		);

		const files = git(["ls-files"], staging).split("\n").filter(Boolean).length;
		if (dryRun) {
			console.log(
				`[dry run] would force-push ${files} files to ${BRANCH} as "${message}"`,
			);
			return;
		}
		// Force is correct and safe here *only* because the branch is generated
		// output published as a single orphan commit — never source.
		run("git", ["push", "--force", "origin", `${BRANCH}:${BRANCH}`], staging);
		console.log(`published ${files} files to ${BRANCH} — ${message}`);
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

const sha = assertClean();
build();
publish(sha);
