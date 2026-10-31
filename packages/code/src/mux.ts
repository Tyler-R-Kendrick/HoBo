/**
 * Herdr-style multi-pane tmux sessions.
 *
 * Previously the "multiplexer" was a picture: `buildMultiplexerStatus` drew
 * panes that corresponded to no real terminal. This drives tmux for real —
 * one window per registered agent, in a session you can detach from and
 * reattach to.
 *
 * The load-bearing idea is **uniform targets**: a locally spawned agent, a
 * local inference server, and an ssh'd remote host are all just a command
 * placed in a pane. Local inference is not a special case with its own
 * lifecycle; it is a target like any other, so detach/reattach, naming and
 * status work identically whether the work is on this box or another one.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TargetKind = "local" | "local-inference" | "ssh";

interface MuxTargetBase {
	/** Window name inside the tmux session. */
	readonly name: string;
	/** Command to run in the window. */
	/**
	 * The command to run in the pane, as a **shell snippet**.
	 *
	 * `placedCommand` prefixes it (`cd … && <command>`) or hands it to
	 * `hobo-rift exec` after `--`, where the outer shell splits it into an argv
	 * vector that rift re-quotes per token. A compound snippet therefore behaves
	 * differently through the two branches, so keep pane commands simple; wrap
	 * anything compound in `sh -c` yourself.
	 */
	readonly command: string;
	/** Working directory for local targets. */
	readonly cwd?: string;
	/**
	 * Run the command through a workspace wrapper instead of `cd`-ing to `cwd`.
	 * Needed for namespace-mounted virtual worktrees, whose path is invisible
	 * outside the mount.
	 */
	readonly exec?: {
		readonly binary: string;
		readonly root: string;
		readonly name: string;
	};
}

export type MuxTarget =
	| (MuxTargetBase & {
			readonly kind: "local" | "local-inference";
	  })
	| (MuxTargetBase & {
			readonly kind: "ssh";
			readonly host: string;
			/** Lease-bound local SSH-agent socket for this authorized pane. */
			readonly identityAgent: string;
			/** Station authorization deadline; SSH is terminated at expiry. */
			readonly expiresAt: string;
	  });

export interface MuxPlan {
	readonly session: string;
	readonly targets: readonly MuxTarget[];
	/** Fully-formed shell command per target, in window order. */
	readonly commands: readonly string[];
}

/**
 * Pin a `-t` target to a session.
 *
 * tmux treats `-t <name>` on new-window/list-windows as a *window* target, so
 * a bare session name can prefix-match a window instead: with session "hobo"
 * and window "hobo-code", `new-window -t hobo` failed with "index 0 in use"
 * and the session silently came up with one pane. The trailing colon means
 * "this session, tmux's choice of window".
 */
export function sessionTarget(session: string): string {
	return `${session}:`;
}

/** tmux window names cannot contain dots or colons without confusing targets. */
export function safeWindowName(raw: string): string {
	const cleaned = raw
		.replace(/[.:\s]+/g, "-")
		.replace(/[^\w-]/g, "")
		.replace(/^-+|-+$/g, "");
	// An all-punctuation name collapses to nothing useful; name it rather than
	// handing tmux a bare dash.
	return cleaned.length > 0 ? cleaned.slice(0, 24) : "pane";
}

/**
 * Resolve a target to the command tmux should run.
 *
 * ssh targets are wrapped rather than modelled separately — that is what
 * makes "local inference in a new terminal" and "remote session" the same
 * shape to everything downstream.
 */
/** POSIX single-quoting; double quotes still expand `$`, backticks and `\`. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/gu, `'\\''`)}'`;
}

/** A command that begins with a `NAME=value` environment assignment. */
const LEADING_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/**
 * The command that places `target.command` in its workspace — the exec wrapper
 * for namespace-mounted trees, a `cd` otherwise, and nothing when the target
 * has neither.
 */
export function placedCommand(target: MuxTarget): string {
	// An ssh target's workspace lives on the remote. Local paths — a `cwd` or
	// an exec wrapper naming this machine's binaries — mean nothing there, and
	// `cd '/home/alice/proj'` on a host without that path stops the agent from
	// starting at all. Ignoring them here rather than trusting every caller to
	// strip them keeps one place responsible for it.
	if (target.kind === "ssh") return target.command;
	if (target.exec) {
		// The bundled sidecar is a .js file, which is only directly executable
		// if its exec bit survived the install; run it through this node.
		const binary = target.exec.binary.endsWith(".js")
			? `${shellQuote(process.execPath)} ${shellQuote(target.exec.binary)}`
			: shellQuote(target.exec.binary);
		// hobo-rift runs what follows `--` as an argv vector, each element
		// quoted, so leading `NAME=value` words are no environment there: the
		// first became the command, and the agent never started. `env` makes
		// them environment again.
		const vector = LEADING_ASSIGNMENT.test(target.command)
			? `env ${target.command}`
			: target.command;
		return `${binary} exec --root ${shellQuote(target.exec.root)} --name ${shellQuote(target.exec.name)} -- ${vector}`;
	}
	return target.cwd
		? `cd ${shellQuote(target.cwd)} && ${target.command}`
		: target.command;
}

export function targetCommand(target: MuxTarget): string {
	if (target.kind === "ssh") {
		if (!target.host || !target.identityAgent || !target.expiresAt) {
			throw new Error(
				`ssh target ${target.name} requires a host and Station authorization`,
			);
		}
		// The remote gets the *placed* command, not the bare one. Sending only
		// `target.command` ran every agent in the remote login directory with no
		// isolation at all, after allocating workspaces nobody then used.
		// -t so the remote gets a TTY, matching what a local pane provides.
		// The brokered reference travels as configuration rather than as an
		// argument, so the pane uses the Station's session instead of whatever
		// ambient key happens to be in ~/.ssh.
		const identity = [
			`IdentityAgent=${target.identityAgent}`,
			"IdentityFile=none",
			"PreferredAuthentications=publickey",
			"PasswordAuthentication=no",
			"KbdInteractiveAuthentication=no",
			"BatchMode=yes",
		]
			.map((option) => `-o ${shellQuote(option)}`)
			.join(" ");
		const ssh = `ssh -t ${identity} ${target.host} ${shellQuote(placedCommand(target))}`;
		return keepPaneOpen(target.name, leaseCommand(ssh, target.expiresAt));
	}
	return keepPaneOpen(target.name, placedCommand(target));
}

/** POSIX lease timer for an established SSH process. */
export function leaseCommand(
	command: string,
	expiresAt: string,
	nowMs = Date.now(),
): string {
	const expiry = Date.parse(expiresAt);
	if (!Number.isFinite(expiry) || expiry <= nowMs) {
		throw new Error("Station authorization is expired or invalid");
	}
	const seconds = Math.max(1, Math.ceil((expiry - nowMs) / 1_000));
	return `sh -c ${shellQuote(`${command} & child=$!; (sleep ${seconds}; kill -TERM "$child" 2>/dev/null) & lease=$!; wait "$child"; status=$?; kill "$lease" 2>/dev/null; wait "$lease" 2>/dev/null; exit "$status"`)}`;
}

/**
 * Keep a pane alive after its command exits, showing the status.
 *
 * tmux destroys a window the moment its command returns, so an agent that
 * exits immediately (`ollama serve` when a server is already running, a CLI
 * that needs auth) simply vanished — the session ended up with fewer panes
 * than detected agents and nothing said why. Holding the pane turns a silent
 * disappearance into a visible exit code.
 */
export function keepPaneOpen(name: string, command: string): string {
	const label = safeWindowName(name);
	return `sh -c '${command.replace(/'/g, "'\\''")}; status=$?; printf "\\n[${label} exited %s — press enter to close]" "$status"; read _'`;
}

export function planMux(
	session: string,
	targets: readonly MuxTarget[],
): MuxPlan {
	return {
		session: safeWindowName(session),
		targets,
		commands: targets.map(targetCommand),
	};
}

export interface MuxRunner {
	readonly run: (
		args: readonly string[],
	) => Promise<{ code: number | null; stdout: string; stderr?: string }>;
}

/** Real tmux runner; stderr ignored so a chatty tmux cannot wedge us. */
export function tmuxRunner(prefix: readonly string[] = []): MuxRunner {
	return {
		run: (args) =>
			new Promise((resolve) => {
				const pipeOutput =
					args[0]?.startsWith("list-") === true ||
					args[0] === "display-message" ||
					args[0] === "capture-pane" ||
					args[0] === "show-options";
				const atomicOutput = args.includes("-P");
				const diagnose =
					args[0] === "has-session" || args[0] === "list-sessions";
				const outputPath = atomicOutput
					? join(tmpdir(), `hobo-tmux-${process.pid}-${randomUUID()}`)
					: undefined;
				const outputFd = outputPath
					? openSync(outputPath, "w", 0o600)
					: undefined;
				const child = spawn("tmux", [...prefix, ...args], {
					// A newly forked tmux server can inherit stdout. Giving mutating
					// commands a pipe leaves callers waiting forever for EOF. `-P`
					// output goes through a private file so pane creation stays atomic.
					stdio: [
						"ignore",
						outputFd ?? (pipeOutput ? "pipe" : "ignore"),
						diagnose ? "pipe" : "ignore",
					],
				});
				let stdout = "";
				let stderr = "";
				let settled = false;
				if (child.stdout) {
					child.stdout.setEncoding("utf8");
					child.stdout.on("data", (c: string) => {
						stdout += c;
					});
				}
				if (child.stderr) {
					child.stderr.setEncoding("utf8");
					child.stderr.on("data", (c: string) => {
						stderr += c;
					});
				}
				const finish = (code: number | null) => {
					if (settled) return;
					settled = true;
					if (outputFd !== undefined) closeSync(outputFd);
					if (outputPath) {
						stdout = readFileSync(outputPath, "utf8");
						unlinkSync(outputPath);
					}
					resolve({ code, stdout, stderr });
				};
				child.once("error", () => finish(null));
				child.once("close", finish);
			}),
	};
}

export interface ApplyResult {
	readonly ok: boolean;
	readonly session: string;
	readonly created: readonly string[];
	readonly existed: boolean;
	readonly detail: string;
}

/**
 * Create the session if absent and add one window per target.
 *
 * Idempotent: an existing session is reused and only missing windows are
 * added, so running this twice does not duplicate panes or kill your work.
 */
export async function applyMux(
	plan: MuxPlan,
	runner: MuxRunner,
): Promise<ApplyResult> {
	const has = await runner.run(["has-session", "-t", plan.session]);
	const existed = has.code === 0;
	const created: string[] = [];

	if (!existed) {
		const first = plan.targets[0];
		if (!first) {
			return {
				ok: false,
				session: plan.session,
				created: [],
				existed: false,
				detail: "no agents detected — nothing to seat in a session",
			};
		}
		const start = await runner.run([
			"new-session",
			"-d",
			"-s",
			plan.session,
			"-n",
			safeWindowName(first.name),
			targetCommand(first),
		]);
		if (start.code !== 0) {
			return {
				ok: false,
				session: plan.session,
				created: [],
				existed: false,
				detail: "tmux new-session failed (is tmux installed?)",
			};
		}
		created.push(safeWindowName(first.name));
	}

	// Only ask tmux what already exists when joining a session we did not just
	// create. Querying right after `new-session` can observe a same-named
	// session still being torn down, and those stale window names made us skip
	// creating the real ones — the session silently came up with one pane
	// instead of six.
	const present = new Set<string>(created);
	if (existed) {
		const listed = await runner.run([
			"list-windows",
			"-t",
			sessionTarget(plan.session),
			"-F",
			"#{window_name}",
		]);
		for (const line of listed.stdout.split("\n")) {
			const name = line.trim();
			if (name.length > 0) present.add(name);
		}
	}

	for (const target of plan.targets) {
		const name = safeWindowName(target.name);
		if (present.has(name) || created.includes(name)) continue;
		const added = await runner.run([
			"new-window",
			"-d",
			"-t",
			sessionTarget(plan.session),
			"-n",
			name,
			targetCommand(target),
		]);
		if (added.code !== 0) {
			let rolledBack = true;
			const surviving = new Set(created);
			if (existed) {
				for (const createdName of [...created].reverse()) {
					const removed = await runner.run([
						"kill-window",
						"-t",
						`${plan.session}:${createdName}`,
					]);
					if (removed.code === 0) surviving.delete(createdName);
					rolledBack = rolledBack && removed.code === 0;
				}
			} else {
				const removed = await runner.run(["kill-session", "-t", plan.session]);
				rolledBack = removed.code === 0;
				if (rolledBack) surviving.clear();
			}
			return {
				ok: false,
				session: plan.session,
				created: [...surviving],
				existed,
				detail: `tmux new-window failed for ${name}; rollback ${rolledBack ? "complete" : "incomplete"}`,
			};
		}
		created.push(name);
	}

	return {
		ok: true,
		session: plan.session,
		created,
		existed,
		detail: existed
			? `reattached to ${plan.session}; added ${created.length} window(s)`
			: `created ${plan.session} with ${created.length} window(s)`,
	};
}

/** The command a human runs to join the session — local or over ssh. */
export function attachCommand(session: string, host?: string): string {
	const local = `tmux attach -t ${safeWindowName(session)}`;
	return host ? `ssh -t ${host} ${JSON.stringify(local)}` : local;
}
