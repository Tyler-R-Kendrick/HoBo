/**
 * Claimed work lives under the subagent that took it.
 * Each claim gets its own rift/worktree branch and a stacked, squash-only
 * delivery policy (incremental checkins → gh stack → squash-merge).
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createIsolationContext } from "./isolation.js";
import { isJsonString } from "./json.js";
import type { IsolationKind } from "./types.js";

export interface ClaimableTask {
	readonly id: string;
}

// public-contract: claimed-work record schema id the Agents board pins
export const WORK_CLAIM_SCHEMA = "hobo.code.work-claim/v1" as const;

export const CLAIMED_WORK_DELIVERY = {
	checkins: "incremental",
	pullRequests: "stacked",
	merge: "squash",
} as const;

export type ClaimedWorkDelivery = typeof CLAIMED_WORK_DELIVERY;

export interface WorkClaim {
	readonly schema: typeof WORK_CLAIM_SCHEMA;
	readonly taskId: string;
	readonly agentId: string;
	readonly runId: string;
	readonly branch: string;
	readonly rootPath: string;
	readonly isolation: IsolationKind;
	readonly delivery: ClaimedWorkDelivery;
	readonly claimedAt: string;
}

export interface AgentWorkGroup {
	readonly agentId: string;
	readonly tasks: readonly ClaimableTask[];
	readonly claims: readonly WorkClaim[];
}

export interface AgentWorkBoard<T extends ClaimableTask = ClaimableTask> {
	readonly schema: "hobo.code.agent-work/v1";
	readonly groups: readonly (Omit<AgentWorkGroup, "tasks"> & {
		readonly tasks: readonly T[];
	})[];
	readonly unclaimed: readonly T[];
}

export interface ClaimTaskInput {
	readonly hoboHome: string;
	readonly projectRoot: string;
	readonly agentId: string;
	readonly taskId: string;
	readonly forceWorktree?: boolean;
	readonly preferRift?: boolean;
	readonly riftAvailable?: () => boolean;
	readonly now?: () => string;
}

export function claimedWorkDeliveryPlan() {
	return {
		...CLAIMED_WORK_DELIVERY,
		commands: [
			"git add -A && git commit",
			"gh stack submit",
			"gh stack merge --yes --squash",
		],
	};
}

export function workClaimsDir(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "claims");
}

export function listWorkClaims(hoboHome: string): readonly WorkClaim[] {
	const dir = workClaimsDir(hoboHome);
	if (!existsSync(dir)) return [];
	const claims: WorkClaim[] = [];
	for (const name of readdirSync(dir).sort()) {
		if (!name.endsWith(".json")) continue;
		try {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const raw = JSON.parse(
				readFileSync(join(dir, name), "utf8"),
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
			) as Partial<WorkClaim>;
			const claim = parseWorkClaim(raw);
			if (claim) claims.push(claim);
		} catch {
			// skip corrupt claim files fail-closed
		}
	}
	return claims;
}

export function workspaceForAgent(
	hoboHome: string,
	agentId: string,
): string | undefined {
	return listWorkClaims(hoboHome).find((row) => row.agentId === agentId)
		?.rootPath;
}

export async function claimTaskForAgent(
	input: ClaimTaskInput,
): Promise<WorkClaim> {
	const agentSlug = slug(input.agentId);
	const taskSlug = slug(input.taskId);
	const runId = `claim-${agentSlug}-${taskSlug}`;
	const branch = `code/${agentSlug}/${taskSlug}`;
	const isolated = await createIsolationContext({
		projectRoot: input.projectRoot,
		hoboHome: input.hoboHome,
		runId,
		branch,
		...(input.forceWorktree !== undefined
			? { forceWorktree: input.forceWorktree }
			: undefined),
		...(input.preferRift !== undefined
			? { preferRift: input.preferRift }
			: undefined),
		...(input.riftAvailable !== undefined
			? { riftAvailable: input.riftAvailable }
			: undefined),
	});
	const claim: WorkClaim = {
		schema: WORK_CLAIM_SCHEMA,
		taskId: input.taskId,
		agentId: input.agentId,
		runId: isolated.runId,
		branch: isolated.branch,
		rootPath: isolated.rootPath,
		isolation: isolated.backend.kind,
		delivery: CLAIMED_WORK_DELIVERY,
		claimedAt: input.now?.() ?? new Date().toISOString(),
	};
	const dir = workClaimsDir(input.hoboHome);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${runId}.json`),
		`${JSON.stringify(claim, null, 2)}\n`,
		"utf8",
	);
	return claim;
}

export function groupTasksUnderAgents<T extends ClaimableTask>(input: {
	readonly agents: readonly { readonly agentId: string }[];
	readonly tasks: readonly T[];
	readonly claims: readonly WorkClaim[];
}): AgentWorkBoard<T> {
	const byTask = new Map(input.claims.map((claim) => [claim.taskId, claim]));
	const claimedIds = new Set(byTask.keys());
	const groups = input.agents.map((agent) => {
		const claims = input.claims.filter(
			(claim) => claim.agentId === agent.agentId,
		);
		const tasks = input.tasks.filter((row) => {
			const claim = byTask.get(row.id);
			return claim?.agentId === agent.agentId;
		});
		return { agentId: agent.agentId, tasks, claims };
	});
	return {
		schema: "hobo.code.agent-work/v1",
		groups,
		unclaimed: input.tasks.filter((row) => !claimedIds.has(row.id)),
	};
}

function parseWorkClaim(raw: Partial<WorkClaim>): WorkClaim | undefined {
	if (raw.schema !== WORK_CLAIM_SCHEMA) return undefined;
	if (!isJsonString(raw.taskId) || raw.taskId.length === 0) return undefined;
	if (!isJsonString(raw.agentId) || raw.agentId.length === 0) {
		return undefined;
	}
	if (!isJsonString(raw.runId) || !isJsonString(raw.branch)) {
		return undefined;
	}
	if (!isJsonString(raw.rootPath)) return undefined;
	if (raw.isolation !== "rift" && raw.isolation !== "worktree")
		return undefined;
	if (
		raw.delivery?.checkins !== "incremental" ||
		raw.delivery.pullRequests !== "stacked" ||
		raw.delivery.merge !== "squash"
	) {
		return undefined;
	}
	if (!isJsonString(raw.claimedAt)) return undefined;
	return {
		schema: WORK_CLAIM_SCHEMA,
		taskId: raw.taskId,
		agentId: raw.agentId,
		runId: raw.runId,
		branch: raw.branch,
		rootPath: raw.rootPath,
		isolation: raw.isolation,
		delivery: CLAIMED_WORK_DELIVERY,
		claimedAt: raw.claimedAt,
	};
}

function slug(value: string): string {
	const next = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 40);
	return next.length > 0 ? next : "work";
}
