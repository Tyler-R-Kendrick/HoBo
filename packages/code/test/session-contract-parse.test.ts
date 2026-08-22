/**
 * The session trust boundary: what a command and a snapshot must prove.
 *
 * Both parsers are parse-don't-validate — a `JsonValue` goes in and a domain
 * record comes out, or nothing does. Protobuf's own `fromJson` handles shape;
 * everything here is the part it cannot know:
 *
 * **Referential integrity across the whole snapshot.** A pane names a tab, an
 * agent run names a pane, a pane that claims an agent run must be the pane that
 * run is on, and the focused pane must live in the focused tab. Each of these
 * is a graph that protobuf sees as four independent lists. A snapshot that
 * passes the shape check and fails the graph is exactly the thing that would
 * render as a session with panes attached to tabs that do not exist.
 *
 * **Ids are unique per collection.** Duplicates are how a restore silently
 * drops half a session: the later row wins wherever the reader keys by id, and
 * nothing reports the loss.
 *
 * **Empty string is not a value.** Every required field is checked for
 * emptiness rather than for presence, because proto3 gives an absent scalar
 * and an empty one the same representation. A session whose branch is `""` is
 * not a session with a default branch; it is a session with no branch.
 *
 * **A boolean must be specified.** `false` and absent are the same byte on the
 * wire, so `specified` exists to make a caller state which one they meant.
 * `stopSession.removeWorktree` is the one where getting it wrong deletes work.
 *
 * Pure: JSON in, record or `TypeError` out.
 */
import { describe, expect, it } from "vitest";

import {
	parseSessionCommand,
	parseSessionSnapshot,
	SESSION_COMMAND_SCHEMA,
	SESSION_SNAPSHOT_SCHEMA,
	sessionSnapshotJson,
} from "../src/session-contract.js";

type Json = Record<string, unknown>;

/** A well-formed envelope carrying whichever command the caller names. */
const envelope = (command: Json, patch: Json = {}): Json => ({
	schemaVersion: SESSION_COMMAND_SCHEMA,
	commandId: "cmd-1",
	actorId: "actor-1",
	sessionId: "sess-1",
	expectedRevision: "3",
	...command,
	...patch,
});

const parseCmd = (command: Json, patch: Json = {}) =>
	// SAFETY: the fixture is the JSON shape the parser reads.
	parseSessionCommand(envelope(command, patch) as never);

/** The smallest snapshot that satisfies every rule, as a fresh object each call. */
const baseSnapshot = (): Json => ({
	schemaVersion: SESSION_SNAPSHOT_SCHEMA,
	revision: "7",
	session: {
		id: "sess-1",
		name: "work",
		projectRoot: "/repo",
		worktreePath: "/repo/.worktrees/work",
		branch: "feature",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		closeOnMerge: true,
		lifecycleState: "SESSION_LIFECYCLE_STATE_RUNNING",
	},
	tabs: [{ id: "tab-1", sessionId: "sess-1", title: "main", position: 0 }],
	panes: [
		{
			id: "pane-1",
			sessionId: "sess-1",
			tabId: "tab-1",
			title: "shell",
			runtimeId: "rt-1",
			workingDirectory: "/repo",
			lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
		},
	],
	agentRuns: [],
	checkpoints: [],
	gitState: {
		worktreePath: "/repo/.worktrees/work",
		branch: "feature",
		headSha: "abc",
		baseSha: "def",
		dirty: false,
		ahead: 0,
		behind: 0,
	},
	deliveryState: {
		remote: "origin",
		lifecycleState: "DELIVERY_LIFECYCLE_STATE_IDLE",
	},
	focusedTabId: "tab-1",
	focusedPaneId: "pane-1",
	attachedClientIds: [],
	capturedAt: "2026-01-01T00:00:00Z",
});

/**
 * Apply a patch, where `undefined` means *remove the key*.
 *
 * `fromJson` treats an explicitly-`undefined` key as a malformed value rather
 * than an absent one, so a fixture that means "this field is missing" has to
 * actually omit it.
 */
function patched(base: Json, patch: Json): Json {
	const out: Json = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete out[key];
		else out[key] = value;
	}
	return out;
}

const snapshot = (patch: Json = {}): Json => patched(baseSnapshot(), patch);

const parseSnap = (patch: Json = {}) =>
	// SAFETY: the fixture is the JSON shape the parser reads.
	parseSessionSnapshot(snapshot(patch) as never);

/** Replace one field inside the nested `session` record. */
const withSession = (patch: Json) => ({
	session: { ...(snapshot().session as Json), ...patch },
});

describe("the command envelope", () => {
	const create = {
		createSession: {
			name: "work",
			projectRoot: "/repo",
			branch: "feature",
			clientId: "client-1",
		},
	};

	it("accepts a well-formed command", () => {
		expect(parseCmd(create).commandId).toBe("cmd-1");
	});

	it("keeps the command it parsed", () => {
		expect(parseCmd(create).command.case).toBe("createSession");
	});

	it("refuses a schema version it does not know", () => {
		// Clients pin the version at this boundary; accepting an unknown one
		// would apply this version's rules to another version's fields.
		expect(() => parseCmd(create, { schemaVersion: "v2" })).toThrow(
			/schemaVersion/u,
		);
	});

	it.each([
		"commandId",
		"actorId",
		"sessionId",
	])("refuses an empty %s", (field) => {
		expect(() => parseCmd(create, { [field]: "" })).toThrow(
			new RegExp(field, "u"),
		);
	});

	it("refuses an envelope with no command at all", () => {
		expect(() => parseCmd({})).toThrow(/command must be specified/u);
	});

	it("accepts revision zero as a real expectation", () => {
		// Zero is "I expect this stream to be empty" -- a legitimate and
		// important thing for a create to say.
		expect(parseCmd(create, { expectedRevision: "0" })).toBeDefined();
	});
});

describe("each command's own rules", () => {
	it.each([
		["name", { name: "" }],
		["projectRoot", { projectRoot: "" }],
		["branch", { branch: "" }],
		["clientId", { clientId: "" }],
	])("refuses a createSession with an empty %s", (field, patch) => {
		expect(() =>
			parseCmd({
				createSession: {
					name: "w",
					projectRoot: "/r",
					branch: "b",
					clientId: "c",
					...patch,
				},
			}),
		).toThrow(new RegExp(field, "u"));
	});

	it.each([
		"detachSession",
		"reattachSession",
	])("refuses a %s with no client", (kind) => {
		// The client id is who is attaching; without it the command cannot
		// name whose attachment changed.
		expect(() => parseCmd({ [kind]: { clientId: "" } })).toThrow(/clientId/u);
	});

	it.each([
		"focusPane",
		"closePane",
		"sendInput",
	])("refuses a %s with no pane", (kind) => {
		expect(() => parseCmd({ [kind]: { paneId: "" } })).toThrow(/paneId/u);
	});

	it.each([
		"focusPane",
		"closePane",
		"sendInput",
	])("accepts a %s naming a pane", (kind) => {
		expect(parseCmd({ [kind]: { paneId: "pane-1" } })).toBeDefined();
	});

	it("refuses an untitled tab", () => {
		expect(() => parseCmd({ createTab: { title: "" } })).toThrow(/title/u);
	});

	it("accepts a titled tab", () => {
		expect(parseCmd({ createTab: { title: "main" } })).toBeDefined();
	});

	it("refuses a pane with no tab", () => {
		expect(() =>
			parseCmd({ createPane: { tabId: "", title: "t", command: ["sh"] } }),
		).toThrow(/tabId/u);
	});

	it("refuses a pane whose command has an empty word", () => {
		// An empty argv entry becomes an empty argument at exec time, which is
		// a different command from the one that was asked for.
		expect(() =>
			parseCmd({
				createPane: { tabId: "tab-1", title: "t", command: ["sh", ""] },
			}),
		).toThrow(/command entries/u);
	});

	it("accepts a pane with no command at all", () => {
		// An empty argv is "use the default shell"; only a *blank word* inside
		// one is malformed.
		expect(
			parseCmd({ createPane: { tabId: "tab-1", title: "t", command: [] } }),
		).toBeDefined();
	});

	it.each(["horizontal", "vertical"])("accepts a %s split", (direction) => {
		expect(
			parseCmd({
				splitPane: {
					paneId: "pane-1",
					title: "t",
					direction,
					command: ["sh"],
				},
			}),
		).toBeDefined();
	});

	it("refuses a split in any other direction", () => {
		// The renderer has two layouts. A third value would reach it as neither.
		expect(() =>
			parseCmd({
				splitPane: {
					paneId: "pane-1",
					title: "t",
					direction: "diagonal",
					command: [],
				},
			}),
		).toThrow(/horizontal or vertical/u);
	});

	it("refuses a split with no direction", () => {
		expect(() =>
			parseCmd({
				splitPane: { paneId: "pane-1", title: "t", command: [] },
			}),
		).toThrow(/horizontal or vertical/u);
	});

	it("refuses a split with an empty command word", () => {
		expect(() =>
			parseCmd({
				splitPane: {
					paneId: "pane-1",
					title: "t",
					direction: "vertical",
					command: [""],
				},
			}),
		).toThrow(/command entries/u);
	});

	it("refuses an agent with no command", () => {
		// Unlike a pane, an agent has no default to fall back to: the command
		// *is* the agent.
		expect(() =>
			parseCmd({
				startAgent: { paneId: "pane-1", provider: "claude", command: [] },
			}),
		).toThrow(/must not be empty/u);
	});

	it("refuses an agent with no provider", () => {
		expect(() =>
			parseCmd({
				startAgent: { paneId: "pane-1", provider: "", command: ["claude"] },
			}),
		).toThrow(/provider/u);
	});

	it("accepts a well-formed agent start", () => {
		expect(
			parseCmd({
				startAgent: { paneId: "pane-1", provider: "claude", command: ["c"] },
			}),
		).toBeDefined();
	});

	it("refuses a stopAgent with no run", () => {
		expect(() => parseCmd({ stopAgent: { agentRunId: "" } })).toThrow(
			/agentRunId/u,
		);
	});

	it("refuses a restore with no checkpoint", () => {
		expect(() => parseCmd({ restoreCheckpoint: { checkpointId: "" } })).toThrow(
			/checkpointId/u,
		);
	});

	it("refuses an empty commit message", () => {
		expect(() => parseCmd({ commit: { message: "" } })).toThrow(/message/u);
	});

	it.each([
		"stagePaths",
		"unstagePaths",
	])("refuses a %s with no paths", (kind) => {
		// Staging nothing is not a no-op the caller meant; it is a command
		// that lost its argument on the way here.
		expect(() => parseCmd({ [kind]: { paths: [] } })).toThrow(
			/must not be empty/u,
		);
	});

	it.each([
		"stagePaths",
		"unstagePaths",
	])("refuses a %s with an empty path", (kind) => {
		expect(() => parseCmd({ [kind]: { paths: ["a", ""] } })).toThrow(
			/entries must not be empty/u,
		);
	});

	it("refuses a push with no remote", () => {
		expect(() => parseCmd({ push: { remote: "" } })).toThrow(/remote/u);
	});

	it("refuses an untitled pull request", () => {
		expect(() =>
			parseCmd({ openPullRequest: { title: "", draft: false } }),
		).toThrow(/title/u);
	});

	it("accepts an explicitly non-draft pull request", () => {
		expect(
			parseCmd({ openPullRequest: { title: "t", draft: false } }),
		).toBeDefined();
	});

	it("accepts a draft pull request", () => {
		expect(
			parseCmd({ openPullRequest: { title: "t", draft: true } }),
		).toBeDefined();
	});

	it("refuses a stacked pull request with no parent branch", () => {
		// A stacked PR's parent is what makes it stacked; without it the PR
		// would open against the default branch instead.
		expect(() =>
			parseCmd({ stackPullRequest: { parentBranch: "", title: "t" } }),
		).toThrow(/parentBranch/u);
	});

	it("refuses an untitled stacked pull request", () => {
		expect(() =>
			parseCmd({ stackPullRequest: { parentBranch: "main", title: "" } }),
		).toThrow(/title/u);
	});

	it("refuses merging pull request zero", () => {
		// Zero is the absent bigint. Merging it would resolve to whatever the
		// API does with a missing number, which is not a decision to delegate.
		expect(() =>
			parseCmd({ mergePullRequest: { pullRequestNumber: "0" } }),
		).toThrow(/must be positive/u);
	});

	it("accepts merging a real pull request", () => {
		expect(
			parseCmd({ mergePullRequest: { pullRequestNumber: "42" } }),
		).toBeDefined();
	});

	it.each([
		true,
		false,
	])("accepts a stopSession that states removeWorktree=%s", (removeWorktree) => {
		expect(parseCmd({ stopSession: { removeWorktree } })).toBeDefined();
	});

	it("refuses an unlabelled checkpoint", () => {
		// A checkpoint is chosen from a list later; an unlabelled one is a row
		// nobody can identify.
		expect(() => parseCmd({ createCheckpoint: { label: "" } })).toThrow(
			/label/u,
		);
	});

	it("accepts a labelled checkpoint", () => {
		expect(parseCmd({ createCheckpoint: { label: "before" } })).toBeDefined();
	});
});

describe("the snapshot envelope", () => {
	it("accepts a well-formed snapshot", () => {
		expect(parseSnap().session?.id).toBe("sess-1");
	});

	it("refuses a schema version it does not know", () => {
		expect(() => parseSnap({ schemaVersion: "v2" })).toThrow(/schemaVersion/u);
	});

	it("refuses a snapshot with no session", () => {
		expect(() => parseSnap({ session: undefined })).toThrow(
			/session must be specified/u,
		);
	});

	it("accepts revision zero", () => {
		expect(parseSnap({ revision: "0" })).toBeDefined();
	});

	it("refuses an empty capturedAt", () => {
		// When the snapshot was taken is how a reader knows whether it is
		// still true.
		expect(() => parseSnap({ capturedAt: "" })).toThrow(/capturedAt/u);
	});
});

describe("the session record", () => {
	it.each([
		"id",
		"name",
		"projectRoot",
		"worktreePath",
		"branch",
		"createdAt",
		"updatedAt",
	])("refuses an empty session.%s", (field) => {
		// Emptiness, not presence: proto3 gives an absent scalar and an empty
		// one the same representation, so a branch of `""` is not a default --
		// it is no branch.
		expect(() =>
			parseSessionSnapshot(
				// SAFETY: the fixture is the JSON shape the parser reads.
				snapshot({
					...withSession({ [field]: "" }),
					...(field === "id"
						? { tabs: [], panes: [], focusedTabId: "", focusedPaneId: "" }
						: undefined),
				}) as never,
			),
		).toThrow(new RegExp(field, "u"));
	});

	it("refuses an unrecognised lifecycle state", () => {
		expect(() =>
			parseSessionSnapshot(
				// SAFETY: the fixture is the JSON shape the parser reads.
				snapshot(withSession({ lifecycleState: 99 })) as never,
			),
		).toThrow(/lifecycleState/u);
	});

	it.each([
		"SESSION_LIFECYCLE_STATE_STARTING",
		"SESSION_LIFECYCLE_STATE_RUNNING",
		"SESSION_LIFECYCLE_STATE_STOPPING",
		"SESSION_LIFECYCLE_STATE_STOPPED",
		"SESSION_LIFECYCLE_STATE_FAILED",
	])("accepts %s", (lifecycleState) => {
		expect(
			parseSessionSnapshot(
				// SAFETY: the fixture is the JSON shape the parser reads.
				snapshot(withSession({ lifecycleState })) as never,
			),
		).toBeDefined();
	});
});

describe("tabs", () => {
	it("refuses a tab with no id", () => {
		expect(() =>
			parseSnap({
				tabs: [{ id: "", sessionId: "sess-1", title: "t", position: 0 }],
				panes: [],
				focusedTabId: "",
				focusedPaneId: "",
			}),
		).toThrow(/tabs\[\]\.id/u);
	});

	it("refuses two tabs with the same id", () => {
		// The later row wins wherever a reader keys by id, and nothing reports
		// the one it replaced.
		expect(() =>
			parseSnap({
				tabs: [
					{ id: "tab-1", sessionId: "sess-1", title: "a", position: 0 },
					{ id: "tab-1", sessionId: "sess-1", title: "b", position: 1 },
				],
			}),
		).toThrow(/must be unique/u);
	});

	it("refuses an untitled tab", () => {
		expect(() =>
			parseSnap({
				tabs: [{ id: "tab-1", sessionId: "sess-1", title: "", position: 0 }],
			}),
		).toThrow(/tabs\[\]\.title/u);
	});

	it("refuses a tab belonging to another session", () => {
		expect(() =>
			parseSnap({
				tabs: [{ id: "tab-1", sessionId: "other", title: "t", position: 0 }],
			}),
		).toThrow(/must match session\.id/u);
	});

	it("cannot represent a session with no tabs at all", () => {
		// FINDING, pinned rather than changed: `focusedTabId` and
		// `focusedPaneId` are required non-empty unconditionally, so a session
		// between "created" and "first tab opened" has no valid snapshot -- the
		// empty focus is refused before the empty tab list is ever considered.
		// Whether that state should be representable is a contract decision,
		// not a test's to make; this records that today it is not.
		expect(() =>
			parseSnap({
				tabs: [],
				panes: [],
				focusedTabId: "",
				focusedPaneId: "",
			}),
		).toThrow(/focusedTabId must not be empty/u);
	});
});

describe("panes", () => {
	const pane = (patch: Json = {}) => ({
		id: "pane-1",
		sessionId: "sess-1",
		tabId: "tab-1",
		title: "shell",
		runtimeId: "rt-1",
		workingDirectory: "/repo",
		lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
		...patch,
	});

	it.each([
		"title",
		"runtimeId",
		"workingDirectory",
	])("refuses a pane with an empty %s", (field) => {
		expect(() => parseSnap({ panes: [pane({ [field]: "" })] })).toThrow(
			new RegExp(field, "u"),
		);
	});

	it("refuses two panes with the same id", () => {
		expect(() =>
			parseSnap({ panes: [pane(), pane({ title: "other" })] }),
		).toThrow(/panes\[\]\.id must be unique/u);
	});

	it("refuses a pane on a tab that does not exist", () => {
		// Protobuf sees four independent lists; this is the graph it cannot
		// check, and a pane on a missing tab renders as a pane nobody can find.
		expect(() =>
			parseSnap({
				panes: [pane({ tabId: "tab-nope" })],
				focusedPaneId: "pane-1",
			}),
		).toThrow(/must reference a tab/u);
	});

	it("refuses a pane belonging to another session", () => {
		expect(() => parseSnap({ panes: [pane({ sessionId: "other" })] })).toThrow(
			/panes\[\]\.sessionId/u,
		);
	});

	it("refuses an unrecognised pane lifecycle state", () => {
		expect(() => parseSnap({ panes: [pane({ lifecycleState: 99 })] })).toThrow(
			/panes\[\]\.lifecycleState/u,
		);
	});

	it("refuses a pane whose agent run does not exist", () => {
		expect(() =>
			parseSnap({ panes: [pane({ agentRunId: "run-nope" })] }),
		).toThrow(/must reference an agent run/u);
	});
});

describe("agent runs", () => {
	const run = (patch: Json = {}) => ({
		id: "run-1",
		sessionId: "sess-1",
		paneId: "pane-1",
		provider: "claude",
		startedAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		terminalOnly: false,
		lifecycleState: "AGENT_LIFECYCLE_STATE_WORKING",
		...patch,
	});

	it("accepts a run on a pane that exists", () => {
		expect(parseSnap({ agentRuns: [run()] })).toBeDefined();
	});

	it.each([
		"provider",
		"startedAt",
		"updatedAt",
	])("refuses a run with an empty %s", (field) => {
		expect(() => parseSnap({ agentRuns: [run({ [field]: "" })] })).toThrow(
			new RegExp(field, "u"),
		);
	});

	it("refuses two runs with the same id", () => {
		expect(() =>
			parseSnap({ agentRuns: [run(), run({ provider: "codex" })] }),
		).toThrow(/agentRuns\[\]\.id must be unique/u);
	});

	it("refuses a run on a pane that does not exist", () => {
		expect(() =>
			parseSnap({ agentRuns: [run({ paneId: "pane-nope" })] }),
		).toThrow(/must reference this session and a pane/u);
	});

	it("refuses a run belonging to another session", () => {
		expect(() =>
			parseSnap({ agentRuns: [run({ sessionId: "other" })] }),
		).toThrow(/must reference this session and a pane/u);
	});

	it("refuses an unrecognised agent lifecycle state", () => {
		expect(() =>
			parseSnap({ agentRuns: [run({ lifecycleState: 99 })] }),
		).toThrow(/agentRuns\[\]\.lifecycleState/u);
	});

	it("links a pane to the run it is actually on", () => {
		expect(
			parseSnap({
				panes: [
					{
						id: "pane-1",
						sessionId: "sess-1",
						tabId: "tab-1",
						title: "shell",
						runtimeId: "rt-1",
						workingDirectory: "/repo",
						agentRunId: "run-1",
						lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
					},
				],
				agentRuns: [run()],
			}),
		).toBeDefined();
	});

	it("refuses a pane claiming a run that is on another pane", () => {
		// The link is bidirectional and has to agree in both directions, or the
		// UI shows one agent in two places.
		expect(() =>
			parseSnap({
				tabs: [{ id: "tab-1", sessionId: "sess-1", title: "t", position: 0 }],
				panes: [
					{
						id: "pane-1",
						sessionId: "sess-1",
						tabId: "tab-1",
						title: "a",
						runtimeId: "rt-1",
						workingDirectory: "/repo",
						agentRunId: "run-1",
						lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
					},
					{
						id: "pane-2",
						sessionId: "sess-1",
						tabId: "tab-1",
						title: "b",
						runtimeId: "rt-2",
						workingDirectory: "/repo",
						lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
					},
				],
				agentRuns: [run({ paneId: "pane-2" })],
			}),
		).toThrow(/must reference its own pane/u);
	});
});

describe("checkpoints", () => {
	const checkpoint = (patch: Json = {}) => ({
		id: "cp-1",
		sessionId: "sess-1",
		gitCommit: "abc123",
		createdAt: "2026-01-01T00:00:00Z",
		lifecycleState: "CHECKPOINT_LIFECYCLE_STATE_CREATED",
		...patch,
	});

	it("accepts a well-formed checkpoint", () => {
		expect(parseSnap({ checkpoints: [checkpoint()] })).toBeDefined();
	});

	it.each([
		"id",
		"gitCommit",
		"createdAt",
	])("refuses a checkpoint with an empty %s", (field) => {
		expect(() =>
			parseSnap({ checkpoints: [checkpoint({ [field]: "" })] }),
		).toThrow(new RegExp(field, "u"));
	});

	it("refuses two checkpoints with the same id", () => {
		// A restore picks by id; two rows with one id is a restore that may
		// land on either.
		expect(() =>
			parseSnap({
				checkpoints: [checkpoint(), checkpoint({ gitCommit: "def" })],
			}),
		).toThrow(/checkpoints\[\]\.id must be unique/u);
	});

	it("refuses a checkpoint from another session", () => {
		expect(() =>
			parseSnap({ checkpoints: [checkpoint({ sessionId: "other" })] }),
		).toThrow(/checkpoints\[\]\.sessionId/u);
	});

	it("refuses an unrecognised checkpoint lifecycle state", () => {
		expect(() =>
			parseSnap({ checkpoints: [checkpoint({ lifecycleState: 99 })] }),
		).toThrow(/checkpoints\[\]\.lifecycleState/u);
	});
});

describe("git state", () => {
	const git = (patch: Json = {}) => ({
		gitState: { ...(snapshot().gitState as Json), ...patch },
	});

	it("refuses a snapshot with none", () => {
		expect(() => parseSnap({ gitState: undefined })).toThrow(
			/gitState must be specified/u,
		);
	});

	it.each([
		"worktreePath",
		"branch",
		"headSha",
		"baseSha",
	])("refuses an empty gitState.%s", (field) => {
		expect(() => parseSnap(git({ [field]: "" }))).toThrow(
			new RegExp(field, "u"),
		);
	});

	it("accepts a clean tree that is level with its base", () => {
		expect(parseSnap(git({ dirty: false, ahead: 0, behind: 0 }))).toBeDefined();
	});

	it("accepts a dirty tree that is ahead and behind", () => {
		expect(parseSnap(git({ dirty: true, ahead: 3, behind: 2 }))).toBeDefined();
	});
});

describe("delivery state", () => {
	const delivery = (patch: Json = {}) => ({
		deliveryState: { ...(snapshot().deliveryState as Json), ...patch },
	});

	it("refuses a snapshot with none", () => {
		expect(() => parseSnap({ deliveryState: undefined })).toThrow(
			/deliveryState must be specified/u,
		);
	});

	it("refuses an empty remote", () => {
		expect(() => parseSnap(delivery({ remote: "" }))).toThrow(
			/deliveryState\.remote/u,
		);
	});

	it("refuses pull request zero", () => {
		// Zero is the absent bigint, and a delivery state that names PR 0 is
		// one whose number was lost rather than one with no PR.
		expect(() => parseSnap(delivery({ pullRequestNumber: "0" }))).toThrow(
			/must be positive/u,
		);
	});

	it("accepts a real pull request number", () => {
		expect(parseSnap(delivery({ pullRequestNumber: "12" }))).toBeDefined();
	});

	it("refuses an empty pull request url when one is given", () => {
		// Optional-but-not-empty: absent means "no PR yet", `""` means a URL
		// went missing on the way here.
		expect(() => parseSnap(delivery({ pullRequestUrl: "" }))).toThrow(
			/pullRequestUrl/u,
		);
	});

	it("refuses an empty stack parent branch when one is given", () => {
		expect(() => parseSnap(delivery({ stackParentBranch: "" }))).toThrow(
			/stackParentBranch/u,
		);
	});

	it("refuses an unrecognised delivery lifecycle state", () => {
		expect(() => parseSnap(delivery({ lifecycleState: 99 }))).toThrow(
			/deliveryState\.lifecycleState/u,
		);
	});

	it.each([
		"DELIVERY_LIFECYCLE_STATE_READY",
		"DELIVERY_LIFECYCLE_STATE_PUSHING",
		"DELIVERY_LIFECYCLE_STATE_PULL_REQUEST_OPEN",
		"DELIVERY_LIFECYCLE_STATE_MERGING",
		"DELIVERY_LIFECYCLE_STATE_MERGED",
		"DELIVERY_LIFECYCLE_STATE_FAILED",
	])("accepts %s", (lifecycleState) => {
		expect(parseSnap(delivery({ lifecycleState }))).toBeDefined();
	});
});

describe("focus", () => {
	it("refuses an empty focused tab", () => {
		expect(() => parseSnap({ focusedTabId: "" })).toThrow(/focusedTabId/u);
	});

	it("refuses an empty focused pane", () => {
		expect(() => parseSnap({ focusedPaneId: "" })).toThrow(/focusedPaneId/u);
	});

	it("refuses a focused tab that does not exist", () => {
		expect(() => parseSnap({ focusedTabId: "tab-nope" })).toThrow(
			/focused pane must belong/u,
		);
	});

	it("refuses a focused pane that does not exist", () => {
		expect(() => parseSnap({ focusedPaneId: "pane-nope" })).toThrow(
			/focused pane must belong/u,
		);
	});

	it("refuses a focused pane that is on a different tab", () => {
		// Focus is one position, not two independent ones; a pane focused on a
		// tab it is not on is a cursor pointing at nothing.
		expect(() =>
			parseSnap({
				tabs: [
					{ id: "tab-1", sessionId: "sess-1", title: "a", position: 0 },
					{ id: "tab-2", sessionId: "sess-1", title: "b", position: 1 },
				],
				focusedTabId: "tab-2",
			}),
		).toThrow(/focused pane must belong/u);
	});
});

describe("attached clients", () => {
	it("accepts a snapshot with none", () => {
		expect(parseSnap({ attachedClientIds: [] })).toBeDefined();
	});

	it("accepts named clients", () => {
		expect(
			parseSnap({ attachedClientIds: ["client-1", "client-2"] }),
		).toBeDefined();
	});

	it("refuses an empty client id", () => {
		// An unnamed attachment cannot be detached later.
		expect(() => parseSnap({ attachedClientIds: [""] })).toThrow(
			/attachedClientIds/u,
		);
	});
});

describe("serialising a snapshot back to json", () => {
	it("round-trips through the parser", () => {
		expect(
			// SAFETY: the serialiser's output is the JSON shape the parser reads.
			parseSessionSnapshot(sessionSnapshotJson(parseSnap()) as never),
		).toBeDefined();
	});

	it("emits implicit fields rather than omitting them", () => {
		// A reader keying off presence would see a clean tree and an absent
		// `dirty` as different things; emitting implicits keeps every field
		// on the wire so absence never has to be interpreted.
		const json = sessionSnapshotJson(parseSnap()) as Record<string, unknown>;
		expect(Object.keys(json)).toContain("attachedClientIds");
	});

	it("keeps the schema version on the way out", () => {
		const json = sessionSnapshotJson(parseSnap()) as Record<string, unknown>;
		expect(json.schemaVersion).toBe(SESSION_SNAPSHOT_SCHEMA);
	});
});
