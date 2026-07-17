import type { HoboCli } from "@hobo/cli";
import { CREDENTIAL_AUDIT_RETENTION } from "@hobo/identity";

import {
	MCP_EVENTS_SCHEMA_VERSION,
	MCP_TOOL_CALL_DECIDED,
	decideToolCall,
	observeToolOutput,
	authorizedToolNames,
	type AuthContext,
	type AuthDecisionEvent,
	type InertOutputObservation,
	type ToolDecision,
} from "./auth.js";
import {
	MCP_TOOL_SURFACE,
	assertToolSurfaceParity,
	findTool,
	type ParityReport,
	type ToolDescriptor,
} from "./tool-surface.js";

// S3-01/S3-02 — the MCP server object. It exposes listTools()/callTool() and
// dispatches EVERY tool through the SAME @hobo/cli command registry the CLI
// uses (an injected HoboCli whose plan/up/down/login commands are wired to a
// YardRuntime). There is no second implementation of plan/up/down here: a tool
// call becomes `hobo <verb> --json` over the shared dispatch path. Auth is
// checked BEFORE dispatch (deny-by-default); results are inert data.

export interface ToolCallInput {
	readonly cwd?: string;
	readonly camp?: string;
	readonly args?: readonly string[];
}

// domain-view: the inert tool-call result; its wire form is McpToolCallResult
// in data-models/mcp.proto. `output` is pure data — the CLI envelope — and can
// never schedule or widen a follow-up call (ADR-0023 item 3).
export interface ToolCallResult {
	readonly ok: boolean;
	readonly tool: string;
	readonly status: string;
	readonly code: string;
	readonly output: unknown;
	readonly decision: ToolDecision;
	readonly error?: { readonly code: string; readonly message: string };
}

export interface HoboMcpServer {
	readonly listTools: () => readonly ToolDescriptor[];
	readonly parity: () => ParityReport;
	readonly authorizedTools: (auth: AuthContext) => readonly string[];
	readonly callTool: (
		name: string,
		input: ToolCallInput,
		auth: AuthContext,
		options?: { correlationId?: string },
	) => Promise<ToolCallResult>;
	readonly observeToolOutput: (input: {
		auth: AuthContext;
		tool: string;
		output: unknown;
	}) => InertOutputObservation;
	readonly getAuditEvents: () => readonly AuthDecisionEvent[];
}

export interface CreateHoboMcpServerOptions {
	// The shared dispatch layer. Its plan/up/down/login command modules carry the
	// injected YardRuntime, exactly as the CLI tests wire them.
	readonly cli: HoboCli;
	readonly surface?: readonly ToolDescriptor[];
	readonly auditSink?: (event: AuthDecisionEvent) => void;
	readonly now?: () => string;
}

export function createHoboMcpServer(options: CreateHoboMcpServerOptions): HoboMcpServer {
	const surface = options.surface ?? MCP_TOOL_SURFACE;
	const now = options.now ?? (() => new Date().toISOString());
	const auditEvents: AuthDecisionEvent[] = [];
	let seq = 0;

	function record(event: AuthDecisionEvent): void {
		auditEvents.push(event);
		options.auditSink?.(event);
	}

	return {
		listTools() {
			return surface;
		},
		parity() {
			return assertToolSurfaceParity(surface);
		},
		authorizedTools(auth) {
			return authorizedToolNames(auth, surface);
		},
		async callTool(name, input, auth, callOptions) {
			const correlationId = callOptions?.correlationId ?? `mcp:${name}:${auth.subject}`;
			const tool = findTool(name, surface);
			if (!tool) {
				// Unknown tools are not part of the derived surface — fail closed.
				const decision = deniedUnknown(name, auth, correlationId, (seq += 1), now());
				record(decision.event);
				return {
					ok: false,
					tool: name,
					status: "denied",
					code: "MCP_UNKNOWN_TOOL",
					output: null,
					decision,
					error: { code: "MCP_UNKNOWN_TOOL", message: `unknown tool "${name}"` },
				};
			}

			const decision = decideToolCall({
				auth,
				tool,
				correlationId,
				seq: (seq += 1),
				now: now(),
			});
			record(decision.event);

			// Deny-by-default: the scope check gates BEFORE the shared dispatch runs.
			if (decision.effect === "deny") {
				return {
					ok: false,
					tool: tool.name,
					status: "denied",
					code: "MCP_SCOPE_DENIED",
					output: null,
					decision,
					error: { code: "MCP_SCOPE_DENIED", message: decision.reason },
				};
			}

			// Authorized: dispatch through the SAME registry the CLI uses.
			const argv = buildArgv(tool.verb, input);
			const runOptions = input.cwd !== undefined ? { cwd: input.cwd } : {};
			const run = await options.cli.run(argv, runOptions);
			const envelope = parseEnvelope(run.stdout);

			return {
				ok: run.exitCode === 0 && envelope.ok !== false,
				tool: tool.name,
				status: typeof envelope.status === "string" ? envelope.status : "unknown",
				code: typeof envelope.code === "string" ? envelope.code : "HOBO_OK",
				output: envelope,
				decision,
			};
		},
		observeToolOutput(input) {
			return observeToolOutput({ ...input, surface });
		},
		getAuditEvents() {
			return [...auditEvents];
		},
	};
}

function buildArgv(verb: string, input: ToolCallInput): string[] {
	const argv = [verb, "--json"];
	if (input.camp !== undefined) {
		argv.push("--camp", input.camp);
	}
	if (input.args) {
		argv.push(...input.args);
	}
	return argv;
}

function parseEnvelope(stdout: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(stdout) as unknown;
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: { raw: stdout };
	} catch {
		return { raw: stdout };
	}
}

function deniedUnknown(
	name: string,
	auth: AuthContext,
	correlationId: string,
	seq: number,
	time: string,
): ToolDecision {
	const reason = `unknown tool "${name}"`;
	return {
		effect: "deny",
		tool: name,
		subject: auth.subject,
		tenant: auth.tenant,
		reason,
		event: {
			id: `evt-mcp-decided-${name}-${seq}`,
			type: MCP_TOOL_CALL_DECIDED,
			schemaVersion: MCP_EVENTS_SCHEMA_VERSION,
			tenant: auth.tenant,
			seq,
			time,
			actor: auth.principal,
			correlationId,
			retention: CREDENTIAL_AUDIT_RETENTION,
			data: { tool: name, subject: auth.subject, effect: "deny", reason },
		},
	};
}
