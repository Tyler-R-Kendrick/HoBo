/**
 * Buzz-style distributed compute hive for hobo code (inspired by block/buzz).
 *
 * Core model (HoBo-native, not a fork of Buzz):
 * - Hive = durable workspace under HOBO_HOME where humans + agents share rooms
 * - Nodes = compute workers (local process, remote named-endpoint, MxC/OpenShell class)
 * - Agents hold content-addressed identities (no ambient credentials)
 * - Tasks dispatch to nodes with mediated isolation + handback; durable learning
 *   lives outside ephemeral isolation roots
 *
 * Composes stations (occupancy), connectivity named endpoints (remote reach),
 * OpenFeature progressive flag code.distributed, and SWE provider mux.
 * Not a CLI verb — hive surface is flat on hobo-code (dispatch default).
 */
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { getNamedEndpoint, getNamedEndpointHost } from "@hobo/core";

import { cleanupIsolation, createIsolationContext } from "./isolation.js";
import type { IsolationContext } from "./types.js";

// public-contract: buzz hive schema.
export const BUZZ_HIVE_SCHEMA = "hobo.code.buzz.hive/v1" as const;
// public-contract: buzz agent identity schema.
export const BUZZ_AGENT_SCHEMA = "hobo.code.buzz.agent/v1" as const;
// public-contract: buzz task schema.
export const BUZZ_TASK_SCHEMA = "hobo.code.buzz.task/v1" as const;

export type BuzzNodeClass =
	| "local-process"
	| "named-endpoint"
	| "mxc"
	| "openshell"
	| "worktree"
	| "rift";

export type BuzzNodeStatus = "online" | "draining" | "offline";
export type BuzzTaskStatus =
	| "queued"
	| "dispatched"
	| "running"
	| "done"
	| "failed"
	| "cancelled";
export type BuzzParticipantKind = "human" | "agent";

export interface BuzzAgentIdentity {
	readonly schemaVersion: typeof BUZZ_AGENT_SCHEMA;
	/** Content-addressed agent id (sha256:…). */
	readonly agentId: `sha256:${string}`;
	readonly displayName: string;
	readonly providerHint: string;
	readonly stationId: string;
	/** Public key material is optional; identity is content-addressed first. */
	readonly publicKeyPem?: string;
	readonly createdAt: string;
}

export interface BuzzNode {
	readonly nodeId: string;
	readonly class: BuzzNodeClass;
	readonly status: BuzzNodeStatus;
	readonly capacity: number;
	readonly running: number;
	readonly endpointHost?: string;
	readonly endpointUrl?: string;
	readonly stationId?: string;
	readonly labels: Readonly<Record<string, string>>;
	readonly updatedAt: string;
}

export interface BuzzRoom {
	readonly roomId: string;
	readonly name: string;
	readonly participants: readonly {
		readonly kind: BuzzParticipantKind;
		readonly id: string;
		readonly displayName: string;
	}[];
	readonly createdAt: string;
}

export interface BuzzTask {
	readonly schemaVersion: typeof BUZZ_TASK_SCHEMA;
	readonly taskId: string;
	readonly roomId: string;
	readonly prompt: string;
	readonly status: BuzzTaskStatus;
	readonly nodeId?: string;
	readonly agentId?: string;
	readonly isolationRunId?: string;
	readonly handbackPath?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly error?: string;
}

export interface BuzzHive {
	readonly schemaVersion: typeof BUZZ_HIVE_SCHEMA;
	readonly hiveId: string;
	readonly stationId: string;
	readonly root: string;
	readonly nodes: readonly BuzzNode[];
	readonly rooms: readonly BuzzRoom[];
	readonly agents: readonly BuzzAgentIdentity[];
	readonly tasks: readonly BuzzTask[];
	readonly distributedEnabled: true;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OpenBuzzHiveOptions {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly hiveId?: string;
	readonly autoRegisterLocalNode?: boolean;
	readonly tenant?: string;
}

function buzzRoot(hoboHome: string, hiveId: string): string {
	return join(hoboHome, "durable", "code", "buzz", hiveId);
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

/** Content-addressed agent identity (Buzz-style first-class agent participant). */
export function createBuzzAgentIdentity(input: {
	readonly displayName: string;
	readonly providerHint: string;
	readonly stationId: string;
	readonly publicKeyPem?: string;
}): BuzzAgentIdentity {
	const material = JSON.stringify({
		displayName: input.displayName,
		providerHint: input.providerHint,
		stationId: input.stationId,
		publicKeyPem: input.publicKeyPem ?? "",
	});
	const digest = createHash("sha256").update(material).digest("hex");
	return Object.freeze({
		schemaVersion: BUZZ_AGENT_SCHEMA,
		agentId: `sha256:${digest}`,
		displayName: input.displayName,
		providerHint: input.providerHint,
		stationId: input.stationId,
		...(input.publicKeyPem !== undefined
			? { publicKeyPem: input.publicKeyPem }
			: {}),
		createdAt: nowIso(),
	});
}

function loadHiveState(root: string): {
	nodes: BuzzNode[];
	rooms: BuzzRoom[];
	agents: BuzzAgentIdentity[];
	tasks: BuzzTask[];
	meta: { hiveId: string; stationId: string; createdAt: string };
} {
	const meta = readJson<{
		hiveId: string;
		stationId: string;
		createdAt: string;
	}>(join(root, "hive.json"));
	if (!meta) {
		throw new Error(`buzz hive missing hive.json under ${root}`);
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
		nodes: list<BuzzNode>("nodes"),
		rooms: list<BuzzRoom>("rooms"),
		agents: list<BuzzAgentIdentity>("agents"),
		tasks: list<BuzzTask>("tasks"),
	};
}

function snapshotHive(root: string): BuzzHive {
	const state = loadHiveState(root);
	return Object.freeze({
		schemaVersion: BUZZ_HIVE_SCHEMA,
		hiveId: state.meta.hiveId,
		stationId: state.meta.stationId,
		root,
		nodes: Object.freeze([...state.nodes]),
		rooms: Object.freeze([...state.rooms]),
		agents: Object.freeze([...state.agents]),
		tasks: Object.freeze([...state.tasks]),
		distributedEnabled: true as const,
		createdAt: state.meta.createdAt,
		updatedAt: nowIso(),
	});
}

/**
 * Open or create a Buzz-style hive bound to a Station.
 * Local compute node auto-registers for distributed dispatch by default.
 */
export function openBuzzHive(options: OpenBuzzHiveOptions): BuzzHive {
	const hiveId = options.hiveId ?? "default";
	const root = buzzRoot(options.hoboHome, hiveId);
	mkdirSync(join(root, "nodes"), { recursive: true });
	mkdirSync(join(root, "rooms"), { recursive: true });
	mkdirSync(join(root, "agents"), { recursive: true });
	mkdirSync(join(root, "tasks"), { recursive: true });

	const metaPath = join(root, "hive.json");
	if (!existsSync(metaPath)) {
		writeJson(metaPath, {
			schemaVersion: BUZZ_HIVE_SCHEMA,
			hiveId,
			stationId: options.stationId,
			createdAt: nowIso(),
			distributedEnabled: true,
		});
		// Default room: humans + agents build together.
		const room: BuzzRoom = {
			roomId: "room-main",
			name: "main",
			participants: [],
			createdAt: nowIso(),
		};
		writeJson(join(root, "rooms", "room-main.json"), room);
	}

	if (options.autoRegisterLocalNode !== false) {
		registerBuzzNode({
			hoboHome: options.hoboHome,
			hiveId,
			node: {
				nodeId: `node-local-${options.stationId.replace(/[^a-z0-9-]/gi, "-")}`,
				class: "local-process",
				status: "online",
				capacity: 4,
				running: 0,
				stationId: options.stationId,
				labels: { kind: "local", hive: hiveId },
			},
		});
		// Named-endpoint node for remote reach (ADR-0130).
		const host = getNamedEndpointHost({
			resource: "hive",
			app: "hobo-code",
			mode: "local",
			tenant: options.tenant ?? "local",
			project: hiveId,
		});
		const url = getNamedEndpoint({
			resource: "hive",
			app: "hobo-code",
			mode: "local",
			tenant: options.tenant ?? "local",
			project: hiveId,
		});
		registerBuzzNode({
			hoboHome: options.hoboHome,
			hiveId,
			node: {
				nodeId: "node-endpoint-remote",
				class: "named-endpoint",
				status: "online",
				capacity: 16,
				running: 0,
				endpointHost: host,
				endpointUrl: url,
				stationId: options.stationId,
				labels: { kind: "remote-ready", protocol: "named-endpoint" },
			},
		});
	}

	return snapshotHive(root);
}

export function registerBuzzNode(input: {
	readonly hoboHome: string;
	readonly hiveId: string;
	readonly node: Omit<BuzzNode, "updatedAt"> & { updatedAt?: string };
}): BuzzNode {
	const root = buzzRoot(input.hoboHome, input.hiveId);
	mkdirSync(join(root, "nodes"), { recursive: true });
	const node: BuzzNode = Object.freeze({
		...input.node,
		labels: Object.freeze({ ...input.node.labels }),
		updatedAt: input.node.updatedAt ?? nowIso(),
	});
	writeJson(join(root, "nodes", `${node.nodeId}.json`), node);
	return node;
}

export function joinBuzzRoom(input: {
	readonly hoboHome: string;
	readonly hiveId: string;
	readonly roomId: string;
	readonly participant: {
		readonly kind: BuzzParticipantKind;
		readonly id: string;
		readonly displayName: string;
	};
}): BuzzRoom {
	const root = buzzRoot(input.hoboHome, input.hiveId);
	const path = join(root, "rooms", `${input.roomId}.json`);
	const existing = readJson<BuzzRoom>(path);
	const room: BuzzRoom = existing
		? {
				...existing,
				participants: Object.freeze([
					...existing.participants.filter((p) => p.id !== input.participant.id),
					input.participant,
				]),
			}
		: {
				roomId: input.roomId,
				name: input.roomId,
				participants: Object.freeze([input.participant]),
				createdAt: nowIso(),
			};
	writeJson(path, room);
	return room;
}

export function registerBuzzAgent(input: {
	readonly hoboHome: string;
	readonly hiveId: string;
	readonly agent: BuzzAgentIdentity;
	readonly roomId?: string;
}): BuzzAgentIdentity {
	const root = buzzRoot(input.hoboHome, input.hiveId);
	writeJson(
		join(root, "agents", `${input.agent.agentId.replace("sha256:", "")}.json`),
		input.agent,
	);
	if (input.roomId) {
		joinBuzzRoom({
			hoboHome: input.hoboHome,
			hiveId: input.hiveId,
			roomId: input.roomId,
			participant: {
				kind: "agent",
				id: input.agent.agentId,
				displayName: input.agent.displayName,
			},
		});
	}
	return input.agent;
}

function pickNode(
	nodes: readonly BuzzNode[],
	preferClass?: BuzzNodeClass,
): BuzzNode | null {
	const online = nodes.filter(
		(n) => n.status === "online" && n.running < n.capacity,
	);
	if (online.length === 0) return null;
	if (preferClass) {
		const preferred = online.find((n) => n.class === preferClass);
		if (preferred) return preferred;
	}
	// Prefer highest residual capacity.
	return [...online].sort(
		(a, b) => b.capacity - b.running - (a.capacity - a.running),
	)[0]!;
}

export interface DispatchBuzzTaskInput {
	readonly hoboHome: string;
	readonly hiveId: string;
	readonly roomId: string;
	readonly prompt: string;
	readonly projectRoot: string;
	readonly agent?: BuzzAgentIdentity;
	readonly preferNodeClass?: BuzzNodeClass;
	/** When true, run mediated isolation on the selected local node. */
	readonly executeLocal?: boolean;
}

export interface DispatchBuzzTaskResult {
	readonly task: BuzzTask;
	readonly isolation?: IsolationContext;
	readonly hive: BuzzHive;
}

/**
 * Dispatch a work unit into the hive: pick a node, optionally run isolation
 * locally (local-process/worktree/rift), record durable task + handback paths.
 */
export function dispatchBuzzTask(
	input: DispatchBuzzTaskInput & { readonly stationId?: string },
): DispatchBuzzTaskResult {
	const rootProbe = buzzRoot(input.hoboHome, input.hiveId);
	const priorMeta = readJson<{ stationId: string }>(
		join(rootProbe, "hive.json"),
	);
	const stationId = input.stationId ?? priorMeta?.stationId ?? "station:local";
	openBuzzHive({
		hoboHome: input.hoboHome,
		stationId,
		hiveId: input.hiveId,
		autoRegisterLocalNode: true,
	});
	const root = buzzRoot(input.hoboHome, input.hiveId);
	const live = snapshotHive(root);
	const prefer =
		input.preferNodeClass ??
		(input.executeLocal !== false ? "local-process" : undefined);
	const node = pickNode(live.nodes, prefer);
	const taskId = `task-${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 12)}`;
	const t0 = nowIso();

	if (!node) {
		const failed: BuzzTask = {
			schemaVersion: BUZZ_TASK_SCHEMA,
			taskId,
			roomId: input.roomId,
			prompt: input.prompt,
			status: "failed",
			createdAt: t0,
			updatedAt: t0,
			error: "no online node with residual capacity",
		};
		writeJson(join(root, "tasks", `${taskId}.json`), failed);
		return { task: failed, hive: snapshotHive(root) };
	}

	let isolation: IsolationContext | undefined;
	let status: BuzzTaskStatus = "dispatched";
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
			isolation = createIsolationContext({
				projectRoot: input.projectRoot,
				hoboHome: input.hoboHome,
				runId: `buzz-${taskId}`,
				forceWorktree: node.class !== "rift",
				stationId: live.stationId,
				branch: `buzz/${taskId}`,
			});
			isolationRunId = isolation.runId;
			// Simulate unit of work complete inside isolation; real agents attach here.
			writeFileSync(
				join(isolation.rootPath, "buzz-task.json"),
				JSON.stringify(
					{
						taskId,
						prompt: input.prompt,
						nodeId: node.nodeId,
						agentId: input.agent?.agentId,
					},
					null,
					2,
				),
				"utf8",
			);
			const cleaned = cleanupIsolation(isolation.runId, {
				hoboHome: input.hoboHome,
				ok: true,
				gates: ["buzz:dispatch", `node:${node.nodeId}`],
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

	const task: BuzzTask = Object.freeze({
		schemaVersion: BUZZ_TASK_SCHEMA,
		taskId,
		roomId: input.roomId,
		prompt: input.prompt,
		status,
		nodeId: node.nodeId,
		...(input.agent !== undefined ? { agentId: input.agent.agentId } : {}),
		...(isolationRunId !== undefined ? { isolationRunId } : {}),
		...(handbackPath !== undefined ? { handbackPath } : {}),
		createdAt: t0,
		updatedAt: nowIso(),
		...(error !== undefined ? { error } : {}),
	});
	writeJson(join(root, "tasks", `${taskId}.json`), task);

	// Refresh node heartbeat (local execute finishes in-process; capacity freed).
	registerBuzzNode({
		hoboHome: input.hoboHome,
		hiveId: input.hiveId,
		node: {
			...node,
			running: status === "dispatched" ? node.running + 1 : node.running,
		},
	});

	return {
		task,
		...(isolation !== undefined ? { isolation } : {}),
		hive: snapshotHive(root),
	};
}

/** MxC / OpenShell isolation class matrix (distributed hardware model). */
export const BUZZ_ISOLATION_CLASSES: readonly {
	readonly class: BuzzNodeClass;
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
		role: "remote reach via tailnet named endpoint",
		defaultOn: true,
	},
	{
		class: "mxc",
		role: "MxC process / micro-VM class — strong tier of DeepAgents+OpenShell+MxC secure stack",
		defaultOn: true,
	},
	{
		class: "openshell",
		role: "OpenShell secure runtime (DeepAgents-orchestrated; kernel policy; credentials outside)",
		defaultOn: true,
	},
] as const;

export function describeBuzzDistributedCompute(): {
	readonly enabledByDefault: true;
	readonly inspiration: "https://github.com/block/buzz";
	readonly model: string;
	readonly secureSandboxStack: "deepagents+openshell+mxc";
	readonly isolationClasses: typeof BUZZ_ISOLATION_CLASSES;
} {
	return {
		enabledByDefault: true,
		inspiration: "https://github.com/block/buzz",
		model:
			"Hive rooms with first-class agent identities; tasks dispatch to distributed nodes (local, named-endpoint, MxC, OpenShell) under Station occupancy; secure path = DeepAgents orchestration inside OpenShell (+ MxC when stronger); durable handbacks outside ephemeral isolation.",
		secureSandboxStack: "deepagents+openshell+mxc",
		isolationClasses: BUZZ_ISOLATION_CLASSES,
	};
}
