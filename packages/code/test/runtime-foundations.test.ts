import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeBuzzDistributedCompute } from "../src/buzz.js";
import { runHoboCodeCli } from "../src/cli.js";
import {
	defaultHoboCodeEveAgents,
	defineEveAgent,
	defineEveSubagent,
	describeEveSubagentSurface,
	EVE_AGENT_SCHEMA,
	eveAgentRootPath,
} from "../src/eve.js";
import { createHarnessCore } from "../src/harness.js";
import {
	describeSecureSandboxStack,
	planSecureSandbox,
	SECURE_SANDBOX_STACK_SCHEMA,
	tierForEveSandboxClass,
} from "../src/sandbox-stack.js";
import {
	CODE_WORLD_SCHEMA,
	describeCodeWorlds,
	localWorld,
	planDurableWorkflowRun,
	vercelWorkflowWorld,
} from "../src/worlds.js";

describe("hobo-code runtime foundations (Eve · DeepAgents+OpenShell+MxC · Worlds)", () => {
	it("defines Eve-shaped coordinator + subagents", () => {
		const { coordinator, subagents } = defaultHoboCodeEveAgents();
		expect(coordinator.schemaVersion).toBe(EVE_AGENT_SCHEMA);
		expect(coordinator.kind).toBe("agent");
		expect(coordinator.subagents).toEqual(
			expect.arrayContaining(["investigator", "implementer", "reviewer"]),
		);
		expect(subagents).toHaveLength(3);
		for (const s of subagents) {
			expect(s.kind).toBe("subagent");
			expect(s.parentId).toBe(coordinator.id);
			expect(s.layout.subagentsDir).toBe("subagents");
		}
		const impl = subagents.find((s) => s.id === "implementer")!;
		expect(eveAgentRootPath(impl)).toBe("agent/subagents/implementer");
		const review = subagents.find((s) => s.id === "reviewer")!;
		expect(review.sandboxClass).toBe("mxc");
		expect(impl.sandboxClass).toBe("openshell");
		const surface = describeEveSubagentSurface();
		expect(surface.framework).toBe("vercel-eve");
		expect(surface.filesystemFirst).toBe(true);
	});

	it("rejects empty Eve agent ids", () => {
		expect(() => defineEveAgent({ id: " ", description: "x" })).toThrow(
			/id required/,
		);
		expect(() =>
			defineEveSubagent({
				id: "child",
				parentId: " ",
				description: "x",
			}),
		).toThrow(/parentId required/);
	});

	it("pins DeepAgents+OpenShell+MxC secure sandbox stack", () => {
		const stack = describeSecureSandboxStack();
		expect(stack.schemaVersion).toBe(SECURE_SANDBOX_STACK_SCHEMA);
		expect(stack.stack).toEqual(["deepagents", "openshell", "mxc"]);
		expect(stack.defaultOn).toBe(true);
		expect(stack.openShell.properties).toContain("credentials-outside-sandbox");
		expect(tierForEveSandboxClass("openshell")).toBe("deepagents-openshell");
		expect(tierForEveSandboxClass("mxc")).toBe("mxc");
		expect(tierForEveSandboxClass("local-process")).toBe("mediated-local");

		const agent = defineEveSubagent({
			id: "implementer",
			parentId: "hobo-code",
			description: "impl",
			sandboxClass: "openshell",
		});
		const plan = planSecureSandbox(agent);
		expect(plan.orchestrator).toBe("deepagents");
		expect(plan.runtime).toBe("openshell");
		expect(plan.mediatedOnly).toBe(true);
		expect(plan.credentialsInSandbox).toBe(false);
	});

	it("pins Vercel Workflows + Worlds for portable durability", () => {
		const catalog = describeCodeWorlds("/tmp/hobo-home");
		expect(catalog.model).toBe("vercel-workflows-worlds");
		expect(catalog.localDefault.kind).toBe("local");
		expect(catalog.localDefault.localDefault).toBe(true);
		expect(catalog.productionDefault.kind).toBe("vercel");
		expect(catalog.productionDefault.productionDefault).toBe(true);
		expect(localWorld("/x").schemaVersion).toBe(CODE_WORLD_SCHEMA);
		expect(vercelWorkflowWorld().capabilities).toEqual({
			eventLog: true,
			compute: true,
			queue: true,
		});
		const run = planDurableWorkflowRun({
			runId: "r1",
			world: vercelWorkflowWorld(),
			stepNames: ["plan", "edit", "test"],
		});
		expect(run.worldKind).toBe("vercel");
		expect(run.survivingRestart).toBe(true);
		expect(run.steps).toHaveLength(3);
	});

	it("harness exposes worlds model + secure sandbox stack flag", () => {
		const root = mkdtempSync(join(tmpdir(), "hc-world-"));
		const harness = createHarnessCore({ worldRoot: root });
		expect(harness.worlds()).toEqual({
			localDefault: "local",
			productionDefault: "vercel",
			model: "vercel-workflows-worlds",
		});
		const sb = harness.useSandbox(join(root, "sb"));
		expect(sb.mediated).toBe(true);
		expect(sb.stack).toMatch(/deepagents\+openshell\+mxc|mediated-local/);
		const cp = harness.checkpoint("run-a", 1, "payload");
		expect(cp.worldKind).toBe("local");
		expect(cp.survivingRestart).toBe(true);
		expect(harness.restore("run-a")?.checkpoint).toBe(cp.checkpoint);
	});

	it("hive distributed descriptor names secure sandbox stack", () => {
		const d = describeBuzzDistributedCompute();
		expect(d.secureSandboxStack).toBe("deepagents+openshell+mxc");
		expect(d.isolationClasses.some((c) => c.class === "openshell")).toBe(true);
		expect(d.isolationClasses.some((c) => c.class === "mxc")).toBe(true);
	});

	it("help data payload includes eve, secure sandbox, worlds", async () => {
		const help = await runHoboCodeCli(["help"]);
		expect(help.ok).toBe(true);
		const data = help.data as {
			subagents: { framework: string };
			secureSandbox: { stack: string[] };
			worlds: { model: string };
		};
		expect(data.subagents.framework).toBe("vercel-eve");
		expect(data.secureSandbox.stack).toEqual([
			"deepagents",
			"openshell",
			"mxc",
		]);
		expect(data.worlds.model).toBe("vercel-workflows-worlds");
	});
});
