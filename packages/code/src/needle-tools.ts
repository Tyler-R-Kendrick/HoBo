/**
 * Cactus Needle as the tool-call planner.
 *
 * Division of labour: Needle (26M, distilled purely for function calling)
 * decides *which tool to run with which arguments*; the chat SLM writes prose.
 * A 1.5B general model asked to emit JSON tool calls is unreliable and slow;
 * a model trained for exactly that job is neither.
 *
 * The bridge is a long-lived Python process (see `bridges/needle_bridge.py`)
 * because loading JAX weights per turn would cost more than the inference.
 * Everything degrades honestly: if Needle is not installed, the engine simply
 * runs without tools and says so.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface PlannedToolCall {
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

export interface ToolPlanner {
	readonly id: string;
	plan(
		query: string,
		tools: readonly unknown[],
	): Promise<readonly PlannedToolCall[]>;
	dispose(): void;
}

export interface NeedlePaths {
	/** Needle checkout (default ~/.cactus/needle). */
	readonly dir: string;
	/** Python with jax/flax/needle deps (default <dir>/.venv/bin/python). */
	readonly python: string;
	/** The bridge script shipped with this package. */
	readonly bridge: string;
}

export function needlePaths(
	env: NodeJS.ProcessEnv = process.env,
	packageRoot = join(import.meta.dirname, ".."),
): NeedlePaths {
	const dir =
		env.HOBO_CODE_NEEDLE_DIR ?? join(env.HOME ?? "/root", ".cactus", "needle");
	return {
		dir,
		python: env.HOBO_CODE_NEEDLE_PYTHON ?? join(dir, ".venv", "bin", "python"),
		bridge: join(packageRoot, "bridges", "needle_bridge.py"),
	};
}

/** Is Needle plausibly installed? Cheap check before paying for a spawn. */
export function needleInstalled(paths: NeedlePaths): boolean {
	return existsSync(paths.python) && existsSync(paths.bridge);
}

/** Parse one bridge response line; malformed output never throws. */
export function parseBridgeLine(
	line: string,
): { ready?: boolean; calls?: PlannedToolCall[]; error?: string } | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	try {
		const parsed = JSON.parse(trimmed) as {
			ok?: boolean;
			ready?: boolean;
			calls?: unknown;
			error?: string;
		};
		if (parsed.ready) return { ready: true };
		if (parsed.ok === false) return { error: parsed.error ?? "unknown error" };
		const calls = Array.isArray(parsed.calls) ? parsed.calls : [];
		return {
			calls: calls
				.filter(
					(c): c is { name: string; arguments?: Record<string, unknown> } =>
						typeof c === "object" &&
						c !== null &&
						typeof (c as { name?: unknown }).name === "string",
				)
				.map((c) => ({ name: c.name, arguments: c.arguments ?? {} })),
		};
	} catch {
		return null;
	}
}

export interface CreateNeedlePlannerOptions {
	readonly paths: NeedlePaths;
	/** How long to wait for weights to become resident. */
	readonly readyTimeoutMs?: number;
	/** How long a single plan may take. */
	readonly planTimeoutMs?: number;
}

export type CreatePlannerResult =
	| { readonly planner: ToolPlanner; readonly reason?: undefined }
	| { readonly planner: null; readonly reason: string };

export async function createNeedlePlanner(
	options: CreateNeedlePlannerOptions,
): Promise<CreatePlannerResult> {
	const { paths } = options;
	if (!needleInstalled(paths)) {
		return {
			planner: null,
			reason: `cactus needle not installed at ${paths.dir} — tool calling is off`,
		};
	}
	const child: ChildProcess = spawn(paths.python, [paths.bridge], {
		env: { ...process.env, HOBO_CODE_NEEDLE_DIR: paths.dir },
		stdio: ["pipe", "pipe", "ignore"],
	});
	let buffer = "";
	const waiters: ((r: {
		calls?: PlannedToolCall[];
		error?: string;
	}) => void)[] = [];
	let ready = false;
	let readyResolve: ((ok: boolean) => void) | null = null;

	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const parsed = parseBridgeLine(line);
			if (!parsed) continue;
			if (parsed.ready) {
				ready = true;
				readyResolve?.(true);
				continue;
			}
			waiters.shift()?.(parsed);
		}
	});
	child.on("error", () => readyResolve?.(false));
	child.on("exit", () => {
		readyResolve?.(false);
		while (waiters.length > 0) waiters.shift()?.({ error: "needle exited" });
	});

	const readyOk = await new Promise<boolean>((resolvePromise) => {
		readyResolve = resolvePromise;
		setTimeout(() => resolvePromise(ready), options.readyTimeoutMs ?? 120_000);
	});
	if (!readyOk) {
		child.kill("SIGKILL");
		return {
			planner: null,
			reason: "cactus needle did not become ready — tool calling is off",
		};
	}

	return {
		planner: {
			id: "cactus-needle",
			plan(query, tools) {
				if (child.exitCode !== null) return Promise.resolve([]);
				return new Promise((resolvePromise) => {
					const timer = setTimeout(() => {
						const i = waiters.indexOf(settle);
						if (i >= 0) waiters.splice(i, 1);
						resolvePromise([]);
					}, options.planTimeoutMs ?? 30_000);
					const settle = (r: { calls?: PlannedToolCall[]; error?: string }) => {
						clearTimeout(timer);
						resolvePromise(r.calls ?? []);
					};
					waiters.push(settle);
					child.stdin?.write(`${JSON.stringify({ query, tools })}\n`);
				});
			},
			dispose() {
				child.stdin?.end();
				child.kill("SIGKILL");
			},
		},
	};
}
