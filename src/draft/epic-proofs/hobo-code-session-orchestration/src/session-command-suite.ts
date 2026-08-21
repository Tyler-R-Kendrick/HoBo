import { parseSessionCommand } from "@hobo/code";

const bodies = {
  createSession: { name: "task", projectRoot: "/repo", branch: "code/task", clientId: "client" },
  detachSession: { clientId: "client" },
  reattachSession: { clientId: "client" },
  focusPane: { paneId: "pane-1" },
  stopSession: { removeWorktree: false },
  createTab: { title: "review" },
  createPane: { tabId: "tab-1", title: "worker", command: [] },
  splitPane: { paneId: "pane-1", direction: "vertical", title: "worker", command: [] },
  closePane: { paneId: "pane-1" },
  sendInput: { paneId: "pane-1", input: "status\n" },
  startAgent: { paneId: "pane-1", provider: "codex", command: ["codex"], prompt: "review" },
  stopAgent: { agentRunId: "agent-1" },
  createCheckpoint: { label: "green" },
  restoreCheckpoint: { checkpointId: "checkpoint-1" },
  commit: { message: "feat: resident sessions" },
  push: { remote: "origin" },
  openPullRequest: { title: "Resident sessions", body: "", draft: false },
  stackPullRequest: { parentBranch: "main", title: "Resident sessions", body: "" },
  mergePullRequest: { pullRequestNumber: "1" }
} as const;

export const REQUIRED_SESSION_COMMANDS = Object.freeze(Object.keys(bodies));

export function parseRequiredSessionCommands(): readonly string[] {
  return REQUIRED_SESSION_COMMANDS.map((name, index) =>
    parseSessionCommand({
      schemaVersion: "hobo.code.session-command/v1",
      commandId: `proof-${index}`,
      actorId: "proof",
      sessionId: "session-1",
      expectedRevision: "0",
      // SAFETY: assertion to `name as keyof typeof bodies` is required at this boundary.
      [name]: bodies[name as keyof typeof bodies]
    }).command.case
  ).filter((name): name is string => name !== undefined);
}
