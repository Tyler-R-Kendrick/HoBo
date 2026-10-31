/**
 * Which signals hobo-code's launcher (`hobo-code.mjs`) listens for, and
 * whether it passes them on to its child, by platform.
 *
 * Except on Windows the child runs in a session of its own, so neither a
 * signal sent to hobo-code nor the terminal's hangup reaches it: the launcher
 * listens for each signal that ends hobo-code and passes it on.
 *
 * On Windows the child shares the launcher's console and gets Ctrl-C and
 * Ctrl-Break itself. Passing a signal on there is TerminateProcess, a forced
 * kill: it races the child's own graceful handling, and no exit listener runs,
 * so a one-shot verb left its `hobo-yard-*` store. The launcher passes nothing
 * on there. It listens only so that Ctrl-C and Ctrl-Break do not end it
 * before its child, and waits.
 */
const ENDING = Object.freeze(["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]);
const CONSOLE = Object.freeze(["SIGINT", "SIGBREAK"]);

/**
 * @param {NodeJS.Platform} platform
 * @returns {{ readonly listen: readonly NodeJS.Signals[]; readonly forward: boolean }}
 */
export function launcherSignals(platform) {
	return platform === "win32"
		? { listen: CONSOLE, forward: false }
		: { listen: ENDING, forward: true };
}

/**
 * Pass `signal` on to the child: to its process group, which it leads in a
 * session of its own, so that whatever it started without detaching (a
 * `/hobo` command, the `--pi` TUI, `tmux attach`, `ssh`) gets the signal too.
 * Sent to the child alone, the signal orphaned them wherever the child had no
 * handler for it. A child that leads no such group, or is gone, gets it alone.
 *
 * @param {{ readonly pid?: number | undefined; kill(signal: NodeJS.Signals): unknown }} child
 * @param {NodeJS.Signals} signal
 * @param {(pid: number, signal: NodeJS.Signals) => unknown} [kill]
 */
export function forwardSignal(
	child,
	signal,
	kill = (pid, sent) => process.kill(pid, sent),
) {
	if (child.pid === undefined) return;
	try {
		kill(-child.pid, signal);
	} catch (error) {
		if (error?.code !== "ESRCH") throw error;
		child.kill(signal);
	}
}
