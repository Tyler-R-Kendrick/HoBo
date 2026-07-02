/**
 * Shared environment helpers for repository automation scripts.
 *
 * Two spawn-time concerns live here so there is a single place to reason about
 * them: stripping harness-injected NODE_OPTIONS before launching child
 * processes, and invoking pnpm the same way on Windows and POSIX shells.
 */

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
