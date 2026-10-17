/**
 * Shared environment helpers for repository automation scripts.
 *
 * Spawn-time concerns live here so there is a single place to reason about
 * them: stripping harness-injected NODE_OPTIONS before launching child
 * processes, invoking pnpm the same way on Windows and POSIX shells, and
 * running pnpm-shaped commands without a package manager at all.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CommandInvocation = {
	command: string;
	args: string[];
};

/**
 * Agent harnesses (Claude Code, tsx watchers, some CI shims) inject
 * `--import tsx` into NODE_OPTIONS so these `.ts` scripts run directly. That
 * flag is correct for the parent process, but it poisons spawned
 * `node`/`pnpm`/test children: it re-imports tsx into every one, perturbs
 * Vitest's own transform, and changes Turbo cache keys. Every spawn that runs
 * a test or build tool should pass its env through here so the child starts
 * from a clean slate; scripts that genuinely need tsx already request it
 * explicitly on their own command line.
 */
export function sanitizeNodeOptions(
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return { ...env, NODE_OPTIONS: "" };
}

/**
 * pnpm is not directly executable from `child_process` with `shell: false` on
 * Windows; it has to be reached through `cmd.exe /d /c pnpm.cmd`. This returns
 * the platform-correct command/args pair so callers can keep `shell: false`
 * (and thus avoid quoting hazards) everywhere.
 */
export function commandForPlatform(
	command: string,
	args: string[],
): CommandInvocation {
	if (process.platform === "win32" && command === "pnpm") {
		return {
			command: process.env.ComSpec ?? "cmd.exe",
			args: ["/d", "/c", "pnpm.cmd", ...args],
		};
	}

	return { command, args };
}

/** What `withoutPackageManager` needs to know about the checkout. */
export type CheckoutFacts = {
	readonly root: string;
	readonly scripts: { readonly [name: string]: string };
	readonly platform: string;
};

/** The root package.json scripts, or none when it cannot be read. */
function rootScripts(root: string): { readonly [name: string]: string } {
	try {
		const manifest: {
			readonly scripts?: { readonly [name: string]: string };
		} = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		return manifest.scripts ?? {};
	} catch {
		return {};
	}
}

/**
 * A `pnpm run <script>` or `pnpm exec <bin>` command, run with what Node and
 * the checkout already provide, so a gate does not need a usable pnpm:
 *
 * - `pnpm run <script> [args]` becomes `node --experimental-strip-types
 *   scripts/run-script.mts <script> -- [args]`, which runs the root
 *   package.json script with `node_modules/.bin` on PATH, like pnpm, and hands
 *   it the arguments as arguments. (`node --run` spliced them into shell text,
 *   so an argument holding `'` broke out of its quote.)
 * - `pnpm exec <bin> [args]` becomes `node_modules/.bin/<bin> [args]`.
 *
 * Everything else stays pnpm: installs, filters, unknown scripts, and scripts
 * with `pre`/`post` scripts, which the launcher does not run. So does Windows,
 * where the `.bin` shims need cmd.exe and nothing here verifies that path.
 */
export function withoutPackageManager(
	command: string,
	args: string[],
	facts: CheckoutFacts = {
		root: process.cwd(),
		scripts: rootScripts(process.cwd()),
		platform: process.platform,
	},
): CommandInvocation {
	const unchanged = { command, args };
	if (command !== "pnpm" || facts.platform === "win32") return unchanged;
	const [verb, name, ...rest] = args;
	if (name === undefined) return unchanged;
	if (verb === "exec") {
		return {
			command: join(facts.root, "node_modules", ".bin", name),
			args: rest,
		};
	}
	if (verb !== "run") return unchanged;
	const known = (script: string) => Object.hasOwn(facts.scripts, script);
	if (!known(name) || known(`pre${name}`) || known(`post${name}`)) {
		return unchanged;
	}
	const scriptArgs = rest[0] === "--" ? rest.slice(1) : rest;
	return {
		command: process.execPath,
		args: [
			"--experimental-strip-types",
			join(facts.root, "scripts", "run-script.mts"),
			name,
			"--",
			...scriptArgs,
		],
	};
}
