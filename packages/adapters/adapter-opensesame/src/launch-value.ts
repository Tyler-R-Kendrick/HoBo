/**
 * What `buildLaunch` returns: the command, the argv and the environment that
 * `spawn` needs, in a frozen value that prints none of them in full. The
 * environment holds the store passphrase when the caller lists it in `passEnv`,
 * and the argv holds the caller's command, which may carry a token as an
 * argument, so logging or serialising a Launch (`util.inspect`, `console.log`,
 * `JSON.stringify`, a template string) shows the names of the environment and
 * the arguments that are the adapter's own, and nothing else.
 */

import { inspect } from "node:util";

export type LaunchParts = Readonly<{
	command: string;
	args: readonly string[];
	env: NodeJS.ProcessEnv;
}>;

/** What a Launch shows of itself. */
export type LaunchSummary = Readonly<{
	command: string;
	args: readonly string[];
	env: Readonly<Record<string, "[redacted]">>;
}>;

const REDACTED = "[redacted]";
/** `dev --agent --schema <file> run --`: the arguments that are the adapter's, before the caller's command. */
const FIXED_ARGS = 6;

function summaryOf(parts: LaunchParts): LaunchSummary {
	const own = parts.args.slice(0, FIXED_ARGS);
	const rest = parts.args.length - own.length;
	return {
		command: parts.command,
		args:
			rest > 0 ? [...own, `[${rest} arguments of the command omitted]`] : own,
		env: Object.fromEntries(
			Object.keys(parts.env).map((name) => [name, REDACTED]),
		),
	};
}

/**
 * A frozen Launch. The three fields are what `spawn` is given; the methods that
 * serialise and print it are on the prototype, so they are not enumerable and a
 * spread or `Object.keys` sees the fields only.
 */
export class Launch implements LaunchParts {
	readonly command: string;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv;

	constructor(parts: LaunchParts) {
		this.command = parts.command;
		this.args = parts.args;
		this.env = parts.env;
		Object.freeze(this);
	}

	toJSON(): LaunchSummary {
		return summaryOf(this);
	}

	toString(): string {
		return `Launch ${inspect(summaryOf(this), { depth: 3 })}`;
	}

	[inspect.custom](): string {
		return this.toString();
	}
}
