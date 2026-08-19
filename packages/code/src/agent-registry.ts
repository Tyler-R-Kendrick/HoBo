/**
 * Agent auto-detection.
 *
 * The multiplexer used to show three hardcoded panes ("coord", "station",
 * "auth") that corresponded to nothing on the machine. Panes should reflect
 * the agents you actually have, so this discovers them from evidence on disk:
 * a binary on PATH and/or a known config directory.
 *
 * Detection is evidence-based and injectable, so it is testable without
 * depending on whatever happens to be installed on the box running the tests.
 */

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import {
	knownAgentsFrom,
	loadHarnessCatalog,
} from "./agent-harness-catalog.js";

export type AgentKind = "coding-agent" | "inference" | "harness";

export interface KnownAgent {
	readonly id: string;
	readonly label: string;
	readonly kind: AgentKind;
	/** Executables that indicate this agent is installed. */
	readonly binaries: readonly string[];
	/** Config paths (relative to $HOME) that indicate prior use. */
	readonly configPaths: readonly string[];
	/** Command to run in the agent's pane. */
	readonly command: string;
}

// public-contract: agents hobo-code knows how to seat in a pane.
// Derived from `packages/code/harnesses/*.json` — add a file, do not edit this list.
export function getKnownAgents(): readonly KnownAgent[] {
	return knownAgentsFrom(loadHarnessCatalog());
}

export const KNOWN_AGENTS: readonly KnownAgent[] = new Proxy(
	[] as KnownAgent[],
	{
		get(_target, prop) {
			const list = getKnownAgents();
			const value = Reflect.get(list, prop, list);
			return typeof value === "function"
				? (value as (...args: unknown[]) => unknown).bind(list)
				: value;
		},
	},
);

export interface DetectedAgent {
	readonly id: string;
	readonly label: string;
	readonly kind: AgentKind;
	readonly command: string;
	/** Resolved executable, when one was found on PATH. */
	readonly binary: string | null;
	/** Why we think it is here — shown so detection is auditable. */
	readonly evidence: readonly string[];
}

export interface DetectProbes {
	/** Resolve an executable on PATH. */
	readonly which: (binary: string) => string | null;
	/** Does this absolute path exist? */
	readonly exists: (path: string) => boolean;
	readonly home: string;
}

/** Default probes: real PATH lookup and filesystem. */
export function defaultProbes(
	env: NodeJS.ProcessEnv = process.env,
): DetectProbes {
	const paths = (env.PATH ?? "").split(delimiter).filter((p) => p.length > 0);
	return {
		which: (binary) => {
			for (const dir of paths) {
				const candidate = join(dir, binary);
				if (existsSync(candidate)) return candidate;
			}
			return null;
		},
		exists: (path) => existsSync(path),
		home: env.HOME ?? "/root",
	};
}

/**
 * Detect installed agents. An agent counts as present when its binary is on
 * PATH *or* it has left config behind — a configured-but-unlinked agent is
 * still worth a pane, and a binary with no config is still runnable.
 */
export function detectAgents(
	probes: DetectProbes,
	catalog: readonly KnownAgent[] = KNOWN_AGENTS,
): DetectedAgent[] {
	const found: DetectedAgent[] = [];
	for (const agent of catalog) {
		const evidence: string[] = [];
		let binary: string | null = null;
		for (const candidate of agent.binaries) {
			const resolved = probes.which(candidate);
			if (resolved) {
				binary = resolved;
				evidence.push(`bin:${resolved}`);
				break;
			}
		}
		for (const rel of agent.configPaths) {
			const abs = join(probes.home, rel);
			if (probes.exists(abs)) evidence.push(`config:${abs}`);
		}
		if (evidence.length === 0) continue;
		found.push({
			id: agent.id,
			label: agent.label,
			kind: agent.kind,
			command: agent.command,
			binary,
			evidence,
		});
	}
	return found;
}
