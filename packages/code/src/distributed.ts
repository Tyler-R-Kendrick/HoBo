/**
 * Distributed multi-node compute for hobo-code.
 *
 * Mechanism (not a product integration of any external hive/chat app):
 * - **Pool** = durable compute registry under HOBO_HOME
 * - **Nodes** = workers with capacity (local process, named-endpoint, MxC, OpenShell, …)
 * - **Tasks** dispatch to nodes with mediated isolation + durable handback
 *
 * Borrowed pattern: capacity-aware multi-node scheduling and isolation-class matrix
 * used by distributed GPU / remote-worker systems. No rooms, chat hive, or "buzz"
 * product surface.
 */
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { getNamedEndpoint, getNamedEndpointHost } from "@hobo/core";

import { cleanupIsolation, createIsolationContext } from "./isolation.js";
import type { IsolationContext } from "./types.js";

// public-contract: compute pool schema.
export const COMPUTE_POOL_SCHEMA = "hobo.code.compute.pool/v1" as const;
// public-contract: compute node schema.
export const COMPUTE_NODE_SCHEMA = "hobo.code.compute.node/v1" as const;
// public-contract: compute task schema.
export const COMPUTE_TASK_SCHEMA = "hobo.code.compute.task/v1" as const;

export type ComputeNodeClass =
	| "local-process"
	| "named-endpoint"
	| "mxc"
	| "openshell"
	| "worktree"
	| "rift";

export type ComputeNodeStatus = "online" | "draining" | "offline";
export type ComputeTaskStatus =
	| "queued"
	| "dispatched"
	| "running"
	| "done"
	| "failed"
	| "cancelled";

export interface ComputeNode {
	readonly nodeId: string;
	readonly class: ComputeNodeClass;
	readonly status: ComputeNodeStatus;
	readonly capacity: number;
	readonly running: number;
	readonly endpointHost?: string;
	readonly endpointUrl?: string;
	readonly stationId?: string;
	/** Optional hardware hints (e.g. gpu=1, device=cuda:0). */
	readonly labels: Readonly<Record<string, string>>;
	readonly updatedAt: string;
}

export interface ComputeTask {
	readonly schemaVersion: typeof COMPUTE_TASK_SCHEMA;
	readonly taskId: string;
	readonly prompt: string;
	readonly status: ComputeTaskStatus;
	readonly nodeId?: string;
	readonly isolationRunId?: string;
	readonly handbackPath?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly error?: string;
}

export interface ComputePool {
	readonly schemaVersion: typeof COMPUTE_POOL_SCHEMA;
	readonly poolId: string;
	readonly stationId: string;
	readonly root: string;
	readonly nodes: readonly ComputeNode[];
	readonly tasks: readonly ComputeTask[];
	readonly distributedEnabled: true;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OpenComputePoolOptions {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly poolId?: string;
	readonly autoRegisterLocalNode?: boolean;
	readonly tenant?: string;
}

function poolRoot(hoboHome: string, poolId: string): string {
	return join(hoboHome, "durable", "code", "compute", poolId);
}

/** Where a dispatched task's record lives, so a reply can point at it. */
export function computeTaskPath(
	hoboHome: string,
	poolId: string,
	taskId: string,
): string {
	return join(poolRoot(hoboHome, poolId), "tasks", `${taskId}.json`);
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function nowIso(): string {
	return new Date().toISOString();
}

function loadPoolState(root: string): {
	nodes: ComputeNode[];
	tasks: ComputeTask[];
	meta: { poolId: string; stationId: string; createdAt: string };
} {
	const meta = readJson<{
		poolId: string;
		stationId: string;
		createdAt: string;
	}>(join(root, "pool.json"));
	if (!meta) {
		throw new Error(`compute pool missing pool.json under ${root}`);
	}
	const list = <T>(dir: string): T[] => {
		const p = join(root, dir);
		if (!existsSync(p)) return [];
		return readdirSync(p)
			.filter((f) => f.endsWith(".json"))
			.map((f) => JSON.parse(readFileSync(join(p, f), "utf8")) as T);
	};
	return {
		meta,
		nodes: list<ComputeNode>("nodes"),
		tasks: list<ComputeTask>("tasks"),
	};
}

function snapshotPool(root: string): ComputePool {
	const state = loadPoolState(root);
	return Object.freeze({
		schemaVersion: COMPUTE_POOL_SCHEMA,
		poolId: state.meta.poolId,
		stationId: state.meta.stationId,
		root,
		nodes: Object.freeze([...state.nodes]),
		tasks: Object.freeze([...state.tasks]),
		distributedEnabled: true as const,
		createdAt: state.meta.createdAt,
		updatedAt: nowIso(),
	});
}

/**
 * Open or create a compute pool bound to a Station.
 * Local + named-endpoint nodes auto-register for multi-node dispatch.
 */
export function openComputePool(options: OpenComputePoolOptions): ComputePool {
	const poolId = options.poolId ?? "default";
	const root = poolRoot(options.hoboHome, poolId);
	mkdirSync(join(root, "nodes"), { recursive: true });
	mkdirSync(join(root, "tasks"), { recursive: true });

	const metaPath = join(root, "pool.json");
	if (!existsSync(metaPath)) {
		writeJson(metaPath, {
			schemaVersion: COMPUTE_POOL_SCHEMA,
			poolId,
			stationId: options.stationId,
			createdAt: nowIso(),
			distributedEnabled: true,
		});
	}

	if (options.autoRegisterLocalNode !== false) {
		registerComputeNode({
			hoboHome: options.hoboHome,
			poolId,
			node: {
				nodeId: `node-local-${options.stationId.replace(/[^a-z0-9-]/gi, "-")}`,
				class: "local-process",
				status: "online",
				capacity: 4,
				running: 0,
				stationId: options.stationId,
				labels: { kind: "local", pool: poolId },
			},
		});
		const host = getNamedEndpointHost({
			resource: "compute",
			app: "hobo-code",
			mode: "local",
			tenant: options.tenant ?? "local",
			project: poolId,
		});
		const url = getNamedEndpoint({
			resource: "compute",
			app: "hobo-code",
			mode: "local",
			tenant: options.tenant ?? "local",
			project: poolId,
		});
		registerComputeNode({
			hoboHome: options.hoboHome,
			poolId,
			node: {
				nodeId: "node-endpoint-remote",
				class: "named-endpoint",
				status: "online",
				capacity: 16,
				running: 0,
				endpointHost: host,
				endpointUrl: url,
				stationId: options.stationId,
				labels: {
					kind: "remote-ready",
					protocol: "named-endpoint",
					// Slot for GPU-class remote workers when labeled by operators.
					workload: "general",
				},
			},
		});
	}

	return snapshotPool(root);
}

export function registerComputeNode(input: {
	readonly hoboHome: string;
	readonly poolId: string;
	readonly node: Omit<ComputeNode, "updatedAt"> & { updatedAt?: string };
}): ComputeNode {
	const root = poolRoot(input.hoboHome, input.poolId);
	mkdirSync(join(root, "nodes"), { recursive: true });
	const node: ComputeNode = Object.freeze({
		...input.node,
		labels: Object.freeze({ ...input.node.labels }),
		updatedAt: input.node.updatedAt ?? nowIso(),
	});
	writeJson(join(root, "nodes", `${node.nodeId}.json`), node);
	return node;
}

function pickNode(
	nodes: readonly ComputeNode[],
	preferClass?: ComputeNodeClass,
	preferLabel?: { key: string; value: string },
): ComputeNode | null {
	let online = nodes.filter(
		(n) => n.status === "online" && n.running < n.capacity,
	);
	if (preferLabel) {
		const labeled = online.filter(
			(n) => n.labels[preferLabel.key] === preferLabel.value,
		);
		if (labeled.length > 0) online = labeled;
	}
	if (online.length === 0) return null;
	if (preferClass) {
		const preferred = online.find((n) => n.class === preferClass);
		if (preferred) return preferred;
	}
	return [...online].sort(
		(a, b) => b.capacity - b.running - (a.capacity - a.running),
	)[0]!;
}

export interface DispatchComputeTaskInput {
	readonly hoboHome: string;
	readonly poolId: string;
	readonly prompt: string;
	readonly projectRoot: string;
	readonly preferNodeClass?: ComputeNodeClass;
	/** e.g. { key: "gpu", value: "1" } for GPU-class remote workers */
	readonly preferLabel?: { key: string; value: string };
	readonly executeLocal?: boolean;
	readonly stationId?: string;
}

export interface DispatchComputeTaskResult {
	readonly task: ComputeTask;
	readonly isolation?: IsolationContext;
	readonly pool: ComputePool;
}

/**
 * Dispatch work to a capacity-aware node; optionally run mediated isolation
 * on local-class nodes. Durable handback lives outside the sandbox root.
 */
export async function dispatchComputeTask(
	input: DispatchComputeTaskInput,
): Promise<DispatchComputeTaskResult> {
	const rootProbe = poolRoot(input.hoboHome, input.poolId);
	const priorMeta = readJson<{ stationId: string }>(
		join(rootProbe, "pool.json"),
	);
	const stationId = input.stationId ?? priorMeta?.stationId ?? "station:local";
	openComputePool({
		hoboHome: input.hoboHome,
		stationId,
		poolId: input.poolId,
		autoRegisterLocalNode: true,
	});
	const root = poolRoot(input.hoboHome, input.poolId);
	const live = snapshotPool(root);
	const prefer =
		input.preferNodeClass ??
		(input.executeLocal !== false ? "local-process" : undefined);
	const node = pickNode(live.nodes, prefer, input.preferLabel);
	const taskId = `task-${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 12)}`;
	const t0 = nowIso();

	if (!node) {
		const failed: ComputeTask = {
			schemaVersion: COMPUTE_TASK_SCHEMA,
			taskId,
			prompt: input.prompt,
			status: "failed",
			createdAt: t0,
			updatedAt: t0,
			error: "no online node with residual capacity",
		};
		writeJson(join(root, "tasks", `${taskId}.json`), failed);
		return { task: failed, pool: snapshotPool(root) };
	}

	let isolation: IsolationContext | undefined;
	let status: ComputeTaskStatus = "dispatched";
	let handbackPath: string | undefined;
	let isolationRunId: string | undefined;
	let error: string | undefined;

	const canRunLocal =
		node.class === "local-process" ||
		node.class === "worktree" ||
		node.class === "rift";
	const executeLocal = input.executeLocal !== false && canRunLocal;

	if (executeLocal) {
		try {
			status = "running";
			isolation = await createIsolationContext({
				projectRoot: input.projectRoot,
				hoboHome: input.hoboHome,
				runId: `compute-${taskId}`,
				forceWorktree: node.class !== "rift",
				stationId: live.stationId,
				branch: `code/${taskId}`,
			});
			isolationRunId = isolation.runId;
			writeFileSync(
				join(isolation.rootPath, "compute-task.json"),
				JSON.stringify(
					{
						taskId,
						prompt: input.prompt,
						nodeId: node.nodeId,
						nodeClass: node.class,
						labels: node.labels,
					},
					null,
					2,
				),
				"utf8",
			);
			const cleaned = await cleanupIsolation(isolation.runId, {
				hoboHome: input.hoboHome,
				ok: true,
				gates: ["compute:dispatch", `node:${node.nodeId}`],
			});
			handbackPath = join(isolation.durableRoot, "handback.json");
			writeJson(handbackPath, cleaned.handback);
			status = cleaned.handback.ok ? "done" : "failed";
			if (!cleaned.handback.ok) {
				error = cleaned.handback.message;
			}
		} catch (e) {
			status = "failed";
			error = e instanceof Error ? e.message : String(e);
		}
	}

	const task: ComputeTask = Object.freeze({
		schemaVersion: COMPUTE_TASK_SCHEMA,
		taskId,
		prompt: input.prompt,
		status,
		nodeId: node.nodeId,
		...(isolationRunId !== undefined ? { isolationRunId } : {}),
		...(handbackPath !== undefined ? { handbackPath } : {}),
		createdAt: t0,
		updatedAt: nowIso(),
		...(error !== undefined ? { error } : {}),
	});
	writeJson(join(root, "tasks", `${taskId}.json`), task);

	registerComputeNode({
		hoboHome: input.hoboHome,
		poolId: input.poolId,
		node: {
			...node,
			running: status === "dispatched" ? node.running + 1 : node.running,
		},
	});

	return {
		task,
		...(isolation !== undefined ? { isolation } : {}),
		pool: snapshotPool(root),
	};
}

/** Isolation / node class matrix for multi-node (incl. remote GPU-class) workers. */
export const COMPUTE_ISOLATION_CLASSES: readonly {
	readonly class: ComputeNodeClass;
	readonly role: string;
	readonly defaultOn: boolean;
}[] = [
	{
		class: "local-process",
		role: "dev / CI default unit of work",
		defaultOn: true,
	},
	{
		class: "worktree",
		role: "git worktree mediated view (first-class fallback)",
		defaultOn: true,
	},
	{
		class: "rift",
		role: "CoW rift isolation when available",
		defaultOn: true,
	},
	{
		class: "named-endpoint",
		role: "remote reach via named endpoint (GPU/worker hosts via labels)",
		defaultOn: true,
	},
	{
		class: "mxc",
		role: "MxC process / micro-VM class — strong remote worker tier",
		defaultOn: true,
	},
	{
		class: "openshell",
		role: "OpenShell secure runtime (credentials outside sandbox)",
		defaultOn: true,
	},
] as const;

export function describeDistributedCompute(): {
	readonly enabledByDefault: true;
	readonly model: string;
	readonly secureSandboxStack: "deepagents+openshell+mxc";
	readonly isolationClasses: typeof COMPUTE_ISOLATION_CLASSES;
} {
	return {
		enabledByDefault: true,
		model:
			"Capacity-aware multi-node dispatch (local, named-endpoint, MxC, OpenShell) under Station occupancy; optional GPU/worker selection via node labels; durable handbacks outside ephemeral isolation. Not a chat/hive product integration.",
		secureSandboxStack: "deepagents+openshell+mxc",
		isolationClasses: COMPUTE_ISOLATION_CLASSES,
	};
}
