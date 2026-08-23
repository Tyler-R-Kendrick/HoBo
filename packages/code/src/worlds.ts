/**
 * Portable durable agent runtimes: **Vercel Workflows + Worlds**.
 *
 * Vercel Workflows (Workflow SDK / WDK) give durable, resumable agent steps.
 * **Worlds** are the adapter system: each World supplies event log, compute,
 * and queue — Local World for offline/dev, Vercel World for managed prod,
 * community Worlds for Postgres/Redis/etc.
 *
 * hobo-code Local World (`HOBO_HOME/worlds/<runId>`) is the offline default
 * (ADR-0139). Production durability adapter shape is Vercel Workflow Worlds
 * (ADR-0123). This module names the portability contract without vendoring WDK.
 *
 * @see https://vercel.com/blog/a-new-programming-model-for-durable-execution
 * @see https://vercel.com/blog/introducing-workflow
 */

// public-contract: world adapter schema.
export const CODE_WORLD_SCHEMA = "hobo.code.world/v1" as const;

export type CodeWorldKind = "local" | "vercel" | "postgres" | "embedded";

/**
 * World supplies the three durable-runtime primitives Workflows need.
 * (Parity with Vercel Worlds: event log · compute · queue.)
 */
export interface CodeWorldCapabilities {
	readonly eventLog: true;
	readonly compute: true;
	readonly queue: true;
}

export interface CodeWorldDescriptor {
	readonly schemaVersion: typeof CODE_WORLD_SCHEMA;
	readonly kind: CodeWorldKind;
	readonly id: string;
	/** Root for durable checkpoints (Local World path or remote handle). */
	readonly rootHint: string;
	readonly capabilities: CodeWorldCapabilities;
	readonly portable: true;
	readonly survivingRestart: true;
	/** Production preferred adapter. */
	readonly productionDefault: boolean;
	/** Offline/dev default. */
	readonly localDefault: boolean;
}

export interface DurableWorkflowStep {
	readonly name: string;
	readonly status: "pending" | "running" | "done" | "failed";
	readonly attempt: number;
}

export interface DurableWorkflowRun {
	readonly runId: string;
	readonly worldId: string;
	readonly worldKind: CodeWorldKind;
	readonly steps: readonly DurableWorkflowStep[];
	readonly survivingRestart: true;
}

const CAPS: CodeWorldCapabilities = {
	eventLog: true,
	compute: true,
	queue: true,
};

/** Local World — offline/dev default under HOBO_HOME/worlds. */
export function localWorld(hoboHome: string): CodeWorldDescriptor {
	return {
		schemaVersion: CODE_WORLD_SCHEMA,
		kind: "local",
		id: "local-world",
		rootHint: `${hoboHome.replace(/\/$/, "")}/worlds`,
		capabilities: CAPS,
		portable: true,
		survivingRestart: true,
		productionDefault: false,
		localDefault: true,
	};
}

/** Vercel Workflow World — managed production durability. */
export function vercelWorkflowWorld(): CodeWorldDescriptor {
	return {
		schemaVersion: CODE_WORLD_SCHEMA,
		kind: "vercel",
		id: "vercel-workflow-world",
		rootHint: "vercel:workflows",
		capabilities: CAPS,
		portable: true,
		survivingRestart: true,
		productionDefault: true,
		localDefault: false,
	};
}

/**
 * Catalog of Worlds hobo-code recognizes for portable durable agent runtimes.
 */
export function describeCodeWorlds(hoboHome = "$HOBO_HOME") {
	const local = localWorld(hoboHome);
	const vercel = vercelWorkflowWorld();
	return {
		model: "vercel-workflows-worlds",
		inspiration: {
			workflows: "https://vercel.com/blog/introducing-workflow",
			durableAgents: "https://ai-sdk.dev/docs/agents/workflow-agent",
		},
		worlds: [local, vercel],
		localDefault: local,
		productionDefault: vercel,
	};
}

/**
 * Bind a durable workflow run to a World (local or vercel).
 * Steps are pure descriptors — execution is adapter-owned.
 */
export function planDurableWorkflowRun(input: {
	readonly runId: string;
	readonly world: CodeWorldDescriptor;
	readonly stepNames: readonly string[];
}): DurableWorkflowRun {
	return {
		runId: input.runId,
		worldId: input.world.id,
		worldKind: input.world.kind,
		steps: input.stepNames.map((name) => ({
			name,
			status: "pending" as const,
			attempt: 0,
		})),
		survivingRestart: true,
	};
}
