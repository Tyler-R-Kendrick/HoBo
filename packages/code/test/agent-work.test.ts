import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CLAIMED_WORK_DELIVERY,
	claimedWorkDeliveryPlan,
	claimTaskForAgent,
	groupTasksUnderAgents,
	listWorkClaims,
	workspaceForAgent,
} from "../src/agent-work.js";
import type { TaskBoardRow } from "../src/grok-build-parity.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

function temp(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

function task(id: string, summary: string): TaskBoardRow {
	return {
		id,
		kind: "task",
		state: "claimed",
		summary,
		clickable: true,
	};
}

describe("claimed work under subagents", () => {
	it("groups tasks under the agent that claimed them", () => {
		const board = groupTasksUnderAgents({
			agents: [{ agentId: "implementer" }, { agentId: "reviewer" }],
			tasks: [
				task("task-login", "implement login"),
				task("task-review", "review login"),
				task("task-orphan", "unclaimed screenshot"),
			],
			claims: [
				{
					taskId: "task-login",
					agentId: "implementer",
					runId: "run-a",
					branch: "code/implementer/task-login",
					rootPath: "/tmp/a",
					isolation: "worktree",
					delivery: CLAIMED_WORK_DELIVERY,
					claimedAt: "2026-08-14T00:00:00.000Z",
				},
				{
					taskId: "task-review",
					agentId: "reviewer",
					runId: "run-b",
					branch: "code/reviewer/task-review",
					rootPath: "/tmp/b",
					isolation: "worktree",
					delivery: CLAIMED_WORK_DELIVERY,
					claimedAt: "2026-08-14T00:00:00.000Z",
				},
			],
		});
		expect(board.groups.map((row) => row.agentId)).toEqual([
			"implementer",
			"reviewer",
		]);
		expect(board.groups[0]?.tasks.map((row) => row.id)).toEqual(["task-login"]);
		expect(board.groups[1]?.tasks.map((row) => row.id)).toEqual([
			"task-review",
		]);
		expect(board.unclaimed.map((row) => row.id)).toEqual(["task-orphan"]);
	});

	it("gives a claiming subagent its own worktree branch and stacked squash policy", async () => {
		const home = temp("hobo-claim-home-");
		const project = temp("hobo-claim-proj-");
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(join(project, "README.md"), "proj\n");
		const claim = await claimTaskForAgent({
			hoboHome: home,
			projectRoot: project,
			agentId: "implementer",
			taskId: "task-login",
			forceWorktree: true,
		});
		expect(claim.agentId).toBe("implementer");
		expect(claim.taskId).toBe("task-login");
		expect(claim.isolation).toBe("worktree");
		expect(claim.branch).toMatch(/^code\/implementer\/task-login/);
		expect(claim.delivery).toEqual({
			checkins: "incremental",
			pullRequests: "stacked",
			merge: "squash",
		});
		expect(claim.rootPath).toContain(home);
		expect(listWorkClaims(home)).toEqual([claim]);
		expect(workspaceForAgent(home, "implementer")).toBe(claim.rootPath);
		const plan = claimedWorkDeliveryPlan();
		expect(plan.checkins).toBe("incremental");
		expect(plan.pullRequests).toBe("stacked");
		expect(plan.merge).toBe("squash");
		expect(plan.commands.join(" ")).toMatch(/gh stack submit/);
		expect(plan.commands.join(" ")).toMatch(/squash/);
	});

	it("keeps two claiming agents on separate trees", async () => {
		const home = temp("hobo-claim-two-");
		const project = temp("hobo-claim-two-proj-");
		writeFileSync(join(project, "README.md"), "proj\n");
		const left = await claimTaskForAgent({
			hoboHome: home,
			projectRoot: project,
			agentId: "implementer",
			taskId: "a",
			forceWorktree: true,
		});
		const right = await claimTaskForAgent({
			hoboHome: home,
			projectRoot: project,
			agentId: "reviewer",
			taskId: "b",
			forceWorktree: true,
		});
		expect(left.rootPath).not.toBe(right.rootPath);
		expect(left.branch).not.toBe(right.branch);
		expect(workspaceForAgent(home, "reviewer")).toBe(right.rootPath);
	});
});
