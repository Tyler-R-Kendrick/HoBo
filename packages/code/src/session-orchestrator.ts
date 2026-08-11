import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
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
	readonly actorId: string;
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
		env?: Readonly<Record<string, string>>,
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
		run(command, args, cwd, env) {
			return new Promise((done) => {
				const child = spawn(command, [...args], {
					cwd,
					env: env ? { ...process.env, ...env } : process.env,
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

function ensureDirectoryDurable(directory: string): void {
	if (existsSync(directory)) return;
	const parent = dirname(directory);
	if (parent === directory) return;
	ensureDirectoryDurable(parent);
	try {
		mkdirSync(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	for (const target of [directory, parent]) {
		const descriptor = openSync(target, "r");
		try {
			fsyncSync(descriptor);
		} finally {
			closeSync(descriptor);
		}
	}
}

function writeJsonAtomic(path: string, value: unknown): void {
	ensureDirectoryDurable(dirname(path));
	const temporary = `${path}.${process.pid}.${randomUUID()}`;
	const descriptor = openSync(temporary, "wx", 0o600);
	try {
		writeFileSync(
			descriptor,
			`${JSON.stringify(value, (_key, item) =>
				typeof item === "bigint" ? item.toString() : item,
			)}\n`,
		);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	renameSync(temporary, path);
	const directory = openSync(dirname(path), "r");
	try {
		fsyncSync(directory);
	} finally {
		closeSync(directory);
	}
}

interface DeliveryLedger {
	readonly digest: string;
	readonly status: "pending" | "applied" | "failed" | "complete";
	readonly approval: SessionDeliveryApproval;
	readonly context: {
		readonly preHead?: string;
		readonly expectedTree?: string;
		readonly expectedMessage?: string;
		readonly pullRequestNumbers?: readonly number[];
	};
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
		env?: Readonly<Record<string, string>>,
	): Promise<string> {
		const result = await runner.run(command, args, cwd, env);
		if (result.code !== 0)
			throw commandError(`${command} ${args[0] ?? ""}`, result);
		return result.stdout.trim();
	}

	async function approved(
		operation: SessionDeliveryOperation,
		snapshot: SessionSnapshot,
		command: SessionCommandEnvelope,
		context: DeliveryLedger["context"],
	): Promise<SessionDeliveryApproval> {
		const action = command.command;
		const details: Record<string, string | boolean> = {};
		switch (action.case) {
			case "commit":
				details.message = action.value.message;
				details.gitHead = context.preHead ?? "";
				details.gitTree = context.expectedTree ?? "";
				break;
			case "push":
				details.remote = action.value.remote;
				details.gitHead = context.preHead ?? "";
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
			actorId: command.actorId,
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
		work: (ledger: DeliveryLedger) => Promise<SessionSnapshot>,
	): Promise<SessionSnapshot> {
		const digest = deliveryFingerprint(command);
		const path = deliveryLedgerPath(command);
		let ledger: DeliveryLedger;
		if (existsSync(path)) {
			const prior = JSON.parse(readFileSync(path, "utf8")) as DeliveryLedger;
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
			if (prior.status === "failed") {
				ledger = prior;
			} else
				throw new Error(
					`${operation} has an unknown prior outcome; reconcile before retrying`,
				);
		} else {
			const context = await deliveryContext(command, snapshot);
			const approval = await approved(operation, snapshot, command, context);
			ledger = {
				digest,
				status: "pending",
				approval,
				context,
			};
			writeJsonAtomic(path, ledger);
		}
		try {
			const result = await work(ledger);
			writeJsonAtomic(path, { ...ledger, status: "complete" });
			return result;
		} catch (error) {
			const current = await options.runtime.load(command.sessionId);
			const outcome = current
				? await deliveryOutcome(command, current, ledger)
				: "unknown";
			if (current && outcome === "applied") {
				writeJsonAtomic(path, { ...ledger, status: "applied" });
				const reconciled = await reconcileAppliedDelivery(
					command,
					current,
					ledger,
				);
				writeJsonAtomic(path, { ...ledger, status: "complete" });
				return reconciled;
			}
			if (outcome === "not-applied") {
				writeJsonAtomic(path, { ...ledger, status: "failed" });
			}
			throw error;
		}
	}

	async function fullWorktreeTree(cwd: string): Promise<string> {
		const indexDir = join(options.worktreesDir, ".delivery-indexes");
		mkdirSync(indexDir, { recursive: true });
		const indexPath = join(indexDir, randomUUID());
		try {
			const env = { GIT_INDEX_FILE: indexPath };
			await run("git", ["read-tree", "HEAD"], cwd, env);
			await run("git", ["add", "-A"], cwd, env);
			return await run("git", ["write-tree"], cwd, env);
		} finally {
			rmSync(indexPath, { force: true });
		}
	}

	async function setWorktreeIndex(cwd: string, commit: string): Promise<void> {
		await run("git", ["read-tree", "--reset", commit], cwd);
	}

	async function deliveryContext(
		command: SessionCommandEnvelope,
		snapshot: SessionSnapshot,
	): Promise<DeliveryLedger["context"]> {
		const session = requiredSession(snapshot);
		switch (command.command.case) {
			case "commit":
				return {
					preHead: await run(
						"git",
						["rev-parse", "HEAD"],
						session.worktreePath,
					),
					expectedTree: await fullWorktreeTree(session.worktreePath),
					expectedMessage: command.command.value.message,
				};
			case "push":
				return {
					preHead: await run(
						"git",
						["rev-parse", "HEAD"],
						session.worktreePath,
					),
				};
			case "openPullRequest":
			case "stackPullRequest": {
				const pullRequests = await pullRequestsForBranch(
					session,
					"number,title,body,isDraft,state",
				);
				if (pullRequests === "unknown")
					throw new Error("cannot establish pre-effect pull request state");
				return {
					pullRequestNumbers: pullRequests.flatMap((item) =>
						typeof item.number === "number" ? [item.number] : [],
					),
				};
			}
			default:
				return {};
		}
	}

	function deliveryFingerprint(command: SessionCommandEnvelope): string {
		return createHash("sha256")
			.update(
				JSON.stringify(
					{
						schemaVersion: command.schemaVersion,
						commandId: command.commandId,
						actorId: command.actorId,
						sessionId: command.sessionId,
						expectedRevision: command.expectedRevision,
						command: command.command,
					},
					(_key, value) =>
						typeof value === "bigint" ? value.toString() : value,
				),
			)
			.digest("hex");
	}

	function deliveryLedgerPath(command: SessionCommandEnvelope): string {
		return join(
			options.worktreesDir,
			".commands",
			createHash("sha256").update(command.sessionId).digest("hex"),
			`${createHash("sha256").update(command.commandId).digest("hex")}.json`,
		);
	}

	async function pullRequestsForBranch(
		session: NonNullable<SessionSnapshot["session"]>,
		fields: string,
	): Promise<"unknown" | Record<string, unknown>[]> {
		const listed = await runner.run(
			"gh",
			[
				"pr",
				"list",
				"--head",
				session.branch,
				"--state",
				"all",
				"--json",
				fields,
			],
			session.worktreePath,
		);
		if (listed.code !== 0) return "unknown";
		try {
			const pullRequests = JSON.parse(listed.stdout) as unknown;
			return Array.isArray(pullRequests)
				? (pullRequests as Record<string, unknown>[])
				: "unknown";
		} catch {
			return "unknown";
		}
	}

	async function pullRequestForDelivery(
		command: SessionCommandEnvelope,
		session: NonNullable<SessionSnapshot["session"]>,
		ledger: DeliveryLedger,
	): Promise<"unknown" | Record<string, unknown> | undefined> {
		const fields =
			command.command.case === "stackPullRequest"
				? "number,url,state,title,body,baseRefName"
				: "number,url,state,title,body,isDraft";
		const listed = await pullRequestsForBranch(session, fields);
		if (listed === "unknown") return "unknown";
		const previous = new Set(ledger.context.pullRequestNumbers ?? []);
		const open = listed.filter(
			(item) => item.state === "OPEN" && typeof item.number === "number",
		);
		const newlyCreated = open.filter(
			(item) => !previous.has(item.number as number),
		);
		if (newlyCreated.length === 1) return newlyCreated[0];
		if (newlyCreated.length > 1) return "unknown";
		if (open.length !== 1) return open.length === 0 ? undefined : "unknown";
		if (command.command.case === "openPullRequest") {
			const value = command.command.value;
			return open[0]?.title === value.title &&
				open[0]?.body === value.body &&
				open[0]?.isDraft === (value.draft ?? false)
				? open[0]
				: undefined;
		}
		if (command.command.case !== "stackPullRequest") return undefined;
		const value = command.command.value;
		return open[0]?.title === value.title &&
			open[0]?.body === value.body &&
			open[0]?.baseRefName === value.parentBranch
			? open[0]
			: undefined;
	}

	async function deliveryOutcome(
		command: SessionCommandEnvelope,
		snapshot: SessionSnapshot,
		ledger: DeliveryLedger,
	): Promise<"applied" | "not-applied" | "unknown"> {
		const session = requiredSession(snapshot);
		switch (command.command.case) {
			case "commit": {
				const head = await run(
					"git",
					["rev-parse", "HEAD"],
					session.worktreePath,
				);
				if (head === ledger.context.preHead) return "not-applied";
				const [parent, tree, message] = await Promise.all([
					runner.run("git", ["rev-parse", `${head}^`], session.worktreePath),
					runner.run(
						"git",
						["rev-parse", `${head}^{tree}`],
						session.worktreePath,
					),
					runner.run(
						"git",
						["show", "-s", "--format=%s", head],
						session.worktreePath,
					),
				]);
				if (parent.code !== 0 || tree.code !== 0 || message.code !== 0)
					return "unknown";
				return parent.stdout.trim() === ledger.context.preHead &&
					tree.stdout.trim() === ledger.context.expectedTree &&
					message.stdout.trim() === ledger.context.expectedMessage
					? "applied"
					: "unknown";
			}
			case "push": {
				const remote = await runner.run(
					"git",
					[
						"ls-remote",
						command.command.value.remote,
						`refs/heads/${session.branch}`,
					],
					session.worktreePath,
				);
				if (remote.code !== 0) return "unknown";
				return remote.stdout.split(/\s/u)[0] === ledger.context.preHead
					? "applied"
					: "not-applied";
			}
			case "openPullRequest": {
				const pullRequest = await pullRequestForDelivery(
					command,
					session,
					ledger,
				);
				if (pullRequest === "unknown") return "unknown";
				return typeof pullRequest?.url === "string" ? "applied" : "not-applied";
			}
			case "stackPullRequest": {
				const pullRequest = await pullRequestForDelivery(
					command,
					session,
					ledger,
				);
				if (pullRequest === "unknown") return "unknown";
				if (typeof pullRequest?.url !== "string") return "not-applied";
				const value = command.command.value;
				if (
					pullRequest.title !== value.title ||
					pullRequest.body !== value.body ||
					pullRequest.baseRefName !== value.parentBranch
				) {
					if (typeof pullRequest.number !== "number") return "unknown";
					const repaired = await runner.run(
						"gh",
						[
							"pr",
							"edit",
							String(pullRequest.number),
							"--base",
							value.parentBranch,
							"--title",
							value.title,
							"--body",
							value.body,
						],
						session.worktreePath,
					);
					if (repaired.code !== 0) return "unknown";
				}
				return "applied";
			}
			case "mergePullRequest": {
				const viewed = await runner.run(
					"gh",
					[
						"pr",
						"view",
						String(command.command.value.pullRequestNumber),
						"--json",
						"state",
					],
					session.worktreePath,
				);
				if (viewed.code !== 0) return "unknown";
				return /"state"\s*:\s*"MERGED"/u.test(viewed.stdout)
					? "applied"
					: "not-applied";
			}
			default:
				return "not-applied";
		}
	}

	async function reconcileAppliedDelivery(
		command: SessionCommandEnvelope,
		snapshot: SessionSnapshot,
		ledger: DeliveryLedger,
	): Promise<SessionSnapshot> {
		const session = requiredSession(snapshot);
		switch (command.command.case) {
			case "commit": {
				const expectedTree = ledger.context.expectedTree;
				if (!expectedTree)
					throw new Error("approved commit is missing its Git tree");
				await setWorktreeIndex(
					session.worktreePath,
					await run("git", ["rev-parse", "HEAD"], session.worktreePath),
				);
				return refresh(snapshot);
			}
			case "push": {
				const remote = command.command.value.remote;
				return options.runtime.update(
					session.id,
					revision(snapshot),
					(next) => {
						if (!next.deliveryState) return;
						next.deliveryState.remote = remote;
						next.deliveryState.lifecycleState = DeliveryLifecycleState.READY;
						next.deliveryState.message = "branch push reconciled";
					},
				);
			}
			case "openPullRequest":
			case "stackPullRequest": {
				const pullRequest = await pullRequestForDelivery(
					command,
					session,
					ledger,
				);
				if (
					pullRequest === "unknown" ||
					typeof pullRequest?.number !== "number" ||
					typeof pullRequest.url !== "string"
				)
					throw new Error("pull request outcome is not uniquely attributable");
				const pullRequestNumber = pullRequest.number;
				const pullRequestUrl = pullRequest.url;
				return options.runtime.update(
					session.id,
					revision(snapshot),
					(next) => {
						if (!next.deliveryState) return;
						next.deliveryState.lifecycleState =
							DeliveryLifecycleState.PULL_REQUEST_OPEN;
						next.deliveryState.pullRequestNumber = BigInt(pullRequestNumber);
						next.deliveryState.pullRequestUrl = pullRequestUrl;
						next.deliveryState.stackParentBranch =
							command.command.case === "stackPullRequest"
								? command.command.value.parentBranch
								: undefined;
						next.deliveryState.message = "pull request reconciled";
					},
				);
			}
			case "mergePullRequest": {
				const merged = await options.runtime.update(
					session.id,
					revision(snapshot),
					(next) => {
						if (!next.deliveryState) return;
						next.deliveryState.lifecycleState = DeliveryLifecycleState.MERGED;
						next.deliveryState.message = "pull request merge reconciled";
					},
				);
				return requiredSession(merged).closeOnMerge
					? options.runtime.stop(session.id, revision(merged))
					: merged;
			}
			default:
				return snapshot;
		}
	}

	async function priorDeliveryResult(
		command: SessionCommandEnvelope,
	): Promise<SessionSnapshot | undefined> {
		const path = deliveryLedgerPath(command);
		if (!existsSync(path)) return undefined;
		const prior = JSON.parse(readFileSync(path, "utf8")) as DeliveryLedger;
		const digest = deliveryFingerprint(command);
		if (prior.digest !== digest)
			throw new Error("command ID was reused for a different action");
		if (prior.status === "failed") return undefined;
		if (prior.status !== "complete") {
			const snapshot = await options.runtime.load(command.sessionId);
			const outcome =
				prior.status === "applied"
					? "applied"
					: snapshot
						? await deliveryOutcome(command, snapshot, prior)
						: "unknown";
			if (snapshot && outcome === "applied") {
				writeJsonAtomic(path, { ...prior, status: "applied" });
				const reconciled = await reconcileAppliedDelivery(
					command,
					snapshot,
					prior,
				);
				writeJsonAtomic(path, { ...prior, status: "complete" });
				return reconciled;
			}
			if (outcome === "not-applied") {
				writeJsonAtomic(path, { ...prior, status: "failed" });
				return undefined;
			}
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

	function checkpointRef(sessionId: string, checkpointId: string): string {
		return `refs/hobo/checkpoints/${createHash("sha256").update(sessionId).digest("hex")}/${checkpointId}`;
	}

	async function checkpoint(
		snapshot: SessionSnapshot,
		label: string,
	): Promise<SessionSnapshot> {
		const session = requiredSession(snapshot);
		const cwd = session.worktreePath;
		const checkpointId = randomUUID();
		const ref = checkpointRef(session.id, checkpointId);
		const commonGitDir = realpathSync(
			await run(
				"git",
				["rev-parse", "--path-format=absolute", "--git-common-dir"],
				cwd,
			),
		);
		return fileLocked(
			join(
				options.worktreesDir,
				".repository-locks",
				`${createHash("sha256").update(commonGitDir).digest("hex")}.lock`,
			),
			async () => {
				const status = await run("git", ["status", "--porcelain=v1"], cwd);
				let commit = await run("git", ["rev-parse", "HEAD"], cwd);
				if (status) {
					const head = commit;
					const stagedTree = await run("git", ["write-tree"], cwd);
					const indexCommit = await run(
						"git",
						[
							"commit-tree",
							stagedTree,
							"-p",
							head,
							"-m",
							`hobo index: ${label}`,
						],
						cwd,
					);
					const indexDir = join(options.worktreesDir, ".checkpoint-indexes");
					mkdirSync(indexDir, { recursive: true });
					const indexPath = join(indexDir, randomUUID());
					try {
						const env = { GIT_INDEX_FILE: indexPath };
						await run("git", ["read-tree", "HEAD"], cwd, env);
						await run("git", ["add", "-A"], cwd, env);
						const fullTree = await run("git", ["write-tree"], cwd, env);
						commit = await run(
							"git",
							[
								"commit-tree",
								fullTree,
								"-p",
								head,
								"-p",
								indexCommit,
								"-m",
								`hobo checkpoint: ${label}`,
							],
							cwd,
						);
					} finally {
						rmSync(indexPath, { force: true });
					}
				}
				await run("git", ["update-ref", ref, commit], cwd);
				try {
					return await options.runtime.update(
						session.id,
						revision(snapshot),
						async (next) => {
							next.checkpoints.push(
								create(CheckpointSchema, {
									id: checkpointId,
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
				} catch (error) {
					await runner.run("git", ["update-ref", "-d", ref], cwd);
					throw error;
				}
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
			const indexCommit = await run(
				"git",
				["rev-parse", `${target.gitCommit}^2`],
				cwd,
			);
			const indexDir = join(options.worktreesDir, ".checkpoint-indexes");
			mkdirSync(indexDir, { recursive: true });
			const indexPath = join(indexDir, randomUUID());
			try {
				await run(
					"git",
					["read-tree", "--reset", "-u", target.gitCommit],
					cwd,
					{ GIT_INDEX_FILE: indexPath },
				);
				await run("git", ["read-tree", indexCommit], cwd);
			} finally {
				rmSync(indexPath, { force: true });
			}
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
						await run(
							"git",
							["check-ref-format", "--branch", value.branch],
							projectRoot,
						);
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
						let createdBranch = false;
						if (!exactOrphan) {
							const branch = await runner.run(
								"git",
								[
									"show-ref",
									"--verify",
									"--quiet",
									`refs/heads/${value.branch}`,
								],
								projectRoot,
							);
							if (branch.code !== 0 && branch.code !== 1) {
								throw commandError("git show-ref", branch);
							}
							createdBranch = branch.code === 1;
							await run(
								"git",
								createdBranch
									? [
											"worktree",
											"add",
											"-b",
											value.branch,
											worktreePath,
											"HEAD",
										]
									: ["worktree", "add", worktreePath, value.branch],
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
								const removed = await runner.run(
									"git",
									["worktree", "remove", worktreePath],
									projectRoot,
								);
								if (removed.code === 0 && createdBranch) {
									await runner.run(
										"git",
										["branch", "-D", value.branch],
										projectRoot,
									);
								}
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
							if (
								action.value.removeWorktree &&
								(await run(
									"git",
									["status", "--porcelain=v1"],
									requiredSession(snapshot).worktreePath,
								))
							) {
								throw new Error(
									"delete requires a clean worktree; checkpoint or commit current work first",
								);
							}
							const stopped = await options.runtime.stop(
								command.sessionId,
								revision(snapshot),
							);
							if (action.value.removeWorktree) {
								const session = requiredSession(stopped);
								const refs = await run(
									"git",
									[
										"for-each-ref",
										"--format=%(refname)",
										`refs/hobo/checkpoints/${createHash("sha256").update(session.id).digest("hex")}`,
									],
									session.worktreePath,
								);
								await run(
									"git",
									["worktree", "remove", session.worktreePath],
									session.projectRoot,
								);
								for (const ref of refs.split("\n").filter(Boolean)) {
									await run(
										"git",
										["update-ref", "-d", ref],
										session.projectRoot,
									);
								}
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
							return deliveryEffect(
								"commit",
								command,
								snapshot,
								async (ledger) => {
									const session = requiredSession(snapshot);
									const preHead = ledger.context.preHead;
									const expectedTree = ledger.context.expectedTree;
									if (!preHead || !expectedTree)
										throw new Error(
											"approved commit is missing its Git identity",
										);
									const commit = await run(
										"git",
										[
											"commit-tree",
											expectedTree,
											"-p",
											preHead,
											"-m",
											action.value.message,
										],
										session.worktreePath,
									);
									await run(
										"git",
										[
											"update-ref",
											`refs/heads/${session.branch}`,
											commit,
											preHead,
										],
										session.worktreePath,
									);
									await setWorktreeIndex(session.worktreePath, commit);
									return refresh(snapshot);
								},
							);
						case "push":
							return deliveryEffect(
								"push",
								command,
								snapshot,
								async (ledger) => {
									const session = requiredSession(snapshot);
									const preHead = ledger.context.preHead;
									if (!preHead)
										throw new Error(
											"approved push is missing its Git identity",
										);
									await run(
										"git",
										[
											"push",
											action.value.remote,
											`${preHead}:refs/heads/${session.branch}`,
										],
										session.worktreePath,
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
								},
							);
						case "openPullRequest":
							return deliveryEffect(
								"open-pull-request",
								command,
								snapshot,
								() => openPullRequest(snapshot, action.value),
							);
						case "stackPullRequest":
							return deliveryEffect(
								"stack-pull-request",
								command,
								snapshot,
								async (ledger) => {
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
									const pullRequest = await pullRequestForDelivery(
										command,
										session,
										ledger,
									);
									if (
										pullRequest === "unknown" ||
										typeof pullRequest?.number !== "number" ||
										typeof pullRequest.url !== "string"
									)
										throw new Error(
											"gh stack submit did not produce a unique pull request",
										);
									await run(
										"gh",
										[
											"pr",
											"edit",
											String(pullRequest.number),
											"--title",
											action.value.title,
											"--body",
											action.value.body,
										],
										session.worktreePath,
									);
									const pullRequestNumber = pullRequest.number;
									const pullRequestUrl = pullRequest.url;
									return options.runtime.update(
										command.sessionId,
										revision(snapshot),
										(next) => {
											if (!next.deliveryState) return;
											next.deliveryState.lifecycleState =
												DeliveryLifecycleState.PULL_REQUEST_OPEN;
											next.deliveryState.pullRequestNumber =
												BigInt(pullRequestNumber);
											next.deliveryState.pullRequestUrl = pullRequestUrl;
											next.deliveryState.stackParentBranch =
												action.value.parentBranch;
											next.deliveryState.message = "stacked pull request open";
										},
									);
								},
							);
						case "mergePullRequest":
							return deliveryEffect(
								"merge-pull-request",
								command,
								snapshot,
								async () => {
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
										? options.runtime.stop(command.sessionId, revision(merged))
										: merged;
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
