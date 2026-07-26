import {
	type AuthContext,
	type HoboMcpServer,
	MCP_TOOL_SURFACE,
} from "@hobo/mcp";

// The MCP stdio protocol layer for the composed `hobo-mcp` binary
// (docs/plans/0006 item 3-3). Newline-delimited JSON-RPC 2.0 per the MCP
// stdio transport; no SDK dependency — the protocol subset the surface needs
// (initialize / tools/list / tools/call / ping) is small enough for the
// standard library. All dispatch flows through the injected HoboMcpServer,
// which routes every call through the SAME @hobo/cli command registry the
// CLI uses (NFR-004 parity) with deny-by-default auth ahead of dispatch.

// public-contract: the MCP protocol revision this stdio server speaks.
export const HOBO_MCP_PROTOCOL_VERSION = "2025-06-18";
// public-contract: the serverInfo.name MCP clients display and configure by.
export const HOBO_MCP_SERVER_NAME = "hobo-mcp";
// public-contract: the serverInfo.version reported in the MCP handshake.
export const HOBO_MCP_SERVER_VERSION = "0.0.1";

interface JsonRpcRequest {
	readonly jsonrpc: "2.0";
	readonly id?: number | string | null;
	readonly method: string;
	readonly params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
	readonly jsonrpc: "2.0";
	readonly id: number | string | null;
	readonly result?: unknown;
	readonly error?: {
		readonly code: number;
		readonly message: string;
	};
}

// The local operator context the stdio binary runs with: the invoking user's
// authority, scoped to exactly the derived tool surface (or the subset named
// in HOBO_MCP_TOOLS). Same trust model as running `hobo` directly — and the
// server still audits every decision and denies unknown tools/scopes.
export function localOperatorAuth(
	env: Record<string, string | undefined> = process.env,
): AuthContext {
	const restrict = env.HOBO_MCP_TOOLS
		? new Set(
				env.HOBO_MCP_TOOLS.split(",")
					.map((name) => name.trim())
					.filter((name) => name.length > 0),
			)
		: null;
	const tools = MCP_TOOL_SURFACE.filter(
		(tool) => restrict === null || restrict.has(tool.name),
	);
	return {
		subject: env.HOBO_MCP_SUBJECT ?? "local-operator",
		tenant: env.HOBO_MCP_TENANT ?? "local",
		principal: {
			kind: "user",
			id: env.HOBO_MCP_SUBJECT ?? "local-operator",
		},
		scope: tools.map((tool) => ({
			port: tool.capability.port,
			resource: tool.capability.resource,
			verbs: [tool.capability.verb],
		})),
	};
}

// Handle one JSON-RPC message. Returns the response to write, or null for
// notifications (which get no response per JSON-RPC 2.0).
export async function handleMcpMessage(
	server: HoboMcpServer,
	auth: AuthContext,
	raw: string,
): Promise<JsonRpcResponse | null> {
	let request: JsonRpcRequest;
	try {
		request = JSON.parse(raw) as JsonRpcRequest;
	} catch {
		return {
			jsonrpc: "2.0",
			id: null,
			error: { code: -32700, message: "parse error" },
		};
	}

	const id = request.id ?? null;
	const isNotification = request.id === undefined;

	switch (request.method) {
		case "initialize": {
			const requested = (request.params as { protocolVersion?: string })
				?.protocolVersion;
			return {
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: requested ?? HOBO_MCP_PROTOCOL_VERSION,
					capabilities: { tools: {} },
					serverInfo: {
						name: HOBO_MCP_SERVER_NAME,
						version: HOBO_MCP_SERVER_VERSION,
					},
				},
			};
		}
		case "notifications/initialized":
		case "notifications/cancelled":
			return null;
		case "ping":
			return { jsonrpc: "2.0", id, result: {} };
		case "tools/list":
			return {
				jsonrpc: "2.0",
				id,
				result: {
					tools: server.listTools().map((tool) => ({
						name: tool.name,
						description: `${tool.summary} (role: ${tool.role})`,
						inputSchema: tool.inputSchema,
					})),
				},
			};
		case "tools/call": {
			const params = (request.params ?? {}) as {
				name?: unknown;
				arguments?: unknown;
			};
			if (typeof params.name !== "string") {
				return {
					jsonrpc: "2.0",
					id,
					error: { code: -32602, message: "tools/call requires params.name" },
				};
			}
			const args = (params.arguments ?? {}) as {
				cwd?: unknown;
				camp?: unknown;
				args?: unknown;
			};
			const result = await server.callTool(
				params.name,
				{
					...(typeof args.cwd === "string" ? { cwd: args.cwd } : {}),
					...(typeof args.camp === "string" ? { camp: args.camp } : {}),
					...(Array.isArray(args.args)
						? {
								args: args.args.filter(
									(a): a is string => typeof a === "string",
								),
							}
						: {}),
				},
				auth,
			);
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify(result.output ?? result.error ?? null),
						},
					],
					isError: !result.ok,
				},
			};
		}
		default:
			if (isNotification) {
				return null;
			}
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32601, message: `method not found: ${request.method}` },
			};
	}
}

// Serve newline-delimited JSON-RPC over the given streams until input ends.
export async function serveMcpStdio(options: {
	readonly server: HoboMcpServer;
	readonly auth: AuthContext;
	readonly input: NodeJS.ReadableStream;
	readonly output: NodeJS.WritableStream;
}): Promise<void> {
	let buffer = "";
	for await (const chunk of options.input) {
		buffer += chunk.toString();
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line.length > 0) {
				const response = await handleMcpMessage(
					options.server,
					options.auth,
					line,
				);
				if (response !== null) {
					options.output.write(`${JSON.stringify(response)}\n`);
				}
			}
			newline = buffer.indexOf("\n");
		}
	}
}
