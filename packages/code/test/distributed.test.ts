import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	describeDistributedCompute,
	dispatchComputeTask,
	openComputePool,
	registerComputeNode,
} from "../src/distributed.js";
import {
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	createMemoryFeaturePort,
} from "../src/platform.js";

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

describe("distributed multi-node compute (no buzz/hive product)", () => {
	it("all code feature defaults are ON including distributed", () => {
		expect(CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.distributed]).toBe(true);
		expect(CODE_FEATURE_FLAGS.distributed).toBe("code.distributed");
		const port = createMemoryFeaturePort();
		expect(
			port.evaluateBoolean(CODE_FEATURE_FLAGS.distributed, {
				targetingKey: "t",
			}).value,
		).toBe(true);
	});

	it("opens compute pool with local + named-endpoint nodes (no rooms)", () => {
		const home = temp("compute-pool-");
		const pool = openComputePool({
			hoboHome: home,
			stationId: "station:local",
			poolId: "demo",
		});
		expect(pool.distributedEnabled).toBe(true);
		expect(pool.nodes.length).toBeGreaterThanOrEqual(2);
		expect(pool.nodes.some((n) => n.class === "local-process")).toBe(true);
		expect(pool.nodes.some((n) => n.class === "named-endpoint")).toBe(true);
		expect(pool.root).toContain("/compute/");
		expect(pool.root).not.toContain("/buzz/");
		const desc = describeDistributedCompute();
		expect(desc.enabledByDefault).toBe(true);
		expect(desc.model.toLowerCase()).not.toContain("hive rooms");
		expect(desc.model.toLowerCase()).not.toMatch(/\bbuzz\b/);
	});

	it("dispatches task onto a capacity-aware node with isolation handback", async () => {
		const home = temp("compute-dispatch-");
		const project = temp("compute-proj-");
		const result = await dispatchComputeTask({
			hoboHome: home,
			poolId: "default",
			prompt: "ship a unit",
			projectRoot: project,
			executeLocal: true,
			stationId: "station:local",
		});
		expect(["done", "dispatched", "failed"]).toContain(result.task.status);
		expect(result.pool.tasks.some((t) => t.taskId === result.task.taskId)).toBe(
			true,
		);
		if (result.task.status === "done") {
			expect(result.task.nodeId).toBeTruthy();
			expect(result.task.handbackPath).toBeTruthy();
		}
	});

	it("can register a GPU-labeled remote node for selection", async () => {
		const home = temp("compute-gpu-");
		openComputePool({
			hoboHome: home,
			stationId: "station:local",
			poolId: "g",
		});
		registerComputeNode({
			hoboHome: home,
			poolId: "g",
			node: {
				nodeId: "node-gpu-1",
				class: "named-endpoint",
				status: "online",
				capacity: 2,
				running: 0,
				labels: { gpu: "1", device: "cuda:0" },
			},
		});
		const result = await dispatchComputeTask({
			hoboHome: home,
			poolId: "g",
			prompt: "train",
			projectRoot: temp("gpu-proj-"),
			executeLocal: false,
			preferLabel: { key: "gpu", value: "1" },
			preferNodeClass: "named-endpoint",
			stationId: "station:local",
		});
		expect(result.task.nodeId).toBe("node-gpu-1");
		expect(result.task.status).toBe("dispatched");
	});
});
