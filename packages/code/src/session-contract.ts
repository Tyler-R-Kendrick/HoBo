import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import {
	AgentLifecycleState,
	CheckpointLifecycleState,
	DeliveryLifecycleState,
	PaneLifecycleState,
	type SessionCommandEnvelope,
	SessionCommandEnvelopeSchema,
	SessionLifecycleState,
	type SessionSnapshot,
	SessionSnapshotSchema,
} from "./_generated/code_harness_pb.js";

// public-contract: clients pin the command envelope version at the trust boundary.
export const SESSION_COMMAND_SCHEMA = "hobo.code.session-command/v1";
// public-contract: every client reads the same durable snapshot version.
export const SESSION_SNAPSHOT_SCHEMA = "hobo.code.session-snapshot/v1";

const SESSION_STATES = [
	SessionLifecycleState.STARTING,
	SessionLifecycleState.RUNNING,
	SessionLifecycleState.STOPPING,
	SessionLifecycleState.STOPPED,
	SessionLifecycleState.FAILED,
];
const PANE_STATES = [
	PaneLifecycleState.STARTING,
	PaneLifecycleState.RUNNING,
	PaneLifecycleState.EXITED,
	PaneLifecycleState.MISSING,
];
const AGENT_STATES = [
	AgentLifecycleState.STARTING,
	AgentLifecycleState.IDLE,
	AgentLifecycleState.WORKING,
	AgentLifecycleState.BLOCKED,
	AgentLifecycleState.DONE,
	AgentLifecycleState.FAILED,
	AgentLifecycleState.STOPPED,
	AgentLifecycleState.UNKNOWN,
];
const CHECKPOINT_STATES = [
	CheckpointLifecycleState.CREATED,
	CheckpointLifecycleState.RESTORING,
	CheckpointLifecycleState.RESTORED,
	CheckpointLifecycleState.FAILED,
];
const DELIVERY_STATES = [
	DeliveryLifecycleState.IDLE,
	DeliveryLifecycleState.READY,
	DeliveryLifecycleState.PUSHING,
	DeliveryLifecycleState.PULL_REQUEST_OPEN,
	DeliveryLifecycleState.MERGING,
	DeliveryLifecycleState.MERGED,
	DeliveryLifecycleState.FAILED,
];

function required(value: string, field: string): void {
	if (!value) throw new TypeError(`${field} must not be empty`);
}

function optionalRequired(value: string | undefined, field: string): void {
	if (value !== undefined) required(value, field);
}

function commandLine(values: readonly string[], field: string): void {
	if (values.some((value) => !value)) {
		throw new TypeError(`${field} entries must not be empty`);
	}
}

function lifecycle(
	value: number,
	allowed: readonly number[],
	field: string,
): void {
	if (!allowed.includes(value)) {
		throw new TypeError(`${field} is not a recognized lifecycle state`);
	}
}

function specified<T>(value: T | undefined, field: string): asserts value is T {
	if (value === undefined) throw new TypeError(`${field} must be specified`);
}

function validateCommand(command: SessionCommandEnvelope["command"]): void {
	switch (command.case) {
		case "createSession":
			required(command.value.name, "createSession.name");
			required(command.value.projectRoot, "createSession.projectRoot");
			required(command.value.branch, "createSession.branch");
			required(command.value.clientId, "createSession.clientId");
			break;
		case "detachSession":
		case "reattachSession":
			required(command.value.clientId, `${command.case}.clientId`);
			break;
		case "focusPane":
		case "closePane":
		case "sendInput":
			required(command.value.paneId, `${command.case}.paneId`);
			break;
		case "createTab":
			required(command.value.title, "createTab.title");
			break;
		case "createPane":
			required(command.value.tabId, "createPane.tabId");
			required(command.value.title, "createPane.title");
			commandLine(command.value.command, "createPane.command");
			break;
		case "splitPane":
			required(command.value.paneId, "splitPane.paneId");
			required(command.value.title, "splitPane.title");
			if (
				command.value.direction !== "horizontal" &&
				command.value.direction !== "vertical"
			) {
				throw new TypeError(
					"splitPane.direction must be horizontal or vertical",
				);
			}
			commandLine(command.value.command, "splitPane.command");
			break;
		case "startAgent":
			required(command.value.paneId, "startAgent.paneId");
			required(command.value.provider, "startAgent.provider");
			if (command.value.command.length === 0) {
				throw new TypeError("startAgent.command must not be empty");
			}
			commandLine(command.value.command, "startAgent.command");
			break;
		case "stopAgent":
			required(command.value.agentRunId, "stopAgent.agentRunId");
			break;
		case "restoreCheckpoint":
			required(command.value.checkpointId, "restoreCheckpoint.checkpointId");
			break;
		case "commit":
			required(command.value.message, "commit.message");
			break;
		case "stagePaths":
		case "unstagePaths":
			if (command.value.paths.length === 0) {
				throw new TypeError(`${command.case}.paths must not be empty`);
			}
			commandLine(command.value.paths, `${command.case}.paths`);
			break;
		case "push":
			required(command.value.remote, "push.remote");
			break;
		case "openPullRequest":
			required(command.value.title, "openPullRequest.title");
			specified(command.value.draft, "openPullRequest.draft");
			break;
		case "stackPullRequest":
			required(command.value.parentBranch, "stackPullRequest.parentBranch");
			required(command.value.title, "stackPullRequest.title");
			break;
		case "mergePullRequest":
			if (command.value.pullRequestNumber === 0n) {
				throw new TypeError(
					"mergePullRequest.pullRequestNumber must be positive",
				);
			}
			break;
		case "stopSession":
			specified(command.value.removeWorktree, "stopSession.removeWorktree");
			break;
		case "createCheckpoint":
			required(command.value.label, "createCheckpoint.label");
			break;
		case undefined:
			throw new TypeError("command must be specified");
	}
}

export function parseSessionCommand(
	input: JsonValue | undefined,
): SessionCommandEnvelope {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const command = fromJson(SessionCommandEnvelopeSchema, input as JsonValue);
	if (command.schemaVersion !== SESSION_COMMAND_SCHEMA) {
		throw new TypeError(`schemaVersion must be ${SESSION_COMMAND_SCHEMA}`);
	}
	required(command.commandId, "commandId");
	required(command.actorId, "actorId");
	required(command.sessionId, "sessionId");
	if (command.expectedRevision === undefined) {
		throw new TypeError("expectedRevision must be specified");
	}
	validateCommand(command.command);
	return command;
}

export function parseSessionSnapshot(
	input: JsonValue | undefined,
): SessionSnapshot {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const snapshot = fromJson(SessionSnapshotSchema, input as JsonValue);
	if (snapshot.schemaVersion !== SESSION_SNAPSHOT_SCHEMA) {
		throw new TypeError(`schemaVersion must be ${SESSION_SNAPSHOT_SCHEMA}`);
	}
	if (!snapshot.session) throw new TypeError("session must be specified");
	if (snapshot.revision === undefined) {
		throw new TypeError("revision must be specified");
	}
	const session = snapshot.session;
	required(session.id, "session.id");
	required(session.name, "session.name");
	required(session.projectRoot, "session.projectRoot");
	required(session.worktreePath, "session.worktreePath");
	required(session.branch, "session.branch");
	required(session.createdAt, "session.createdAt");
	required(session.updatedAt, "session.updatedAt");
	specified(session.closeOnMerge, "session.closeOnMerge");
	lifecycle(session.lifecycleState, SESSION_STATES, "session.lifecycleState");

	const tabIds = new Set<string>();
	for (const tab of snapshot.tabs) {
		required(tab.id, "tabs[].id");
		if (tabIds.has(tab.id)) throw new TypeError("tabs[].id must be unique");
		required(tab.title, "tabs[].title");
		specified(tab.position, "tabs[].position");
		if (tab.sessionId !== session.id) {
			throw new TypeError("tabs[].sessionId must match session.id");
		}
		tabIds.add(tab.id);
	}
	const paneTabIds = new Map<string, string>();
	for (const pane of snapshot.panes) {
		required(pane.id, "panes[].id");
		if (paneTabIds.has(pane.id))
			throw new TypeError("panes[].id must be unique");
		required(pane.title, "panes[].title");
		required(pane.runtimeId, "panes[].runtimeId");
		required(pane.workingDirectory, "panes[].workingDirectory");
		optionalRequired(pane.agentRunId, "panes[].agentRunId");
		if (pane.sessionId !== session.id) {
			throw new TypeError("panes[].sessionId must match session.id");
		}
		if (!tabIds.has(pane.tabId)) {
			throw new TypeError("panes[].tabId must reference a tab");
		}
		lifecycle(pane.lifecycleState, PANE_STATES, "panes[].lifecycleState");
		paneTabIds.set(pane.id, pane.tabId);
	}
	const agentPanes = new Map<string, string>();
	for (const agent of snapshot.agentRuns) {
		required(agent.id, "agentRuns[].id");
		if (agentPanes.has(agent.id))
			throw new TypeError("agentRuns[].id must be unique");
		agentPanes.set(agent.id, agent.paneId);
		required(agent.provider, "agentRuns[].provider");
		optionalRequired(agent.providerSessionId, "agentRuns[].providerSessionId");
		required(agent.startedAt, "agentRuns[].startedAt");
		required(agent.updatedAt, "agentRuns[].updatedAt");
		specified(agent.terminalOnly, "agentRuns[].terminalOnly");
		if (agent.sessionId !== session.id || !paneTabIds.has(agent.paneId)) {
			throw new TypeError("agentRuns[] must reference this session and a pane");
		}
		lifecycle(agent.lifecycleState, AGENT_STATES, "agentRuns[].lifecycleState");
	}
	for (const pane of snapshot.panes) {
		if (pane.agentRunId) {
			const agentPaneId = agentPanes.get(pane.agentRunId);
			if (!agentPaneId)
				throw new TypeError("panes[].agentRunId must reference an agent run");
			if (agentPaneId !== pane.id)
				throw new TypeError("panes[].agentRunId must reference its own pane");
		}
	}
	const checkpointIds = new Set<string>();
	for (const checkpoint of snapshot.checkpoints) {
		required(checkpoint.id, "checkpoints[].id");
		if (checkpointIds.has(checkpoint.id))
			throw new TypeError("checkpoints[].id must be unique");
		checkpointIds.add(checkpoint.id);
		required(checkpoint.gitCommit, "checkpoints[].gitCommit");
		required(checkpoint.createdAt, "checkpoints[].createdAt");
		if (checkpoint.sessionId !== session.id) {
			throw new TypeError("checkpoints[].sessionId must match session.id");
		}
		lifecycle(
			checkpoint.lifecycleState,
			CHECKPOINT_STATES,
			"checkpoints[].lifecycleState",
		);
	}
	if (!snapshot.gitState) throw new TypeError("gitState must be specified");
	required(snapshot.gitState.worktreePath, "gitState.worktreePath");
	required(snapshot.gitState.branch, "gitState.branch");
	required(snapshot.gitState.headSha, "gitState.headSha");
	required(snapshot.gitState.baseSha, "gitState.baseSha");
	specified(snapshot.gitState.dirty, "gitState.dirty");
	specified(snapshot.gitState.ahead, "gitState.ahead");
	specified(snapshot.gitState.behind, "gitState.behind");
	if (!snapshot.deliveryState) {
		throw new TypeError("deliveryState must be specified");
	}
	required(snapshot.deliveryState.remote, "deliveryState.remote");
	if (snapshot.deliveryState.pullRequestNumber === 0n) {
		throw new TypeError("deliveryState.pullRequestNumber must be positive");
	}
	optionalRequired(
		snapshot.deliveryState.pullRequestUrl,
		"deliveryState.pullRequestUrl",
	);
	optionalRequired(
		snapshot.deliveryState.stackParentBranch,
		"deliveryState.stackParentBranch",
	);
	lifecycle(
		snapshot.deliveryState.lifecycleState,
		DELIVERY_STATES,
		"deliveryState.lifecycleState",
	);
	required(snapshot.focusedTabId, "focusedTabId");
	required(snapshot.focusedPaneId, "focusedPaneId");
	if (
		!tabIds.has(snapshot.focusedTabId) ||
		paneTabIds.get(snapshot.focusedPaneId) !== snapshot.focusedTabId
	) {
		throw new TypeError("focused pane must belong to the focused tab");
	}
	for (const clientId of snapshot.attachedClientIds) {
		required(clientId, "attachedClientIds[]");
	}
	required(snapshot.capturedAt, "capturedAt");
	return snapshot;
}

export function sessionSnapshotJson(snapshot: SessionSnapshot): JsonValue {
	return toJson(SessionSnapshotSchema, snapshot, { alwaysEmitImplicit: true });
}

export type { SessionCommandEnvelope, SessionSnapshot };
