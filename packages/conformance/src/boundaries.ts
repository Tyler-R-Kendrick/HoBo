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

// Layer-1 contract packages: provider-neutral vocabulary that adapters
// legitimately implement against, the same way they implement WIT worlds.
// ADR-0151 makes this explicit — capability profiles are "the missing semantic
// layer" between a Bindle primitive and a hosted product, and bindings are
// "independent of provisioners" — so a provider declaring the profiles it
// implements and emitting a portable binding is the designed direction of
// dependency, not a layering breach. Registering them as contracts is what
// makes that legal by construction instead of by a growing exception list.
// ADR-0156 records the longer-term move of these contracts into `@hobo/core`.
const CONTRACT_PACKAGE_PATHS = new Set([
	"packages/wit",
	"packages/capability-profiles",
	"packages/bindings",
	"packages/claims",
	"packages/trust",
	"packages/data-postgres",
	"packages/kv-redis-compatible",
]);

const KNOWN_PACKAGE_PATHS = new Set([
	"packages/core",
	"packages/contract-harness",
	"packages/wit",
	"packages/bindles",
	"packages/camps",
	"packages/yards",
	"packages/cloud-providers",
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
	"packages/connectivity",
	"packages/contracts",
	"packages/broker",
	"packages/mcp",
	"packages/training-pipeline",
	"packages/code",
	"packages/ci-guard",
	"packages/control-api",
	"packages/control-yard",
	"packages/management",
	"packages/replay",
	"packages/schema-tools",
	"packages/stations",
	"packages/storage-sqlite",
	"packages/trails",
	"packages/agent-skills",
	"packages/evals",
	"packages/fuzz",
	"packages/patterns",
	"packages/pixel-village",
	"packages/registry",
	"packages/dispatcher",
	"packages/rift",
	"packages/sdk",
	"packages/training",
	"packages/yard-world",
	// ADR-0151 plane packages: present in the workspace since the capability
	// profile/binding/claim tranche landed, but never registered here, so the
	// boundary gate threw "unknown import source" on a clean tree.
	"packages/auth-md",
	"packages/bindings",
	"packages/capability-matrix",
	"packages/capability-profiles",
	"packages/claims",
	"packages/data-postgres",
	"packages/kv-redis-compatible",
	"packages/recipes",
	"packages/trust",
	"packages/wasp",
	"packages/convex",
	// ADR-0159 out-of-box application test harness.
	"packages/testing",
	// Example Bindles vendored under the hobo-code harness. They consume
	// adapters and bindles like any application would, so they classify as
	// ordinary workspace packages rather than a new tier.
	"packages/code/examples/barebones",
	"packages/code/examples/hello-world",
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
	// Pre-existing layer-3 reaches, surfaced when the boundary gate stopped
	// throwing on unregistered packages (it previously crashed before reaching
	// rule evaluation, so these were never reported). Both are genuine breaches
	// awaiting the ADR-0156 lift of the selectable-definition and operator-SDK
	// types into @hobo/core; recorded here rather than left invisible, and
	// scoped to these EXACT edges so no new one is admitted.
	"packages/packs/pack-framework->packages/cloud",
	"packages/providers/provider-convex->packages/sdk",
	// The policy-engine gate-plane adapters (docs/plans/0017 F30) lower engine
	// verdicts onto @hobo/contracts' shared vocabulary (GatekeeperEffect,
	// PolicyDecisionRequest). The dependency deliberately points
	// provider->contracts so @hobo/broker can depend on the adapters without a
	// cycle; contracts is the shared contract layer, not an app package.
	"packages/providers/provider-opa->packages/contracts",
	"packages/providers/provider-cedar->packages/contracts",
	// provider-convex's @hobo/bindles edge is a devDependency only: the
	// golden-bindle test asserts no provider selection leaks into bindle
	// authoring (assertNoBindleProviderSelection). No runtime import exists.
	"packages/providers/provider-convex->packages/bindles",
	// The OpenBao adapter (#1003) implements @hobo/identity's secrets-manager
	// port; that port vocabulary lives in identity rather than core, same
	// future-ADR tiering as the training/eval and runner exceptions above.
	"packages/adapters/adapter-openbao->packages/identity",
	// Connector packages (#1052) are AUTHORING-side declarations, not runtime
	// adapters: they export an opaque symbol built with @hobo/bindles'
	// defineConnector so b.connector() can resolve it. The edge points at the
	// authoring surface by design; future connector packages extend this list
	// until the same future ADR classifies the connector tier.
	"packages/connectors/connector-firecrawl->packages/bindles",
	// ADR-0135: the local/browser runtimes compose @hobo/storage-sqlite as the
	// durable engine behind HoBo-owned ports (schema v2, SqliteJournal). This is
	// the sanctioned runtime->storage composition, not a port bypass.
	"packages/runtimes/runtime-local->packages/storage-sqlite",
	"packages/runtimes/runtime-browser->packages/storage-sqlite",
	// Dev-only PACT consumer/provider tests, same shape as the accepted
	// core->contract-harness edge in validateBoundaryImports.
	"packages/runtimes/runtime-oci->packages/contract-harness",
]);

// The SWE agent connectors (swe-claude, swe-codex, swe-copilot, swe-cursor,
// swe-gemini, swe-grok, ...) all speak ACP through @hobo/connector-acp, the
// connector-tier base library (#893-#899), and share the SWE connector
// vocabulary through @hobo/swe-shared. A tier rule instead of exact edges
// because every new SWE connector adds the same edge; any other
// connector->connector import still fails closed.
function isConnectorTierBaseEdge(from: string, to: string): boolean {
	return (
		from.startsWith("packages/connectors/") &&
		(to === "packages/connectors/connector-acp" ||
			to === "packages/connectors/swe-shared")
	);
}

// The implementation-pack tier has the same shape as the connector tier:
// `pack-framework` is the tier's base library (pack descriptor, digest pinning,
// lifecycle) that concrete packs compose. Scoped to that exact target so
// pack->pack imports between concrete packs still fail closed.
function isPackTierBaseEdge(from: string, to: string): boolean {
	return (
		from.startsWith("packages/packs/") && to === "packages/packs/pack-framework"
	);
}

function isAcceptedAdapterPackageEdge(from: string, to: string): boolean {
	return (
		ACCEPTED_ADAPTER_PACKAGE_EDGES.has(`${from}->${to}`) ||
		isConnectorTierBaseEdge(from, to) ||
		isPackTierBaseEdge(from, to)
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

	if (CONTRACT_PACKAGE_PATHS.has(path)) {
		return { kind: "contract", layer: 1 };
	}

	if (
		path.startsWith("packages/providers/") ||
		path.startsWith("packages/iac/") ||
		path.startsWith("packages/build/") ||
		path.startsWith("packages/runtimes/") ||
		path.startsWith("packages/connectors/") ||
		path.startsWith("packages/adapters/") ||
		// ADR-0151 implementation packs are signed deployables that satisfy a
		// capability profile on generic compute. They sit at the adapter tier
		// for the same reason providers do: they implement a core contract and
		// must not reach sideways into layer-3 packages.
		path.startsWith("packages/packs/")
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
			// Layer-1 contract packages are implementable vocabulary, like WIT
			// worlds: an adapter declaring the capability profiles it implements
			// or emitting a portable binding is depending on a contract, not on
			// another implementation.
			to.kind !== "contract" &&
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
