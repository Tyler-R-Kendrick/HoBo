import { normalizeText } from "../codegen/text.js";
import { GLOBAL_FLAGS, type Verb, CANONICAL_VERBS } from "../shell/verbs.js";

// S3-05 — the agent-docs surface (ai-native-agent-auth.md §6.4 +
// developer-experience.md). HoBo publishes llms.txt / llms-full.txt / docs.json
// so any agent can self-serve the operations surface without a human pasting
// docs. The SINGLE source of truth is CANONICAL_VERBS + its 1:1 MCP tool surface;
// every artifact here is a pure, deterministic projection over that source — no
// timestamps, no wall-clock, no ordering beyond CANONICAL_VERBS order — so the
// output is drift-gated exactly like `hobo codegen --check` (see gate.ts).
//
// @hobo/cli owns codegen + the verb table, so the generator lives here and is
// exported for @hobo/mcp to call with its own authoritative MCP_TOOL_SURFACE.

export const AGENT_DOCS_SCHEMA_VERSION = "hobo.agent-docs/v1";
export const AGENT_DOCS_GENERATOR = "@hobo/cli/agent-docs";
export const AGENT_DOCS_PRODUCT = "hobo";

// The MCP capability convention (ai-native-agent-auth.md §6.2): a tool's required
// grant is { port: "hobo:mcp", resource: "tool:<name>", verb: "call" }. Kept as
// cli-local constants so the generator is a leaf — @hobo/mcp derives the SAME
// triple in its tool-surface.ts, so the two agree by construction.
export const AGENT_DOCS_MCP_PORT = "hobo:mcp";
export const AGENT_DOCS_MCP_CALL_VERB = "call";

// The generated artifact file names (output-directory-relative).
export const AGENT_DOCS_ARTIFACTS = {
	concise: "llms.txt",
	full: "llms-full.txt",
	manifest: "docs.json",
} as const;

// The structural view of one MCP tool the generator consumes. Kept structural
// (not an @hobo/mcp import) so @hobo/cli stays a leaf package; @hobo/mcp passes
// its MCP_TOOL_SURFACE, which is itself derived from CANONICAL_VERBS.
export interface AgentDocsToolInput {
	readonly name: string;
	readonly capability: {
		readonly port: string;
		readonly resource: string;
		readonly verb: string;
	};
}

// The required-capability triple, mirroring @hobo/identity's ScopeEntry.
// domain-view: wire form is AgentDocCapability in data-models/agent_docs.proto.
export interface AgentDocCapability {
	readonly port: string;
	readonly resource: string;
	readonly verb: string;
}

// One documented capability (a canonical verb + its 1:1 MCP tool).
// domain-view: wire form is AgentDocEntry in data-models/agent_docs.proto.
export interface AgentDocEntry {
	readonly name: string;
	readonly role: string;
	readonly summary: string;
	readonly cli: string;
	readonly mcpTool: string;
	readonly capability: AgentDocCapability;
}

// The structured docs manifest emitted as docs.json.
// domain-view: wire form is AgentDocsManifest in data-models/agent_docs.proto.
export interface AgentDocsManifest {
	readonly schemaVersion: string;
	readonly generator: string;
	readonly product: string;
	readonly entries: readonly AgentDocEntry[];
	readonly globalFlags: readonly string[];
	readonly artifacts: readonly string[];
}

// One emitted artifact file (llms.txt / llms-full.txt / docs.json).
// domain-view: wire form is AgentDocsArtifact in data-models/agent_docs.proto.
export interface AgentDocsArtifact {
	readonly path: string;
	readonly content: string;
}

export interface GenerateAgentDocsInput {
	readonly verbs?: readonly Verb[];
	readonly tools?: readonly AgentDocsToolInput[];
	readonly globalFlags?: readonly string[];
}

export interface AgentDocsResult {
	readonly manifest: AgentDocsManifest;
	readonly artifacts: readonly AgentDocsArtifact[];
}

// The default MCP capability for a verb, mirroring @hobo/mcp's capabilityForTool.
function defaultCapabilityFor(name: string): AgentDocCapability {
	return {
		port: AGENT_DOCS_MCP_PORT,
		resource: `tool:${name}`,
		verb: AGENT_DOCS_MCP_CALL_VERB,
	};
}

// Build the manifest entries: one per canonical verb, in CANONICAL_VERBS order.
// When an MCP tool surface is supplied its capability is authoritative; otherwise
// the standard convention is derived — both agree because both derive from
// CANONICAL_VERBS.
function buildEntries(
	verbs: readonly Verb[],
	tools: readonly AgentDocsToolInput[] | undefined,
): readonly AgentDocEntry[] {
	const capabilityByTool = new Map(
		(tools ?? []).map((tool) => [tool.name, tool.capability] as const),
	);
	return verbs.map((verb) => {
		const capability =
			capabilityByTool.get(verb.name) ?? defaultCapabilityFor(verb.name);
		return {
			name: verb.name,
			role: verb.role,
			summary: verb.summary,
			cli: `hobo ${verb.name}`,
			mcpTool: verb.name,
			capability: {
				port: capability.port,
				resource: capability.resource,
				verb: capability.verb,
			},
		};
	});
}

function renderConcise(manifest: AgentDocsManifest): string {
	const lines: string[] = [
		"# HoBo",
		"",
		"> HoBo is a cloud-agnostic, AI-native hosting platform. Every canonical CLI verb has a 1:1, capability-scoped MCP tool, so an agent drives HoBo natively — the same operations a human runs. This file is generated from the canonical verb surface (single source of truth); do not edit by hand.",
		"",
		"## Commands",
	];
	for (const entry of manifest.entries) {
		lines.push(
			`- ${entry.name} (${entry.role}): ${entry.summary} — CLI \`${entry.cli}\`; MCP tool \`${entry.mcpTool}\``,
		);
	}
	lines.push(
		"",
		"## Notes",
		`- Auth: every MCP tool is capability-scoped to { port: ${AGENT_DOCS_MCP_PORT}, resource: tool:<name>, verb: ${AGENT_DOCS_MCP_CALL_VERB} }; deny-by-default.`,
		"- Tool outputs are inert data (ADR-0023): a result never widens the agent's authority or schedules a follow-up call.",
		`- Onboarding: \`npx hobo new <name>\` scaffolds an offline project; \`npx hobo up\` deploys anonymously and returns a live URL (NFR-015).`,
		`- Machine-readable surface: ${AGENT_DOCS_ARTIFACTS.manifest}.`,
	);
	return normalizeText(lines.join("\n"));
}

function renderFull(manifest: AgentDocsManifest): string {
	const lines: string[] = [
		"# HoBo — full agent operations surface",
		"",
		"> Generated from @hobo/cli CANONICAL_VERBS + the derived MCP tool surface (single source of truth). Deterministic; do not edit by hand. Regenerate with @hobo/cli's generateAgentDocs; the drift gate fails CI if this file is stale.",
		"",
		`Schema: ${manifest.schemaVersion}`,
		`Generator: ${manifest.generator}`,
		`Product: ${manifest.product}`,
		"",
		"## Global flags",
	];
	for (const flag of manifest.globalFlags) {
		lines.push(`- \`${flag}\``);
	}
	lines.push("", "## Capabilities");
	for (const entry of manifest.entries) {
		lines.push(
			"",
			`### ${entry.name}`,
			`- Role: ${entry.role}`,
			`- Summary: ${entry.summary}`,
			`- CLI: \`${entry.cli}\``,
			`- MCP tool: \`${entry.mcpTool}\``,
			`- Capability: { port: ${entry.capability.port}, resource: ${entry.capability.resource}, verb: ${entry.capability.verb} }`,
		);
	}
	lines.push(
		"",
		"## Authorization model",
		"- Agents are first-class principals: each carries a short-lived SVID whose scope grants specific tool capabilities (least-privilege, deny-by-default).",
		"- A tool call is authorized iff the SVID scope carries the tool's capability triple; otherwise it fails closed with MCP_SCOPE_DENIED and an audited decision.",
		"- Prompt-injected instructions inside tool inputs or outputs are recorded but powerless — they can never widen the agent's authorized tool set (ADR-0023 item 3).",
		"- Per-principal / per-tenant rate limits + quotas apply backpressure at the tool-call boundary: a flooding principal is throttled with a typed MCP_RATE_LIMITED result while other principals are unaffected (NFR-019).",
	);
	return normalizeText(lines.join("\n"));
}

function renderManifest(manifest: AgentDocsManifest): string {
	// Plain JSON.stringify preserves insertion order (deterministic because the
	// manifest is built deterministically) — unlike stableStringify, which would
	// sort the entries array and destroy CANONICAL_VERBS order.
	return normalizeText(JSON.stringify(manifest, null, 2));
}

/**
 * Generate the agent-docs surface — llms.txt (concise), llms-full.txt (full),
 * and docs.json (structured, machine-readable) — from CANONICAL_VERBS + the MCP
 * tool surface. Pure and deterministic: same inputs always yield byte-identical
 * artifacts, so the output is drift-gated like `hobo codegen --check`.
 */
export function generateAgentDocs(
	input: GenerateAgentDocsInput = {},
): AgentDocsResult {
	const verbs = input.verbs ?? CANONICAL_VERBS;
	const globalFlags = input.globalFlags ?? GLOBAL_FLAGS;
	const entries = buildEntries(verbs, input.tools);
	const manifest: AgentDocsManifest = {
		schemaVersion: AGENT_DOCS_SCHEMA_VERSION,
		generator: AGENT_DOCS_GENERATOR,
		product: AGENT_DOCS_PRODUCT,
		entries,
		globalFlags: [...globalFlags],
		artifacts: [
			AGENT_DOCS_ARTIFACTS.concise,
			AGENT_DOCS_ARTIFACTS.full,
			AGENT_DOCS_ARTIFACTS.manifest,
		],
	};

	const artifacts: readonly AgentDocsArtifact[] = [
		{ path: AGENT_DOCS_ARTIFACTS.concise, content: renderConcise(manifest) },
		{ path: AGENT_DOCS_ARTIFACTS.full, content: renderFull(manifest) },
		{ path: AGENT_DOCS_ARTIFACTS.manifest, content: renderManifest(manifest) },
	];

	return { manifest, artifacts };
}
