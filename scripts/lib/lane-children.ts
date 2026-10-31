/**
 * Every process the mirror lane starts (ADR-0174): the emulator and each
 * package's `pnpm --filter <name> run test:mirror`, tracked from the moment it
 * is spawned, so that a signal or the runner's exit stops it even while the
 * runner is still waiting for it to come up.
 *
 * Each child leads a process group of its own (`detached` on POSIX), so a stop
 * reaches what it started in turn: pnpm's shell, vitest and vitest's workers.
 * A stop is SIGTERM to the group, SIGKILL to the group if the child has not
 * exited after the grace period, and SIGKILL to whatever of the group is left
 * once the child has exited. It resolves on the child's `exit` event; nothing
 * is polled. On Windows, where there are no process groups, the child alone
 * is signalled.
 *
 * Erasable TypeScript with node builtins only, like the rest of scripts/lib.
 */
import {
	type ChildProcess,
	type SpawnOptions,
	spawn,
} from "node:child_process";
import process from "node:process";

const GROUPS = process.platform !== "win32";

/** The lane is stopping and starts nothing more. */
export class LaneChildrenClosedError extends Error {
	readonly code = "MIRROR_LANE_STOPPING";
	constructor(command: string) {
		super(
			`MIRROR_LANE_STOPPING: not starting ${command}: the lane is stopping`,
		);
		this.name = "LaneChildrenClosedError";
	}
}

function running(child: ChildProcess): boolean {
	return child.exitCode === null && child.signalCode === null;
}

function exited(child: ChildProcess): Promise<void> {
	return running(child)
		? new Promise((resolveExit) => child.once("exit", () => resolveExit()))
		: Promise.resolve();
}

/** Signal `child`'s process group, or the child alone where there are none; a group already gone is no error. */
function signal(child: ChildProcess, name: NodeJS.Signals): void {
	if (child.pid === undefined) return;
	try {
		if (GROUPS) process.kill(-child.pid, name);
		else child.kill(name);
	} catch {
		// ESRCH: nothing of the group is left.
	}
}

export class LaneChildren {
	readonly #live = new Set<ChildProcess>();
	#closed = false;

	/** Spawn `command` as the leader of its own process group and track it until it exits. */
	spawn(
		command: string,
		args: readonly string[],
		options: SpawnOptions,
	): ChildProcess {
		if (this.#closed) throw new LaneChildrenClosedError(command);
		const child = spawn(command, [...args], { ...options, detached: GROUPS });
		this.#live.add(child);
		child.once("exit", () => this.#live.delete(child));
		child.once("error", () => {
			if (child.pid === undefined) this.#live.delete(child);
		});
		return child;
	}

	/** Stop one child and its group; resolves once the child has exited. */
	async stop(child: ChildProcess, graceMs = 5_000): Promise<void> {
		if (child.pid === undefined) return;
		if (running(child)) {
			signal(child, "SIGTERM");
			const killer = setTimeout(() => signal(child, "SIGKILL"), graceMs);
			await exited(child);
			clearTimeout(killer);
		}
		// What the child started may outlive it: nothing of the group stays.
		signal(child, "SIGKILL");
		this.#live.delete(child);
	}

	/** Start nothing more and stop every child; resolves once each has exited. */
	async stopAll(graceMs = 5_000): Promise<void> {
		this.#closed = true;
		await Promise.all(
			[...this.#live].map((child) => this.stop(child, graceMs)),
		);
	}

	/** For the runner's `exit` event, which cannot wait: SIGKILL every group still tracked. */
	killAllNow(): void {
		this.#closed = true;
		for (const child of this.#live) signal(child, "SIGKILL");
	}
}
