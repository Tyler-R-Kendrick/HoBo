/**
 * What happens to a run when the process that started it is interrupted. A
 * parent that simply stops leaves OpenSesame and the command it started running
 * with a live surrogate, and the schema in the temp directory, so the run is
 * guarded from before anything is written until after the schema is removed:
 *
 * - SIGTERM and SIGHUP are passed on as they are. OpenSesame revokes the run,
 *   stops the command and exits 143 or 129; the caller gets that outcome.
 * - SIGINT and SIGQUIT are passed on as SIGTERM. OpenSesame does not stop the
 *   command on an interrupt, so passing it on as it came would end the parent
 *   and leave the rest running. The interrupt is then re-raised on this process
 *   once the schema is gone and the handlers are off, so Ctrl-C still ends it,
 *   by the signal, as it would have.
 * - A signal that arrives before OpenSesame is started is remembered; nothing is
 *   started and `runProxied` says it was interrupted.
 * - From the `exit` event, which runs even when no await can, OpenSesame is sent
 *   SIGTERM if it is still running and the schema directory is removed.
 *
 * What no handler can reach: SIGKILL, and a crash of the process. The schema
 * directory (`hobo-opensesame-*`, a 0600 `.env.schema`) stays in the temp
 * directory; it holds references (connection names, paths, methods), never a
 * token. OpenSesame and its command keep running with their surrogate until the
 * command ends or the surrogate's lifetime runs out.
 */

import { rmSync } from "node:fs";

/** The part of a spawned process the run reads. A `ChildProcess` is one. */
export interface SpawnedProcess {
	readonly stderr: {
		on(event: "data", listener: (chunk: Buffer | string) => void): void;
	} | null;
	on(event: "error", listener: (error: Error) => void): void;
	on(
		event: "close",
		listener: (code: number | null, signal: NodeJS.Signals | null) => void,
	): void;
	kill(signal: NodeJS.Signals): boolean;
}

/** Where signals and the process's exit come from. `process` is one. */
export interface SignalSource {
	on(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
	on(event: "exit", listener: () => void): void;
	off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
	off(event: "exit", listener: () => void): void;
}

const PASSED_ON: readonly NodeJS.Signals[] = [
	"SIGTERM",
	"SIGHUP",
	"SIGINT",
	"SIGQUIT",
];

/** Interrupts end the parent by default, so the parent's ending is restored after the run. */
const INTERRUPTS: readonly NodeJS.Signals[] = ["SIGINT", "SIGQUIT"];

/** What OpenSesame is sent for what this process was sent: only SIGTERM and SIGHUP stop its command. */
function forwarded(signal: NodeJS.Signals): NodeJS.Signals {
	return INTERRUPTS.includes(signal) ? "SIGTERM" : signal;
}

export type RunGuard = Readonly<{
	/** The first signal received since the guard was made. */
	received(): NodeJS.Signals | undefined;
	/** The schema directory to remove if the process exits mid-run. */
	own(dir: string): void;
	/** OpenSesame is running; the signals received so far and from now on reach it. */
	attach(child: SpawnedProcess): void;
	/** OpenSesame has ended. */
	detach(): void;
	/** Remove the handlers; then re-raise an interrupt that stopped the run. */
	release(): void;
}>;

export function guardRun(
	host: SignalSource,
	raise: ((signal: NodeJS.Signals) => void) | undefined,
): RunGuard {
	let first: NodeJS.Signals | undefined;
	let running: SpawnedProcess | undefined;
	let dir: string | undefined;

	const onSignal = (signal: NodeJS.Signals) => {
		first ??= signal;
		running?.kill(forwarded(signal));
	};
	const onExit = () => {
		running?.kill("SIGTERM");
		if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
	};
	for (const name of PASSED_ON) host.on(name, onSignal);
	host.on("exit", onExit);

	return {
		received: () => first,
		own(owned) {
			dir = owned;
		},
		attach(child) {
			running = child;
			if (first !== undefined) child.kill(forwarded(first));
		},
		detach() {
			running = undefined;
		},
		release() {
			for (const name of PASSED_ON) host.off(name, onSignal);
			host.off("exit", onExit);
			if (first !== undefined && INTERRUPTS.includes(first)) raise?.(first);
		},
	};
}
