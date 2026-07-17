export {
	MCP_CONTROL_SURFACE_INTERFACE,
	MCP_CONTROL_SURFACE_PORT,
} from "./port.js";

export {
	MCP_TOOL_PORT,
	MCP_TOOL_CALL_VERB,
	MCP_TOOL_SURFACE,
	TOOL_INPUT_SCHEMA,
	assertToolSurfaceParity,
	capabilityForTool,
	deriveToolSurface,
	findTool,
	type CapabilityScope,
	type ParityReport,
	type ToolDescriptor,
} from "./tool-surface.js";

export {
	MCP_EVENTS_SCHEMA_VERSION,
	MCP_TOOL_CALL_DECIDED,
	authorizedToolNames,
	decideToolCall,
	observeToolOutput,
	resolveAuthContext,
	scopeAuthorizesCapability,
	type AuthContext,
	type AuthDecisionEvent,
	type AuthResolution,
	type InertOutputObservation,
	type McpPrincipal,
	type ToolDecision,
	type ToolDecisionEffect,
} from "./auth.js";

export {
	createHoboMcpServer,
	type CreateHoboMcpServerOptions,
	type HoboMcpServer,
	type ToolCallInput,
	type ToolCallResult,
} from "./server.js";

export const HOBO_MCP_PACKAGE = "@hobo/mcp";
