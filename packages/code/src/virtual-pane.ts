/**
 * The command a virtualized tmux pane actually runs.
 *
 * A normal pane runs the agent's binary. A virtualized one runs this: a REPL
 * whose every command goes through `virtual-shell.ts`, so the pane cannot name
 * anything the allow-list omits — there is no `execve` behind it to escape to.
 * Output is rendered through `virtual-terminal.ts`, which means the pane's
 * screen is a structure the harness holds rather than bytes it merely forwards.
 */

import { createInterface } from "node:readline";
import { createVirtualShell, DEFAULT_COMMANDS, mountFor } from "./virtual-shell.js";

/** Count shown in the mux panel, so the claim is specific rather than vague. */
export const VIRTUAL_PANE_COMMANDS = DEFAULT_COMMANDS.length;

/**
 * The shell command tmux runs for a virtualized pane.
 *
 * Single-quoted throughout: the workspace path is a real path from a rift
 * allocation and may contain anything a directory name may contain.
 */
export function virtualPaneCommand(agentId: string, workspace: string): string {
	const quote = (v: string) => `'${v.replace(/'/gu, `'\\''`)}'`;
	return `hobo-code vshell --name ${quote(agentId)} --workspace ${quote(workspace)}`;
}

export interface VirtualPaneOptions {
	readonly agentId: string;
	readonly workspace: string;
	/** Rift tier, when known — decides which directory is actually mounted. */
	readonly tier?: string;
	readonly source?: string;
	readonly writable?: boolean;
	readonly input?: NodeJS.ReadableStream;
	readonly output?: NodeJS.WritableStream;
}

/**
 * Run the pane REPL until stdin closes.
 *
 * Deliberately line-oriented rather than a full-screen UI: the pane is a place
 * an agent (or a human looking over its shoulder) types commands, and the
 * interesting behaviour is which of them are answered at all.
 */
export async function runVirtualPane(
	options: VirtualPaneOptions,
): Promise<number> {
	const output = options.output ?? process.stdout;
	const mount =
		options.tier !== undefined && options.source !== undefined
			? mountFor({
					path: options.workspace,
					tier: options.tier,
					source: options.source,
				})
			: options.workspace;
	const shell = createVirtualShell({
		workspace: mount,
		...(options.writable === true ? { writable: true } : {}),
		env: { AGENT_ID: options.agentId },
	});

	output.write(
		`hobo-code virtual pane · ${options.agentId}\n` +
			`workspace ${mount}\n` +
			`${shell.commands.length} commands available; no network, no execve; ` +
			`writes ${shell.writable ? "persist" : "stay virtual until promotion"}\n` +
			`type 'commands' to list them, Ctrl-D to leave\n\n`,
	);

	const rl = createInterface({
		input: options.input ?? process.stdin,
		terminal: false,
	});
	const prompt = () => output.write(`${options.agentId}:~$ `);
	prompt();

	for await (const line of rl) {
		const command = line.trim();
		if (command.length === 0) {
			prompt();
			continue;
		}
		if (command === "commands") {
			output.write(`${shell.commands.join(" ")}\n`);
			prompt();
			continue;
		}
		if (command === "exit" || command === "quit") break;
		const run = await shell.run(command);
		if (run.stdout) output.write(run.stdout);
		if (run.stderr) output.write(run.stderr);
		if (run.refused) {
			// Say plainly that this is a policy answer, not a missing install —
			// otherwise the obvious next move is to try to install it.
			output.write(
				"  ↳ not available in a virtual pane (allow-list, not a missing binary)\n",
			);
		}
		prompt();
	}
	rl.close();
	output.write("\n");
	return 0;
}
