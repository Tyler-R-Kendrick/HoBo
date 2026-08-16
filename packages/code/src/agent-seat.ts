/**
 * Seat-time command wrappers for agent CLIs that cannot share the user's
 * default home with an already-running host (Windows Codex app-server, IDE).
 *
 * Nested `codex` against shared `~/.codex` fails with
 * "failed to start embedded app server". A HOBO_HOME seat that only links
 * auth + config starts a healthy TUI; fullscreen attach then has a real pane.
 */
import { join } from "node:path";
import { shellQuote } from "./mux.js";

/** Dir under HOBO_HOME for a nested Codex TUI that must not fight ~/.codex locks. */
export function codexSeatHome(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "seats", "codex");
}

/**
 * Wrap a harness command for seating. Codex gets an isolated CODEX_HOME;
 * other agents pass through unchanged.
 */
export function seatShellCommand(options: {
	readonly agentId: string;
	readonly command: string;
	readonly hoboHome: string;
	readonly userHome?: string;
}): string {
	if (options.agentId !== "codex") return options.command;
	const userHome = options.userHome ?? process.env.HOME ?? "";
	if (!userHome || !options.hoboHome) return options.command;
	const seat = codexSeatHome(options.hoboHome);
	const auth = join(userHome, ".codex", "auth.json");
	const config = join(userHome, ".codex", "config.toml");
	return [
		`mkdir -p ${shellQuote(seat)}`,
		`ln -sfn ${shellQuote(auth)} ${shellQuote(join(seat, "auth.json"))}`,
		`ln -sfn ${shellQuote(config)} ${shellQuote(join(seat, "config.toml"))}`,
		`CODEX_HOME=${shellQuote(seat)} ${options.command}`,
	].join(" && ");
}

/** Pane text that means the seated CLI died and should be respawned. */
export function isStaleSeatCapture(capture: string): boolean {
	return (
		/failed to start embedded app server/iu.test(capture) ||
		/\[[\w-]+ exited \d+/iu.test(capture)
	);
}
