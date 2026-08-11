import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { create } from "@bufbuild/protobuf";

import {
	CheckpointLifecycleState,
	CheckpointSchema,
	DeliveryLifecycleState,
	GitStateSchema,
	type SessionCommandEnvelope,
	type SessionSnapshot,
} from "./_generated/code_harness_pb.js";
import type { ResidentSessionRuntime } from "./resident-session-runtime.js";
import { parseSessionCommand } from "./session-contract.js";

export type SessionDeliveryOperation =
	| "commit"
	| "push"
	| "open-pull-request"
	| "stack-pull-request"
	| "merge-pull-request";

export interface SessionDeliveryApproval {
	readonly operation: SessionDeliveryOperation;
	readonly commandId: string;
	readonly sessionId: string;
	readonly expectedRevision: bigint;
	readonly details: Readonly<Record<string, string | boolean>>;
}

export interface SessionProcessResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface SessionProcessRunner {
	run(
		command: string,
		args: readonly string[],
		cwd: string,
	): Promise<SessionProcessResult>;
}

export interface SessionOrchestratorOptions {
	readonly runtime: ResidentSessionRuntime;
	readonly worktreesDir: string;
	readonly runner?: SessionProcessRunner;
	readonly authorize?: (
		action: SessionDeliveryApproval,
		snapshot: SessionSnapshot,
	) => boolean | Promise<boolean>;
	readonly now?: () => string;
}

export interface SessionOrchestrator {
	execute(command: unknown): Promise<SessionSnapshot>;
}

export function sessionProcessRunner(): SessionProcessRunner {
	return {
		run(command, args, cwd) {
			return new Promise((done) => {
				const child = spawn(command, [...args], {
					cwd,
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stdout = "";
				let stderr = "";
				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (chunk: string) => {
					stdout += chunk;
				});
				child.stderr.on("data", (chunk: string) => {
					stderr += chunk;
				});
				child.once("error", (error) =>
					done({ code: null, stdout, stderr: String(error) }),
				);
				child.once("close", (code) => done({ code, stdout, stderr }));
			});
		},
	};
}

function sessionPath(root: string, sessionId: string): string {
	const slug =
		sessionId.replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 32) || "session";
	const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
	return join(root, `${slug}-${hash}`);
}

function requiredSession(
	snapshot: SessionSnapshot,
): NonNullable<SessionSnapshot["session"]> {
	if (!snapshot.session)
		throw new Error("session snapshot is missing its session");
	return snapshot.session;
}

function revision(snapshot: SessionSnapshot): bigint {
	if (snapshot.revision === undefined)
		throw new Error("session snapshot is missing its revision");
	return snapshot.revision;
}

function commandError(command: string, result: SessionProcessResult): Error {
	return new Error(
		`${command} failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`,
	);
}

function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function fileLocked<T>(path: string, work: () => Promise<T>): Promise<T> {
	mkdirSync(dirname(path), { recursive: true });
	const owner = `${path}.${process.pid}.${randomUUID()}`;
	writeFileSync(owner, String(process.pid), { flag: "wx", mode: 0o600 });
	let acquired = false;
	try {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				linkSync(owner, path);
				acquired = true;
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				let pid = 0;
				try {
					pid = Number.parseInt(readFileSync(path, "utf8"), 10);
				} catch (readError) {
					if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
					throw readError;
				}
				if (Number.isSafeInteger(pid) && processAlive(pid)) {
					throw new Error(`operation is busy: ${path}`);
				}
				try {
					unlinkSync(path);
				} catch (unlinkError) {
					if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT")
						throw unlinkError;
				}
			}
		}
	} finally {
		unlinkSync(owner);
	}
	if (!acquired) throw new Error(`could not acquire operation lock: ${path}`);
	try {
		return await work();
	} finally {
		unlinkSync(path);
	}
}

function writeJsonAtomic(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${randomUUID()}`;
	writeFileSync(
		temporary,
		`${JSON.stringify(value, (_key, item) =>
			typeof item === "bigint" ? item.toString() : item,
		)}\n`,
		{
			flag: "wx",
			mode: 0o600,
		},
	);
	renameSync(temporary, path);
}

export function createSessionOrchestrator(
	options: SessionOrchestratorOptions,
): SessionOrchestrator {
	const runner = options.runner ?? sessionProcessRunner();
	const now = options.now ?? (() => new Date().toISOString());

	async function run(
		command: string,
		args: readonly string[],
		cwd: string,
	): Promise<string> {
		const result = await runner.run(command, args, cwd);
		if (result.code !== 0)
			throw commandError(`${command} ${args[0] ?? ""}`, result);
		return result.stdout.trim();
	}

	async function approved(
		operation: SessionDeliveryOperation,
		snapshot: SessionSnapshot,
		command: SessionCommandEnvelope,
	): Promise<SessionDeliveryApproval> {
		const action = command.command;
		const details: Record<string, string | boolean> = {};
		switch (action.case) {
			case "commit":
				details.message = action.value.message;
				break;
			case "push":
				details.remote = action.value.remote;
				break;
			case "openPullRequest":
				details.title = action.value.title;
				details.body = action.value.body;
				details.draft = action.value.draft ?? false;
				break;
			case "stackPullRequest":
				details.parentBranch = action.value.parentBranch;
				details.title = action.value.title;
				details.body = action.value.body;
				break;
			case "mergePullRequest":
				details.pullRequestNumber = String(action.value.pullRequestNumber);
				break;
			default:
				throw new Error(`${operation} is not a delivery command`);
		}
		const approval = Object.freeze({
			operation,
			commandId: command.commandId,
			sessionId: command.sessionId,
			expectedRevision: command.expectedRevision ?? 0n,
			details: Object.freeze(details),
		});
		if (!(await options.authorize?.(approval, snapshot))) {
			throw new Error(`${operation} requires explicit approval`);
		}
		return approval;
	}

	async function deliveryEffect(
		operation: SessionDeliveryOperation,
		command: SessionCommandEnvelope,
		snapshot: SessionSnapshot,
		work: () => Promise<SessionSnapshot>,
	): Promise<SessionSnapshot> {
		const approval = await approved(operation, snapshot, command);
		const digest = createHash("sha256")
			.update(
				JSON.stringify(command.command, (_key, value) =>
					typeof value === "bigint" ? value.toString() : value,
				),
			)
			.digest("hex");
		const path = deliveryLedgerPath(command.commandId);
		if (existsSync(path)) {
			const prior = JSON.parse(readFileSync(path, "utf8")) as {
				digest?: string;
				status?: string;
			};
			if (prior.digest !== digest)
				throw new Error(
					"command ID was reused for a different delivery action",
				);
			if (prior.status === "complete") {
				const current = await options.runtime.load(command.sessionId);
				if (!current)
					throw new Error(`session ${command.sessionId} does not exist`);
				return current;
			}
			throw new Error(
				`${operation} has an unknown prior outcome; reconcile before retrying`,
			);
		}
		writeJsonAtomic(path, { digest, status: "pending", approval });
		const result = await work();
		writeJsonAtomic(path, { digest, status: "complete", approval });
		return result;
	}

	function deliveryLedgerPath(commandId: string): string {
		return join(
			options.worktreesDir,
			".commands",
			`${createHash("sha256").update(commandId).digest("hex")}.json`,
		);
	}

	async function priorDeliveryResult(
		command: SessionCommandEnvelope,
	): Promise<SessionSnapshot | undefined> {
		const path = deliveryLedgerPath(command.commandId);
		if (!existsSync(path)) return undefined;
		const prior = JSON.parse(readFileSync(path, "utf8")) as {
			digest?: string;
			status?: string;
		};
		const digest = createHash("sha256")
			.update(
				JSON.stringify(command.command, (_key, value) =>
					typeof value === "bigint" ? value.toString() : value,
				),
			)
			.digest("hex");
		if (prior.digest !== digest)
			throw new Error("command ID was reused for a different action");
		if (prior.status !== "complete") {
			throw new Error(
				"delivery command has an unknown prior outcome; reconcile before retrying",
			);
		}
		const snapshot = await options.runtime.load(command.sessionId);
		if (!snapshot)
			throw new Error(`session ${command.sessionId} does not exist`);
		return snapshot;
	}

	async function gitState(snapshot: SessionSnapshot): Promise<void> {
		const session = requiredSession(snapshot);
		const cwd = session.worktreePath;
		const [head, status] = await Promise.all([
			run("git", ["rev-parse", "HEAD"], cwd),
			run("git", ["status", "--porcelain=v1", "--untracked-files=all"], cwd),
		]);
		const upstream = await runner.run(
			"git",
			["rev-parse", "--abbrev-ref", "@{upstream}"],
			cwd,
		);
		let baseSha = head;
		let ahead = 0;
		let behind = 0;
		if (upstream.code === 0) {
			baseSha = await run(
				"git",
				["merge-base", "HEAD", upstream.stdout.trim()],
				cwd,
			);
			const counts = await run(
				"git",
				[
					"rev-list",
					"--left-right",
					"--count",
					`HEAD...${upstream.stdout.trim()}`,
				],
				cwd,
			);
			[ahead, behind] = counts.split(/\s+/u).map(Number) as [number, number];
		}
		const stagedPaths: string[] = [];
		const unstagedPaths: string[] = [];
		const untrackedPaths: string[] = [];
		for (const line of status.split("\n").filter(Boolean)) {
			const index = line[0] ?? " ";
			const worktree = line[1] ?? " ";
			const path = line.slice(3).split(" -> ").at(-1) ?? "";
			if (index === "?" && worktree === "?") untrackedPaths.push(path);
			else {
				if (index !== " ") stagedPaths.push(path);
				if (worktree !== " ") unstagedPaths.push(path);
			}
		}
		snapshot.gitState = create(GitStateSchema, {
			worktreePath: cwd,
			branch: session.branch,
			headSha: head,
			baseSha,
			dirty: status.length > 0,
			ahead,
			behind,
			stagedPaths,
			unstagedPaths,
			untrackedPaths,
		});
	}

	async function refresh(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
		return options.runtime.update(
			requiredSession(snapshot).id,
			revision(snapshot),
			gitState,
		);
	}

	async function loaded(
		command: SessionCommandEnvelope,
	): Promise<SessionSnapshot> {
		const snapshot = await options.runtime.load(command.sessionId);
		if (!snapshot)
			throw new Error(`session ${command.sessionId} does not exist`);
		if (
			command.expectedRevision === undefined ||
			command.expectedRevision !== snapshot.revision
		) {
			throw new Error(
				`expected revision ${command.expectedRevision}, found ${snapshot.revision}`,
			);
		}
		return snapshot;
	}

	async function checkpoint(
		snapshot: SessionSnapshot,
		label: string,
	): Promise<SessionSnapshot> {
		const session = requiredSession(snapshot);
		return fileLocked(
			join(
				options.worktreesDir,
				".repository-locks",
				`${createHash("sha256").update(session.projectRoot).digest("hex")}.lock`,
			),
			async () => {
				const cwd = session.worktreePath;
				const status = await run("git", ["status", "--porcelain=v1"], cwd);
				let commit = await run("git", ["rev-parse", "HEAD"], cwd);
				if (status) {
					await run(
						"git",
						[
							"stash",
							"push",
							"--include-untracked",
							"--message",
							`hobo:${session.id}:${label}`,
						],
						cwd,
					);
					commit = await run("git", ["rev-parse", "refs/stash"], cwd);
					await run("git", ["stash", "apply", "--index", commit], cwd);
				}
				return options.runtime.update(
					session.id,
					revision(snapshot),
					async (next) => {
						next.checkpoints.push(
							create(CheckpointSchema, {
								id: randomUUID(),
								sessionId: session.id,
								gitCommit: commit,
								label,
								lifecycleState: CheckpointLifecycleState.CREATED,
								createdAt: now(),
							}),
						);
						await gitState(next);
					},
				);
			},
		);
	}

	async function restore(
		snapshot: SessionSnapshot,
		checkpointId: string,
	): Promise<SessionSnapshot> {
		const session = requiredSession(snapshot);
		const target = snapshot.checkpoints.find(
			(item) => item.id === checkpointId,
		);
		if (!target) throw new Error(`checkpoint ${checkpointId} does not exist`);
		const cwd = session.worktreePath;
		if (await run("git", ["status", "--porcelain=v1"], cwd)) {
			throw new Error(
				"restore requires a clean worktree; checkpoint current work first",
			);
		}
		const head = await run("git", ["rev-parse", "HEAD"], cwd);
		if (target.gitCommit !== head) {
			const base = await run(
				"git",
				["rev-parse", `${target.gitCommit}^1`],
				cwd,
			);
			if (base !== head)
				throw new Error("checkpoint belongs to a different HEAD");
			await run("git", ["stash", "apply", "--index", target.gitCommit], cwd);
		}
		return options.runtime.update(
			session.id,
			revision(snapshot),
			async (next) => {
				const item = next.checkpoints.find(
					(candidate) => candidate.id === checkpointId,
				);
				if (item) item.lifecycleState = CheckpointLifecycleState.RESTORED;
				await gitState(next);
			},
		);
	}

	async function deliveryFailure(
		snapshot: SessionSnapshot,
		error: unknown,
	): Promise<never> {
		await options.runtime.update(
			requiredSession(snapshot).id,
			revision(snapshot),
			(next) => {
				if (next.deliveryState) {
					next.deliveryState.lifecycleState = DeliveryLifecycleState.FAILED;
					next.deliveryState.message = String(error);
				}
			},
		);
		throw error;
	}

	async function openPullRequest(
		snapshot: SessionSnapshot,
		input: {
			title: string;
			body: string;
			draft?: boolean | undefined;
			parent?: string | undefined;
		},
	): Promise<SessionSnapshot> {
		const session = requiredSession(snapshot);
		const args = ["pr", "create", "--title", input.title, "--body", input.body];
		if (input.parent) args.push("--base", input.parent);
		if (input.draft) args.push("--draft");
		const output = await run("gh", args, session.worktreePath);
		const match = /\/pull\/(\d+)/u.exec(output);
		if (!match)
			throw new Error("gh pr create did not return a pull request URL");
		return options.runtime.update(session.id, revision(snapshot), (next) => {
			if (!next.deliveryState) return;
			next.deliveryState.lifecycleState =
				DeliveryLifecycleState.PULL_REQUEST_OPEN;
			next.deliveryState.pullRequestNumber = BigInt(match[1] ?? "0");
			next.deliveryState.pullRequestUrl = output.split("\n").at(-1);
			next.deliveryState.stackParentBranch = input.parent;
			next.deliveryState.message = "pull request open";
		});
	}

	return {
		async execute(raw) {
			const command = parseSessionCommand(raw);
			return fileLocked(
				join(
					options.worktreesDir,
					".operation-locks",
					`${createHash("sha256").update(command.sessionId).digest("hex")}.lock`,
				),
				async () => {
					const replay = await priorDeliveryResult(command);
					if (replay) return replay;
					if (command.command.case === "createSession") {
						const value = command.command.value;
						const projectRoot = resolve(value.projectRoot);
						await run("git", ["rev-parse", "--show-toplevel"], projectRoot);
						const worktreePath = sessionPath(
							options.worktreesDir,
							command.sessionId,
						);
						mkdirSync(dirname(worktreePath), { recursive: true });
						const listing = await run(
							"git",
							["worktree", "list", "--porcelain"],
							projectRoot,
						);
						const exactOrphan = listing.split("\n\n").some((entry) => {
							const fields = Object.fromEntries(
								entry.split("\n").map((line) => {
									const separator = line.indexOf(" ");
									return separator < 0
										? [line, ""]
										: [line.slice(0, separator), line.slice(separator + 1)];
								}),
							);
							return (
								resolve(fields.worktree ?? "") === resolve(worktreePath) &&
								fields.branch === `refs/heads/${value.branch}`
							);
						});
						let addedWorktree = false;
						if (!exactOrphan) {
							await run(
								"git",
								["worktree", "add", "-b", value.branch, worktreePath, "HEAD"],
								projectRoot,
							);
							addedWorktree = true;
						}
						let created: SessionSnapshot;
						try {
							created = await options.runtime.create({
								id: command.sessionId,
								name: value.name,
								projectRoot,
								worktreePath,
								branch: value.branch,
								clientId: value.clientId,
							});
						} catch (error) {
							if (
								addedWorktree &&
								!(await run(
									"git",
									["status", "--porcelain=v1"],
									worktreePath,
								)) &&
								!(await options.runtime.load(command.sessionId))
							) {
								await runner.run(
									"git",
									["worktree", "remove", worktreePath],
									projectRoot,
								);
							}
							throw error;
						}
						return refresh(created);
					}

					const snapshot = await loaded(command);
					const action = command.command;
					switch (action.case) {
						case "detachSession":
							return options.runtime.detach(
								command.sessionId,
								revision(snapshot),
								action.value.clientId,
							);
						case "reattachSession":
							return options.runtime.reattach(
								command.sessionId,
								revision(snapshot),
								action.value.clientId,
							);
						case "focusPane":
							return options.runtime.focusPane(
								command.sessionId,
								revision(snapshot),
								action.value.paneId,
							);
						case "stopSession": {
							const stopped = await options.runtime.stop(
								command.sessionId,
								revision(snapshot),
							);
							if (action.value.removeWorktree) {
								await run(
									"git",
									["worktree", "remove", requiredSession(stopped).worktreePath],
									requiredSession(stopped).projectRoot,
								);
							}
							return stopped;
						}
						case "createTab":
							return options.runtime.createTab(
								command.sessionId,
								revision(snapshot),
								action.value.title,
							);
						case "createPane":
							return options.runtime.createPane(
								command.sessionId,
								revision(snapshot),
								action.value.tabId,
								action.value.title,
								action.value.command,
							);
						case "splitPane":
							return options.runtime.splitPane(
								command.sessionId,
								revision(snapshot),
								action.value.paneId,
								action.value.direction as "horizontal" | "vertical",
								action.value.title,
								action.value.command,
							);
						case "closePane":
							return options.runtime.closePane(
								command.sessionId,
								revision(snapshot),
								action.value.paneId,
							);
						case "sendInput":
							return options.runtime.sendInput(
								command.sessionId,
								revision(snapshot),
								action.value.paneId,
								action.value.input,
								command.commandId,
							);
						case "startAgent":
							return options.runtime.startAgent(
								command.sessionId,
								revision(snapshot),
								action.value.paneId,
								action.value.provider,
								action.value.command,
								action.value.prompt,
							);
						case "stopAgent":
							return options.runtime.stopAgent(
								command.sessionId,
								revision(snapshot),
								action.value.agentRunId,
							);
						case "createCheckpoint":
							return checkpoint(snapshot, action.value.label);
						case "restoreCheckpoint":
							return restore(snapshot, action.value.checkpointId);
						case "commit":
							return deliveryEffect("commit", command, snapshot, async () => {
								await run(
									"git",
									["add", "-A"],
									requiredSession(snapshot).worktreePath,
								);
								await run(
									"git",
									["commit", "-m", action.value.message],
									requiredSession(snapshot).worktreePath,
								);
								return refresh(snapshot);
							});
						case "push":
							return deliveryEffect("push", command, snapshot, async () => {
								try {
									await run(
										"git",
										[
											"push",
											"--set-upstream",
											action.value.remote,
											requiredSession(snapshot).branch,
										],
										requiredSession(snapshot).worktreePath,
									);
									return options.runtime.update(
										command.sessionId,
										revision(snapshot),
										(next) => {
											if (next.deliveryState) {
												next.deliveryState.remote = action.value.remote;
												next.deliveryState.lifecycleState =
													DeliveryLifecycleState.READY;
												next.deliveryState.message = "branch pushed";
											}
										},
									);
								} catch (error) {
									return deliveryFailure(snapshot, error);
								}
							});
						case "openPullRequest":
							return deliveryEffect(
								"open-pull-request",
								command,
								snapshot,
								async () => {
									try {
										return await openPullRequest(snapshot, action.value);
									} catch (error) {
										return deliveryFailure(snapshot, error);
									}
								},
							);
						case "stackPullRequest":
							return deliveryEffect(
								"stack-pull-request",
								command,
								snapshot,
								async () => {
									try {
										const session = requiredSession(snapshot);
										await run(
											"gh",
											[
												"stack",
												"init",
												"--base",
												action.value.parentBranch,
												session.branch,
											],
											session.worktreePath,
										);
										await run(
											"gh",
											["stack", "submit", "--auto", "--open"],
											session.worktreePath,
										);
										await run(
											"gh",
											[
												"pr",
												"edit",
												session.branch,
												"--title",
												action.value.title,
												"--body",
												action.value.body,
											],
											session.worktreePath,
										);
										const url = await run(
											"gh",
											[
												"pr",
												"view",
												session.branch,
												"--json",
												"url",
												"--jq",
												".url",
											],
											session.worktreePath,
										);
										const match = /\/pull\/(\d+)/u.exec(url);
										if (!match)
											throw new Error(
												"gh stack submit did not produce a pull request URL",
											);
										return options.runtime.update(
											command.sessionId,
											revision(snapshot),
											(next) => {
												if (!next.deliveryState) return;
												next.deliveryState.lifecycleState =
													DeliveryLifecycleState.PULL_REQUEST_OPEN;
												next.deliveryState.pullRequestNumber = BigInt(
													match[1] ?? "0",
												);
												next.deliveryState.pullRequestUrl = url;
												next.deliveryState.stackParentBranch =
													action.value.parentBranch;
												next.deliveryState.message =
													"stacked pull request open";
											},
										);
									} catch (error) {
										return deliveryFailure(snapshot, error);
									}
								},
							);
						case "mergePullRequest":
							return deliveryEffect(
								"merge-pull-request",
								command,
								snapshot,
								async () => {
									try {
										await run(
											"gh",
											[
												"stack",
												"merge",
												String(action.value.pullRequestNumber),
												"--yes",
												"--squash",
											],
											requiredSession(snapshot).worktreePath,
										);
										const merged = await options.runtime.update(
											command.sessionId,
											revision(snapshot),
											(next) => {
												if (next.deliveryState) {
													next.deliveryState.lifecycleState =
														DeliveryLifecycleState.MERGED;
													next.deliveryState.message =
														"pull request squash-merged";
												}
											},
										);
										return requiredSession(merged).closeOnMerge
											? options.runtime.stop(
													command.sessionId,
													revision(merged),
												)
											: merged;
									} catch (error) {
										return deliveryFailure(snapshot, error);
									}
								},
							);
						case undefined:
							throw new Error("command must be specified");
					}
				},
			);
		},
	};
}
