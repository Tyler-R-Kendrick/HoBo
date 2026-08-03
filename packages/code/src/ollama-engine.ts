/**
 * Locally hosted SLM engine (ollama) — the default completion engine.
 *
 * hobo-code is a $0-path product: the shell must think without a cloud
 * account, so a local small language model is the default and BYOK/cloud is
 * the fallback, not the other way round. Talks ollama's `/api/chat` directly
 * (streaming NDJSON) so there is no vendor SDK between the shell and the
 * model, and no credential can be required.
 *
 * Turns run with the sandbox as cwd; the engine proposes, the approval gate
 * disposes (ADR-0139 — promotion stays the sole audited mutation path).
 */

import {
	type EngineTurnEvent,
	type EngineTurnResult,
	type EngineUsage,
	listSandboxChanges,
	type ShellEngine,
	usageDelta,
	ZERO_USAGE,
} from "./shell-engine.js";

// public-contract: default local model-server endpoint callers may override.
export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
/** Small, fast, coding-shaped default — overridable via HOBO_CODE_MODEL. */
// public-contract: the local model the $0 path documents and pulls.
export const DEFAULT_LOCAL_MODEL = "qwen2.5-coder:1.5b";

/** One streamed frame of ollama's chat NDJSON. */
export interface OllamaChatFrame {
	readonly message?: { readonly content?: string };
	readonly done?: boolean;
	readonly done_reason?: string;
	readonly prompt_eval_count?: number;
	readonly eval_count?: number;
	readonly error?: string;
}

/** Parse one NDJSON line; malformed lines are ignored rather than fatal. */
export function parseOllamaFrame(line: string): OllamaChatFrame | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	try {
		return JSON.parse(trimmed) as OllamaChatFrame;
	} catch {
		return null;
	}
}

/** ollama reports counts, not cost — local inference is free, so cost is 0. */
export function usageFromFrame(frame: OllamaChatFrame): EngineUsage {
	const input = frame.prompt_eval_count ?? 0;
	const output = frame.eval_count ?? 0;
	return {
		inputTokens: input,
		outputTokens: output,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: input + output,
		costUsd: 0,
	};
}

export interface OllamaProbe {
	readonly ok: boolean;
	readonly models: readonly string[];
	readonly reason?: string;
}

/** Is a local ollama reachable, and which models does it serve? */
export async function probeOllama(
	host: string = DEFAULT_OLLAMA_HOST,
	timeoutMs = 1500,
): Promise<OllamaProbe> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`${host}/api/tags`, {
			signal: controller.signal,
		});
		if (!response.ok) {
			return {
				ok: false,
				models: [],
				reason: `ollama HTTP ${response.status}`,
			};
		}
		const body = (await response.json()) as {
			models?: { name?: string }[];
		};
		const models = (body.models ?? [])
			.map((m) => m.name)
			.filter((n): n is string => typeof n === "string");
		return { ok: true, models };
	} catch (err) {
		return {
			ok: false,
			models: [],
			reason: err instanceof Error ? err.message : String(err),
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Pick a chat-capable model. Embedding models cannot answer, so they are
 * excluded — serving one and calling it a chat engine would be a lie.
 */
export function selectChatModel(
	models: readonly string[],
	preferred?: string,
): string | null {
	const chatable = models.filter((m) => !/embed/i.test(m));
	if (preferred) {
		const exact = chatable.find((m) => m === preferred);
		if (exact) return exact;
		const loose = chatable.find(
			(m) => m.split(":")[0] === preferred.split(":")[0],
		);
		if (loose) return loose;
		// An explicitly requested model that is not served is an error the
		// caller must see, not something to silently substitute.
		return null;
	}
	return (
		chatable.find((m) => m.startsWith(DEFAULT_LOCAL_MODEL.split(":")[0]!)) ??
		chatable[0] ??
		null
	);
}

export interface CreateOllamaEngineOptions {
	readonly sandboxRoot: string;
	readonly runId: string;
	readonly instructions: string;
	readonly host?: string;
	/** Explicit model (HOBO_CODE_MODEL, minus any `ollama/` prefix). */
	readonly model?: string;
}

export type CreateOllamaEngineResult =
	| { readonly engine: ShellEngine; readonly reason?: undefined }
	| { readonly engine: null; readonly reason: string };

interface ChatMessage {
	readonly role: "system" | "user" | "assistant";
	readonly content: string;
}

export async function createOllamaShellEngine(
	options: CreateOllamaEngineOptions,
): Promise<CreateOllamaEngineResult> {
	const host = options.host ?? DEFAULT_OLLAMA_HOST;
	const probe = await probeOllama(host);
	if (!probe.ok) {
		return {
			engine: null,
			reason: `no local model server at ${host} (${probe.reason ?? "unreachable"}) — start ollama or set HOBO_CODE_ENGINE=none`,
		};
	}
	const model = selectChatModel(probe.models, options.model);
	if (!model) {
		return {
			engine: null,
			reason: options.model
				? `local model "${options.model}" is not served by ${host} — try: ollama pull ${options.model}`
				: `${host} serves no chat-capable model (embedding-only) — try: ollama pull ${DEFAULT_LOCAL_MODEL}`,
		};
	}

	const history: ChatMessage[] = [
		{ role: "system", content: options.instructions },
	];
	let cumulative: EngineUsage = ZERO_USAGE;
	let inFlight: AbortController | null = null;

	const engine: ShellEngine = {
		id: "ollama",
		modelLabel: model,
		sandboxRoot: options.sandboxRoot,
		runId: options.runId,
		usage: () => cumulative,
		changes: () => listSandboxChanges(options.sandboxRoot),
		async turn(prompt, onEvent) {
			const before = cumulative;
			history.push({ role: "user", content: prompt });
			const controller = new AbortController();
			inFlight = controller;
			let text = "";
			try {
				const response = await fetch(`${host}/api/chat`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ model, messages: history, stream: true }),
					signal: controller.signal,
				});
				if (!response.ok || !response.body) {
					throw new Error(`ollama HTTP ${response.status}`);
				}
				// Stream NDJSON, emitting each token the moment it lands — on a
				// slow local box this is the difference between watching words
				// appear and staring at a frozen screen.
				const decoder = new TextDecoder();
				let buffer = "";
				for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
					buffer += decoder.decode(chunk, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						const frame = parseOllamaFrame(line);
						if (!frame) continue;
						if (frame.error) throw new Error(frame.error);
						const delta = frame.message?.content;
						if (delta) {
							text += delta;
							onEvent({ kind: "text-delta", delta });
						}
						if (frame.done) {
							const turnUsage = usageFromFrame(frame);
							cumulative = {
								inputTokens: cumulative.inputTokens + turnUsage.inputTokens,
								outputTokens: cumulative.outputTokens + turnUsage.outputTokens,
								cacheReadTokens: 0,
								cacheWriteTokens: 0,
								totalTokens: cumulative.totalTokens + turnUsage.totalTokens,
								costUsd: 0,
							};
						}
					}
				}
				history.push({ role: "assistant", content: text });
				return {
					ok: true,
					text,
					toolCalls: 0,
					aborted: false,
					usage: usageDelta(before, cumulative),
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const aborted = controller.signal.aborted || /abort/i.test(message);
				// Keep a cancelled partial in history so the next turn has context.
				if (text.length > 0) history.push({ role: "assistant", content: text });
				return {
					ok: false,
					text,
					toolCalls: 0,
					aborted,
					...(aborted ? {} : { error: message }),
					usage: usageDelta(before, cumulative),
				};
			} finally {
				inFlight = null;
			}
		},
		async abort() {
			inFlight?.abort();
		},
		async dispose() {
			inFlight?.abort();
		},
	};
	return { engine };
}
