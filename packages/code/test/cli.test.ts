import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CODE_FEATURE_FLAGS,
	HOBO_CODE_VERBS,
	runHoboCodeCli,
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

describe("hobo-code CLI (flat verbs, dispatch default)", () => {
	it("does not list a buzz verb", () => {
		expect(HOBO_CODE_VERBS).not.toContain("buzz");
		expect(HOBO_CODE_VERBS[0]).toBe("dispatch");
	});

	it("defaults to dispatch when no verb is given", async () => {
		const home = temp("hc-def-");
		const project = temp("hc-def-proj-");
		const result = await runHoboCodeCli(["refine", "the", "app"], {
			hoboHome: home,
			cwd: project,
		});
		expect(result.code).toBe("HOBO_CODE_DISPATCH");
		expect(result.ok).toBe(true);
		expect(
			(result.data as { defaultVerb: boolean; task: { status: string } })
				.defaultVerb,
		).toBe(true);
		expect(
			(result.data as { task: { status: string } }).task.status,
		).toBe("done");
	});

	it("explicit dispatch and status work as flat verbs", async () => {
		const home = temp("hc-flat-");
		const project = temp("hc-flat-proj-");
		const status = await runHoboCodeCli(["status"], { hoboHome: home });
		expect(status.ok).toBe(true);
		expect(status.code).toBe("HOBO_CODE_STATUS");

		const dispatch = await runHoboCodeCli(["dispatch", "hello"], {
			hoboHome: home,
			cwd: project,
		});
		expect(dispatch.ok).toBe(true);
		expect(dispatch.code).toBe("HOBO_CODE_DISPATCH");
	});

	it("join / agent / nodes are flat (not under buzz)", async () => {
		const home = temp("hc-hive-");
		const join = await runHoboCodeCli(["join", "tyler"], { hoboHome: home });
		expect(join.ok).toBe(true);
		expect(join.code).toBe("HOBO_CODE_JOIN");

		const agent = await runHoboCodeCli(["agent", "worker"], {
			hoboHome: home,
		});
		expect(agent.ok).toBe(true);
		expect(agent.code).toBe("HOBO_CODE_AGENT");

		const nodes = await runHoboCodeCli(["nodes"], { hoboHome: home });
		expect(nodes.ok).toBe(true);
		expect(
			(nodes.data as { list: unknown[] }).list.length,
		).toBeGreaterThanOrEqual(2);
	});

	it("help names binary hobo-code and default dispatch", async () => {
		const help = await runHoboCodeCli(["help"]);
		expect(help.ok).toBe(true);
		expect(help.message).toContain("hobo-code");
		// ★d marks default dispatch; full word is data.defaultVerb
		expect(help.message).toContain("★d");
		expect(help.message).not.toMatch(/\bbuzz\b/);
		expect(
			(help.data as { binary: string; defaultVerb: string }).binary,
		).toBe("hobo-code");
		expect(
			(help.data as { defaultVerb: string }).defaultVerb,
		).toBe("dispatch");
		expect(CODE_FEATURE_FLAGS.distributed).toBe("code.distributed");
		expect(HOBO_CODE_VERBS).toContain("env");
		expect(help.message).toContain("ev");
		expect(
			(help.data as { hermetic: { schema: string } }).hermetic.schema,
		).toBe("hobo.code.hermetic-env/v1");
	});

	it("env reports hermetic shell markers and durable layout without requiring Nix", async () => {
		const home = temp("hc-env-home-");
		const project = temp("hc-env-proj-");
		const { writeFileSync } = await import("node:fs");
		writeFileSync(
			join(project, "devenv.nix"),
			"{ pkgs, ... }: { packages = [ pkgs.nodejs ]; }\n",
			"utf8",
		);
		const env = await runHoboCodeCli(["env", "--json"], {
			hoboHome: home,
			cwd: project,
		});
		expect(env.ok).toBe(true);
		expect(env.code).toBe("HOBO_CODE_ENV");
		const data = env.data as {
			hermetic: {
				hermeticDeclared: boolean;
				markers: string[];
				layout: { pureSeparation: boolean; durable: string };
				fidelity: string;
			};
		};
		expect(data.hermetic.hermeticDeclared).toBe(true);
		expect(data.hermetic.markers).toContain("devenv.nix");
		expect(data.hermetic.layout.pureSeparation).toBe(true);
		expect(data.hermetic.fidelity).toBe("hermetic-declared");
		expect(env.message).toMatch(/hermetic/);
		// Human chrome always surfaces durable layout (nix purity analog).
		expect(env.message).toMatch(/durable/);
	});

	it("isolate data exposes durable root separate from sandbox", async () => {
		const home = temp("hc-iso-home-");
		const project = temp("hc-iso-proj-");
		const iso = await runHoboCodeCli(["isolate", "run-hermetic-1"], {
			hoboHome: home,
			cwd: project,
		});
		expect(iso.ok).toBe(true);
		const data = iso.data as {
			isolation: { rootPath: string; durableRoot: string };
			layout: { pureSeparation: boolean };
			hermetic: { schema: string };
		};
		expect(data.isolation.durableRoot).toContain("durable");
		expect(data.isolation.rootPath).not.toBe(data.isolation.durableRoot);
		expect(data.layout.pureSeparation).toBe(true);
		expect(data.hermetic.schema).toBe("hobo.code.hermetic-env/v1");
		// Human chrome must not hide pure separation from nix-terminal persona.
		expect(iso.message).toMatch(/durable/);
	});
});
