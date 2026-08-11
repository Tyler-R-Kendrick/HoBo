import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { create, type JsonValue } from "@bufbuild/protobuf";
import { createRuntimeLocalEventStore } from "@hobo/runtime-local";

import {
	AgentLifecycleState,
	AgentRunSchema,
	DeliveryLifecycleState,
	PaneLifecycleState,
	PaneSchema,
	SessionLifecycleState,
	type SessionSnapshot,
	SessionSnapshotSchema,
	TabSchema,
} from "./_generated/code_harness_pb.js";
import {
	keepPaneOpen,
	type MuxRunner,
	safeWindowName,
	sessionTarget,
	shellQuote,
} from "./mux.js";
import {
	parseSessionSnapshot,
	SESSION_SNAPSHOT_SCHEMA,
	sessionSnapshotJson,
} from "./session-contract.js";

export interface CreateResidentSessionOptions {
	readonly id: string;
	readonly name: string;
	readonly projectRoot: string;
	readonly worktreePath: string;
	readonly branch: string;
	readonly clientId: string;
	readonly closeOnMerge?: boolean;
	readonly shell?: readonly string[];
}

export interface ResidentSessionRuntimeOptions {
	readonly dataDir: string;
	readonly tmux: MuxRunner;
	readonly now?: () => string;
	readonly shell?: readonly string[];
}

function isActiveAgent(state: AgentLifecycleState): boolean {
	return ![
		AgentLifecycleState.DONE,
		AgentLifecycleState.FAILED,
		AgentLifecycleState.STOPPED,
	].includes(state);
}

export interface ResidentSessionRuntime {
	create(options: CreateResidentSessionOptions): Promise<SessionSnapshot>;
	load(sessionId: string): Promise<SessionSnapshot | undefined>;
	list(): Promise<readonly SessionSnapshot[]>;
	createTab(
		sessionId: string,
		expectedRevision: bigint,
		title: string,
		command?: readonly string[],
	): Promise<SessionSnapshot>;
	createPane(
		sessionId: string,
		expectedRevision: bigint,
		tabId: string,
		title: string,
		command?: readonly string[],
	): Promise<SessionSnapshot>;
	splitPane(
		sessionId: string,
		expectedRevision: bigint,
		paneId: string,
		direction: "horizontal" | "vertical",
		title: string,
		command?: readonly string[],
	): Promise<SessionSnapshot>;
	focusPane(
		sessionId: string,
		expectedRevision: bigint,
		paneId: string,
	): Promise<SessionSnapshot>;
	sendInput(
		sessionId: string,
		expectedRevision: bigint,
		paneId: string,
		input: string,
		commandId?: string,
	): Promise<SessionSnapshot>;
	closePane(
		sessionId: string,
		expectedRevision: bigint,
		paneId: string,
	): Promise<SessionSnapshot>;
	detach(
		sessionId: string,
		expectedRevision: bigint,
		clientId: string,
	): Promise<SessionSnapshot>;
	reattach(
		sessionId: string,
		expectedRevision: bigint,
		clientId: string,
	): Promise<SessionSnapshot>;
	stop(sessionId: string, expectedRevision: bigint): Promise<SessionSnapshot>;
	startAgent(
		sessionId: string,
		expectedRevision: bigint,
		paneId: string,
		provider: string,
		command: readonly string[],
		prompt: string,
	): Promise<SessionSnapshot>;
	stopAgent(
		sessionId: string,
		expectedRevision: bigint,
		agentRunId: string,
	): Promise<SessionSnapshot>;
	update(
		sessionId: string,
		expectedRevision: bigint,
		work: (snapshot: SessionSnapshot) => void | Promise<void>,
	): Promise<SessionSnapshot>;
	close(): void;
}

function tmuxSession(sessionId: string): string {
	const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
	return `h-${safeWindowName(sessionId).slice(0, 13)}-${hash}`;
}

function clone(snapshot: SessionSnapshot): SessionSnapshot {
	return parseSessionSnapshot(sessionSnapshotJson(snapshot));
}

function required(value: string, field: string): string {
	if (!value) throw new TypeError(`${field} must not be empty`);
	return value;
}

function paneRuntimeId(stdout: string): string {
	return required(stdout.trim().split(/\s+/u)[0] ?? "", "tmux pane id");
}

type TmuxPaneMetadata = {
	readonly paneId: string;
	readonly tabId: string;
	readonly paneTitle: string;
	readonly tabTitle: string;
	readonly workingDirectory: string;
};

function encodePaneMetadata(metadata: TmuxPaneMetadata): string {
	return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function decodePaneMetadata(command: string): TmuxPaneMetadata | undefined {
	const encoded = /HOBO_PANE_META=([A-Za-z0-9_-]+)/u.exec(command)?.[1];
	if (!encoded) return undefined;
	try {
		const value: unknown = JSON.parse(
			Buffer.from(encoded, "base64url").toString("utf8"),
		);
		if (!value || typeof value !== "object") return undefined;
		const record = value as Record<string, unknown>;
		for (const field of [
			"paneId",
			"tabId",
			"paneTitle",
			"tabTitle",
			"workingDirectory",
		]) {
			if (typeof record[field] !== "string" || record[field] === "") {
				return undefined;
			}
		}
		return record as TmuxPaneMetadata;
	} catch {
		return undefined;
	}
}

export function createResidentSessionRuntime(
	options: ResidentSessionRuntimeOptions,
): ResidentSessionRuntime {
	const now = options.now ?? (() => new Date().toISOString());
	const store = createRuntimeLocalEventStore({
		dataDir: options.dataDir,
		clock: { now },
		partitionId: "hobo-code-sessions",
	});
	const defaultShell = options.shell ?? [process.env.SHELL || "/bin/sh"];
	const lockDir = join(options.dataDir, "session-locks");
	mkdirSync(lockDir, { recursive: true });

	function lockPath(sessionId: string): string {
		return join(
			lockDir,
			`${createHash("sha256").update(sessionId).digest("hex")}.lock`,
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

	function clearStaleLock(path: string, sessionId: string): void {
		let marker: string;
		try {
			marker = readFileSync(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		const owner = /^hobo:(\d+)-([0-9a-f-]+)\n$/u.exec(marker);
		const legacyOwner = /^(\d+)$/u.exec(marker);
		const pid = Number(owner?.[1] ?? legacyOwner?.[1]);
		if (!Number.isSafeInteger(pid) || processAlive(pid)) {
			throw new Error(`session ${sessionId} is busy`);
		}
		const ownerPath = owner
			? `${path}.hobo-${owner[1]}-${owner[2]}`
			: `${path}.hobo-${pid}-legacy`;
		const claimPrefix = `${basename(ownerPath)}.reclaim-`;
		let claimSource = ownerPath;
		const findClaims = (): string[] =>
			readdirSync(dirname(ownerPath)).filter((entry) =>
				entry.startsWith(claimPrefix),
			);
		if (legacyOwner && !existsSync(ownerPath) && findClaims().length === 0) {
			try {
				writeFileSync(ownerPath, marker, { flag: "wx", mode: 0o600 });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		}
		if (!existsSync(claimSource)) {
			const claims = findClaims();
			if (claims.length !== 1) throw new Error(`session ${sessionId} is busy`);
			claimSource = join(dirname(ownerPath), claims[0] ?? "");
			const claimant = /\.reclaim-(\d+)-/u.exec(claimSource);
			if (!claimant || processAlive(Number(claimant[1]))) {
				throw new Error(`session ${sessionId} is busy`);
			}
		}
		const claimPath = `${ownerPath}.reclaim-${process.pid}-${randomUUID()}`;
		try {
			renameSync(claimSource, claimPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(`session ${sessionId} is busy`);
			}
			throw error;
		}
		let released = false;
		try {
			if (readFileSync(path, "utf8") !== marker) {
				throw new Error(`session ${sessionId} is busy`);
			}
			unlinkSync(path);
			released = true;
		} finally {
			if (released) rmSync(claimPath, { force: true });
		}
	}

	async function locked<T>(
		sessionId: string,
		work: () => Promise<T>,
	): Promise<T> {
		const path = lockPath(sessionId);
		const ownerId = `${process.pid}-${randomUUID()}`;
		const marker = `hobo:${ownerId}\n`;
		const ownerPath = `${path}.hobo-${ownerId}`;
		writeFileSync(ownerPath, marker, { flag: "wx", mode: 0o600 });
		let acquired = false;
		const release = (): void => {
			try {
				if (readFileSync(path, "utf8") === marker) unlinkSync(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		};
		try {
			for (let attempt = 0; attempt < 2; attempt += 1) {
				try {
					// Hard-link publication is atomic: observers never see an empty owner.
					linkSync(ownerPath, path);
					acquired = true;
					break;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					clearStaleLock(path, sessionId);
				}
			}
			if (!acquired) throw new Error(`could not acquire session ${sessionId}`);
			try {
				const result = await work();
				release();
				return result;
			} catch (error) {
				try {
					release();
				} catch (releaseError) {
					throw new AggregateError(
						[error, releaseError],
						`session ${sessionId} failed and its lock could not be released`,
					);
				}
				throw error;
			}
		} finally {
			rmSync(ownerPath, { force: true });
		}
	}

	function streamId(sessionId: string): string {
		return `code-session:${required(sessionId, "sessionId")}`;
	}

	async function loadStored(
		sessionId: string,
	): Promise<SessionSnapshot | undefined> {
		const record = await store.loadSnapshot<JsonValue>(streamId(sessionId));
		let snapshot = record ? parseSessionSnapshot(record.state) : undefined;
		for await (const event of store.read(
			streamId(sessionId),
			(record?.seq ?? 0) + 1,
		)) {
			const data = event.data as { snapshot?: unknown };
			if (data.snapshot) snapshot = parseSessionSnapshot(data.snapshot);
		}
		return snapshot;
	}

	async function persist(
		snapshot: SessionSnapshot,
		type: "code.SessionCreated" | "code.SessionChanged",
	): Promise<void> {
		const revision = Number(snapshot.revision);
		if (!Number.isSafeInteger(revision) || revision < 1) {
			throw new RangeError(
				"session revision exceeds the SQLite sequence range",
			);
		}
		const json = sessionSnapshotJson(snapshot) as JsonValue;
		await store.append(
			streamId(snapshot.session?.id ?? ""),
			[{ type, data: { snapshot: json } }],
			{
				expectedSeq: revision - 1,
				actor: { kind: "system", id: "hobo-code" },
				tenant: "local",
				...(snapshot.session?.id ? { correlationId: snapshot.session.id } : {}),
			},
		);
		await store.snapshot(streamId(snapshot.session?.id ?? ""), json, revision);
	}

	async function current(
		sessionId: string,
		expectedRevision: bigint,
	): Promise<SessionSnapshot> {
		const snapshot = await loadStored(sessionId);
		if (!snapshot) throw new Error(`session ${sessionId} does not exist`);
		if (snapshot.revision !== expectedRevision) {
			throw new Error(
				`expected revision ${expectedRevision}, found ${snapshot.revision}`,
			);
		}
		return clone(snapshot);
	}

	async function mutate(
		sessionId: string,
		expectedRevision: bigint,
		work: (snapshot: SessionSnapshot) => Promise<SessionSnapshot>,
	): Promise<SessionSnapshot> {
		return locked(sessionId, async () =>
			work(await current(sessionId, expectedRevision)),
		);
	}

	async function changed(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
		if (snapshot.revision === undefined)
			throw new Error("session revision is missing");
		snapshot.revision += 1n;
		const timestamp = now();
		if (snapshot.session) snapshot.session.updatedAt = timestamp;
		snapshot.capturedAt = timestamp;
		await persist(snapshot, "code.SessionChanged");
		return snapshot;
	}

	async function runTmux(args: readonly string[]): Promise<string> {
		const result = await options.tmux.run(args);
		if (result.code !== 0) {
			throw new Error(`tmux ${args[0]} failed`);
		}
		return result.stdout;
	}

	async function focusRuntimePane(runtimeId: string): Promise<void> {
		await runTmux(["select-window", "-t", runtimeId]);
		await runTmux(["select-pane", "-t", runtimeId]);
	}

	type ActualPane = {
		readonly runtimeId: string;
		readonly active: boolean;
		readonly metadata: TmuxPaneMetadata;
		readonly agentRunId: string;
		readonly agentExit: string;
	};

	async function readActualPanes(
		sessionId: string,
	): Promise<readonly ActualPane[]> {
		const result = await options.tmux.run([
			"list-panes",
			"-s",
			"-t",
			tmuxSession(sessionId),
			"-F",
			"#{pane_id}\t#{pane_active}\t#{window_active}\t#{pane_start_command}\t#{@hobo_agent_run}\t#{@hobo_agent_exit}",
		]);
		if (result.code !== 0) {
			throw new Error(
				`tmux pane reconciliation unavailable: ${result.stderr ?? "unknown error"}`,
			);
		}
		return result.stdout
			.split("\n")
			.map((line) => line.split("\t", 6))
			.map(
				([
					runtimeId = "",
					paneActive = "0",
					windowActive = "0",
					command = "",
					agentRunId = "",
					agentExit = "",
				]) => ({
					runtimeId,
					active: paneActive === "1" && windowActive === "1",
					metadata: decodePaneMetadata(command),
					agentRunId,
					agentExit,
				}),
			)
			.filter((entry): entry is ActualPane =>
				Boolean(entry.runtimeId && entry.metadata),
			);
	}

	function applyActualPanes(
		sessionId: string,
		snapshot: SessionSnapshot,
		actual: readonly ActualPane[],
	): boolean {
		if (actual.length === 0) return false;

		let drifted = false;
		const actualPaneIds = new Set(actual.map((entry) => entry.metadata.paneId));
		for (const entry of actual) {
			let pane = snapshot.panes.find(
				(candidate) => candidate.id === entry.metadata.paneId,
			);
			if (!pane) {
				if (!snapshot.tabs.some((tab) => tab.id === entry.metadata.tabId)) {
					snapshot.tabs.push(
						create(TabSchema, {
							id: entry.metadata.tabId,
							sessionId,
							title: entry.metadata.tabTitle,
							position: snapshot.tabs.length,
						}),
					);
				}
				pane = create(PaneSchema, {
					id: entry.metadata.paneId,
					sessionId,
					tabId: entry.metadata.tabId,
					title: entry.metadata.paneTitle,
					lifecycleState: PaneLifecycleState.RUNNING,
					runtimeId: entry.runtimeId,
					workingDirectory: entry.metadata.workingDirectory,
				});
				snapshot.panes.push(pane);
				drifted = true;
			}
			if (
				pane.runtimeId !== entry.runtimeId ||
				pane.lifecycleState !== PaneLifecycleState.RUNNING
			) {
				pane.runtimeId = entry.runtimeId;
				pane.lifecycleState = PaneLifecycleState.RUNNING;
				drifted = true;
			}
			if (entry.agentRunId) {
				const run = snapshot.agentRuns.find(
					(candidate) => candidate.id === entry.agentRunId,
				);
				if (run && run.lifecycleState === AgentLifecycleState.STARTING) {
					run.lifecycleState = AgentLifecycleState.WORKING;
					run.updatedAt = now();
					run.summary = "agent running";
					drifted = true;
				}
				if (
					run &&
					run.lifecycleState !== AgentLifecycleState.STOPPED &&
					entry.agentExit.startsWith(`${run.id}:`)
				) {
					const status = Number(entry.agentExit.slice(run.id.length + 1));
					run.lifecycleState =
						status === 0
							? AgentLifecycleState.DONE
							: AgentLifecycleState.FAILED;
					run.updatedAt = now();
					run.summary = `agent exited ${status}`;
					pane.agentRunId = undefined;
					drifted = true;
				}
			}
			if (
				entry.active &&
				(snapshot.focusedPaneId !== pane.id ||
					snapshot.focusedTabId !== pane.tabId)
			) {
				snapshot.focusedPaneId = pane.id;
				snapshot.focusedTabId = pane.tabId;
				drifted = true;
			}
		}
		for (const pane of snapshot.panes) {
			if (
				!actualPaneIds.has(pane.id) &&
				pane.lifecycleState !== PaneLifecycleState.MISSING
			) {
				pane.lifecycleState = PaneLifecycleState.MISSING;
				drifted = true;
			}
		}
		return drifted;
	}

	async function reconcilePanes(
		sessionId: string,
		snapshot: SessionSnapshot,
	): Promise<SessionSnapshot> {
		const drifted = applyActualPanes(
			sessionId,
			snapshot,
			await readActualPanes(sessionId),
		);
		return drifted ? changed(snapshot) : snapshot;
	}

	async function load(sessionId: string): Promise<SessionSnapshot | undefined> {
		const snapshot = await loadStored(sessionId);
		if (
			!snapshot?.session ||
			snapshot.session.lifecycleState !== SessionLifecycleState.RUNNING
		) {
			return snapshot;
		}
		const present = await options.tmux.run([
			"has-session",
			"-t",
			tmuxSession(sessionId),
		]);
		if (present.code === 0) {
			return locked(sessionId, async () => {
				const latest = await loadStored(sessionId);
				return latest ? reconcilePanes(sessionId, latest) : undefined;
			});
		}
		if (
			!/(can't find session|no server running|no sessions|no such file)/iu.test(
				present.stderr ?? "",
			)
		) {
			throw new Error(
				`tmux availability unknown: ${present.stderr ?? "probe failed"}`,
			);
		}
		return locked(sessionId, async () => {
			const latest = await loadStored(sessionId);
			if (
				!latest?.session ||
				latest.session.lifecycleState !== SessionLifecycleState.RUNNING
			) {
				return latest;
			}
			latest.session.lifecycleState = SessionLifecycleState.FAILED;
			for (const pane of latest.panes) {
				pane.lifecycleState = PaneLifecycleState.MISSING;
			}
			return changed(latest);
		});
	}

	function paneCommand(command?: readonly string[]): readonly string[] {
		const resolved = command ?? defaultShell;
		if (resolved.length === 0 || resolved.some((part) => !part)) {
			throw new TypeError("pane command entries must not be empty");
		}
		return resolved;
	}

	function tmuxCommand(
		title: string,
		command?: readonly string[],
		metadata?: TmuxPaneMetadata,
	): string {
		const wrapped = keepPaneOpen(
			title,
			paneCommand(command).map(shellQuote).join(" "),
		);
		return metadata
			? `env HOBO_PANE_META=${encodePaneMetadata(metadata)} ${wrapped}`
			: wrapped;
	}

	function tmuxAgentCommand(
		command: readonly string[],
		metadata: TmuxPaneMetadata,
		agentRunId: string,
	): string {
		const invocation = paneCommand(command).map(shellQuote).join(" ");
		const fallbackShell = paneCommand().map(shellQuote).join(" ");
		const script = `${invocation}; status=$?; tmux set-option -p @hobo_agent_exit ${agentRunId}:$status; exec ${fallbackShell}`;
		return `env HOBO_PANE_META=${encodePaneMetadata(metadata)} sh -c ${shellQuote(script)}`;
	}

	async function split(
		snapshot: SessionSnapshot,
		sessionId: string,
		sourceId: string,
		direction: "horizontal" | "vertical",
		title: string,
		command?: readonly string[],
	): Promise<SessionSnapshot> {
		const paneTitle = required(title, "title");
		const source = snapshot.panes.find((pane) => pane.id === sourceId);
		if (!source) throw new Error(`pane ${sourceId} does not exist`);
		const id = randomUUID();
		const tabTitle =
			snapshot.tabs.find((tab) => tab.id === source.tabId)?.title ?? "tab";
		const resolvedCommand = tmuxCommand(paneTitle, command, {
			paneId: id,
			tabId: source.tabId,
			paneTitle,
			tabTitle,
			workingDirectory: source.workingDirectory,
		});
		const stdout = await runTmux([
			"split-window",
			"-d",
			"-P",
			"-F",
			"#{pane_id}",
			"-t",
			source.runtimeId,
			direction === "horizontal" ? "-h" : "-v",
			"-c",
			source.workingDirectory,
			resolvedCommand,
		]);
		const runtimeId = paneRuntimeId(stdout);
		await focusRuntimePane(runtimeId);
		snapshot.panes.push(
			create(PaneSchema, {
				id,
				sessionId,
				tabId: source.tabId,
				title: paneTitle,
				lifecycleState: PaneLifecycleState.RUNNING,
				runtimeId,
				workingDirectory: source.workingDirectory,
			}),
		);
		snapshot.focusedTabId = source.tabId;
		snapshot.focusedPaneId = id;
		return changed(snapshot);
	}

	return {
		async create(input) {
			const id = required(input.id, "id");
			const sessionName = required(input.name, "name");
			const projectRoot = required(input.projectRoot, "projectRoot");
			const worktreePath = required(input.worktreePath, "worktreePath");
			const branch = required(input.branch, "branch");
			const clientId = required(input.clientId, "clientId");
			await load(id);
			return locked(id, async () => {
				const prior = await loadStored(id);
				if (prior?.session?.lifecycleState === SessionLifecycleState.RUNNING) {
					throw new Error(`session ${id} already exists`);
				}
				const timestamp = now();
				const snapshot = create(SessionSnapshotSchema, {
					schemaVersion: SESSION_SNAPSHOT_SCHEMA,
					session: {
						id,
						name: sessionName,
						projectRoot,
						worktreePath,
						branch,
						lifecycleState: SessionLifecycleState.RUNNING,
						createdAt: prior?.session?.createdAt ?? timestamp,
						updatedAt: timestamp,
						closeOnMerge: input.closeOnMerge ?? false,
					},
					tabs: [],
					panes: [],
					agentRuns: [],
					checkpoints: [],
					gitState: {
						worktreePath,
						branch,
						headSha: "unresolved",
						baseSha: "unresolved",
						dirty: false,
						ahead: 0,
						behind: 0,
						stagedPaths: [],
						unstagedPaths: [],
						untrackedPaths: [],
					},
					deliveryState: {
						lifecycleState: DeliveryLifecycleState.IDLE,
						remote: "origin",
						message: "",
					},
					focusedTabId: "",
					focusedPaneId: "",
					attachedClientIds: [clientId],
					revision: (prior?.revision ?? 0n) + 1n,
					capturedAt: timestamp,
				});
				const name = tmuxSession(id);
				if (!prior) {
					const existing = await options.tmux.run(["has-session", "-t", name]);
					if (existing.code === 0) {
						applyActualPanes(id, snapshot, await readActualPanes(id));
						const focused =
							snapshot.panes.find(
								(pane) => pane.id === snapshot.focusedPaneId,
							) ?? snapshot.panes[0];
						if (!focused) {
							throw new Error(
								`tmux session ${name} exists but has no valid HoBo pane metadata`,
							);
						}
						snapshot.focusedPaneId = focused.id;
						snapshot.focusedTabId = focused.tabId;
						const adopted = clone(snapshot);
						await persist(adopted, "code.SessionCreated");
						return adopted;
					}
				}
				const tabId = randomUUID();
				const paneId = randomUUID();
				const shell = tmuxCommand("shell", input.shell, {
					paneId,
					tabId,
					paneTitle: "shell",
					tabTitle: "main",
					workingDirectory: worktreePath,
				});
				const stdout = await runTmux([
					"new-session",
					"-d",
					"-P",
					"-F",
					"#{pane_id}",
					"-s",
					name,
					"-n",
					"main",
					"-c",
					worktreePath,
					shell,
				]);
				snapshot.tabs.push(
					create(TabSchema, {
						id: tabId,
						sessionId: id,
						title: "main",
						position: 0,
					}),
				);
				snapshot.panes.push(
					create(PaneSchema, {
						id: paneId,
						sessionId: id,
						tabId,
						title: "shell",
						lifecycleState: PaneLifecycleState.RUNNING,
						runtimeId: paneRuntimeId(stdout),
						workingDirectory: worktreePath,
					}),
				);
				snapshot.focusedTabId = tabId;
				snapshot.focusedPaneId = paneId;
				try {
					await persist(
						snapshot,
						prior ? "code.SessionChanged" : "code.SessionCreated",
					);
				} catch (error) {
					await options.tmux.run(["kill-session", "-t", name]);
					throw error;
				}
				return snapshot;
			});
		},

		load,

		async list() {
			const snapshots = new Map<string, SessionSnapshot>();
			for await (const positioned of store.readAll({
				filter: { type: "code.SessionCreated" },
			})) {
				const data = positioned.event.data as { snapshot?: unknown };
				if (!data.snapshot) continue;
				const snapshot = parseSessionSnapshot(data.snapshot);
				if (snapshot.session)
					snapshots.set(
						snapshot.session.id,
						(await load(snapshot.session.id)) ?? snapshot,
					);
			}
			return [...snapshots.values()].sort((left, right) =>
				(left.session?.name ?? "").localeCompare(right.session?.name ?? ""),
			);
		},

		async createTab(sessionId, expectedRevision, title, command) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const tabTitle = required(title, "title");
				const tabId = randomUUID();
				const paneId = randomUUID();
				const workingDirectory = snapshot.session?.worktreePath ?? "";
				const resolvedCommand = tmuxCommand(tabTitle, command, {
					paneId,
					tabId,
					paneTitle: tabTitle,
					tabTitle,
					workingDirectory,
				});
				const stdout = await runTmux([
					"new-window",
					"-d",
					"-P",
					"-F",
					"#{pane_id}",
					"-t",
					sessionTarget(tmuxSession(sessionId)),
					"-n",
					safeWindowName(tabTitle),
					"-c",
					workingDirectory,
					resolvedCommand,
				]);
				const runtimeId = paneRuntimeId(stdout);
				await focusRuntimePane(runtimeId);
				snapshot.tabs.push(
					create(TabSchema, {
						id: tabId,
						sessionId,
						title: tabTitle,
						position: snapshot.tabs.length,
					}),
				);
				snapshot.panes.push(
					create(PaneSchema, {
						id: paneId,
						sessionId,
						tabId,
						title: tabTitle,
						lifecycleState: PaneLifecycleState.RUNNING,
						runtimeId,
						workingDirectory,
					}),
				);
				snapshot.focusedTabId = tabId;
				snapshot.focusedPaneId = paneId;
				return changed(snapshot);
			});
		},

		async createPane(sessionId, expectedRevision, tabId, title, command) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const source = snapshot.panes.find((pane) => pane.tabId === tabId);
				if (!source) throw new Error(`tab ${tabId} does not exist`);
				return split(
					snapshot,
					sessionId,
					source.id,
					"vertical",
					title,
					command,
				);
			});
		},

		async splitPane(
			sessionId,
			expectedRevision,
			paneId,
			direction,
			title,
			command,
		) {
			return mutate(sessionId, expectedRevision, (snapshot) =>
				split(snapshot, sessionId, paneId, direction, title, command),
			);
		},

		async focusPane(sessionId, expectedRevision, paneId) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const pane = snapshot.panes.find(
					(candidate) => candidate.id === paneId,
				);
				if (!pane) throw new Error(`pane ${paneId} does not exist`);
				await focusRuntimePane(pane.runtimeId);
				snapshot.focusedPaneId = pane.id;
				snapshot.focusedTabId = pane.tabId;
				return changed(snapshot);
			});
		},

		async sendInput(sessionId, expectedRevision, paneId, input, commandId) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const pane = snapshot.panes.find(
					(candidate) => candidate.id === paneId,
				);
				if (!pane) throw new Error(`pane ${paneId} does not exist`);
				if (commandId) {
					const encoded = Buffer.from(commandId, "utf8").toString("base64url");
					const prior = await options.tmux.run([
						"show-options",
						"-p",
						"-v",
						"-t",
						pane.runtimeId,
						"@hobo_last_input_command",
					]);
					const processed = prior.stdout.trim().split(",").filter(Boolean);
					if (prior.code === 0 && processed.includes(encoded)) {
						return snapshot;
					}
					const nextProcessed = [...processed.slice(-63), encoded].join(",");
					await runTmux([
						"send-keys",
						"-t",
						pane.runtimeId,
						"-l",
						"--",
						input,
						";",
						"set-option",
						"-p",
						"-t",
						pane.runtimeId,
						"@hobo_last_input_command",
						nextProcessed,
					]);
				} else {
					await runTmux(["send-keys", "-t", pane.runtimeId, "-l", "--", input]);
				}
				return snapshot;
			});
		},

		async closePane(sessionId, expectedRevision, paneId) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				if (snapshot.panes.length === 1) {
					throw new Error(
						"cannot close the final pane; stop the session instead",
					);
				}
				const index = snapshot.panes.findIndex((pane) => pane.id === paneId);
				const pane = snapshot.panes[index];
				if (!pane) throw new Error(`pane ${paneId} does not exist`);
				const paneRuns = snapshot.agentRuns.filter(
					(run) => run.paneId === paneId,
				);
				if (paneRuns.some((run) => isActiveAgent(run.lifecycleState))) {
					throw new Error(`pane ${paneId} has an active agent`);
				}
				if (pane.lifecycleState !== PaneLifecycleState.MISSING) {
					await runTmux(["kill-pane", "-t", pane.runtimeId]);
				}
				snapshot.panes.splice(index, 1);
				snapshot.agentRuns = snapshot.agentRuns.filter(
					(run) => run.paneId !== paneId,
				);
				if (
					!snapshot.panes.some((candidate) => candidate.tabId === pane.tabId)
				) {
					snapshot.tabs = snapshot.tabs.filter((tab) => tab.id !== pane.tabId);
					for (const [position, tab] of snapshot.tabs.entries()) {
						tab.position = position;
					}
				}
				if (snapshot.focusedPaneId === paneId) {
					const next =
						snapshot.panes.find(
							(candidate) =>
								candidate.tabId === pane.tabId &&
								candidate.lifecycleState !== PaneLifecycleState.MISSING,
						) ??
						snapshot.panes.find(
							(candidate) =>
								candidate.lifecycleState !== PaneLifecycleState.MISSING,
						);
					if (!next) throw new Error("session has no remaining pane");
					await focusRuntimePane(next.runtimeId);
					snapshot.focusedPaneId = next.id;
					snapshot.focusedTabId = next.tabId;
				}
				return changed(snapshot);
			});
		},

		async detach(sessionId, expectedRevision, clientId) {
			required(clientId, "clientId");
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				snapshot.attachedClientIds = snapshot.attachedClientIds.filter(
					(id) => id !== clientId,
				);
				return changed(snapshot);
			});
		},

		async reattach(sessionId, expectedRevision, clientId) {
			required(clientId, "clientId");
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				if (!snapshot.attachedClientIds.includes(clientId)) {
					snapshot.attachedClientIds.push(required(clientId, "clientId"));
				}
				return changed(snapshot);
			});
		},

		async stop(sessionId, expectedRevision) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				if (
					snapshot.session?.lifecycleState === SessionLifecycleState.RUNNING
				) {
					await runTmux(["kill-session", "-t", tmuxSession(sessionId)]);
				}
				if (snapshot.session)
					snapshot.session.lifecycleState = SessionLifecycleState.STOPPED;
				for (const pane of snapshot.panes)
					pane.lifecycleState = PaneLifecycleState.EXITED;
				return changed(snapshot);
			});
		},

		async startAgent(
			sessionId,
			expectedRevision,
			paneId,
			provider,
			command,
			prompt,
		) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const pane = snapshot.panes.find(
					(candidate) => candidate.id === paneId,
				);
				if (!pane) throw new Error(`pane ${paneId} does not exist`);
				if (
					snapshot.agentRuns.some(
						(run) => run.paneId === paneId && isActiveAgent(run.lifecycleState),
					)
				) {
					throw new Error(`pane ${paneId} already has an active agent`);
				}
				const resolved = [...paneCommand(command), ...(prompt ? [prompt] : [])];
				const tabTitle =
					snapshot.tabs.find((tab) => tab.id === pane.tabId)?.title ?? "tab";
				const timestamp = now();
				const run = create(AgentRunSchema, {
					id: randomUUID(),
					sessionId,
					paneId,
					provider: required(provider, "provider"),
					lifecycleState: AgentLifecycleState.STARTING,
					startedAt: timestamp,
					updatedAt: timestamp,
					summary: "agent start requested",
					terminalOnly: true,
				});
				snapshot.agentRuns.push(run);
				pane.agentRunId = run.id;
				const intent = await changed(snapshot);
				try {
					await runTmux([
						"respawn-pane",
						"-k",
						"-t",
						pane.runtimeId,
						"-c",
						pane.workingDirectory,
						tmuxAgentCommand(
							resolved,
							{
								paneId: pane.id,
								tabId: pane.tabId,
								paneTitle: pane.title,
								tabTitle,
								workingDirectory: pane.workingDirectory,
							},
							run.id,
						),
						";",
						"set-option",
						"-p",
						"-t",
						pane.runtimeId,
						"@hobo_agent_run",
						run.id,
						";",
						"set-option",
						"-p",
						"-t",
						pane.runtimeId,
						"@hobo_agent_exit",
						"",
					]);
				} catch (error) {
					run.lifecycleState = AgentLifecycleState.FAILED;
					run.updatedAt = now();
					run.summary = String(error);
					pane.agentRunId = undefined;
					await changed(intent);
					throw error;
				}
				run.lifecycleState = AgentLifecycleState.WORKING;
				run.updatedAt = now();
				run.summary = "agent running";
				return changed(intent);
			});
		},

		async stopAgent(sessionId, expectedRevision, agentRunId) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				const run = snapshot.agentRuns.find(
					(candidate) => candidate.id === agentRunId,
				);
				if (!run) throw new Error(`agent run ${agentRunId} does not exist`);
				if (!isActiveAgent(run.lifecycleState))
					throw new Error(`agent run ${agentRunId} is already terminal`);
				const pane = snapshot.panes.find(
					(candidate) => candidate.id === run.paneId,
				);
				if (!pane) throw new Error(`pane ${run.paneId} does not exist`);
				run.lifecycleState = AgentLifecycleState.UNKNOWN;
				run.updatedAt = now();
				run.summary = "agent stop requested";
				const intent = await changed(snapshot);
				await runTmux(["send-keys", "-t", pane.runtimeId, "C-c"]);
				let confirmed = false;
				for (let attempt = 0; attempt < 20; attempt += 1) {
					const exit = await options.tmux.run([
						"show-options",
						"-p",
						"-v",
						"-t",
						pane.runtimeId,
						"@hobo_agent_exit",
					]);
					if (exit.code === 0 && exit.stdout.trim().startsWith(`${run.id}:`)) {
						confirmed = true;
						break;
					}
					await new Promise((done) => setTimeout(done, 50));
				}
				run.lifecycleState = confirmed
					? AgentLifecycleState.STOPPED
					: AgentLifecycleState.UNKNOWN;
				run.updatedAt = now();
				run.summary = confirmed
					? "agent stopped"
					: "stop requested; completion unconfirmed";
				if (confirmed) pane.agentRunId = undefined;
				return changed(intent);
			});
		},

		async update(sessionId, expectedRevision, work) {
			return mutate(sessionId, expectedRevision, async (snapshot) => {
				await work(snapshot);
				return changed(parseSessionSnapshot(sessionSnapshotJson(snapshot)));
			});
		},

		close() {
			store.close();
		},
	};
}
