/**
 * Pane interact: herdr-shaped attach inside the product TV bezel.
 *
 * Enter forwards keys to the focused tmux leaf while Agents keeps painting
 * capture-pane -e inside BroadcastFrame. Ctrl+] / Ctrl+\ leave. Fullscreen
 * tmux attach remains an escape hatch only (`attachTmuxFullscreen`).
 */
import { spawn } from "node:child_process";
import {
	isKeyRelease,
	matchesKey,
	parseKey,
} from "@earendil-works/pi-tui";
import type { MuxRunner } from "./mux.js";

/** Ctrl+] — leave pane interact without quitting the shell. */
// public-contract: pane-interact detach key (Ctrl+])
export const PANE_INTERACT_DETACH = "\x1d";
/** Ctrl+\ — alternate leave (terminals that swallow Ctrl+]). */
// public-contract: pane-interact alternate detach key (Ctrl+\)
export const PANE_INTERACT_DETACH_ALT = "\x1c";

export function isPaneInteractDetach(data: string): boolean {
	if (
		data === PANE_INTERACT_DETACH ||
		data === PANE_INTERACT_DETACH_ALT ||
		matchesKey(data, "ctrl+]") ||
		matchesKey(data, "ctrl+\\")
	) {
		return true;
	}
	// Kitty CSI-u: ] = 93, FS (\x1c) = 28, GS (\x1d) = 29
	if (
		data === "\x1b[29;5u" ||
		data === "\x1b[93;5u" ||
		data === "\x1b[28;5u" ||
		data === "\x1b[92;5u"
	) {
		return true;
	}
	return false;
}

/** Named keys → tmux `send-keys` key names (watch-mode / steer fallback). */
const TMUX_NAMED: Readonly<Record<string, string>> = {
	up: "Up",
	down: "Down",
	left: "Left",
	right: "Right",
	enter: "Enter",
	return: "Enter",
	tab: "Tab",
	"shift+tab": "BTab",
	backspace: "BSpace",
	delete: "DC",
	escape: "Escape",
	esc: "Escape",
	home: "Home",
	end: "End",
	pageUp: "PageUp",
	pageDown: "PageDown",
	space: "Space",
	"ctrl+c": "C-c",
	"ctrl+d": "C-d",
	"ctrl+z": "C-z",
	"ctrl+a": "C-a",
	"ctrl+e": "C-e",
	"ctrl+u": "C-u",
	"ctrl+k": "C-k",
	"ctrl+l": "C-l",
	"ctrl+w": "C-w",
	"ctrl+p": "C-p",
	"ctrl+n": "C-n",
	"ctrl+r": "C-r",
	"ctrl+t": "C-t",
	"ctrl+b": "C-b",
	"ctrl+o": "C-o",
	"ctrl+x": "C-x",
	"ctrl+y": "C-y",
	"ctrl+v": "C-v",
	"ctrl+space": "C-Space",
};

/**
 * Map a raw TTY key chunk to tmux `send-keys` argv tails (steer / tests).
 * Kitty CSI-u is normalized — nested CLIs do not speak Kitty.
 */
export function tmuxKeyArgvForInput(data: string): readonly (readonly string[])[] {
	if (data.length === 0 || isPaneInteractDetach(data)) return [];
	if (isKeyRelease(data)) return [];

	const key = parseKey(data);
	if (key) {
		const named = TMUX_NAMED[key];
		if (named) return [[named]];

		const arrow = /(?:^|\+)(up|down|left|right)$/iu.exec(key);
		if (arrow) {
			const dir = arrow[1]!.toLowerCase();
			return [
				[
					dir === "up"
						? "Up"
						: dir === "down"
							? "Down"
							: dir === "left"
								? "Left"
								: "Right",
				],
			];
		}

		const ctrlLetter = /^ctrl\+([a-z])$/iu.exec(key);
		if (ctrlLetter) {
			return [[`C-${ctrlLetter[1]!.toLowerCase()}`]];
		}

		const altLetter = /^alt\+([a-z0-9])$/iu.exec(key);
		if (altLetter) {
			return [[`M-${altLetter[1]!.toLowerCase()}`]];
		}

		if (key.length === 1) {
			return [["-l", "--", key]];
		}

		const shiftLetter = /^shift\+([a-z])$/iu.exec(key);
		if (shiftLetter) {
			return [["-l", "--", shiftLetter[1]!.toUpperCase()]];
		}
	}

	switch (data) {
		case "\x1b[A":
		case "\x1bOA":
			return [["Up"]];
		case "\x1b[B":
		case "\x1bOB":
			return [["Down"]];
		case "\x1b[C":
		case "\x1bOC":
			return [["Right"]];
		case "\x1b[D":
		case "\x1bOD":
			return [["Left"]];
		case "\r":
		case "\n":
			return [["Enter"]];
		case "\t":
			return [["Tab"]];
		case "\x7f":
		case "\b":
			return [["BSpace"]];
		case "\x1b":
			return [["Escape"]];
		case "\x03":
			return [["C-c"]];
		case "\x04":
			return [["C-d"]];
		default:
			break;
	}

	if (!data.includes("\x1b")) {
		return [["-l", "--", data]];
	}
	return [];
}

/** Forward a key chunk to a tmux pane target (steer / tests — not fullscreen). */
export async function sendKeysToPane(
	runner: MuxRunner,
	target: string,
	data: string,
): Promise<void> {
	for (const argv of tmuxKeyArgvForInput(data)) {
		await runner.run(["send-keys", "-t", target, ...argv]);
	}
}

export interface FullscreenAttachOptions {
	readonly session: string;
	/** Window name inside the session (select before attach). */
	readonly window: string;
	/** Optional pane id (`%N`) to focus inside the window. */
	readonly pane?: string;
	readonly runner?: MuxRunner;
	/** Override spawn (tests). Default: `tmux attach-session` with inherit. */
	readonly attach?: (args: readonly string[]) => Promise<number | null>;
}

/**
 * Hand this TTY to tmux so the seated CLI renders and receives keys exactly
 * as it would outside hobo-code. Caller must stop the product TUI first and
 * restart it after this resolves (Ctrl+] detaches).
 */
export async function attachTmuxFullscreen(
	options: FullscreenAttachOptions,
): Promise<{ readonly code: number | null; readonly detail: string }> {
	const runner = options.runner;
	const targetWindow = `${options.session}:${options.window}`;
	if (runner) {
		await runner.run(["select-window", "-t", targetWindow]);
		if (options.pane) {
			await runner.run(["select-pane", "-t", options.pane]);
		}
		// Root binding so Ctrl+] works without the tmux prefix (herdr-shaped).
		await runner.run(["bind-key", "-n", "C-]", "detach-client"]);
	}

	const args = ["attach-session", "-t", options.session] as const;
	const attach =
		options.attach ??
		((argv: readonly string[]) =>
			new Promise<number | null>((resolve, reject) => {
				const child = spawn("tmux", [...argv], {
					stdio: "inherit",
					env: process.env,
				});
				child.once("error", reject);
				child.once("close", (code) => resolve(code));
			}));

	const code = await attach(args);
	return {
		code,
		detail:
			code === 0
				? `detached from ${targetWindow} · back in hobo-code`
				: `tmux attach exited ${code} (${targetWindow})`,
	};
}

// public-contract: attached-pane footer hint inside the Agents TV bezel
export const PANE_INTERACT_HINT =
	"attached · keys→▶ · PgUp/Dn scroll TV · [ ] · Ctrl+\\ leave";

// public-contract: Agents attach affordance before Enter enters pane interact
export const AGENTS_ATTACH_HINT =
	"Enter attach · PgUp/Dn scroll · /mux pane · [ ] · Ctrl+\\ leave";
