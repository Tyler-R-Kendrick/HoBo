#!/usr/bin/env node
/**
 * anti-slop changed-file lane: runs the vendored Oxlint plugin
 * (tools/oxlint/anti-slop, configured in oxlint.config.ts) on just the files a
 * commit or PR touches, so the pre-existing repo-wide backlog does not block
 * commits but no new violations slip in. `--deny-warnings` keeps changed files
 * warning-clean as well (unused vars, useless spreads, …). Directory ignores
 * stay owned by oxlint.config.ts — explicitly passed paths still honor its
 * ignorePatterns.
 *
 * Usage:
 *   node --import tsx scripts/lint-slop-changed.mts --staged
 *   node --import tsx scripts/lint-slop-changed.mts --base=origin/main
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

import { commandForPlatform, sanitizeNodeOptions } from "./lib/env.ts";

const LINTABLE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const CHUNK_SIZE = 200;

function git(args: string[]): string {
	const result = spawnSync("git", args, {
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		env: sanitizeNodeOptions(),
	});
	if (result.error || result.status !== 0) return "";
	return result.stdout.trim();
}

function changedFiles(staged: boolean, base: string): string[] {
	const diffArgs = ["diff", "--name-only", "--diff-filter=ACMR"];
	if (staged) {
		return git([...diffArgs, "--cached"])
			.split(/\r?\n/)
			.filter(Boolean);
	}
	const mergeBase = git(["merge-base", base, "HEAD"]) || base;
	return git([...diffArgs, mergeBase, "HEAD"])
		.split(/\r?\n/)
		.filter(Boolean);
}

const args = process.argv.slice(2);
const staged = args.includes("--staged");
const baseFlag = args.find((arg) => arg.startsWith("--base="));
const base =
	baseFlag === undefined ? "HEAD~1" : baseFlag.slice("--base=".length);

const files = changedFiles(staged, base)
	.filter((file) => LINTABLE.test(file))
	.filter((file) => existsSync(file));

if (files.length === 0) {
	console.log("ok  lint:slop:changed — no changed lintable files.");
	process.exit(0);
}

let failure = 0;
for (let index = 0; index < files.length; index += CHUNK_SIZE) {
	const chunk = files.slice(index, index + CHUNK_SIZE);
	const invocation = commandForPlatform("pnpm", [
		"exec",
		"oxlint",
		"--deny-warnings",
		"--no-error-on-unmatched-pattern",
		...chunk,
	]);
	const result = spawnSync(invocation.command, invocation.args, {
		stdio: "inherit",
		env: sanitizeNodeOptions(),
	});
	if (result.status !== 0) failure = result.status ?? 1;
}

if (failure !== 0) {
	console.error(
		`fail  lint:slop:changed — anti-slop/warning findings in changed files (${files.length} file(s) linted).`,
	);
	process.exit(failure);
}
console.log(
	`ok  lint:slop:changed — ${files.length} changed file(s) clean under anti-slop rules.`,
);
