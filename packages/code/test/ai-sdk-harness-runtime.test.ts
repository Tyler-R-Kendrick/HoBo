import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bundledHarnessDir } from "../src/agent-harness-catalog.js";
import {
	cliPromptInvocation,
	createHarnessAgent,
	createHarnessV1,
	type HarnessV1Event,
} from "../src/ai-sdk-harness-runtime.js";
import {
	BUILTIN_HARNESS_ADAPTERS,
	HARNESS_RUNTIME_ADAPTERS,
	parseHarnessSpec,
	resolveHarnessRuntime,
} from "../src/harness-spec.js";

describe("harness runtime spec", () => {
	it("parses an explicit AI SDK builtin adapter without switching on agent id", () => {
		const spec = parseHarnessSpec({
			id: "newbot",
			label: "New Bot",
			kind: "coding-agent",
			command: "newbot",
			runtime: { adapter: "claude-code" },
		});
		expect(spec.runtime?.adapter).toBe("claude-code");
		const resolved = resolveHarnessRuntime(spec);
		expect(resolved.origin).toBe("builtin");
		expect(resolved.adapter).toBe("claude-code");
		expect(resolved.packageName).toBe("@ai-sdk/harness-claude-code");
		expect(BUILTIN_HARNESS_ADAPTERS).toContain("claude-code");
	});

	it("defaults omitted runtime from spec kind, never from id", () => {
		expect(
			resolveHarnessRuntime(
				parseHarnessSpec({ id: "x", label: "X", kind: "coding-agent" }),
			),
		).toMatchObject({ origin: "custom", adapter: "cli" });
		expect(
			resolveHarnessRuntime(
				parseHarnessSpec({ id: "x", label: "X", kind: "eve-agent" }),
			),
		).toMatchObject({ origin: "custom", adapter: "eve" });
		expect(
			resolveHarnessRuntime(
				parseHarnessSpec({ id: "x", label: "X", kind: "sdk" }),
			),
		).toMatchObject({ origin: "custom", adapter: "sdk" });
		expect(
			resolveHarnessRuntime(
				parseHarnessSpec({
					id: "x",
					label: "X",
					kind: "harness",
					host: true,
				}),
			),
		).toMatchObject({ origin: "custom", adapter: "skip" });
		expect(
			resolveHarnessRuntime(
				parseHarnessSpec({ id: "x", label: "X", kind: "inference" }),
			),
		).toMatchObject({ origin: "custom", adapter: "skip" });
	});

	it("rejects an unknown runtime adapter with a path-bearing parse error", () => {
		try {
			parseHarnessSpec({
				id: "x",
				label: "X",
				kind: "coding-agent",
				runtime: { adapter: "my-special-bot" },
			});
			expect.unreachable("unknown adapter must throw");
		} catch (error) {
			expect((error as { path?: string }).path).toBe("runtime.adapter");
			expect(String(error)).toContain("claude-code");
		}
	});

	it("declares a closed adapter for every bundled plugin", () => {
		const dir = bundledHarnessDir();
		const names = readdirSync(dir).filter((name) => name.endsWith(".json"));
		expect(names.length).toBeGreaterThan(0);
		const seen = new Set<string>();
		for (const name of names) {
			const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
				id: string;
			};
			const spec = parseHarnessSpec(raw);
			expect(spec.runtime?.adapter, name).toBeDefined();
			expect(HARNESS_RUNTIME_ADAPTERS).toContain(spec.runtime?.adapter);
			const resolved = resolveHarnessRuntime(spec);
			seen.add(resolved.adapter);
			if (resolved.origin === "builtin") {
				expect(resolved.packageName).toMatch(/^@ai-sdk\/harness-/);
			}
			if (resolved.adapter === "cli") {
				expect(spec.runtime?.prompt?.placement).toBe("trailing-arg");
				expect(spec.runtime?.prompt?.prefixArgs?.length).toBeGreaterThan(0);
			}
		}
		expect(seen.has("claude-code")).toBe(true);
		expect(seen.has("codex")).toBe(true);
		expect(seen.has("pi")).toBe(true);
		expect(seen.has("cli")).toBe(true);
	});
});

describe("custom HarnessV1 adapters", () => {
	it("runs a bundled cli harness from spec prompt args without an injected runner", async () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor Agent",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: {
				adapter: "cli",
				prompt: { placement: "trailing-arg", prefixArgs: ["-p"] },
			},
		});
		const harness = await createHarnessV1(spec, {
			spawnCli: async ({ command, args, stdin }) => {
				expect(command).toBe("cursor-agent");
				expect(args).toEqual(["-p", "fix the test"]);
				expect(stdin).toBeUndefined();
				return { stdout: "patched auth.ts", stderr: "", code: 0 };
			},
		});
		expect(harness.specificationVersion).toBe("harness-v1");
		expect(harness.harnessId).toBe("cursor");
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		const turn = await session.doPromptTurn({
			prompt: "fix the test",
			emit: (event) => events.push(event),
		});
		await turn.done;
		expect(events.map((event) => event.type)).toEqual([
			"text-start",
			"text-delta",
			"text-end",
			"finish",
		]);
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: "patched auth.ts",
		});
	});

	it("builds aider and goose one-shot argv from the plugin spec, not agent id", () => {
		expect(
			cliPromptInvocation(
				parseHarnessSpec(
					JSON.parse(
						readFileSync(join(bundledHarnessDir(), "aider.json"), "utf8"),
					),
				),
				"add a test",
			).args,
		).toEqual(["--yes", "--message", "add a test"]);
		expect(
			cliPromptInvocation(
				parseHarnessSpec(
					JSON.parse(
						readFileSync(join(bundledHarnessDir(), "goose.json"), "utf8"),
					),
				),
				"add a test",
			).args,
		).toEqual(["run", "-t", "add a test"]);
		expect(
			cliPromptInvocation(
				parseHarnessSpec(
					JSON.parse(
						readFileSync(join(bundledHarnessDir(), "cursor.json"), "utf8"),
					),
				),
				"add a test",
			).args,
		).toEqual(["-p", "add a test"]);
		expect(
			cliPromptInvocation(
				parseHarnessSpec(
					JSON.parse(
						readFileSync(join(bundledHarnessDir(), "copilot.json"), "utf8"),
					),
				),
				"add a test",
			).args,
		).toEqual(["-p", "add a test"]);
		expect(
			cliPromptInvocation(
				parseHarnessSpec(
					JSON.parse(
						readFileSync(join(bundledHarnessDir(), "gemini.json"), "utf8"),
					),
				),
				"add a test",
			).args,
		).toEqual(["-p", "add a test"]);
	});

	it("runs a cli turn through the injected runner and emits AI SDK text parts", async () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor Agent",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: { adapter: "cli" },
		});
		const harness = await createHarnessV1(spec, {
			runCliTurn: async ({ prompt, command }) => {
				expect(command).toBe("cursor-agent");
				expect(prompt).toBe("fix the test");
				return "patched auth.ts";
			},
		});
		expect(harness.specificationVersion).toBe("harness-v1");
		expect(harness.harnessId).toBe("cursor");
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		const turn = await session.doPromptTurn({
			prompt: "fix the test",
			emit: (event) => events.push(event),
		});
		await turn.done;
		expect(events.map((event) => event.type)).toEqual([
			"text-start",
			"text-delta",
			"text-end",
			"finish",
		]);
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: "patched auth.ts",
		});
	});

	it(
		"loads an installed builtin adapter without switching on agent id",
		async () => {
			const spec = parseHarnessSpec({
				id: "pi",
				label: "Pi",
				kind: "coding-agent",
				runtime: { adapter: "pi" },
			});
			const harness = await createHarnessV1(spec);
			expect(harness.specificationVersion).toBe("harness-v1");
			expect(harness.harnessId).toBe("pi");
		},
		15_000,
	);

	it("loads a builtin adapter via the injected importer instead of a switch on id", async () => {
		const spec = parseHarnessSpec({
			id: "claude",
			label: "Claude Code",
			kind: "coding-agent",
			runtime: { adapter: "claude-code" },
		});
		const harness = await createHarnessV1(spec, {
			importBuiltin: async (packageName) => {
				expect(packageName).toBe("@ai-sdk/harness-claude-code");
				return {
					specificationVersion: "harness-v1" as const,
					harnessId: "claude-code",
					builtinTools: {},
					doStart: async () => {
						throw new Error("builtin session not used in this test");
					},
				};
			},
		});
		expect(harness.harnessId).toBe("claude-code");
	});

	it("fails closed when a builtin adapter package cannot load", async () => {
		const spec = parseHarnessSpec({
			id: "codex",
			label: "Codex",
			kind: "coding-agent",
			runtime: { adapter: "codex" },
		});
		await expect(
			createHarnessV1(spec, {
				importBuiltin: async () => {
					throw new Error("Cannot find package '@ai-sdk/harness-codex'");
				},
			}),
		).rejects.toThrow(/@ai-sdk\/harness-codex/);
	});

	it("passes stdin prompt placement through to spawn", async () => {
		const spec = parseHarnessSpec({
			id: "pipebot",
			label: "Pipe Bot",
			kind: "coding-agent",
			command: "pipebot",
			runtime: {
				adapter: "cli",
				prompt: { placement: "stdin", prefixArgs: ["run"] },
			},
		});
		const harness = await createHarnessV1(spec, {
			spawnCli: async ({ args, stdin }) => {
				expect(args).toEqual(["run"]);
				expect(stdin).toBe("via stdin");
				return { stdout: "piped", stderr: "", code: 0 };
			},
		});
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		await (
			await session.doPromptTurn({
				prompt: "via stdin",
				emit: (event) => events.push(event),
			})
		).done;
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: "piped",
		});
	});

	it("fails closed when the CLI exits non-zero", async () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor Agent",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: { adapter: "cli" },
		});
		const harness = await createHarnessV1(spec, {
			spawnCli: async () => ({ stdout: "", stderr: "boom", code: 2 }),
		});
		const session = await harness.doStart({ sessionId: "s1" });
		await expect(
			session.doPromptTurn({ prompt: "x", emit: () => {} }),
		).rejects.toThrow(/exited 2: boom/);
	});

	it("spawns a real process when spawnCli is omitted", async () => {
		const spec = parseHarnessSpec({
			id: "node",
			label: "Node",
			kind: "coding-agent",
			command: process.execPath,
			runtime: {
				adapter: "cli",
				prompt: { placement: "trailing-arg", prefixArgs: ["-p"] },
			},
		});
		const harness = await createHarnessV1(spec);
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		await (
			await session.doPromptTurn({
				prompt: '"spawn-ok"',
				emit: (event) => events.push(event),
			})
		).done;
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: expect.stringContaining("spawn-ok"),
		});
	});

	it("echoes an eve-tree turn when no runner is injected", async () => {
		const spec = parseHarnessSpec({
			id: "investigator",
			label: "Investigator",
			kind: "eve-agent",
			runtime: { adapter: "eve" },
		});
		const harness = await createHarnessV1(spec);
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		await (
			await session.doPromptTurn({
				prompt: "look around",
				emit: (event) => events.push(event),
			})
		).done;
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: "eve tree investigator received: look around",
		});
	});

	it("runs the sdk adapter through generateSdkText, not a CLI spawn", async () => {
		const spec = parseHarnessSpec({
			id: "sdk",
			label: "SDK",
			kind: "sdk",
			runtime: { adapter: "sdk" },
		});
		const harness = await createHarnessV1(spec, {
			generateSdkText: async (prompt) => `loop:${prompt}`,
		});
		const session = await harness.doStart({ sessionId: "s1" });
		const events: HarnessV1Event[] = [];
		await (
			await session.doPromptTurn({
				prompt: "hello",
				emit: (event) => events.push(event),
			})
		).done;
		expect(events.find((event) => event.type === "text-delta")).toMatchObject({
			delta: "loop:hello",
		});
	});

	it("fails closed when the sdk adapter has no generateSdkText seam", async () => {
		const spec = parseHarnessSpec({
			id: "sdk",
			label: "SDK",
			kind: "sdk",
			runtime: { adapter: "sdk" },
		});
		const harness = await createHarnessV1(spec);
		const session = await harness.doStart({ sessionId: "s1" });
		await expect(
			session.doPromptTurn({ prompt: "hello", emit: () => {} }),
		).rejects.toThrow(/generateSdkText/);
	});

	it("throws on a skip-adapter prompt turn", async () => {
		const spec = parseHarnessSpec({
			id: "ollama",
			label: "Ollama",
			kind: "inference",
			runtime: { adapter: "skip" },
		});
		const harness = await createHarnessV1(spec);
		const session = await harness.doStart({ sessionId: "s1" });
		await expect(
			session.doPromptTurn({ prompt: "hi", emit: () => {} }),
		).rejects.toThrow(/not a runnable/);
	});

	it("constructs a HarnessV1 for every bundled plugin", async () => {
		const fake = {
			specificationVersion: "harness-v1" as const,
			harnessId: "stub",
			builtinTools: {},
			doStart: async () => {
				throw new Error("unused");
			},
		};
		const dir = bundledHarnessDir();
		for (const name of readdirSync(dir).filter((file) =>
			file.endsWith(".json"),
		)) {
			const spec = parseHarnessSpec(
				JSON.parse(readFileSync(join(dir, name), "utf8")),
			);
			await expect(
				createHarnessV1(spec, {
					importBuiltin: async () => fake,
					spawnCli: async () => ({ stdout: "ok", stderr: "", code: 0 }),
					generateSdkText: async () => "ok",
				}),
				name,
			).resolves.toMatchObject({ specificationVersion: "harness-v1" });
		}
	});
});

describe("HarnessAgent factory", () => {
	it("constructs HarnessAgent for a host adapter with just-bash", async () => {
		const spec = parseHarnessSpec({
			id: "pi",
			label: "Pi",
			kind: "coding-agent",
			runtime: { adapter: "pi" },
		});
		const agent = await createHarnessAgent(spec);
		expect(typeof agent.createSession).toBe("function");
	});

	it("wraps a host adapter with the just-bash sandbox, not a switch on id", async () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor Agent",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: { adapter: "cli" },
		});
		const agent = await createHarnessAgent(spec, {
			runCliTurn: async () => "ok",
			importJustBashSandbox: async () => ({
				createJustBashSandbox: () => ({ kind: "just-bash" }),
			}),
			createAgent: ({ harness, sandbox }) => {
				expect(harness.specificationVersion).toBe("harness-v1");
				expect(harness.harnessId).toBe("cursor");
				expect(sandbox).toEqual({ kind: "just-bash" });
				return {
					createSession: async () => ({ sessionId: "s1" }),
				};
			},
		});
		await expect(agent.createSession()).resolves.toEqual({ sessionId: "s1" });
	});

	it("refuses a bridge adapter without a network sandbox", async () => {
		const spec = parseHarnessSpec({
			id: "claude",
			label: "Claude Code",
			kind: "coding-agent",
			runtime: { adapter: "claude-code" },
		});
		await expect(
			createHarnessAgent(spec, {
				importBuiltin: async () => ({
					specificationVersion: "harness-v1" as const,
					harnessId: "claude-code",
					builtinTools: {},
					doStart: async () => {
						throw new Error("unused");
					},
				}),
			}),
		).rejects.toThrow(/@ai-sdk\/sandbox-vercel/);
	});

	it("accepts an injected network sandbox for a bridge adapter", async () => {
		const spec = parseHarnessSpec({
			id: "claude",
			label: "Claude Code",
			kind: "coding-agent",
			runtime: { adapter: "claude-code" },
		});
		const agent = await createHarnessAgent(spec, {
			importBuiltin: async (packageName) => {
				expect(packageName).toBe("@ai-sdk/harness-claude-code");
				return {
					specificationVersion: "harness-v1" as const,
					harnessId: "claude-code",
					builtinTools: {},
					doStart: async () => {
						throw new Error("unused");
					},
				};
			},
			sandbox: { kind: "vercel" },
			createAgent: ({ sandbox }) => {
				expect(sandbox).toEqual({ kind: "vercel" });
				return { createSession: async () => ({}) };
			},
		});
		expect(typeof agent.createSession).toBe("function");
	});

	it("refuses skip adapters instead of constructing HarnessAgent", async () => {
		const spec = parseHarnessSpec({
			id: "ollama",
			label: "Ollama",
			kind: "inference",
			runtime: { adapter: "skip" },
		});
		await expect(createHarnessAgent(spec)).rejects.toThrow(/not a runnable/);
	});

	it("fails closed when HarnessAgent cannot load", async () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor Agent",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: { adapter: "cli" },
		});
		await expect(
			createHarnessAgent(spec, {
				sandbox: { kind: "just-bash" },
				runCliTurn: async () => "ok",
				importHarnessAgent: async () => {
					throw new Error("Cannot find package '@ai-sdk/harness'");
				},
			}),
		).rejects.toThrow(/@ai-sdk\/harness/);
	});
});
