/**
 * Local SLM engine contract, exercised against a real HTTP server on
 * 127.0.0.1 — no network, no credentials, no mocking of fetch. What the
 * shell does with a locally hosted model is the product's whole $0 path,
 * so it is tested end to end rather than stubbed at the seam.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { AGUI_EVENT } from "../src/agui.js";
import { engineMode, localModelFromSpec } from "../src/engine-resolve.js";
import {
	createOllamaShellEngine,
	DEFAULT_LOCAL_MODEL,
	parseOllamaFrame,
	probeOllama,
	selectChatModel,
	usageFromFrame,
} from "../src/ollama-engine.js";
import type { EngineTurnEvent } from "../src/shell-engine.js";

const servers: Server[] = [];
afterAll(() => {
	for (const s of servers) s.close();
});

interface FakeOptions {
	readonly models?: string[];
	readonly chunks?: string[];
	readonly failChat?: number;
	readonly hangMs?: number;
}

/** A minimal stand-in for ollama's /api/tags + streaming /api/chat. */
function fakeOllama(options: FakeOptions = {}): Promise<string> {
	const models = options.models ?? [DEFAULT_LOCAL_MODEL];
	const server = createServer((req, res) => {
		if (req.url === "/api/tags") {
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
			return;
		}
		if (req.url === "/api/chat") {
			if (options.failChat) {
				res.statusCode = options.failChat;
				res.end("nope");
				return;
			}
			res.setHeader("content-type", "application/x-ndjson");
			const chunks = options.chunks ?? ["Hel", "lo", " there"];
			let i = 0;
			const push = () => {
				if (i < chunks.length) {
					res.write(
						`${JSON.stringify({ message: { content: chunks[i] }, done: false })}\n`,
					);
					i += 1;
					setTimeout(push, options.hangMs ?? 1);
					return;
				}
				res.write(
					`${JSON.stringify({
						message: { content: "" },
						done: true,
						done_reason: "stop",
						prompt_eval_count: 21,
						eval_count: 7,
					})}\n`,
				);
				res.end();
			};
			push();
			return;
		}
		res.statusCode = 404;
		res.end();
	});
	servers.push(server);
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			resolve(`http://127.0.0.1:${port}`);
		});
	});
}

describe("ollama wire format", () => {
	it("parses frames and ignores malformed lines instead of dying", () => {
		expect(parseOllamaFrame('{"done":true}')).toEqual({ done: true });
		expect(parseOllamaFrame("")).toBeNull();
		expect(parseOllamaFrame("not json")).toBeNull();
	});

	it("reports token counts and zero cost — local inference is free", () => {
		const usage = usageFromFrame({ prompt_eval_count: 30, eval_count: 12 });
		expect(usage.inputTokens).toBe(30);
		expect(usage.outputTokens).toBe(12);
		expect(usage.totalTokens).toBe(42);
		expect(usage.costUsd).toBe(0);
	});
});

describe("model selection", () => {
	it("never selects an embedding model as a chat engine", () => {
		expect(selectChatModel(["nomic-embed-text:latest"])).toBeNull();
		expect(
			selectChatModel(["nomic-embed-text:latest", "qwen2.5-coder:1.5b"]),
		).toBe("qwen2.5-coder:1.5b");
	});

	it("honours an explicit request and refuses to silently substitute", () => {
		expect(selectChatModel(["llama3.2:1b"], "llama3.2:1b")).toBe("llama3.2:1b");
		// Same family, different tag → acceptable match.
		expect(selectChatModel(["llama3.2:3b"], "llama3.2:1b")).toBe("llama3.2:3b");
		// Absent entirely → null, so the user is told rather than surprised.
		expect(selectChatModel(["qwen2.5-coder:1.5b"], "mistral")).toBeNull();
	});
});

describe("engine mode + spec parsing", () => {
	it("maps env to a mode", () => {
		expect(engineMode({ HOBO_CODE_ENGINE: "none" })).toBe("none");
		expect(engineMode({ HOBO_CODE_ENGINE: "local" })).toBe("local");
		expect(engineMode({ HOBO_CODE_ENGINE: "pi" })).toBe("cloud");
		expect(engineMode({})).toBe("auto");
	});

	it("extracts a local model name only from local-shaped specs", () => {
		expect(localModelFromSpec("ollama/qwen2.5-coder:1.5b")).toBe(
			"qwen2.5-coder:1.5b",
		);
		expect(localModelFromSpec("llama3.2:1b")).toBe("llama3.2:1b");
		expect(localModelFromSpec("anthropic/claude-sonnet-5")).toBeUndefined();
		expect(localModelFromSpec(undefined)).toBeUndefined();
	});
});

describe("local SLM engine", () => {
	it("streams deltas and reports real usage from a live server", async () => {
		const host = await fakeOllama({ chunks: ["Hel", "lo", " there"] });
		const created = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-local",
			instructions: "be terse",
			host,
		});
		expect(created.engine).not.toBeNull();
		const engine = created.engine!;
		expect(engine.id).toBe("ollama");
		expect(engine.modelLabel).toBe(DEFAULT_LOCAL_MODEL);

		const events: EngineTurnEvent[] = [];
		const result = await engine.turn("hi", (e) => events.push(e));
		expect(result.ok).toBe(true);
		expect(result.text).toBe("Hello there");
		// Deltas arrive incrementally — that is what makes a slow local model
		// bearable instead of a frozen screen.
		expect(
			events.filter((e) => e.type === AGUI_EVENT.textMessageContent),
		).toHaveLength(3);
		// The run is bracketed and the wait is announced, so the UI has
		// something honest to show before the first token lands.
		expect(events[0]!.type).toBe(AGUI_EVENT.runStarted);
		expect(events.some((e) => e.type === AGUI_EVENT.stateDelta)).toBe(true);
		expect(events.at(-1)!.type).toBe(AGUI_EVENT.runFinished);
		expect(result.usage?.inputTokens).toBe(21);
		expect(result.usage?.outputTokens).toBe(7);
		expect(result.usage?.costUsd).toBe(0);
		// Session usage accumulates.
		expect(engine.usage().totalTokens).toBe(28);
	});

	it("keeps conversation context across turns", async () => {
		const host = await fakeOllama({ chunks: ["ok"] });
		const { engine } = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-ctx",
			instructions: "be terse",
			host,
		});
		await engine!.turn("first", () => {});
		const second = await engine!.turn("second", () => {});
		expect(second.ok).toBe(true);
		// Two turns of usage, not one.
		expect(engine!.usage().totalTokens).toBe(56);
	});

	it("abort stops an in-flight turn and reports it as cancelled", async () => {
		const host = await fakeOllama({
			chunks: ["a", "b", "c", "d", "e", "f"],
			hangMs: 60,
		});
		const { engine } = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-abort",
			instructions: "be terse",
			host,
		});
		const turn = engine!.turn("long one", () => {});
		setTimeout(() => void engine!.abort(), 80);
		const result = await turn;
		expect(result.aborted).toBe(true);
		expect(result.ok).toBe(false);
		// A cancelled turn is not an error the user must debug.
		expect(result.error).toBeUndefined();
	});

	it("degrades with an actionable reason when nothing is served", async () => {
		const host = await fakeOllama({ models: ["nomic-embed-text:latest"] });
		const created = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-none",
			instructions: "x",
			host,
		});
		expect(created.engine).toBeNull();
		expect(created.reason).toMatch(/embedding-only/);
		expect(created.reason).toMatch(/ollama pull/);
	});

	it("degrades when the server is unreachable", async () => {
		const created = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-down",
			instructions: "x",
			host: "http://127.0.0.1:1",
		});
		expect(created.engine).toBeNull();
		expect(created.reason).toMatch(/no local model server/);
	});

	it("surfaces a chat HTTP failure as a turn error, not a crash", async () => {
		const host = await fakeOllama({ failChat: 500 });
		const { engine } = await createOllamaShellEngine({
			sandboxRoot: process.cwd(),
			runId: "run-500",
			instructions: "x",
			host,
		});
		const result = await engine!.turn("hi", () => {});
		expect(result.ok).toBe(false);
		expect(result.aborted).toBe(false);
		expect(result.error).toMatch(/500/);
	});

	it("probe reports served models", async () => {
		const host = await fakeOllama({ models: ["a:1", "b:2"] });
		const probe = await probeOllama(host);
		expect(probe.ok).toBe(true);
		expect(probe.models).toEqual(["a:1", "b:2"]);
	});
});
