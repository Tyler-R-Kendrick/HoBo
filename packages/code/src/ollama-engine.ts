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

import { at } from "@hobo/core/total-access";
import { AGUI_EVENT } from "./agui.js";
import { LOCAL_TOOL_SCHEMA, runLocalTool } from "./local-tools.js";
import type { ToolPlanner } from "./needle-tools.js";
import {
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

export interface OllamaModelInfo {
	readonly name: string;
	/** Parameters as reported by the server, e.g. "1.5B" → 1.5e9. */
	readonly parameters: number | null;
	readonly family: string | null;
}

export interface OllamaProbe {
	readonly ok: boolean;
	readonly models: readonly string[];
	readonly details: readonly OllamaModelInfo[];
	readonly reason?: string;
}

/** "1.5B" → 1.5e9, "137M" → 1.37e8. Unknown shapes yield null. */
export function parseParameterSize(raw: string | undefined): number | null {
	if (!raw) return null;
	const m = /^([\d.]+)\s*([BM])$/i.exec(raw.trim());
	if (!m) return null;
	const value = Number.parseFloat(at(m, 1));
	if (!Number.isFinite(value)) return null;
	return at(m, 2).toUpperCase() === "B" ? value * 1e9 : value * 1e6;
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
				details: [],
				reason: `ollama HTTP ${response.status}`,
			};
		}
		const body = (await response.json()) as {
			models?: {
				name?: string;
				details?: { parameter_size?: string; family?: string };
			}[];
		};
		const details: OllamaModelInfo[] = (body.models ?? [])
			.filter(
				(
					m,
				): m is {
					name: string;
					details?: { parameter_size?: string; family?: string };
				} => typeof m.name === "string",
			)
			.map((m) => ({
				name: m.name,
				parameters: parseParameterSize(m.details?.parameter_size),
				family: m.details?.family ?? null,
			}));
		return { ok: true, models: details.map((d) => d.name), details };
	} catch (err) {
		return {
			ok: false,
			models: [],
			details: [],
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
	details: readonly OllamaModelInfo[] = [],
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
	// Adaptive default: pick the *smallest* chat-capable model that is already
	// pulled. On a CPU box a 1.5B model can take ~10s per token, which reads as
	// a hang however good the UI is; responsiveness beats capability for the
	// default, and HOBO_CODE_MODEL overrides whenever the user disagrees.
	const sized = chatable
		.map((name) => ({
			name,
			parameters:
				details.find((d) => d.name === name)?.parameters ??
				Number.POSITIVE_INFINITY,
		}))
		.sort((a, b) => a.parameters - b.parameters);
	return sized[0]?.name ?? null;
}

export interface CreateOllamaEngineOptions {
	readonly sandboxRoot: string;
	/**
	 * Decides which tools to run (Cactus Needle). Absent → conversation only,
	 * which is honest but cannot edit files or reach the promotion gate.
	 */
	readonly planner?: ToolPlanner | null;
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
	readonly role: "system" | "user" | "assistant" | "tool";
	readonly content: string;
	/** Present on tool results so the model can attribute the output. */
	readonly name?: string;
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
	const model = selectChatModel(probe.models, options.model, probe.details);
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
			onEvent({ type: AGUI_EVENT.runStarted, runId: options.runId });

			// Tool phase. A model distilled for function calling picks the
			// tools; the chat model never has to emit JSON it is bad at.
			let toolCalls = 0;
			if (options.planner) {
				onEvent({
					type: AGUI_EVENT.stateDelta,
					label: `planning tools with ${options.planner.id}…`,
				});
				const planned = await options.planner.plan(
					prompt,
					LOCAL_TOOL_SCHEMA.map((t) => ({
						name: t.function.name,
						parameters: t.function.parameters,
					})),
				);
				for (const [index, call] of planned.entries()) {
					const id = `tool-${index}`;
					onEvent({
						type: AGUI_EVENT.toolCallStart,
						toolCallId: id,
						toolName: call.name,
					});
					onEvent({
						type: AGUI_EVENT.toolCallArgs,
						toolCallId: id,
						delta: JSON.stringify(call.arguments),
					});
					const outcome = runLocalTool(
						options.sandboxRoot,
						call.name,
						call.arguments,
					);
					toolCalls += 1;
					onEvent({
						type: AGUI_EVENT.toolCallResult,
						toolCallId: id,
						ok: outcome.ok,
						summary: outcome.summary,
					});
					// The chat model answers *from* the tool output, so the
					// result has to enter its context, not just the transcript.
					// ollama's chat API models tool output as its own role; feeding
					// it back as a user turn made the model answer *about* the
					// request instead of *from* the result.
					history.push({
						role: "tool",
						name: call.name,
						content: outcome.content,
					});
				}
			}
			// The model server has to load and evaluate the prompt before the
			// first token; say so rather than showing a frozen screen.
			onEvent({
				type: AGUI_EVENT.stateDelta,
				label: `thinking with ${model}…`,
			});
			try {
				const response = await fetch(`${host}/api/chat`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						model,
						messages: history,
						stream: true,
						// Unbounded generation on a CPU box ran for minutes; a
						// shell answer that never ends is the same as no answer.
						options: {
							num_predict: Number.parseInt(
								process.env.HOBO_CODE_MAX_TOKENS ?? "384",
								10,
							),
						},
					}),
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
							if (text.length === 0) {
								onEvent({
									type: AGUI_EVENT.textMessageStart,
									messageId: "assistant",
									role: "assistant",
								});
							}
							text += delta;
							onEvent({
								type: AGUI_EVENT.textMessageContent,
								messageId: "assistant",
								delta,
							});
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
				onEvent({ type: AGUI_EVENT.textMessageEnd, messageId: "assistant" });
				onEvent({ type: AGUI_EVENT.runFinished, runId: options.runId });
				history.push({ role: "assistant", content: text });
				return {
					ok: true,
					text,
					toolCalls,
					aborted: false,
					usage: usageDelta(before, cumulative),
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const aborted = controller.signal.aborted || /abort/i.test(message);
				// Keep a cancelled partial in history so the next turn has context.
				if (aborted) {
					onEvent({
						type: AGUI_EVENT.runFinished,
						runId: options.runId,
						cancelled: true,
					});
				} else {
					onEvent({
						type: AGUI_EVENT.runError,
						runId: options.runId,
						message,
					});
				}
				if (text.length > 0) history.push({ role: "assistant", content: text });
				return {
					ok: false,
					text,
					toolCalls,
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
