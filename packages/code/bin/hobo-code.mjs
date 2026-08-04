#!/usr/bin/env node
/**
 * hobo-code entry (package bin).
 *
 * Always prefer this over calling dist/bin directly in a monorepo: optimizexp
 * and agent edits land in `src/`, but the published binary is compiled `dist/`.
 * If dist is missing or older than src, rebuild before running so the *installed*
 * CLI matches the source under review.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(pkgRoot, "dist", "cli.js");
const distBin = join(pkgRoot, "dist", "bin", "hobo-code.js");
const srcRoot = join(pkgRoot, "src");

function maxSrcMtime(dir) {
	let max = 0;
	/** @param {string} d */
	const walk = (d) => {
		let entries;
		try {
			entries = readdirSync(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			const p = join(d, ent.name);
			if (ent.isDirectory()) {
				if (ent.name === "node_modules" || ent.name === "dist") continue;
				walk(p);
			} else if (/\.(ts|mts|tsx|cts)$/.test(ent.name)) {
				try {
					max = Math.max(max, statSync(p).mtimeMs);
				} catch {
					/* ignore */
				}
			}
		}
	};
	walk(dir);
	return max;
}

function distIsStale() {
	if (!existsSync(distCli) || !existsSync(distBin)) return true;
	const distM = statSync(distCli).mtimeMs;
	// 1s slack for filesystem mtime granularity
	return maxSrcMtime(srcRoot) > distM + 1000;
}

if (process.env.HOBO_CODE_SKIP_STALE_REBUILD !== "1" && distIsStale()) {
	process.stderr.write(
		"hobo-code: dist is stale (src newer than dist) — rebuilding @hobo/code…\n",
	);
	const build = spawnSync("pnpm", ["run", "build"], {
		cwd: pkgRoot,
		stdio: "inherit",
		env: process.env,
		shell: process.platform === "win32",
	});
	if ((build.status ?? 1) !== 0) {
		process.stderr.write(
			"hobo-code: rebuild failed. Run: pnpm --filter @hobo/code build\n",
		);
		process.exit(build.status ?? 1);
	}
}

if (!existsSync(distBin)) {
	process.stderr.write(
		"hobo-code: missing dist/bin/hobo-code.js — run: pnpm --filter @hobo/code build\n",
	);
	process.exit(1);
}

const run = spawnSync(process.execPath, [distBin, ...process.argv.slice(2)], {
	stdio: "inherit",
	env: process.env,
});
process.exit(run.status ?? 1);
