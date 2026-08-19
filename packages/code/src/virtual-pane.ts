/**
 * The command a virtualized tmux pane actually runs.
 *
 * A normal pane runs the agent's binary. A virtualized one runs this: a REPL
 * whose every command goes through `virtual-shell.ts`, so the pane cannot name
 * anything the allow-list omits — there is no `execve` behind it to escape to.
 * Output goes straight to the pane today. `virtual-terminal.ts` is the parser
 * that would make the screen a structure the harness holds rather than bytes it
 * forwards, but nothing routes through it yet — saying otherwise here would
 * describe a design instead of the code.
 */

import { createInterface } from "node:readline";
import {
	createVirtualShell,
	DEFAULT_COMMANDS,
	mountFor,
	type VirtualRun,
} from "./virtual-shell.js";

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
	/** Environment to read the namespace marker from; defaults to process.env. */
	readonly env?: NodeJS.ProcessEnv;
	readonly input?: NodeJS.ReadableStream;
	readonly output?: NodeJS.WritableStream;
	/** Seam for tests: observe or replace the shell the pane drives. */
	readonly shell?: {
		run(command: string): Promise<VirtualRun>;
		readonly commands?: readonly string[];
		readonly writable?: boolean;
	};
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
	// `--tier/--source` describe a workspace seen from OUTSIDE its namespace.
	// Inside (which is where `mux --virtual` runs), the merged path is real and
	// redirecting to the source would hand this agent the shared tree. The
	// marker `hobo-rift exec` sets is how that is detectable rather than
	// left to whoever reads the help text.
	const insideNamespace =
		(options.env ?? process.env).HOBO_RIFT_WORKSPACE !== undefined;
	if (insideNamespace && options.tier !== undefined) {
		throw new Error(
			"--tier/--source describe a workspace from outside its namespace, but this pane is already inside one; " +
				"mounting the source here would give this agent the shared tree instead of its own workspace",
		);
	}
	const mount =
		options.tier !== undefined && options.source !== undefined
			? mountFor({
					path: options.workspace,
					tier: options.tier,
					source: options.source,
				})
			: options.workspace;
	const shell =
		options.shell ??
		createVirtualShell({
			workspace: mount,
			...(options.writable === true ? { writable: true } : {}),
			env: { AGENT_ID: options.agentId },
		});

	// The banner is what tells an agent what it has, so it must describe the
	// shell actually in use rather than the default one.
	const described = shell as Partial<ReturnType<typeof createVirtualShell>>;
	const available = described.commands ?? DEFAULT_COMMANDS;
	const persists = described.writable ?? options.writable === true;
	output.write(
		`hobo-code virtual pane · ${options.agentId}\n` +
			`workspace ${mount}\n` +
			`${available.length} commands available; no network, no execve; ` +
			`writes ${persists ? "persist" : "stay virtual until promotion"}\n` +
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
			output.write(`${available.join(" ")}\n`);
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
