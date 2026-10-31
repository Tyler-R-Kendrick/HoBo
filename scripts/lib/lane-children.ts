/**
 * Every process the mirror lane starts (ADR-0174): the emulator and each
 * package's `pnpm --filter <name> run test:mirror`, tracked from the moment it
 * is spawned, so that a signal or the runner's exit stops it even while the
 * runner is still waiting for it to come up.
 *
 * Each child leads a process group of its own (`detached` on POSIX), so a stop
 * reaches what it started in turn: pnpm's shell, vitest and vitest's workers.
 * A stop is SIGTERM to the group, and SIGKILL to the group if the child has
 * not exited after the grace period. Whatever of the group outlives its
 * leader is sent SIGKILL from the leader's own `exit` handler, however the
 * leader ended, and never later: once the leader is reaped and its group
 * empty, the id can belong to an unrelated process. A stop resolves on the
 * child's `exit` event; nothing is polled. On Windows, where there are no
 * process groups, the child alone is signalled.
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
	/** The stop in progress for a child, so a second stop waits on it rather than signalling again. */
	readonly #stopping = new Map<ChildProcess, Promise<void>>();
	#closed = false;

	/**
	 * Spawn `command` as the leader of its own process group and track it
	 * until it exits. The leader's `exit` handler, the first one registered,
	 * sends what is left of its group a SIGKILL, whether a stop or something
	 * else ended it: at that moment the group still holds its id, so the
	 * signal reaches no one else. Nothing signals the group after that.
	 */
	spawn(
		command: string,
		args: readonly string[],
		options: SpawnOptions,
	): ChildProcess {
		if (this.#closed) throw new LaneChildrenClosedError(command);
		const child = spawn(command, [...args], { ...options, detached: GROUPS });
		this.#live.add(child);
		child.once("exit", () => {
			signal(child, "SIGKILL");
			this.#live.delete(child);
		});
		child.once("error", () => {
			if (child.pid === undefined) this.#live.delete(child);
		});
		return child;
	}

	/**
	 * Stop one child and its group: SIGTERM to the group, SIGKILL to it after
	 * `graceMs` if the child is still running, and the exit handler's sweep.
	 * Resolves once the child has exited. A child that has already exited is
	 * not signalled at all, and a second stop waits on the first.
	 */
	stop(child: ChildProcess, graceMs = 5_000): Promise<void> {
		const inProgress = this.#stopping.get(child);
		if (inProgress !== undefined) return inProgress;
		if (child.pid === undefined || !running(child)) return Promise.resolve();
		const stopped = new Promise<void>((resolveStop) => {
			const killer = setTimeout(() => {
				if (running(child)) signal(child, "SIGKILL");
			}, graceMs);
			child.once("exit", () => {
				clearTimeout(killer);
				resolveStop();
			});
			signal(child, "SIGTERM");
		});
		this.#stopping.set(child, stopped);
		return stopped;
	}

	/** Start nothing more and stop every child; resolves once each has exited. */
	async stopAll(graceMs = 5_000): Promise<void> {
		this.#closed = true;
		await Promise.all(
			[...this.#live].map((child) => this.stop(child, graceMs)),
		);
	}

	/** For the runner's last moment, which cannot wait: SIGKILL every group whose leader still runs. */
	killAllNow(): void {
		this.#closed = true;
		for (const child of this.#live) {
			if (running(child)) signal(child, "SIGKILL");
		}
	}
}
