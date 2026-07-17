// `agent` — a durable, tool-invoking actor (sdk-api.md §Layer 4, lowering onto
// `hobo:runtime/agent`). An agent IS a workflow: it lowers onto the same durable
// engine, so every tool call is a journaled step (replayable) and every reach
// for a tool or broker token passes through the deny-by-default capability
// membrane in `ctx`. A tool the agent never declared has no capability and is
// refused with a typed `CapabilityDeniedError`.

import {
	type Capability,
	toolCapability,
	tokenCapability,
} from "./ctx.js";
import {
	defineWorkflow,
	type WorkflowContext,
	type WorkflowDefinition,
} from "./workflow.js";

/** A tool the agent may invoke (deny-by-default: must be declared to be reachable). */
export interface AgentTool<I = unknown, O = unknown> {
	name: string;
	run(input: I): Promise<O> | O;
}

export interface DefineAgentInput<A, R> {
	name: string;
	/** Tools available to the agent; each grants a `tool:<name>` capability. */
	tools?: AgentTool[];
	/** Extra capabilities (e.g. `token:<provider>`) the agent is granted. */
	capabilities?: Iterable<Capability>;
	/** The agent body; drives tools via `ctx.tool(name, input)`. */
	run(ctx: WorkflowContext, input: A): Promise<R> | R;
}

/**
 * Define a durable agent. The returned value is a `WorkflowDefinition` — the
 * agent runs on the workflow engine unchanged. Declared tools become
 * `tool:<name>` capabilities in the context's grant set; anything else is denied.
 */
export function agent<A, R>(
	input: DefineAgentInput<A, R>,
): WorkflowDefinition<A, R> {
	if (!input.name) {
		throw new TypeError("agent name must be a non-empty string");
	}
	const tools = input.tools ?? [];
	const toolRegistry: Record<string, (value: unknown) => Promise<unknown> | unknown> =
		{};
	const grantedCapabilities: Capability[] = [];

	for (const tool of tools) {
		toolRegistry[tool.name] = (value) => tool.run(value);
		grantedCapabilities.push(toolCapability(tool.name));
	}

	return defineWorkflow<A, R>({
		name: input.name,
		capabilities: [...grantedCapabilities, ...(input.capabilities ?? [])],
		tools: toolRegistry,
		run: input.run,
	});
}

export { toolCapability, tokenCapability };
