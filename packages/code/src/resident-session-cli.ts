import { randomUUID } from "node:crypto";

import {
	AgentLifecycleState,
	SessionLifecycleState,
} from "./_generated/code_harness_pb.js";
import type { DevMachine } from "./dev-machines.js";
import { sshDestination } from "./dev-machines.js";
import {
	createLocalSessionControl,
	sessionCommandEnvelope,
} from "./local-session-control.js";
import { residentSessionTmuxName } from "./resident-session-runtime.js";
import {
	type SessionSnapshot,
	sessionSnapshotJson,
} from "./session-contract.js";

const DELIVERY_COMMANDS = new Set(["commit", "push", "pr", "stack", "merge"]);

export function shouldWaitForResidentSession(
	sessionState: SessionLifecycleState,
	agentStates: readonly AgentLifecycleState[],
): boolean {
	return (
		sessionState === SessionLifecycleState.RUNNING &&
		agentStates.some((state) =>
			[AgentLifecycleState.STARTING, AgentLifecycleState.WORKING].includes(
				state,
			),
		)
	);
}

export function remoteSessionServeSshArgs(
	machine: DevMachine,
	port: number,
	identityAgent: string,
): readonly string[] {
	if (!identityAgent) {
		throw new Error("Station authorization did not provide an SSH agent");
	}
	const endpoint = `127.0.0.1:${port}`;
	return [
		"-T",
		"-o",
		`IdentityAgent=${identityAgent}`,
		"-o",
		"IdentityFile=none",
		"-o",
		"PreferredAuthentications=publickey",
		"-o",
		"PasswordAuthentication=no",
		"-o",
		"KbdInteractiveAuthentication=no",
		"-o",
		"BatchMode=yes",
		"-o",
		"ExitOnForwardFailure=yes",
		"-L",
		`${endpoint}:${endpoint}`,
		sshDestination(machine),
		"hobo-code",
		"session",
		"serve",
		"--port",
		String(port),
	];
}

export function authorizationLeaseDelay(
	expiresAt: string,
	nowMs = Date.now(),
): number {
	const expiresAtMs = Date.parse(expiresAt);
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
		throw new Error("Station authorization is expired or invalid");
	}
	return Math.min(expiresAtMs - nowMs, 2_147_483_647);
}

export interface ResidentSessionCliResult {
	readonly message: string;
	readonly data: unknown;
}

export interface RemoteSessionServe {
	readonly machine: DevMachine;
	readonly port: number;
	readonly authorizationSessionId: string;
	readonly authorizationExpiresAt: string;
	readonly auditTypes: readonly string[];
	readonly identityAgent: string;
	/** Process-local lease close; omitted from JSON output. */
	readonly closeAuthorization: () => Promise<void>;
}

function required(value: string | undefined, usage: string): string {
	if (!value) throw new Error(`usage: hobo-code session ${usage}`);
	return value;
}

function revision(snapshot: SessionSnapshot): bigint {
	if (snapshot.revision === undefined)
		throw new Error("session has no revision");
	return snapshot.revision;
}

function slug(value: string): string {
	const clean = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 32);
	if (!clean) throw new Error("session name must contain a letter or digit");
	return clean;
}

function summary(snapshot: SessionSnapshot): string {
	const session = snapshot.session;
	if (!session) return "invalid session";
	const agents = snapshot.agentRuns.length;
	return `${session.id} · ${session.branch} · ${snapshot.tabs.length} tab(s) · ${snapshot.panes.length} pane(s) · ${agents} agent(s) · r${snapshot.revision ?? 0n}`;
}

function details(snapshot: SessionSnapshot): string {
	return [
		summary(snapshot),
		`focus · tab ${snapshot.focusedTabId} · pane ${snapshot.focusedPaneId}`,
		...snapshot.tabs.map((tab) => `tab · ${tab.id} · ${tab.title}`),
		...snapshot.panes.map(
			(pane) => `pane · ${pane.id} · tab ${pane.tabId} · ${pane.title}`,
		),
		...snapshot.agentRuns.map(
			(run) => `agent · ${run.id} · pane ${run.paneId} · ${run.provider}`,
		),
		...snapshot.checkpoints.map(
			(checkpoint) => `checkpoint · ${checkpoint.id} · ${checkpoint.label}`,
		),
	].join("\n");
}

async function commandFor(
	hoboHome: string,
	actorId: string,
	approved: boolean,
	sessionId: string,
	command: string,
	value: Readonly<Record<string, unknown>>,
): Promise<SessionSnapshot> {
	const control = createLocalSessionControl({ hoboHome });
	try {
		const snapshot = await control.load(sessionId);
		if (!snapshot) throw new Error(`session ${sessionId} does not exist`);
		return await control.execute(
			sessionCommandEnvelope(
				sessionId,
				revision(snapshot),
				actorId,
				command,
				value,
			),
			approved,
		);
	} finally {
		control.close();
	}
}

export async function runResidentSessionCli(input: {
	readonly args: readonly string[];
	readonly hoboHome: string;
	readonly projectDir: string;
	readonly approved: boolean;
	readonly actorId?: string;
	readonly servePort?: number;
	readonly remoteServe?: RemoteSessionServe;
}): Promise<ResidentSessionCliResult | undefined> {
	const [operation, ...args] = input.args;
	if (!operation) return undefined;
	const actorId = input.actorId ?? `cli-${process.ppid}`;
	if (operation === "serve") {
		if (input.remoteServe) {
			return {
				message: `forwarding resident browser from ${input.remoteServe.machine.id} at http://127.0.0.1:${input.remoteServe.port}; Station authorization gates a lease-bound local SSH agent`,
				data: {
					terminalAction: {
						kind: "forward-sessions",
						...input.remoteServe,
						credentialMode: "station-authorized-agent",
					},
				},
			};
		}
		return {
			message: "starting loopback session browser",
			data: {
				terminalAction: {
					kind: "serve-sessions",
					hoboHome: input.hoboHome,
					projectRoot: input.projectDir,
					...(input.servePort !== undefined ? { port: input.servePort } : {}),
				},
			},
		};
	}
	if (operation === "list") {
		const control = createLocalSessionControl({ hoboHome: input.hoboHome });
		try {
			const sessions = await control.list();
			return {
				message:
					sessions.length === 0
						? "no resident sessions"
						: sessions.map(summary).join("\n"),
				data: { sessions: sessions.map(sessionSnapshotJson) },
			};
		} finally {
			control.close();
		}
	}
	if (operation === "create") {
		const name = required(args[0], "create <name> [branch]");
		const suffix = randomUUID().slice(0, 8);
		const sessionId = `${slug(name)}-${suffix}`;
		const branch = args[1] ?? `code/${slug(name)}-${suffix}`;
		const control = createLocalSessionControl({ hoboHome: input.hoboHome });
		try {
			const snapshot = await control.execute(
				sessionCommandEnvelope(sessionId, 0n, actorId, "createSession", {
					name,
					projectRoot: input.projectDir,
					branch,
					clientId: actorId,
				}),
			);
			return {
				message: `created ${details(snapshot)}`,
				data: { snapshot: sessionSnapshotJson(snapshot) },
			};
		} finally {
			control.close();
		}
	}

	const sessionId = required(args[0], `${operation} <sessionId> …`);
	if (["show", "status", "wait"].includes(operation)) {
		const control = createLocalSessionControl({ hoboHome: input.hoboHome });
		try {
			let snapshot = await control.load(sessionId);
			if (!snapshot) throw new Error(`session ${sessionId} does not exist`);
			while (
				operation === "wait" &&
				shouldWaitForResidentSession(
					snapshot.session?.lifecycleState ?? SessionLifecycleState.FAILED,
					snapshot.agentRuns.map((run) => run.lifecycleState),
				)
			) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				snapshot = await control.load(sessionId);
				if (!snapshot) throw new Error(`session ${sessionId} disappeared`);
			}
			return {
				message: details(snapshot),
				data: { snapshot: sessionSnapshotJson(snapshot) },
			};
		} finally {
			control.close();
		}
	}

	let command: string;
	let value: Record<string, unknown>;
	switch (operation) {
		case "attach":
		case "switch":
			command = "reattachSession";
			value = { clientId: actorId };
			break;
		case "detach":
			command = "detachSession";
			value = { clientId: actorId };
			break;
		case "tab":
			command = "createTab";
			value = { title: required(args[1], "tab <sessionId> <title>") };
			break;
		case "pane":
			command = "createPane";
			value = {
				tabId: required(args[1], "pane <sessionId> <tabId> <title> [command…]"),
				title: required(args[2], "pane <sessionId> <tabId> <title> [command…]"),
				command: args.slice(3),
			};
			break;
		case "split":
			command = "splitPane";
			value = {
				paneId: required(
					args[1],
					"split <sessionId> <paneId> <horizontal|vertical> <title> [command…]",
				),
				direction: required(
					args[2],
					"split <sessionId> <paneId> <horizontal|vertical> <title> [command…]",
				),
				title: required(
					args[3],
					"split <sessionId> <paneId> <horizontal|vertical> <title> [command…]",
				),
				command: args.slice(4),
			};
			break;
		case "focus":
			command = "focusPane";
			value = { paneId: required(args[1], "focus <sessionId> <paneId>") };
			break;
		case "input":
		case "prompt":
			command = "sendInput";
			value = {
				paneId: required(args[1], `${operation} <sessionId> <paneId> <text…>`),
				input: `${required(
					args.slice(2).join(" "),
					`${operation} <sessionId> <paneId> <text…>`,
				)}${operation === "prompt" ? "\n" : ""}`,
			};
			break;
		case "close-pane":
			command = "closePane";
			value = { paneId: required(args[1], "close-pane <sessionId> <paneId>") };
			break;
		case "agent-start":
			command = "startAgent";
			value = {
				paneId: required(
					args[1],
					"agent-start <sessionId> <paneId> <provider> <command…>",
				),
				provider: required(
					args[2],
					"agent-start <sessionId> <paneId> <provider> <command…>",
				),
				command: args.slice(3),
				prompt: "",
			};
			break;
		case "agent-stop":
			command = "stopAgent";
			value = {
				agentRunId: required(args[1], "agent-stop <sessionId> <agentRunId>"),
			};
			break;
		case "checkpoint":
			command = "createCheckpoint";
			value = {
				label: required(
					args.slice(1).join(" "),
					"checkpoint <sessionId> <label>",
				),
			};
			break;
		case "restore":
			command = "restoreCheckpoint";
			value = {
				checkpointId: required(args[1], "restore <sessionId> <checkpointId>"),
			};
			break;
		case "commit":
			command = "commit";
			value = {
				message: required(
					args.slice(1).join(" "),
					"commit <sessionId> <message>",
				),
			};
			break;
		case "push":
			command = "push";
			value = { remote: args[1] ?? "origin" };
			break;
		case "pr":
			command = "openPullRequest";
			value = {
				title: required(args.slice(1).join(" "), "pr <sessionId> <title>"),
				body: "",
				draft: false,
			};
			break;
		case "stack":
			command = "stackPullRequest";
			value = {
				parentBranch: required(
					args[1],
					"stack <sessionId> <parentBranch> <title>",
				),
				title: required(
					args.slice(2).join(" "),
					"stack <sessionId> <parentBranch> <title>",
				),
				body: "",
			};
			break;
		case "merge":
			command = "mergePullRequest";
			value = {
				pullRequestNumber: required(
					args[1],
					"merge <sessionId> <pullRequestNumber>",
				),
			};
			break;
		case "stop":
		case "delete":
			command = "stopSession";
			value = { removeWorktree: operation === "delete" };
			break;
		default:
			throw new Error(`unknown session operation: ${operation}`);
	}
	if (DELIVERY_COMMANDS.has(operation) && !input.approved) {
		throw new Error(`${operation} requires --approve`);
	}
	const snapshot = await commandFor(
		input.hoboHome,
		actorId,
		input.approved,
		sessionId,
		command,
		value,
	);
	const attach = operation === "attach" || operation === "switch";
	return {
		message: `${operation} ${summary(snapshot)}`,
		data: {
			snapshot: sessionSnapshotJson(snapshot),
			...(attach
				? {
						terminalAction: {
							kind: "attach-session",
							sessionName: residentSessionTmuxName(sessionId),
						},
					}
				: operation === "detach"
					? { terminalAction: { kind: "detach-session" } }
					: {}),
		},
	};
}
