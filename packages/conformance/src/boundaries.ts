export type WorkspaceEdge = {
	readonly from: string;
	readonly to: string;
};

export type PackageKind =
	| "core"
	| "contract"
	| "adapter"
	| "package"
	| "external"
	| "unknown";

export type PackageClassification = {
	kind: PackageKind;
	layer: number;
};

const KNOWN_PACKAGE_PATHS = new Set([
	"packages/core",
	"packages/contract-harness",
	"packages/wit",
	"packages/bindles",
	"packages/camps",
	"packages/yards",
	"packages/junctions",
	"packages/runtime",
	"packages/componentize",
	"packages/conformance",
	"packages/cli",
	"packages/hobo",
	"packages/stage-gate",
	"packages/policy",
	"packages/data",
	"packages/events",
	"packages/identity",
	"packages/cloud",
	"packages/contracts",
	"packages/broker",
	"packages/mcp",
	"packages/training-pipeline",
]);

// Documented, narrowly-scoped exceptions. The AI training/eval providers
// (provider-agentv, provider-ax) legitimately COMPOSE the SDK training/runtime
// packages instead of reaching them through a core port; these edges landed in
// #824/#825 and are tracked for a future ADR that classifies training/eval
// providers as a distinct tier. Scoped to these EXACT edges so genuine
// adapter->adapter and other outward imports still fail closed.
const ACCEPTED_ADAPTER_PACKAGE_EDGES = new Set([
	"packages/providers/provider-agentv->packages/training-pipeline",
	"packages/providers/provider-ax->packages/runtime",
	// The runner tier (#891/#892) composes @hobo/runner-github's shared
	// execution-host vocabulary (SKU catalog, host registry, dispatch
	// tracking) rather than reaching it through a core port; runner-github is
	// functioning as the runner-tier base library. Same future-ADR tiering as
	// the training/eval providers above; scoped to these EXACT edges.
	"packages/providers/runner-blacksmith->packages/providers/runner-github",
	"packages/providers/runner-depot->packages/providers/runner-github",
	"packages/providers/runner-depot->packages/providers/runner-blacksmith",
]);

// The SWE agent connectors (swe-claude, swe-codex, swe-copilot, swe-cursor,
// swe-gemini, swe-grok, ...) all speak ACP through @hobo/connector-acp, the
// connector-tier base library (#893-#899). A tier rule instead of exact edges
// because every new SWE connector adds the same edge; any other
// connector->connector import still fails closed.
function isConnectorTierBaseEdge(from: string, to: string): boolean {
	return (
		from.startsWith("packages/connectors/") &&
		to === "packages/connectors/connector-acp"
	);
}

function isAcceptedAdapterPackageEdge(from: string, to: string): boolean {
	return (
		ACCEPTED_ADAPTER_PACKAGE_EDGES.has(`${from}->${to}`) ||
		isConnectorTierBaseEdge(from, to)
	);
}

function isWorkspacePath(path: string): boolean {
	return path.startsWith("packages/") || path.startsWith("examples/");
}

export function parseWorkspaceEdge(input: unknown): WorkspaceEdge {
	if (typeof input !== "object" || input === null) {
		throw new Error("workspace edge must be an object");
	}

	const record = input as Record<string, unknown>;
	const from = record.from;
	const to = record.to;

	if (typeof from !== "string" || from.length === 0) {
		throw new Error("workspace edge from must be a non-empty string");
	}

	if (typeof to !== "string" || to.length === 0) {
		throw new Error("workspace edge to must be a non-empty string");
	}

	const fromClass = classifyPackage(from);
	const toClass = classifyPackage(to);

	if (fromClass.kind === "unknown" && isWorkspacePath(from)) {
		throw new Error(`unknown import source ${from}`);
	}

	if (toClass.kind === "unknown" && isWorkspacePath(to)) {
		throw new Error(`unknown import target ${to}`);
	}

	return { from, to };
}

export function classifyPackage(path: string): PackageClassification {
	if (!path.startsWith("packages/") && !path.startsWith("examples/")) {
		return { kind: "external", layer: 0 };
	}

	if (path === "packages/core") {
		return { kind: "core", layer: 0 };
	}

	if (path === "packages/contract-harness") {
		return { kind: "package", layer: 0 };
	}

	if (path === "packages/wit") {
		return { kind: "contract", layer: 1 };
	}

	if (
		path.startsWith("packages/providers/") ||
		path.startsWith("packages/iac/") ||
		path.startsWith("packages/build/") ||
		path.startsWith("packages/runtimes/") ||
		path.startsWith("packages/connectors/") ||
		path.startsWith("packages/adapters/")
	) {
		return { kind: "adapter", layer: 2 };
	}

	if (KNOWN_PACKAGE_PATHS.has(path)) {
		return { kind: "package", layer: path.startsWith("examples/") ? 4 : 3 };
	}

	if (path.startsWith("examples/")) {
		return { kind: "package", layer: 4 };
	}

	return { kind: "unknown", layer: Number.POSITIVE_INFINITY };
}

export function validateBoundaryImports(
	edges: readonly WorkspaceEdge[],
	extra: readonly WorkspaceEdge[] = [],
): { errors: string[] } {
	const errors: string[] = [];
	const imports = [...edges, ...extra];

	for (const edge of imports) {
		const from = classifyPackage(edge.from);
		const to = classifyPackage(edge.to);

		if (from.kind === "unknown") {
			errors.push(`unknown import source ${edge.from}`);
			continue;
		}

		if (to.kind === "unknown") {
			errors.push(`unknown import target ${edge.to}`);
			continue;
		}

		if (from.kind === "core" && to.kind !== "external") {
			if (edge.to === "packages/contract-harness") {
				continue;
			}
			errors.push(
				`core must not import HoBo packages: ${edge.from} -> ${edge.to}`,
			);
		}

		if (
			from.kind === "adapter" &&
			to.kind === "adapter" &&
			edge.from !== edge.to &&
			!isAcceptedAdapterPackageEdge(edge.from, edge.to)
		) {
			errors.push(
				`adapters must not import each other: ${edge.from} -> ${edge.to}`,
			);
		}

		if (
			from.kind === "adapter" &&
			to.kind !== "core" &&
			edge.from !== edge.to &&
			edge.to !== "packages/conformance" &&
			!isAcceptedAdapterPackageEdge(edge.from, edge.to)
		) {
			errors.push(
				`adapters may import only core ports: ${edge.from} -> ${edge.to}`,
			);
		}

		if (
			to.layer > from.layer &&
			edge.to !== "packages/conformance" &&
			!isAcceptedAdapterPackageEdge(edge.from, edge.to)
		) {
			errors.push(`dependency points outward: ${edge.from} -> ${edge.to}`);
		}
	}

	return { errors };
}

export function detectWorkspaceCycles(edges: readonly WorkspaceEdge[]): {
	errors: string[];
} {
	const graph = new Map<string, string[]>();
	const errors: string[] = [];

	for (const { from, to } of edges) {
		const next = graph.get(from) ?? [];
		next.push(to);
		graph.set(from, next);
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();

	const visit = (node: string, trail: string[]): void => {
		if (visiting.has(node)) {
			const cycle = trail.slice(trail.indexOf(node)).join(" -> ");
			errors.push(`workspace dependency cycle: ${cycle}`);
			return;
		}

		if (visited.has(node)) {
			return;
		}

		visiting.add(node);
		for (const next of graph.get(node) ?? []) {
			visit(next, [...trail, next]);
		}
		visiting.delete(node);
		visited.add(node);
	};

	for (const node of graph.keys()) {
		visit(node, [node]);
	}

	return { errors };
}

export const canonicalWorkspaceEdges: readonly WorkspaceEdge[] = [
	{ from: "packages/core", to: "packages/contract-harness" },
	{ from: "packages/bindles", to: "packages/core" },
	{ from: "packages/bindles", to: "packages/wit" },
	{ from: "packages/camps", to: "packages/bindles" },
	{ from: "packages/camps", to: "packages/core" },
	{ from: "packages/yards", to: "packages/camps" },
	{ from: "packages/junctions", to: "packages/yards" },
	{ from: "packages/runtime", to: "packages/core" },
	{ from: "packages/cli", to: "packages/core" },
	{ from: "packages/cli", to: "packages/runtime" },
	{ from: "packages/componentize", to: "packages/core" },
	{ from: "packages/conformance", to: "packages/core" },
	{ from: "packages/stage-gate", to: "packages/componentize" },
	{ from: "packages/runtimes/runtime-local", to: "packages/conformance" },
	{ from: "packages/data", to: "packages/core" },
	{ from: "packages/events", to: "packages/core" },
	{ from: "packages/events", to: "packages/data" },
	{ from: "packages/identity", to: "packages/core" },
	{ from: "packages/cloud", to: "packages/core" },
	{ from: "packages/cloud", to: "packages/bindles" },
	{ from: "packages/cloud", to: "packages/data" },
	{ from: "packages/cloud", to: "packages/events" },
	{ from: "packages/contracts", to: "packages/core" },
	{ from: "packages/contracts", to: "packages/policy" },
	{ from: "packages/mcp", to: "packages/core" },
	{ from: "packages/mcp", to: "packages/cli" },
	{ from: "packages/mcp", to: "packages/identity" },
	{ from: "packages/conformance", to: "packages/runtime" },
	{ from: "packages/training-pipeline", to: "packages/core" },
	{ from: "packages/iac/iac-pulumi", to: "packages/core" },
	{ from: "packages/providers/provider-cloudflare", to: "packages/core" },
	// @hobo/hobo — the composition root (apps, L3). It composes the L3 sdk/runtime
	// packages and the L2 adapters; every edge is inward or same-layer, so no
	// exception is required.
	{ from: "packages/hobo", to: "packages/cli" },
	{ from: "packages/hobo", to: "packages/cloud" },
	{ from: "packages/hobo", to: "packages/contracts" },
	{ from: "packages/hobo", to: "packages/bindles" },
	{ from: "packages/hobo", to: "packages/core" },
	{ from: "packages/hobo", to: "packages/data" },
	{ from: "packages/hobo", to: "packages/runtimes/runtime-local" },
	{ from: "packages/hobo", to: "packages/providers/provider-cloudflare" },
	{ from: "packages/hobo", to: "packages/iac/iac-pulumi" },
	{ from: "packages/providers/provider-agentv", to: "packages/core" },
	{ from: "packages/providers/provider-ax", to: "packages/core" },
	// Accepted training/eval-provider composition edges (see ACCEPTED_ADAPTER_PACKAGE_EDGES).
	{
		from: "packages/providers/provider-agentv",
		to: "packages/training-pipeline",
	},
	{ from: "packages/providers/provider-ax", to: "packages/runtime" },
];
