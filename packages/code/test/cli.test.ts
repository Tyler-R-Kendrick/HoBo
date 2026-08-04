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
	it("does not list buzz/hive product verbs", () => {
		expect(HOBO_CODE_VERBS).not.toContain("buzz");
		expect(HOBO_CODE_VERBS).not.toContain("join");
		expect(HOBO_CODE_VERBS).not.toContain("rooms");
		expect(HOBO_CODE_VERBS).not.toContain("nodes");
		expect(HOBO_CODE_VERBS).not.toContain("platform");
		expect(HOBO_CODE_VERBS).toContain("auth");
		expect(HOBO_CODE_VERBS).toContain("models");
		expect(HOBO_CODE_VERBS).toContain("attach");
		expect(HOBO_CODE_VERBS).toContain("tasks");
		expect(HOBO_CODE_VERBS).toContain("guide");
		expect(HOBO_CODE_VERBS).toContain("cost");
		expect(HOBO_CODE_VERBS).toContain("harness");
		expect(HOBO_CODE_VERBS).toContain("edit");
		expect(HOBO_CODE_VERBS).toContain("config");
		// agent = protocol-native AX inventory (MCP/ACP), not hive join/rooms
		expect(HOBO_CODE_VERBS).toContain("agent");
		expect(HOBO_CODE_VERBS).not.toContain("remote");
		expect(HOBO_CODE_VERBS[0]).toBe("dispatch");
	});

	it("does not dispatch an empty non-TTY invocation", async () => {
		const home = temp("hobo-code-empty-tty-");
		const result = await runHoboCodeCli([], {
			env: { ...process.env, HOBO_HOME: home },
			hoboHome: home,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_INTERACTIVE_REQUIRED");
		expect(result.exitCode).toBe(1);
		expect(result.message).toMatch(/needs a TTY|hobo-code help/i);
		expect(
			(result.data as { interactiveRequired?: boolean }).interactiveRequired,
		).toBe(true);
	});

	it("rejects unknown flags instead of silently accepting them", async () => {
		const home = temp("hobo-code-flags-");
		const env = { ...process.env, HOBO_HOME: home };

		const unknown = await runHoboCodeCli(["status", "--wat"], {
			env,
			hoboHome: home,
		});
		expect(unknown.ok).toBe(false);
		expect(unknown.exitCode).toBe(1);
		expect(unknown.code).toBe("HOBO_CODE_UNKNOWN_FLAG");
		expect(unknown.message).toMatch(/Unknown flag "--wat"/);
		expect(unknown.message).toMatch(/hobo-code help/);

		// Unknown --flag=value form is rejected too.
		const assigned = await runHoboCodeCli(["status", "--wat=1"], {
			env,
			hoboHome: home,
		});
		expect(assigned.ok).toBe(false);
		expect(assigned.code).toBe("HOBO_CODE_UNKNOWN_FLAG");

		// Boolean flags must not swallow the next token as a value.
		const help = await runHoboCodeCli(["--json", "help"], {
			env,
			hoboHome: home,
		});
		expect(help.ok).toBe(true);
		expect(help.code).toBe("HOBO_CODE_HELP");

		// Known value-taking flags still consume the next token.
		const cwdMiss = await runHoboCodeCli(["env", "--cwd"], {
			env,
			hoboHome: home,
		});
		expect(cwdMiss.ok).toBe(false);
		expect(cwdMiss.code).toBe("HOBO_CODE_UNKNOWN_FLAG");
		expect(cwdMiss.message).toMatch(/requires a value/);
	});

	it("agent inventories human-free auth, MCP/ACP, unattended contract", async () => {
		const home = temp("hobo-code-agent-");
		const login = await runHoboCodeCli(["auth", "login", "--agent"], {
			env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
			hoboHome: home,
		});
		expect(login.ok).toBe(true);
		expect(login.message).toMatch(/human-free|agent ·|no-elicitation/i);

		const r = await runHoboCodeCli(["agent"], {
			env: { ...process.env, HOBO_HOME: home, HOBO_CODE_AGENT: "1" },
			hoboHome: home,
		});
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_AGENT");
		expect(r.message).toMatch(/◈ agent/);
		expect(r.message).toMatch(/human-free|auth ·/i);
		expect(r.message).toMatch(/mcp ·|acp ·/i);
		expect(r.message).toMatch(/no-elicit|unattended/i);
		const data = r.data as {
			agent: {
				schema: string;
				humanFreeAuth: { ready: boolean; modes: { id: string }[] };
				unattended: { noElicitation: boolean; jsonFirst: boolean };
				selfImprove: { loop: string[] };
				protocols: { id: string; status: string }[];
				mcpTools: string[];
			};
		};
		expect(data.agent.schema).toMatch(/hobo\.code\.agent/);
		expect(data.agent.humanFreeAuth.ready).toBe(true);
		expect(data.agent.unattended.noElicitation).toBe(true);
		expect(data.agent.unattended.jsonFirst).toBe(true);
		expect(data.agent.selfImprove.loop.length).toBeGreaterThan(2);
		expect(data.agent.protocols.some((p) => p.id === "mcp")).toBe(true);
		expect(data.agent.protocols.some((p) => p.id === "acp")).toBe(true);
		expect(data.agent.mcpTools.length).toBeGreaterThan(0);
		expect(JSON.stringify(data.agent)).not.toMatch(/sk-[a-zA-Z0-9]{12,}/);

		const refuse = await runHoboCodeCli(
			["auth", "login", "--agent", "--tenant", "acme", "--domain", "x.example"],
			{ env: { ...process.env, HOBO_HOME: home }, hoboHome: home },
		);
		expect(refuse.ok).toBe(false);
		expect(refuse.message).toMatch(/device-code|session-ref|local/i);

		const help = await runHoboCodeCli(["agent", "--help"]);
		expect(help.message).toMatch(/MCP|ACP|elicitation|human-free/i);
	});

	it("config inventories env/flags by stack without secret values", async () => {
		const r = await runHoboCodeCli(["config"], {
			env: {
				...process.env,
				HOBO_HOME: temp("hobo-code-cfg-"),
				HOBO_CODE_MODEL: "ollama/qwen2.5-coder:7b",
				HOBO_CODE_MONETIZATION: "0",
				OPENAI_API_KEY: "sk-test-must-not-leak",
			},
		});
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_CONFIG");
		expect(r.message).toMatch(/◈ config/);
		expect(r.message).toMatch(/setup ·|cost-budget|editor-vim|hermetic-nix/i);
		expect(r.message).not.toContain("sk-test-must-not-leak");
		const data = r.data as {
			config: {
				schema: string;
				knobs: {
					name: string;
					secret: boolean;
					present: boolean;
					valueHint: string | null;
					stacks: string[];
				}[];
				byStack: Record<string, unknown[]>;
				setupChecklist: string[];
				notes: string[];
			};
			stack: string | null;
		};
		expect(data.config.schema).toMatch(/hobo\.code\.config/);
		expect(data.config.knobs.length).toBeGreaterThan(5);
		expect(data.config.setupChecklist.length).toBeGreaterThan(0);
		expect(data.config.byStack["cost-budget"]).toBeTruthy();
		expect(data.config.byStack["editor-vim"]).toBeTruthy();
		const key = data.config.knobs.find((k) => k.name === "OPENAI_API_KEY");
		expect(key?.present).toBe(true);
		expect(key?.secret).toBe(true);
		expect(key?.valueHint).toMatch(/present \(secret\)|set/i);
		expect(JSON.stringify(data.config)).not.toContain("sk-test-must-not-leak");

		const filtered = await runHoboCodeCli(
			["config", "--stack", "cost-budget", "--json"],
			{
				env: {
					...process.env,
					HOBO_HOME: temp("hobo-code-cfg2-"),
					HOBO_CODE_BUDGET_USD: "0",
				},
			},
		);
		expect(filtered.ok).toBe(true);
		expect(filtered.message).toMatch(/cost-budget|HOBO_CODE_BUDGET|budget/i);
		const fdata = filtered.data as {
			stack: string;
			config: { schema: string; knobs: { name: string }[] };
		};
		expect(fdata.stack).toBe("cost-budget");
		expect(fdata.config.schema).toMatch(/hobo\.code\.config/);

		const bad = await runHoboCodeCli(["config", "--stack", "not-a-stack"]);
		expect(bad.ok).toBe(false);
		expect(bad.message).toMatch(/unknown stack|cost-budget|editor-vim/i);

		const help = await runHoboCodeCli(["config", "--help"]);
		expect(help.message).toMatch(/stack|setup|env|flags/i);
	});

	it("edit exposes neovim bridge and managed pane contract", async () => {
		const r = await runHoboCodeCli([
			"edit",
			"src/cli.ts",
			"--bridge",
			"direct-exec",
		]);
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_EDIT");
		expect(r.message).toMatch(/◈ edit/);
		expect(r.message).toMatch(/editor ·|nvim|vim/i);
		expect(r.message).toMatch(/pane ·|bridge ·/i);
		expect(r.message).toMatch(/hobo-code\.nvim|ext ·/i);
		expect(r.message).toMatch(/nav · status/i);
		const data = r.data as {
			editor: {
				schema: string;
				preferred: { binary: string; kind: string };
				activeBridge: string;
				bridges: { mode: string; openCommand: string }[];
				extension: { id: string; present: boolean; path: string };
				pane: { managed: boolean; layout: string };
				cliNavigation: string[];
			};
			openCommand: string;
		};
		expect(data.editor.schema).toMatch(/editor-bridge/);
		expect(data.editor.pane.managed).toBe(true);
		expect(data.editor.activeBridge).toBe("direct-exec");
		expect(data.editor.bridges.some((b) => b.mode === "tmux-send")).toBe(true);
		expect(data.editor.bridges.some((b) => b.mode === "stdio-jsonrpc")).toBe(
			true,
		);
		expect(data.editor.extension.id).toBe("hobo-code.nvim");
		expect(data.editor.extension.present).toBe(true);
		expect(data.editor.cliNavigation.some((c) => /edit/.test(c))).toBe(true);
		expect(data.openCommand.length).toBeGreaterThan(0);

		const printed = await runHoboCodeCli([
			"edit",
			"--print-cmd",
			"--bridge",
			"direct-exec",
			"README.md",
		]);
		expect(printed.ok).toBe(true);
		expect(printed.message).toMatch(/nvim|vim|hx|edit/i);

		const help = await runHoboCodeCli(["edit", "--help"]);
		expect(help.message).toMatch(/neovim|vim|tmux|bridge|keyboard/i);
	});

	it("harness shows Pi/Flue dual surface, skills, eve, self-improve", async () => {
		const r = await runHoboCodeCli(["harness"]);
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_HARNESS");
		expect(r.message).toMatch(/◈ harness/);
		expect(r.message).toMatch(/pi ·|flue ·/i);
		expect(r.message).toMatch(/skills ·/i);
		expect(r.message).toMatch(/eve ·|implementer|reviewer/i);
		expect(r.message).toMatch(/isolate→evidence→promote|self-improve|loop ·/i);
		expect(r.message).toMatch(/brain ·|serena|gbrain/i);
		const data = r.data as {
			harness: {
				dualSurface: {
					pi: { kind: string };
					flue: { kind: string; try: string };
					sharedCustomization: string;
				};
				skillRoots: { root: string }[];
				eve: { defaultAgents: { subagents: { id: string }[] } };
				selfImprove: { loop: string[] };
				brain: { id: string; status: string }[];
			};
		};
		expect(data.harness.dualSurface.pi.kind).toBe("pi-tui");
		expect(data.harness.dualSurface.flue.kind).toBe("flue-run");
		expect(data.harness.dualSurface.flue.try).toMatch(/flue run/);
		expect(data.harness.dualSurface.sharedCustomization).toMatch(
			/harness-customization/,
		);
		expect(data.harness.skillRoots.length).toBeGreaterThan(0);
		// Monorepo walk-up: at least one skill root should resolve when repo has .agents/skills
		expect(data.harness.skillRoots.some((s) => s.present)).toBe(true);
		expect(data.harness.eve.defaultAgents.subagents.map((s) => s.id)).toEqual(
			expect.arrayContaining(["investigator", "implementer", "reviewer"]),
		);
		expect(data.harness.selfImprove.loop.length).toBeGreaterThan(3);
		expect(data.harness.brain.some((b) => b.id === "gbrain")).toBe(true);

		const help = await runHoboCodeCli(["harness", "--help"]);
		expect(help.message).toMatch(/Pi|Flue|skills|self-improve|brain/i);
	});

	it("cost shows $0 path, savings, routing, and never secrets", async () => {
		const r = await runHoboCodeCli(["cost"], {
			env: {
				...process.env,
				HOBO_CODE_MONETIZATION: "0",
				HOBO_CODE_MODEL: "ollama/qwen2.5-coder:7b",
				HOBO_CODE_BUDGET_USD: "2",
				OPENAI_API_KEY: "sk-secret-must-not-leak",
			},
		});
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_COST");
		expect(r.message).toMatch(/◈ cost/);
		expect(r.message).toMatch(/cap ·|spend|save ·/i);
		expect(r.message).toMatch(/local\/free|ollama/i);
		expect(r.message).toMatch(/cheapest|route/i);
		expect(r.message).toMatch(/rtk|headroom|caveman/i);
		expect(r.message).not.toContain("sk-secret");
		const data = r.data as {
			cost: {
				zeroDollarPath: boolean;
				budget: { capUsd: number; monetizationEnabled: boolean };
				savings: { savedPct: number };
				freeLocal: { id: string }[];
				tokenTools: { id: string }[];
				routing: { policy: string; picked: string | null };
			};
		};
		expect(data.cost.zeroDollarPath).toBe(true);
		expect(data.cost.budget.capUsd).toBe(2);
		expect(data.cost.budget.monetizationEnabled).toBe(false);
		expect(data.cost.savings.savedPct).toBeGreaterThan(0);
		expect(data.cost.freeLocal.some((f) => f.id === "ollama")).toBe(true);
		expect(data.cost.tokenTools.map((t) => t.id)).toEqual(
			expect.arrayContaining([
				"rtk",
				"headroom",
				"caveman",
				"serena",
				"ponytail",
			]),
		);
		expect(data.cost.routing.policy).toBe("cheapest-capable");
		expect(data.cost.routing.picked).toBe("local-free");

		const help = await runHoboCodeCli(["cost", "--help"]);
		expect(help.message).toMatch(/\$0|savings|free|local|OrnithAI/i);
	});

	it("guide maps Claude Code SOTA features in plain English", async () => {
		const r = await runHoboCodeCli(["guide"]);
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_GUIDE");
		expect(r.message).toMatch(/Claude Code → hobo-code/);
		expect(r.message).toMatch(/workflows/i);
		expect(r.message).toMatch(/remote connect|attach/i);
		expect(r.message).toMatch(/fork|isolate/i);
		expect(r.message).toMatch(/browser|Chrome/i);
		expect(r.message).toMatch(/Happy path|auth login/i);
		expect(r.message).toMatch(/Residual/i);
		const data = r.data as {
			source?: string;
			guide: {
				map: { claudeCode: string; status: string; try: string }[];
				residual: string[];
				happyPath: string[];
			};
		};
		expect(data.source).toBe("claude-code");
		expect(data.guide.map.length).toBeGreaterThan(5);
		expect(data.guide.map.some((m) => /workflow/i.test(m.claudeCode))).toBe(
			true,
		);
		expect(data.guide.map.some((m) => m.status === "residual")).toBe(true);
		expect(data.guide.happyPath.some((h) => /auth login/.test(h))).toBe(true);
		expect(data.guide.residual.length).toBeGreaterThan(0);

		const help = await runHoboCodeCli(["guide", "--help"]);
		expect(help.message).toMatch(/Claude Code/i);
		expect(help.message).toMatch(/workflows|ultrareview|fork|btw/i);
		expect(help.message).toMatch(/--cursor|Cursor/i);
	});

	it("guide --cursor maps Cursor Agent/Composer/Background/BugBot features", async () => {
		const r = await runHoboCodeCli(["guide", "--cursor"]);
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_GUIDE");
		expect(r.message).toMatch(/Cursor → hobo-code/);
		expect(r.message).toMatch(/Agent mode/i);
		expect(r.message).toMatch(/Composer/i);
		expect(r.message).toMatch(/Background Agent/i);
		expect(r.message).toMatch(/BugBot/i);
		expect(r.message).toMatch(/MCP/i);
		expect(r.message).toMatch(/isolate|promote|dispatch/i);
		expect(r.message).toMatch(/Residual/i);
		const data = r.data as {
			source?: string;
			cursor: {
				map: { cursor: string; status: string }[];
				residual: string[];
			};
		};
		expect(data.source).toBe("cursor");
		expect(data.cursor.map.some((m) => /Agent/i.test(m.cursor))).toBe(true);
		expect(data.cursor.map.some((m) => m.status === "residual")).toBe(true);
		expect(data.cursor.residual.length).toBeGreaterThan(0);

		const fromFlag = await runHoboCodeCli([
			"guide",
			"--from",
			"cursor",
			"--json",
		]);
		expect(fromFlag.ok).toBe(true);
		expect((fromFlag.data as { source: string }).source).toBe("cursor");
	});

	it("tasks shows Grok Build–shaped board and parity JSON", async () => {
		const home = temp("hc-tasks-");
		const r = await runHoboCodeCli(["tasks"], { hoboHome: home });
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_TASKS");
		expect(r.message).toMatch(/▣ tasks/);
		expect(r.message).toMatch(/grok-build · click · tasks · workflows/);
		expect(r.message).toMatch(/click · task-row/);
		const data = r.data as {
			grokBuild: {
				mouseInteractive: boolean;
				clickableRegions: string[];
				backgroundTasks: { supported: boolean };
				workflows: { model: string };
				compare: { grokBuild: string };
			};
			rows: { id: string; clickable: boolean }[];
			workflow: { steps: unknown[] };
		};
		expect(data.grokBuild.mouseInteractive).toBe(true);
		expect(data.grokBuild.clickableRegions).toContain("task-row");
		expect(data.grokBuild.backgroundTasks.supported).toBe(true);
		expect(data.grokBuild.workflows.model).toBe("vercel-workflows-worlds");
		expect(data.grokBuild.compare.grokBuild).toMatch(/Grok Build/i);
		expect(data.rows.length).toBeGreaterThan(0);
		expect(data.rows[0]?.clickable).toBe(true);
		expect(data.workflow.steps.length).toBeGreaterThan(0);

		const help = await runHoboCodeCli(["tasks", "--help"]);
		expect(help.message).toMatch(/Grok Build/i);
		expect(help.message).toMatch(/tasks pane|clickable|workflow/i);
	});

	it("attach shows named endpoint and tmux/mosh/tailscale narrative", async () => {
		const home = temp("hc-attach-");
		const r = await runHoboCodeCli(["attach"], { hoboHome: home });
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_ATTACH");
		expect(r.message).toMatch(/◎ attach/);
		expect(r.message).toMatch(/code\.mux|reattach/i);
		expect(r.message).toMatch(/local|overlay|mosh|session/i);
		const data = r.data as {
			registration: { host: string; mode: string; mosh: { explored: boolean } };
			attach: { detachable: boolean; steps: string[] };
			compare: { tmux: string; mosh: string; tailscale: string };
		};
		expect(data.registration.host.length).toBeGreaterThan(0);
		expect(data.registration.mode).toBe("local");
		expect(data.registration.mosh.explored).toBe(true);
		expect(data.attach.detachable).toBe(true);
		expect(data.attach.steps.length).toBeGreaterThan(2);
		expect(data.compare.tmux).toMatch(/tmux/i);
		expect(data.compare.tailscale).toMatch(/overlay|tailnet|Tailscale/i);

		const ov = await runHoboCodeCli(["attach", "--mode", "overlay", "--json"], {
			hoboHome: home,
		});
		expect(ov.ok).toBe(true);
		const ovData = ov.data as { registration: { mode: string } };
		expect(ovData.registration.mode).toBe("overlay");

		const help = await runHoboCodeCli(["attach", "--help"]);
		expect(help.message).toMatch(/tmux|mosh|Tailscale/i);
		expect(help.message).toMatch(/--mode/);
	});

	it("models shows active model and BYOK env presence without secrets", async () => {
		const r = await runHoboCodeCli(["models"], {
			env: {
				...process.env,
				HOBO_CODE_MODEL: "openai/gpt-4.1",
				OPENAI_API_KEY: "sk-secret-must-not-leak",
			},
		});
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_MODELS");
		expect(r.message).toMatch(/openai\/gpt-4\.1/);
		expect(r.message).toMatch(/OPENAI_API_KEY/);
		expect(r.message).not.toContain("sk-secret");
		expect(r.message).toMatch(/sandbox/i);
		expect(r.message).toMatch(/cost · hobo-code cost|free ·/i);
		const data = r.data as {
			models: { byok: { name: string; present: boolean }[] };
		};
		expect(
			data.models.byok.some((b) => b.name === "OPENAI_API_KEY" && b.present),
		).toBe(true);
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
		expect((result.data as { task: { status: string } }).task.status).toBe(
			"done",
		);
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

	it("auth login binds local station; control-plane verbs are not product surface", async () => {
		const home = temp("hc-auth-bind-");
		const login = await runHoboCodeCli(["auth", "login"], { hoboHome: home });
		expect(login.ok).toBe(true);
		expect(login.code).toBe("HOBO_CODE_AUTH");
		for (const verb of [
			"platform",
			"budget",
			"remote",
			"nodes",
			"join",
		] as const) {
			const r = await runHoboCodeCli([verb], { hoboHome: home });
			expect(r.code).not.toMatch(
				/HOBO_CODE_PLATFORM|HOBO_CODE_BUDGET|HOBO_CODE_REMOTE|HOBO_CODE_NODES|HOBO_CODE_JOIN/,
			);
		}
	});

	it("help names binary hobo-code and default dispatch", async () => {
		const help = await runHoboCodeCli(["help"]);
		expect(help.ok).toBe(true);
		expect(help.message).toContain("hobo-code");
		expect(help.message).toMatch(/^Usage:/m);
		expect(help.message).toContain("dispatch");
		expect(help.message).toContain("env");
		expect(help.message).toContain("--dense");
		expect(help.message).not.toMatch(/\bbuzz\b/);
		expect(help.message).toMatch(/status|tasks|attach/);
		expect(help.message).toContain("attach");
		expect(help.message).toContain("tasks");
		expect(help.message).toMatch(/guide/i);
		expect(help.message).toContain("guide");
		expect(help.message).toMatch(/--cursor|Cursor|guide --cursor/i);
		expect(help.message).toMatch(/^First run:/m);
		expect(help.message).toMatch(/auth login/);
		expect(help.message).toMatch(/cost|harness/);
		expect(help.message).toMatch(/Maps:|guide|tasks|attach|cost|harness/i);
		expect((help.data as { binary: string; defaultVerb: string }).binary).toBe(
			"hobo-code",
		);
		expect((help.data as { defaultVerb: string }).defaultVerb).toBe("dispatch");
		expect(CODE_FEATURE_FLAGS.distributed).toBe("code.distributed");
		expect(HOBO_CODE_VERBS).toContain("env");
		expect(
			(help.data as { hermetic: { schema: string } }).hermetic.schema,
		).toBe("hobo.code.hermetic-env/v1");
	});

	it("status --help and session --help document Herdr mux differentiators", async () => {
		const st = await runHoboCodeCli(["status", "--help"]);
		expect(st.ok).toBe(true);
		expect(st.message).toMatch(/Herdr/i);
		expect(st.message).toMatch(/highlight|copyOnHighlight|copy/i);
		expect(st.message).toMatch(/detach/i);
		expect(st.message).toMatch(/pane/i);
		const se = await runHoboCodeCli(["session", "--help"]);
		expect(se.ok).toBe(true);
		expect(se.message).toMatch(/Herdr|persist|handback|durable/i);
		expect(se.message).toMatch(/HOBO_HOME|session-end|durable/i);
	});

	it("session --json exposes herdr capabilities and durable persistence", async () => {
		const home = temp("hc-herdr-sess-");
		const project = temp("hc-herdr-sess-proj-");
		const r = await runHoboCodeCli(["session", "--json"], {
			hoboHome: home,
			cwd: project,
			env: { HOBO_CODE_EPHEMERAL_SESSION: "1" },
		});
		expect(r.ok).toBe(true);
		const data = r.data as {
			status: { copyOnHighlight: boolean; detachable: boolean; theme: string };
			herdr: { copyOnHighlight: boolean; detachable: boolean; legend: string };
			persistence: {
				durableRoot: string;
				handbackArtifact: string;
				detachable: boolean;
			};
		};
		expect(data.status.copyOnHighlight).toBe(true);
		expect(data.status.detachable).toBe(true);
		expect(data.status.theme).toBe("herdr");
		expect(data.herdr.copyOnHighlight).toBe(true);
		expect(data.herdr.detachable).toBe(true);
		expect(data.herdr.legend).toMatch(/herdr/);
		expect(data.persistence.durableRoot.length).toBeGreaterThan(0);
		expect(data.persistence.handbackArtifact).toBe("session-end.json");
		expect(data.persistence.detachable).toBe(true);
	});

	it("auth --help shows auth topic help, not top-level help", async () => {
		const r = await runHoboCodeCli(["auth", "--help"]);
		expect(r.ok).toBe(true);
		expect(r.code).toBe("HOBO_CODE_HELP");
		expect(r.message).toMatch(/hobo-code auth/i);
		expect(r.message).toMatch(/Usage:/);
		expect(r.message).toMatch(/--json/);
		expect(r.message).toMatch(/login|station/i);
		// Must not be the full top-level verb catalog only
		expect(r.message).not.toMatch(/^ {2}dispatch {3}Send work into the hive/m);
		expect((r.data as { topic: string }).topic).toBe("auth");
	});

	it("help auth matches auth --help topic", async () => {
		const a = await runHoboCodeCli(["help", "auth"]);
		const b = await runHoboCodeCli(["auth", "--help"]);
		expect(a.message).toBe(b.message);
		expect((a.data as { topic: string }).topic).toBe("auth");
	});

	it("promote --help documents runId usage", async () => {
		const r = await runHoboCodeCli(["promote", "--help"]);
		expect(r.message).toMatch(/hobo-code promote/);
		expect(r.message).toMatch(/runId/);
		expect(r.message).toMatch(/isolate/);
		expect((r.data as { topic: string }).topic).toBe("promote");
	});

	it("help --dense shows glyph idiom strip and legend (opt-in)", async () => {
		const help = await runHoboCodeCli(["help", "--dense"]);
		expect(help.ok).toBe(true);
		expect(help.message).toMatch(/^hobo-code★●/m);
		expect(help.message).toMatch(/★d·st·se·sc·i·pr/);
		expect(help.message).toMatch(/ev·au/);
		expect(help.message).toMatch(/dense chrome/);
		expect(help.message).toMatch(/★d=dispatch-default/);
		expect((help.data as { dense: boolean }).dense).toBe(true);
		// Not the full plain Usage block
		expect(help.message).not.toMatch(/^Usage:/m);
	});

	it("HOBO_CODE_DENSE=1 enables dense help without --dense flag", async () => {
		const help = await runHoboCodeCli(["help"], {
			env: { ...process.env, HOBO_CODE_DENSE: "1" },
		});
		expect(help.message).toMatch(/^hobo-code★●/m);
		expect((help.data as { dense: boolean }).dense).toBe(true);
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

	it("promote without run id explains usage and next steps", async () => {
		const r = await runHoboCodeCli(["promote"]);
		expect(r.ok).toBe(false);
		expect(r.code).toBe("HOBO_CODE_USAGE");
		expect(r.message).toMatch(/missing run id/i);
		expect(r.message).toMatch(/hobo-code promote/);
		expect(r.remediation?.some((s) => /isolate/i.test(s))).toBe(true);
	});

	it("promote missing sandbox fails closed with isolate hint", async () => {
		const home = temp("hc-promo-miss-");
		const project = temp("hc-promo-miss-p-");
		const r = await runHoboCodeCli(["promote", "no-such-run"], {
			hoboHome: home,
			cwd: project,
		});
		expect(r.ok).toBe(false);
		expect(r.code).toBe("HOBO_CODE_PROMOTE_MISSING_RUN");
		expect(r.message).toMatch(/no sandbox/i);
		expect(r.message).toMatch(/isolate/);
	});

	it("near-miss verb typo suggests the real verb instead of dispatching", async () => {
		const r = await runHoboCodeCli(["promot"]);
		expect(r.ok).toBe(false);
		expect(r.code).toBe("HOBO_CODE_UNKNOWN_VERB");
		expect(r.message).toMatch(/did you mean · promote/);
		expect(r.message).toMatch(/hobo-code help/);
		expect(r.message).toMatch(/\? cmd|not a verb/);
		// Kind recovery — no false success star for a typo.
		expect(r.message).not.toMatch(/^✓ ★/m);
	});

	it("CLI-shaped unknown token is kind fail, not deceptive dispatch success", async () => {
		const r = await runHoboCodeCli(["not-a-real-verb-zz"]);
		expect(r.ok).toBe(false);
		expect(r.code).toBe("HOBO_CODE_UNKNOWN_VERB");
		expect(r.message).toMatch(/not a verb/);
		expect(r.message).toMatch(/hobo-code help/);
		expect(r.message).toMatch(/prompt ·/);
		expect(r.message).not.toMatch(/^✓ ★/m);
		expect(r.exitCode).toBe(1);
	});

	it("plain status uses English hierarchy; dense keeps glyph box", async () => {
		const home = temp("hc-status-plain-");
		const plain = await runHoboCodeCli(["status"], { hoboHome: home });
		expect(plain.ok).toBe(true);
		expect(plain.message).toMatch(/session status|Agents:/i);
		expect(plain.message).toMatch(/Next:/);
		expect(plain.message).toMatch(/idle|working|done|blocked/);
		expect(plain.message).not.toMatch(/┌─+┐/);
		const dense = await runHoboCodeCli(["status", "--dense"], {
			hoboHome: home,
			dense: true,
		});
		expect(dense.ok).toBe(true);
		expect(dense.message).toMatch(/┌─+┐|hobo-code·/);
	});

	it("help groups verbs and orients HoBo world for GUI-native humans", async () => {
		const help = await runHoboCodeCli(["help"]);
		expect(help.ok).toBe(true);
		expect(help.message).toMatch(/HoBo/i);
		expect(help.message).toMatch(/plain by default/i);
		expect(help.message).toMatch(/Start here:/);
		expect(help.message).toMatch(/Session & status:/);
		expect(help.message).toMatch(/not stock Pi/i);
	});

	it("multi-word bare prompt still dispatches (not a typo)", async () => {
		const home = temp("hc-dispatch-home-");
		const project = temp("hc-dispatch-proj-");
		const r = await runHoboCodeCli(["refine the openui bindle"], {
			hoboHome: home,
			cwd: project,
		});
		expect(r.ok).toBe(true);
		expect(r.code).toMatch(/DISPATCH/);
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
