#!/usr/bin/env node
/**
 * hobo-code entry (package bin).
 *
 * Prefer this over calling dist/bin directly in a monorepo: edits land in
 * `src/`, the published binary is compiled `dist/`. When dist is missing or
 * older than src, try `tsc` — but never block the CLI on an unrelated type
 * error. Fall back to `src/bin/hobo-code.ts` via tsx so `hobo-code agents`
 * stays runnable while dist is dirty.
 */
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(pkgRoot, "dist", "cli.js");
const distBin = join(pkgRoot, "dist", "bin", "hobo-code.js");
const srcBin = join(pkgRoot, "src", "bin", "hobo-code.ts");
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

function tscPath() {
	if (typeof process.env.HOBO_CODE_TSC === "string" && process.env.HOBO_CODE_TSC) {
		return process.env.HOBO_CODE_TSC;
	}
	const local = join(pkgRoot, "node_modules", "typescript", "bin", "tsc");
	if (existsSync(local)) return local;
	return join(pkgRoot, "..", "..", "node_modules", "typescript", "bin", "tsc");
}

function tryRebuildDist() {
	process.stderr.write(
		"hobo-code: dist is stale (src newer than dist) — tsc @hobo/code only…\n",
	);
	const tsc = tscPath();
	const build = existsSync(tsc)
		? spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
				cwd: pkgRoot,
				stdio: "inherit",
				env: process.env,
			})
		: spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
				cwd: pkgRoot,
				stdio: "inherit",
				env: process.env,
				shell: process.platform === "win32",
			});
	if ((build.status ?? 1) === 0) {
		try {
			chmodSync(distBin, 0o755);
			chmodSync(join(pkgRoot, "bin", "hobo-code.mjs"), 0o755);
		} catch {
			/* postbuild chmod is best-effort after a successful tsc */
		}
		return true;
	}
	process.stderr.write(
		"hobo-code: tsc failed — running src/ via tsx (dist not required to test)\n",
	);
	return false;
}

function runFromSource() {
	if (!existsSync(srcBin)) {
		process.stderr.write(
			"hobo-code: missing src/bin/hobo-code.ts — cannot fall back from stale dist\n",
		);
		process.exit(1);
	}
	return spawn(
		process.execPath,
		["--import", "tsx", srcBin, ...process.argv.slice(2)],
		{
			stdio: "inherit",
			env: process.env,
			cwd: pkgRoot,
			detached: process.platform !== "win32",
		},
	);
}

const forceSource = process.env.HOBO_CODE_FROM_SOURCE === "1";
const skipRebuild = process.env.HOBO_CODE_SKIP_STALE_REBUILD === "1";
const wantRebuild =
	!skipRebuild &&
	(process.env.HOBO_CODE_FORCE_STALE_REBUILD === "1" || distIsStale());

let useSource = forceSource;
if (!useSource && wantRebuild) {
	const rebuilt = tryRebuildDist();
	useSource = !rebuilt;
}

if (!useSource && !existsSync(distBin)) {
	if (existsSync(srcBin)) {
		process.stderr.write(
			"hobo-code: missing dist/bin/hobo-code.js — running src/ via tsx\n",
		);
		useSource = true;
	} else {
		process.stderr.write(
			"hobo-code: missing dist/bin/hobo-code.js — run: pnpm --filter @hobo/code build\n",
		);
		process.exit(1);
	}
}

const run = useSource
	? runFromSource()
	: spawn(process.execPath, [distBin, ...process.argv.slice(2)], {
			stdio: "inherit",
			env: process.env,
			detached: process.platform !== "win32",
		});
const interrupt = () => run.kill("SIGINT");
const terminate = () => run.kill("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
const result = await new Promise((resolve) => {
	run.once("error", (error) => resolve({ error }));
	run.once("exit", (status, signal) => resolve({ status, signal }));
});
process.off("SIGINT", interrupt);
process.off("SIGTERM", terminate);
if (result.error) process.stderr.write(`hobo-code: ${result.error.message}\n`);
process.exitCode =
	result.status ??
	(result.signal === "SIGINT" ? 130 : result.signal === "SIGTERM" ? 143 : 1);
