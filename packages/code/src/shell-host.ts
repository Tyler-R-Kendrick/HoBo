/**
 * Default InteractiveShell host — bridges product CLI + dispatch + engine.
 *
 * Honesty contract (render-budget/honesty tests pin this):
 * - a chat reply states exactly what happened — without an engine, a turn
 *   *records a compute task* and the reply says so; with an engine, the turn
 *   streams the real model and edits stay in the mediated sandbox until an
 *   audited promote (ADR-0139);
 * - no success theater, no fixed "Next:" filler, no branding in replies;
 * - every reply teaches the equivalent one-shot command.
 */
import { spawn } from "node:child_process";

import {
	formatHoboCodeResult,
	type HoboCodeCliDeps,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "./cli.js";
import type { DevBrowserSession } from "./dev-browser.js";
import type { PendingApproval, ShellHost } from "./interactive-shell.js";
import { formatUsage, type ShellEngine } from "./shell-engine.js";

interface DispatchedTaskShape {
	readonly taskId?: string;
	readonly status?: string;
	readonly handbackPath?: string;
	readonly error?: string;
}

function dispatchedTask(result: HoboCodeCliResult): DispatchedTaskShape | null {
	if (typeof result.data !== "object" || result.data === null) return null;
	const task = (result.data as { readonly task?: unknown }).task;
	if (typeof task !== "object" || task === null) return null;
	return task as DispatchedTaskShape;
}

function oneShotHint(prompt: string): string {
	const compact = prompt.length > 48 ? `${prompt.slice(0, 47)}…` : prompt;
	return `One-shot equivalent: hobo-code "${compact.replace(/"/g, '\\"')}"`;
}

async function runHoboCommand(
	argv: readonly string[],
	deps: DefaultShellHostOptions,
): Promise<string> {
	const env = { ...process.env, ...deps.env };
	const command = env.HOBO_CODE_HOBO_BIN ?? env.HOBO_BIN ?? "hobo";
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...argv], {
			cwd: deps.cwd ?? process.cwd(),
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		const append = (chunk: Buffer): void => {
			output = `${output}${chunk.toString("utf8")}`.slice(-64 * 1024);
		};
		child.stdout.on("data", append);
		child.stderr.on("data", append);
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			const text = output.trimEnd();
			if (code === 0) resolve(text || `hobo ${argv.join(" ")} completed`);
			else
				reject(
					new Error(
						`${text ? `${text}\n` : ""}hobo exited with ${signal ?? code ?? "unknown status"}`,
					),
				);
		});
	});
}

async function executeResidentTerminalAction(
	result: HoboCodeCliResult,
	env: NodeJS.ProcessEnv,
): Promise<void> {
	const action =
		result.data && typeof result.data === "object"
			? (
					result.data as {
						readonly terminalAction?: {
							readonly kind?: string;
							readonly sessionName?: string;
						};
					}
				).terminalAction
			: undefined;
	if (!result.ok) return;
	const args =
		action?.kind === "attach-session" && action.sessionName
			? env.TMUX
				? ["switch-client", "-t", action.sessionName]
				: ["attach-session", "-t", action.sessionName]
			: action?.kind === "detach-session" && env.TMUX
				? ["detach-client"]
				: undefined;
	if (!args) return;
	const code = await new Promise<number>((resolve) => {
		const child = spawn("tmux", args, { stdio: "inherit", env });
		child.once("error", () => resolve(1));
		child.once("exit", (exitCode, signal) =>
			resolve(signal === "SIGINT" ? 130 : (exitCode ?? 1)),
		);
	});
	if (code !== 0)
		throw new Error(`tmux ${args[0]} failed with exit code ${code}`);
}

export interface DefaultShellHostOptions extends HoboCodeCliDeps {
	/** Wired completion engine (Slice 2). Absent → honest dispatch-only mode. */
	readonly engine?: ShellEngine | null;
}

export function createDefaultShellHost(
	deps: DefaultShellHostOptions = {},
): ShellHost {
	const engine = deps.engine ?? null;
	const devSessions = new Set<DevBrowserSession>();
	const cliDeps: DefaultShellHostOptions = {
		...deps,
		onDevSession: (session) => {
			devSessions.add(session);
			deps.onDevSession?.(session);
		},
	};
	const engineExtras: Partial<ShellHost> = engine
		? {
				engineLabel: `${engine.id} · ${engine.modelLabel}`,
				aboutLines: [
					`Engine: ${engine.id} (${engine.modelLabel}) — streams real turns.`,
					`Sandbox: ${engine.sandboxRoot} (mediated; canonical tree read-only).`,
					"Edits never reach the canonical tree without an explicit approval;",
					`promotion is squash-only, gated and audited (run ${engine.runId}).`,
					"Pi TUI stays an opt-in escape hatch via `hobo-code --pi` — never the product UI.",
				],
				usageLabel: () => {
					const u = engine.usage();
					return u.totalTokens > 0 || u.costUsd > 0 ? formatUsage(u) : "";
				},
				streamTurn: (prompt, onEvent) => engine.turn(prompt, onEvent),
				cancelTurn: () => engine.abort(),
				/**
				 * Raise the approval gate only when the sandbox actually changed —
				 * an answer-only turn must not nag for a promotion.
				 */
				pendingApprovalFor: async (result) => {
					if (result.toolCalls === 0) return null;
					const changes = await engine.changes();
					if (changes.length === 0) return null;
					return {
						runId: engine.runId,
						sandboxRoot: engine.sandboxRoot,
						changes,
					};
				},
				promote: async (approval: PendingApproval) => {
					const result = await runHoboCodeCli(
						["promote", "--run", approval.runId],
						{ ...deps, json: false },
					);
					const body = formatHoboCodeResult(result, {
						json: false,
						dense: deps.dense === true,
					}).trimEnd();
					if (result.ok) {
						return [
							`Promoted run ${approval.runId} — gates ran, then the diff was applied.`,
							// The result's own message carries the applied count; the
							// approval snapshot can be stale by now.
							result.message,
							body,
						].join("\n");
					}
					return [
						`Promotion refused (${result.code}) — work stays in the sandbox.`,
						body,
						...(result.remediation?.length
							? ["Try:", ...result.remediation.map((r) => `  ${r}`)]
							: []),
					].join("\n");
				},
			}
		: {};
	return {
		...engineExtras,
		async runVerb(argv) {
			if (argv[0] === "hobo" && argv[1] !== "dev") {
				return runHoboCommand(argv.slice(1), deps);
			}
			const codeArgv = argv[0] === "hobo" ? argv.slice(1) : argv;
			const result = await runHoboCodeCli([...codeArgv], {
				...cliDeps,
				json: false,
			});
			const text = formatHoboCodeResult(result, {
				json: false,
				dense: deps.dense === true,
			});
			await executeResidentTerminalAction(result, deps.env ?? process.env);
			return text;
		},
		dispose: async () => {
			await Promise.all([...devSessions].map((session) => session.close()));
			devSessions.clear();
		},
		async complete(prompt) {
			const result = await runHoboCodeCli([prompt], {
				...deps,
				json: false,
			});
			const task = dispatchedTask(result);
			if (result.ok && task?.taskId) {
				return [
					`Recorded compute task ${task.taskId} (status: ${task.status ?? "unknown"}).`,
					"No completion engine is wired yet, so nothing acted on your prompt —",
					"it is stored as a dispatch task for a worker to pick up (/about).",
					...(task.handbackPath ? [`Handback: ${task.handbackPath}`] : []),
					oneShotHint(prompt),
				].join("\n");
			}
			if (result.ok) {
				// Non-dispatch success (e.g. a verb-shaped prompt routed elsewhere).
				return formatHoboCodeResult(result, {
					json: false,
					dense: deps.dense === true,
				});
			}
			const remediation = result.remediation ?? [];
			return [
				`${result.code}: ${task?.error ?? "dispatch failed"}`,
				formatHoboCodeResult(result, {
					json: false,
					dense: deps.dense === true,
				}).trimEnd(),
				...(remediation.length > 0
					? ["Try:", ...remediation.map((r) => `  ${r}`)]
					: []),
			].join("\n");
		},
	};
}
