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
import { join } from "node:path";
import { emitFromAtoms } from "./atom-index.js";
import {
	formatHoboCodeResult,
	type HoboCodeCliDeps,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "./cli.js";
import { explicitHoboBinOverride, runComposedHobo } from "./composed-hobo.js";
import { type DevBrowserSession, resolveHoboSpawn } from "./dev-browser.js";
import { materializeExample } from "./example-catalog.js";
import { linkGeneratedAppRuntime } from "./generated-app-runtime.js";
import type { PendingApproval, ShellHost } from "./interactive-shell.js";
import { isJsonObject } from "./json.js";
import { formatUsage, type ShellEngine } from "./shell-engine.js";
import {
	formatLiveEndpoints,
	matchWorkspaceAction,
	resolveRunnableProject,
} from "./workspace-actions.js";

interface DispatchedTaskView {
	readonly taskId?: string;
	readonly status?: string;
	readonly handbackPath?: string;
	readonly error?: string;
}

function formatSessionCreateReply(options: {
	readonly id: string;
	readonly outputDir: string;
	readonly files: readonly string[];
	readonly holes: readonly string[];
}): string {
	const preview = [...options.files]
		.filter((file) => !file.endsWith(".gitkeep"))
		.sort((left, right) => {
			const rank = (file: string): number => {
				if (/(?:^|\/)(?:bindle|yard)\.ts$/u.test(file)) return 0;
				if (file.startsWith("src/")) return 1;
				return 2;
			};
			return rank(left) - rank(right);
		})
		.slice(0, 8)
		.join(", ");
	const hole =
		options.holes.length > 0
			? `Trainable holes (${options.holes.join(", ")}) are "use training" skeletons — not invented logic.`
			: undefined;
	return [
		`Created ${options.id} at ${options.outputDir}.`,
		preview.length > 0 ? `Wrote ${preview}.` : undefined,
		hole,
		'Say "run it" or "debug it" when you want live endpoints.',
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function dispatchedTask(result: HoboCodeCliResult): DispatchedTaskView | null {
	if (!isJsonObject(result.data) || result.data === null) return null;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const task = (result.data as { readonly task?: unknown }).task;
	if (!isJsonObject(task) || task === null) return null;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return task as DispatchedTaskView;
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
	const override = explicitHoboBinOverride(env);
	if (override === undefined) {
		const result = await runComposedHobo(argv, {
			cwd: deps.cwd ?? process.cwd(),
			env,
		});
		const text = [result.progress.join("\n"), result.stdout, result.stderr]
			.filter((part) => part.trim().length > 0)
			.join("\n")
			.trimEnd();
		if (result.exitCode === 0) {
			return text || `hobo ${argv.join(" ")} completed`;
		}
		throw new Error(
			`${text ? `${text}\n` : ""}hobo exited with ${result.exitCode}`,
		);
	}
	const spawned = resolveHoboSpawn({ env, argv, hoboBin: override });
	return new Promise((resolve, reject) => {
		const child = spawn(spawned.command, [...spawned.args], {
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
		child.once("error", (error) => {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				reject(
					new Error(
						`hobo override binary not found (${err.path ?? spawned.bin}). Set HOBO_CODE_HOBO_BIN to a real composed binary, or unset it to use in-process @hobo/hobo`,
					),
				);
				return;
			}
			reject(error);
		});
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
		result.data && isJsonObject(result.data)
			? // SAFETY: parsed or fixture value is the named domain type after this assertion.
				(
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
	const workspaceRoot = deps.cwd ?? process.cwd();
	let lastProjectDir: string | undefined;
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
	const tryWorkspaceAction = async (prompt: string): Promise<string | null> => {
		const action = matchWorkspaceAction(prompt);
		if (!action) return null;
		if (action.kind === "create" || action.kind === "create-and-run") {
			const outputDir = join(workspaceRoot, action.exampleId);
			const emitted = emitFromAtoms({
				intent: action.prompt,
				outputDir,
				params: { name: action.exampleId.replace(/[^a-z0-9-]+/giu, "-") },
			});
			if (emitted.ok) {
				linkGeneratedAppRuntime(outputDir);
				lastProjectDir = outputDir;
				if (action.kind === "create") {
					return formatSessionCreateReply({
						id: emitted.compositionId ?? action.exampleId,
						outputDir,
						files: emitted.files,
						holes: emitted.holes,
					});
				}
			} else {
				const copied = materializeExample({
					exampleId: action.exampleId,
					outputDir,
					appName: action.exampleId,
					intent: action.prompt,
				});
				linkGeneratedAppRuntime(copied.outputDir);
				lastProjectDir = copied.outputDir;
				if (action.kind === "create") {
					return formatSessionCreateReply({
						id: copied.templateId,
						outputDir: copied.outputDir,
						files: copied.files,
						holes: [],
					});
				}
			}
		}
		const projectDir = resolveRunnableProject(workspaceRoot, lastProjectDir);
		if (projectDir === undefined) {
			return 'No Bindle to run. Say "create a hello world app" first.';
		}
		const result = await runHoboCodeCli(
			["dev", "--cwd", projectDir, "--port", "0", "--debug-port", "0"],
			{ ...cliDeps, json: false },
		);
		if (!result.ok) {
			return formatHoboCodeResult(result, {
				json: false,
				dense: deps.dense === true,
			});
		}
		const deployment =
			result.data && isJsonObject(result.data)
				? // SAFETY: parsed or fixture value is the named domain type after this assertion.
					(
						result.data as {
							readonly deployment?: {
								readonly appUrl?: string;
								readonly debugUrl?: string;
								readonly controlsUrl?: string;
								readonly reportUrl?: string;
								readonly namedUrl?: string;
								readonly stationId?: string;
								readonly environment?: string;
							};
						}
					).deployment
				: undefined;
		if (
			!deployment?.appUrl ||
			!deployment.debugUrl ||
			!deployment.controlsUrl ||
			!deployment.reportUrl
		) {
			return formatHoboCodeResult(result, {
				json: false,
				dense: deps.dense === true,
			});
		}
		return formatLiveEndpoints({
			appUrl: deployment.appUrl,
			debugUrl: deployment.debugUrl,
			controlsUrl: deployment.controlsUrl,
			reportUrl: deployment.reportUrl,
			...(deployment.namedUrl !== undefined
				? { namedUrl: deployment.namedUrl }
				: undefined),
			...(deployment.stationId !== undefined
				? { stationId: deployment.stationId }
				: undefined),
			...(deployment.environment !== undefined
				? { environment: deployment.environment }
				: undefined),
			emphasis: action.kind === "debug" ? "debug" : "run",
		});
	};
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
		tryWorkspaceAction,
		async sendToAgent(agent, text) {
			const { IN_SESSION_MUX, sendToInSessionPane } = await import(
				"./in-session-panes.js"
			);
			const { tmuxRunner } = await import("./mux.js");
			const runner = tmuxRunner();
			const listed = await runner.run([
				"list-windows",
				"-t",
				`${IN_SESSION_MUX}:`,
				"-F",
				"#{window_name}\t#{pane_id}",
			]);
			const line = listed.stdout
				.split("\n")
				.find((row) => row.startsWith(`${agent}\t`));
			const target =
				line?.split("\t")[1]?.trim() || `${IN_SESSION_MUX}:${agent}`;
			await sendToInSessionPane(runner, target, text);
			return `sent to ${agent} in this session — stay here, Tab to panes to watch it work`;
		},
		async complete(prompt) {
			const handled = await tryWorkspaceAction(prompt);
			if (handled !== null) return handled;
			const result = await runHoboCodeCli([prompt], {
				...deps,
				json: false,
			});
			const task = dispatchedTask(result);
			if (result.ok && task?.taskId) {
				return [
					`Recorded compute task ${task.taskId} (status: ${task.status ?? "unknown"}).`,
					"No completion engine is wired yet, so nothing acted on your prompt —",
					// SAFETY: parsed or fixture value is the named domain type after this assertion.
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
