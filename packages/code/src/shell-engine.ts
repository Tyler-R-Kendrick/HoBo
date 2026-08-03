/**
 * Streaming completion engine for the InteractiveShell (ADR-0139).
 *
 * Pi (`@earendil-works/pi-coding-agent`) is the completion engine — never the
 * product frame (ARCHITECTURE.md hard rule). The engine always runs with its
 * cwd inside a mediated isolation sandbox: agents never write the canonical
 * tree, and promotion stays the sole audited mutation path.
 *
 * When no engine can run (no credentials / opt-out), the shell stays in the
 * honest dispatch-only mode from Slice 1 — `engine:none · dispatch-only`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BYOK_ENV_NAMES } from "./models.js";

// ── Turn protocol ────────────────────────────────────────────────────────

export type EngineTurnEvent =
	| { readonly kind: "text-delta"; readonly delta: string }
	| { readonly kind: "tool-start"; readonly name: string }
	| { readonly kind: "tool-end"; readonly name: string; readonly ok: boolean };

/** Real token/cost accounting for a session — never estimated. */
export interface EngineUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheWriteTokens: number;
	readonly totalTokens: number;
	/** Provider-reported spend in USD for the session so far. */
	readonly costUsd: number;
}

export const ZERO_USAGE: EngineUsage = {
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	totalTokens: 0,
	costUsd: 0,
};

/** Per-turn delta = after − before (clamped at zero for safety). */
export function usageDelta(
	before: EngineUsage,
	after: EngineUsage,
): EngineUsage {
	const sub = (a: number, b: number) => Math.max(0, a - b);
	return {
		inputTokens: sub(after.inputTokens, before.inputTokens),
		outputTokens: sub(after.outputTokens, before.outputTokens),
		cacheReadTokens: sub(after.cacheReadTokens, before.cacheReadTokens),
		cacheWriteTokens: sub(after.cacheWriteTokens, before.cacheWriteTokens),
		totalTokens: sub(after.totalTokens, before.totalTokens),
		costUsd: Math.max(0, after.costUsd - before.costUsd),
	};
}

/** Compact footer/cost rendering, e.g. "1.2k in · 340 out · $0.0123". */
export function formatUsage(usage: EngineUsage): string {
	const n = (v: number) =>
		v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
	const cost =
		usage.costUsd > 0 && usage.costUsd < 0.0001
			? "<$0.0001"
			: `$${usage.costUsd.toFixed(4)}`;
	const cached =
		usage.cacheReadTokens > 0 ? ` · ${n(usage.cacheReadTokens)} cached` : "";
	return `${n(usage.inputTokens)} in · ${n(usage.outputTokens)} out${cached} · ${cost}`;
}

export interface EngineTurnResult {
	readonly ok: boolean;
	readonly text: string;
	readonly toolCalls: number;
	readonly aborted: boolean;
	readonly error?: string;
	/** Tokens/cost consumed by this turn alone (provider-reported). */
	readonly usage?: EngineUsage;
}

/** A file the engine changed inside the mediated sandbox. */
export interface SandboxChange {
	readonly status: string;
	readonly path: string;
}

export interface ShellEngine {
	/** Short engine id for the footer, e.g. "pi". */
	readonly id: string;
	/** provider/model label for the footer — the model that actually runs. */
	readonly modelLabel: string;
	/** Mediated sandbox root the engine works in. */
	readonly sandboxRoot: string;
	/** Isolation run id — promotion target. */
	readonly runId: string;
	turn(
		prompt: string,
		onEvent: (event: EngineTurnEvent) => void,
	): Promise<EngineTurnResult>;
	abort(): Promise<void>;
	dispose(): Promise<void>;
	/** Session-cumulative usage (provider-reported; zeros when unavailable). */
	usage(): EngineUsage;
	/** Files changed in the sandbox — the diff summary an approval gate shows. */
	changes(): Promise<readonly SandboxChange[]>;
}

// ── Availability gate ────────────────────────────────────────────────────

/**
 * Cheap pre-check before paying the engine import/auth cost.
 * HOBO_CODE_ENGINE=none opts out; =pi forces an attempt; otherwise attempt
 * only when some credential source is plausibly present.
 */
export function shouldAttemptEngine(
	env: NodeJS.ProcessEnv,
	options: { readonly piAgentDir?: string } = {},
): boolean {
	const mode = env.HOBO_CODE_ENGINE?.trim().toLowerCase();
	if (mode === "none" || mode === "0" || mode === "off") return false;
	if (mode === "pi") return true;
	const byok = BYOK_ENV_NAMES.some(
		(name) => name !== "HOBO_CODE_MODEL" && Boolean(env[name]),
	);
	if (byok) return true;
	if (env.OPENAI_BASE_URL) return true;
	const agentDir = options.piAgentDir ?? join(env.HOME ?? "", ".pi", "agent");
	return existsSync(join(agentDir, "auth.json"));
}

// ── Sandbox change detection ─────────────────────────────────────────────

/** Parse `git status --porcelain` into typed changes (pure, unit-tested). */
export function parsePorcelain(stdout: string): SandboxChange[] {
	const out: SandboxChange[] = [];
	for (const line of stdout.split("\n")) {
		if (line.trim().length === 0) continue;
		const code = line.slice(0, 2).trim() || "?";
		const rest = line.slice(3).trim();
		if (rest.length === 0) continue;
		// Renames are reported as "old -> new"; the new path is what promotes.
		const path = rest.includes(" -> ") ? rest.split(" -> ")[1]! : rest;
		out.push({ status: code, path });
	}
	return out;
}

/**
 * Files the engine changed inside the mediated sandbox. Async so the shell
 * keeps rendering; a non-git sandbox simply reports no changes.
 */
export function listSandboxChanges(
	sandboxRoot: string,
): Promise<readonly SandboxChange[]> {
	return new Promise((resolvePromise) => {
		const child = spawn("git", ["status", "--porcelain"], {
			cwd: sandboxRoot,
		});
		let stdout = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (c: string) => {
			stdout += c;
		});
		child.on("error", () => resolvePromise([]));
		child.on("close", (code) =>
			resolvePromise(code === 0 ? parsePorcelain(stdout) : []),
		);
	});
}

// ── Pi agent event mapping (pure, unit-tested) ───────────────────────────

/** Minimal structural view of pi's AgentSessionEvent — keeps the mapper pure. */
export interface PiAgentEventLike {
	readonly type: string;
	readonly toolName?: string;
	readonly isError?: boolean;
	readonly assistantMessageEvent?: {
		readonly type: string;
		readonly delta?: string;
	};
}

export function mapPiEventToTurnEvent(
	event: PiAgentEventLike,
): EngineTurnEvent | null {
	if (
		event.type === "message_update" &&
		event.assistantMessageEvent?.type === "text_delta" &&
		typeof event.assistantMessageEvent.delta === "string"
	) {
		return { kind: "text-delta", delta: event.assistantMessageEvent.delta };
	}
	if (event.type === "tool_execution_start" && event.toolName) {
		return { kind: "tool-start", name: event.toolName };
	}
	if (event.type === "tool_execution_end" && event.toolName) {
		return {
			kind: "tool-end",
			name: event.toolName,
			ok: event.isError !== true,
		};
	}
	return null;
}

// ── Pi engine ────────────────────────────────────────────────────────────

export interface CreatePiShellEngineOptions {
	/** Mediated sandbox root (isolation worktree) — the engine's cwd. */
	readonly sandboxRoot: string;
	readonly runId: string;
	/** provider/model spec, e.g. "anthropic/claude-sonnet-4-5". */
	readonly modelSpec: string;
	/** System prompt appended to pi's base prompt. */
	readonly instructions: string;
}

export type CreatePiShellEngineResult =
	| { readonly engine: ShellEngine; readonly reason?: undefined }
	| { readonly engine: null; readonly reason: string };

/**
 * Create the pi-backed engine. Import is dynamic so dispatch-only sessions
 * never pay for it; every failure degrades to an honest reason string.
 */
export async function createPiShellEngine(
	options: CreatePiShellEngineOptions,
): Promise<CreatePiShellEngineResult> {
	let sdk: typeof import("@earendil-works/pi-coding-agent");
	try {
		sdk = await import("@earendil-works/pi-coding-agent");
	} catch (err) {
		return {
			engine: null,
			reason: `pi engine unavailable: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	try {
		const modelRuntime = await sdk.ModelRuntime.create();
		const [provider, ...rest] = options.modelSpec.split("/");
		const resolved = sdk.resolveCliModel({
			...(provider ? { cliProvider: provider } : {}),
			...(rest.length > 0 ? { cliModel: rest.join("/") } : {}),
			modelRuntime,
		});
		if (!resolved.model) {
			return {
				engine: null,
				reason:
					resolved.error ??
					`no usable model for "${options.modelSpec}" (set HOBO_CODE_MODEL / provider API key)`,
			};
		}

		const settingsManager = sdk.SettingsManager.create(
			options.sandboxRoot,
			sdk.getAgentDir(),
		);
		const loader = new sdk.DefaultResourceLoader({
			cwd: options.sandboxRoot,
			agentDir: sdk.getAgentDir(),
			settingsManager,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			appendSystemPrompt: [options.instructions],
		});
		await loader.reload();

		const { session } = await sdk.createAgentSession({
			cwd: options.sandboxRoot,
			modelRuntime,
			model: resolved.model,
			resourceLoader: loader,
			sessionManager: sdk.SessionManager.inMemory(options.sandboxRoot),
		});

		const modelLabel = `${resolved.model.provider}/${resolved.model.id}`;

		/** Provider-reported session totals; zeros if pi cannot report them. */
		const readUsage = (): EngineUsage => {
			try {
				const stats = session.getSessionStats();
				return {
					inputTokens: stats.tokens.input,
					outputTokens: stats.tokens.output,
					cacheReadTokens: stats.tokens.cacheRead,
					cacheWriteTokens: stats.tokens.cacheWrite,
					totalTokens: stats.tokens.total,
					costUsd: stats.cost,
				};
			} catch {
				return ZERO_USAGE;
			}
		};

		const engine: ShellEngine = {
			id: "pi",
			modelLabel,
			sandboxRoot: options.sandboxRoot,
			runId: options.runId,
			usage: readUsage,
			changes: () => listSandboxChanges(options.sandboxRoot),
			async turn(prompt, onEvent) {
				let text = "";
				let toolCalls = 0;
				let aborted = false;
				const before = readUsage();
				const unsubscribe = session.subscribe((event) => {
					const mapped = mapPiEventToTurnEvent(event as PiAgentEventLike);
					if (!mapped) return;
					if (mapped.kind === "text-delta") text += mapped.delta;
					if (mapped.kind === "tool-start") toolCalls += 1;
					onEvent(mapped);
				});
				try {
					await session.prompt(prompt);
					return {
						ok: true,
						text,
						toolCalls,
						aborted,
						usage: usageDelta(before, readUsage()),
					};
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					aborted = /abort/i.test(message);
					return {
						ok: false,
						text,
						toolCalls,
						aborted,
						error: message,
						usage: usageDelta(before, readUsage()),
					};
				} finally {
					unsubscribe();
				}
			},
			async abort() {
				await session.abort();
			},
			async dispose() {
				session.dispose();
			},
		};
		return { engine };
	} catch (err) {
		return {
			engine: null,
			reason: `pi engine init failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
