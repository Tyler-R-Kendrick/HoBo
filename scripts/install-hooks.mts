// Auto-install the repository's git hooks through the pnpm `prepare` lifecycle
// so a fresh `pnpm install` wires `core.hooksPath` to `.githooks` without a
// manual step. This must be fail-open: a `prepare` script that throws breaks
// `pnpm install` for everyone, so every failure path exits 0. Opt out with
// `HOBO_SKIP_HOOKS=1`, and CI is skipped automatically (it runs gates directly
// and does not need local commit hooks).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function skip(reason: string): never {
	console.log(`install-hooks: skipped (${reason}).`);
	process.exit(0);
}

if (process.env.HOBO_SKIP_HOOKS) skip("HOBO_SKIP_HOOKS is set");
if (process.env.CI) skip("CI environment");
if (!existsSync(".git")) skip("not a git working tree");
if (!existsSync(".githooks")) skip(".githooks directory is missing");

try {
	const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
		stdio: "inherit",
	});
	if (result.status === 0) {
		console.log("install-hooks: core.hooksPath -> .githooks");
	} else {
		console.log("install-hooks: could not set core.hooksPath; skipping.");
	}
} catch (error) {
	const message = error instanceof Error ? error.message : "git unavailable";
	console.log(`install-hooks: skipped (${message}).`);
}

process.exit(0);
