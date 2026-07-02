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
	"packages/runtime",
	"packages/componentize",
	"packages/conformance",
	"packages/cli",
	"packages/stage-gate",
]);

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
		path.startsWith("packages/runtimes/")
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
			edge.from !== edge.to
		) {
			errors.push(
				`adapters must not import each other: ${edge.from} -> ${edge.to}`,
			);
		}

		if (
			from.kind === "adapter" &&
			to.kind !== "core" &&
			edge.from !== edge.to &&
			edge.to !== "packages/conformance"
		) {
			errors.push(
				`adapters may import only core ports: ${edge.from} -> ${edge.to}`,
			);
		}

		if (to.layer > from.layer && edge.to !== "packages/conformance") {
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
	{ from: "packages/runtime", to: "packages/core" },
	{ from: "packages/cli", to: "packages/core" },
	{ from: "packages/cli", to: "packages/runtime" },
	{ from: "packages/componentize", to: "packages/core" },
	{ from: "packages/conformance", to: "packages/core" },
	{ from: "packages/stage-gate", to: "packages/componentize" },
	{ from: "packages/runtimes/runtime-local", to: "packages/conformance" },
];
