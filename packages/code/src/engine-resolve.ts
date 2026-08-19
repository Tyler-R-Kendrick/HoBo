/**
 * Engine resolution: **local first**.
 *
 * hobo-code's cost story is a $0 path, so a locally hosted SLM is the default
 * and BYOK/cloud is the fallback — never a requirement. Order:
 *
 *   1. `HOBO_CODE_ENGINE=none` → no engine (honest dispatch-only shell)
 *   2. a reachable local model server (ollama) → local SLM
 *   3. cloud credentials present → pi engine
 *   4. otherwise → no engine, with a reason the user can act on
 *
 * Every failure returns a reason string; nothing here throws, because losing
 * an engine must degrade the shell, not crash it.
 */

import { must } from "@hobo/core/total-access";
import { createNeedlePlanner, needlePaths } from "./needle-tools.js";
import {
	createOllamaShellEngine,
	DEFAULT_LOCAL_MODEL,
} from "./ollama-engine.js";
import {
	createPiShellEngine,
	type ShellEngine,
	shouldAttemptEngine,
} from "./shell-engine.js";

export interface ResolveEngineOptions {
	readonly sandboxRoot: string;
	readonly runId: string;
	readonly instructions: string;
	readonly modelSpec: string;
	readonly env: NodeJS.ProcessEnv;
}

export interface ResolvedEngine {
	readonly engine: ShellEngine | null;
	/** Why there is no engine, or which fallback was taken. */
	readonly reason?: string;
}

/** `ollama/qwen2.5-coder:1.5b` → `qwen2.5-coder:1.5b`; passthrough otherwise. */
export function localModelFromSpec(
	spec: string | undefined,
): string | undefined {
	if (!spec) return undefined;
	const trimmed = spec.trim();
	if (trimmed.length === 0) return undefined;
	if (trimmed.startsWith("ollama/")) return trimmed.slice("ollama/".length);
	// A provider-qualified cloud spec is not a local model name.
	if (trimmed.includes("/")) return undefined;
	return trimmed;
}

export type EngineMode = "none" | "local" | "cloud" | "auto";

export function engineMode(env: NodeJS.ProcessEnv): EngineMode {
	const raw = env.HOBO_CODE_ENGINE?.trim().toLowerCase();
	if (raw === "none" || raw === "0" || raw === "off") return "none";
	if (raw === "local" || raw === "ollama") return "local";
	if (raw === "pi" || raw === "cloud") return "cloud";
	return "auto";
}

export async function resolveShellEngine(
	options: ResolveEngineOptions,
): Promise<ResolvedEngine> {
	const mode = engineMode(options.env);
	if (mode === "none") {
		return { engine: null, reason: "HOBO_CODE_ENGINE=none" };
	}

	const reasons: string[] = [];

	if (mode === "auto" || mode === "local") {
		// Tool calling is handled by Cactus Needle, a model distilled for
		// exactly that. Absent → the engine still runs, just conversation-only.
		const planned =
			options.env.HOBO_CODE_TOOLS === "0"
				? { planner: null, reason: "HOBO_CODE_TOOLS=0" }
				: await createNeedlePlanner({ paths: needlePaths(options.env) });
		if (!planned.planner && planned.reason) reasons.push(planned.reason);
		const local = await createOllamaShellEngine({
			planner: planned.planner,
			sandboxRoot: options.sandboxRoot,
			runId: options.runId,
			instructions: options.instructions,
			...(options.env.OLLAMA_HOST ? { host: options.env.OLLAMA_HOST } : {}),
			...(localModelFromSpec(options.env.HOBO_CODE_MODEL)
				? {
						model: must(
							localModelFromSpec(options.env.HOBO_CODE_MODEL),
							"localModelFromSpec(options.env.HOBO_CODE_MODEL)",
						),
					}
				: {}),
		});
		if (local.engine) return { engine: local.engine };
		reasons.push(local.reason);
		if (mode === "local") {
			return { engine: null, reason: local.reason };
		}
	}

	if (mode === "auto" || mode === "cloud") {
		if (shouldAttemptEngine(options.env)) {
			const cloud = await createPiShellEngine({
				sandboxRoot: options.sandboxRoot,
				runId: options.runId,
				modelSpec: options.modelSpec,
				instructions: options.instructions,
			});
			if (cloud.engine) return { engine: cloud.engine };
			reasons.push(cloud.reason);
		} else {
			reasons.push("no cloud credentials");
		}
	}

	return {
		engine: null,
		reason: `${reasons.join("; ")} — run \`ollama pull ${DEFAULT_LOCAL_MODEL}\` for the local $0 path`,
	};
}
