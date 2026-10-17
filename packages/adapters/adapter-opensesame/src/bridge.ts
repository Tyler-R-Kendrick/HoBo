/**
 * The env-spec bridge OpenSesame is told to run, when the caller names one.
 * OPENSESAME_ENV_PARSE is a program path that Node runs as a script, as
 * OPENSESAME_NODE is the program path Node itself is, and an OpenSesame older
 * than its commit c403ba90a runs it with the whole environment, store passphrase
 * included. So a path the environment names is held to what the executable is:
 * absolute (a relative one is the working directory's, where a checkout puts
 * files) and in a trusted place (`trust.ts`: owned by the user or root and not
 * writable by others, not under `node_modules/.bin`, not in the working
 * directory's tree). Unset, nothing is passed and OpenSesame uses its own.
 */

import path from "node:path";

import { OpenSesameAdapterError } from "./errors.js";
import { placeProblem, type Trust } from "./trust.js";

export type BridgeInput = Readonly<{
	/** The value of OPENSESAME_ENV_PARSE in the caller's environment, if set. */
	bridge: string | undefined;
	platform: NodeJS.Platform;
	trust: Trust;
}>;

function refuse(why: string): OpenSesameAdapterError {
	return new OpenSesameAdapterError(
		"bridge_missing",
		`OPENSESAME_ENV_PARSE ${why}; nothing was started and the store passphrase went nowhere. Name the bridge by an absolute path in a directory only you and root can write, or unset it`,
	);
}

/** Throws a typed refusal unless the bridge is unset, or an absolute path to something that exists, in a trusted place. */
export function checkBridge(input: BridgeInput): void {
	const { bridge } = input;
	if (bridge === undefined) return;
	const flavour = input.platform === "win32" ? path.win32 : path.posix;
	if (!flavour.isAbsolute(bridge)) {
		throw refuse(
			"must be an absolute path: a relative one means the working directory",
		);
	}
	const why = placeProblem(bridge, input.trust);
	if (why !== undefined)
		throw refuse(`names a bridge that cannot be used: ${why}`);
}
