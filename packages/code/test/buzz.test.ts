import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	createBuzzAgentIdentity,
	createMemoryFeaturePort,
	describeBuzzDistributedCompute,
	dispatchBuzzTask,
	joinBuzzRoom,
	listSandboxOrphans,
	openBuzzHive,
	registerBuzzAgent,
} from "../src/index.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("buzz distributed compute (block/buzz-inspired)", () => {
	it("all code feature defaults are ON including distributed + monetization + rift", () => {
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.harnessEnabled]).toBe(true);
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.visualEvidence]).toBe(true);
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.monetizationSurface]).toBe(
			true,
		);
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.riftPreferred]).toBe(true);
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.distributed]).toBe(true);
		expect(CODE_FEATURE_FLAGS.distributed).toBe("code.distributed");
		const port = createMemoryFeaturePort();
		expect(
			port.evaluateBoolean(CODE_FEATURE_FLAGS.monetizationSurface, {
				targetingKey: "t",
			}).value,
		).toBe(true);
		expect(
			port.evaluateBoolean(CODE_FEATURE_FLAGS.distributed, {
				targetingKey: "t",
			}).value,
		).toBe(true);
	});

	it("opens hive with local + named-endpoint nodes and main room", () => {
		const home = temp("buzz-hive-");
		const hive = openBuzzHive({
			hoboHome: home,
			stationId: "station:local",
			hiveId: "demo",
		});
		expect(hive.distributedEnabled).toBe(true);
		expect(hive.nodes.length).toBeGreaterThanOrEqual(2);
		expect(hive.nodes.some((n) => n.class === "local-process")).toBe(true);
		expect(hive.nodes.some((n) => n.class === "named-endpoint")).toBe(true);
		expect(hive.rooms.some((r) => r.roomId === "room-main")).toBe(true);
		const desc = describeBuzzDistributedCompute();
		expect(desc.enabledByDefault).toBe(true);
		expect(desc.inspiration).toContain("block/buzz");
		expect(desc.isolationClasses.some((c) => c.class === "mxc")).toBe(true);
		expect(desc.isolationClasses.some((c) => c.class === "openshell")).toBe(
			true,
		);
	});

	it("registers first-class agent identity and joins room", () => {
		const home = temp("buzz-agent-");
		openBuzzHive({ hoboHome: home, stationId: "station:x", hiveId: "h1" });
		const agent = createBuzzAgentIdentity({
			displayName: "worker-codex",
			providerHint: "@hobo/swe-codex",
			stationId: "station:x",
		});
		expect(agent.agentId.startsWith("sha256:")).toBe(true);
		registerBuzzAgent({
			hoboHome: home,
			hiveId: "h1",
			agent,
			roomId: "room-main",
		});
		const room = joinBuzzRoom({
			hoboHome: home,
			hiveId: "h1",
			roomId: "room-main",
			participant: {
				kind: "human",
				id: "human:tyler",
				displayName: "tyler",
			},
		});
		expect(room.participants.some((p) => p.kind === "agent")).toBe(true);
		expect(room.participants.some((p) => p.kind === "human")).toBe(true);
	});

	it("dispatches task to local node with isolation cleanup and zero orphans", () => {
		const home = temp("buzz-dispatch-");
		const project = temp("buzz-proj-");
		const agent = createBuzzAgentIdentity({
			displayName: "dispatch-agent",
			providerHint: "@hobo/code",
			stationId: "station:local",
		});
		const result = dispatchBuzzTask({
			hoboHome: home,
			hiveId: "default",
			roomId: "room-main",
			prompt: "scaffold openui bindle",
			projectRoot: project,
			agent,
			stationId: "station:local",
			executeLocal: true,
		});
		expect(result.task.status).toBe("done");
		expect(result.task.nodeId).toBeTruthy();
		expect(result.task.handbackPath).toBeTruthy();
		expect(listSandboxOrphans(home)).toEqual([]);
		expect(result.hive.tasks.some((t) => t.taskId === result.task.taskId)).toBe(
			true,
		);
	});
});
