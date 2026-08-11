import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	parseSessionCommand,
	parseSessionSnapshot,
	sessionSnapshotJson,
} from "../src/session-contract.js";

import { verifySessionControlPlanePact } from "./fixtures/session-control-plane-provider.js";

const pactPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"contracts",
	"pacts",
	"code-harness-boundary.pact.json",
);

describe("SessionControlPlane boundary pact", () => {
	it("parses a versioned command once at the trust boundary", () => {
		const command = parseSessionCommand({
			schemaVersion: "hobo.code.session-command/v1",
			commandId: "command-1",
			actorId: "client-1",
			sessionId: "session-1",
			expectedRevision: "0",
			createTab: { title: "review" },
		});

		expect(command.command.case).toBe("createTab");
		expect(() =>
			parseSessionCommand({
				schemaVersion: "hobo.code.session-command/v1",
				commandId: "command-2",
				actorId: "client-1",
				sessionId: "session-1",
				expectedRevision: "0",
			}),
		).toThrow("command must be specified");
		expect(() =>
			parseSessionCommand({
				schemaVersion: "hobo.code.session-command/v1",
				commandId: "command-3",
				actorId: "client-1",
				sessionId: "session-1",
				createTab: { title: "review" },
			}),
		).toThrow("expectedRevision must be specified");
	});

	it("parses a complete snapshot and rejects defaulted required state", () => {
		const input = {
			schemaVersion: "hobo.code.session-snapshot/v1",
			session: {
				id: "session-1",
				name: "review",
				projectRoot: "/repo",
				worktreePath: "/repo-worktree",
				branch: "code/review",
				lifecycleState: "SESSION_LIFECYCLE_STATE_RUNNING",
				createdAt: "2026-08-10T00:00:00Z",
				updatedAt: "2026-08-10T00:00:00Z",
				closeOnMerge: false,
			},
			tabs: [{ id: "tab-1", sessionId: "session-1", title: "main", position: 0 }],
			panes: [{
				id: "pane-1",
				sessionId: "session-1",
				tabId: "tab-1",
				title: "agent",
				lifecycleState: "PANE_LIFECYCLE_STATE_RUNNING",
				runtimeId: "%1",
				workingDirectory: "/repo-worktree",
			}],
			agentRuns: [],
			checkpoints: [],
			gitState: {
				worktreePath: "/repo-worktree",
				branch: "code/review",
				headSha: "abc",
				baseSha: "def",
				dirty: false,
				ahead: 0,
				behind: 0,
				stagedPaths: [],
				unstagedPaths: [],
				untrackedPaths: [],
			},
			deliveryState: {
				lifecycleState: "DELIVERY_LIFECYCLE_STATE_IDLE",
				remote: "origin",
				message: "",
			},
			focusedTabId: "tab-1",
			focusedPaneId: "pane-1",
			attachedClientIds: ["client-1"],
			revision: "0",
			capturedAt: "2026-08-10T00:00:00Z",
		};
		const snapshot = parseSessionSnapshot(input);
		expect(sessionSnapshotJson(snapshot)).toMatchObject({
			session: { lifecycleState: "SESSION_LIFECYCLE_STATE_RUNNING" },
			revision: "0",
		});
		const { gitState: omitted, ...withoutGitState } = input;
		void omitted;
		expect(() => parseSessionSnapshot(withoutGitState)).toThrow(
			"gitState must be specified",
		);
		const { revision: omittedRevision, ...withoutRevision } = input;
		void omittedRevision;
		expect(() => parseSessionSnapshot(withoutRevision)).toThrow(
			"revision must be specified",
		);
		const { dirty: omittedDirty, ...withoutDirty } = input.gitState;
		void omittedDirty;
		expect(() =>
			parseSessionSnapshot({ ...input, gitState: withoutDirty }),
		).toThrow("gitState.dirty must be specified");
		expect(() =>
			parseSessionSnapshot({
				...input,
				session: { ...input.session, lifecycleState: "running" },
			}),
		).toThrow();
		expect(() =>
			parseSessionSnapshot({
				...input,
				session: { ...input.session, lifecycleState: 999 },
			}),
		).toThrow("session.lifecycleState is not a recognized lifecycle state");
		for (const deliveryState of [
			{ ...input.deliveryState, pullRequestNumber: "0" },
			{ ...input.deliveryState, pullRequestUrl: "" },
			{ ...input.deliveryState, stackParentBranch: "" },
		]) {
			expect(() => parseSessionSnapshot({ ...input, deliveryState })).toThrow();
		}
		expect(() =>
			parseSessionSnapshot({
				...input,
				panes: [{ ...input.panes[0], agentRunId: "" }],
			}),
		).toThrow("panes[].agentRunId must not be empty");
		expect(() =>
			parseSessionSnapshot({
				...input,
				agentRuns: [{
					id: "agent-1",
					sessionId: "session-1",
					paneId: "pane-1",
					provider: "codex",
					providerSessionId: "",
					lifecycleState: "AGENT_LIFECYCLE_STATE_IDLE",
					startedAt: "2026-08-10T00:00:00Z",
					updatedAt: "2026-08-10T00:00:00Z",
					summary: "",
					terminalOnly: false,
				}],
			}),
		).toThrow("agentRuns[].providerSessionId must not be empty");
		expect(() =>
			parseSessionSnapshot({
				...input,
				tabs: [
					...input.tabs,
					{ id: "tab-2", sessionId: "session-1", title: "review", position: 1 },
				],
				focusedTabId: "tab-2",
			}),
		).toThrow("focused pane must belong to the focused tab");
	});

	it("executes isolation, promotion, and resident-session interactions", async () => {
		const pact = JSON.parse(readFileSync(pactPath, "utf8"));
		const result = await verifySessionControlPlanePact(pact);

		expect(result.consumer).toBe("@hobo/code");
		expect(result.provider).toBe("SessionControlPlane");
		expect(result.verifiedDescriptions).toEqual(
			expect.arrayContaining([
				"create isolation context with worktree fallback when rift unavailable",
				"cleanup leaves zero orphans and primary worktree clean",
				"promotion is gated and squash-only",
				"create a resident session with runtime-backed panes",
				"detach without stopping the resident session",
				"reattach to the durable session snapshot",
				"switch focus to another runtime-backed pane",
			]),
		);
		expect(result.snapshot.session.lifecycleState).toBe(
			"SESSION_LIFECYCLE_STATE_RUNNING",
		);
		expect(result.snapshot.attachedClientIds).toEqual(["client-2"]);
		expect(result.snapshot.focusedPaneId).toBe("pane-worker");
		expect(
			result.snapshot.panes.every((pane: { runtimeId?: string }) =>
				Boolean(pane.runtimeId),
			),
		).toBe(true);
	});
});
