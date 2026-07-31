import { beqOpenUi } from "./beq.js";
import { openUiNode, openUiTree } from "./openui-ir.js";
import { appendMetricsRow } from "./metrics.js";
import type { MetricsLedgerRow, OpenUiNode, OpenUiTree } from "./types.js";

export type MismatchKind = "rename" | "role-swap" | "style-skew";

export interface MismatchInjectionResult {
	readonly kind: MismatchKind;
	readonly original: OpenUiTree;
	readonly mutated: OpenUiTree;
	readonly rejected: boolean;
	readonly reasons: readonly string[];
	readonly row: MetricsLedgerRow;
}

/**
 * H7: inject controlled API/naming/style mismatches; expect early preflight/semantic reject.
 */
export function injectLibraryMismatch(
	tree: OpenUiTree,
	kind: MismatchKind,
): MismatchInjectionResult {
	const mutated = mutate(tree, kind);
	const beq = beqOpenUi(mutated, tree);
	const reasons: string[] = [];
	if (!beq.ok) {
		reasons.push(...beq.failures.map((f) => f.reason));
	}
	if (mutated.libraryTier === "mismatch") {
		reasons.push("tier tagged mismatch");
	}
	const rejected = !beq.ok || mutated.libraryTier === "mismatch";
	const row = appendMetricsRow({
		hypothesis: "H7",
		tier: "mismatch",
		method: "mismatch-inject",
		pass_at_1: rejected ? 0 : 1,
		pass_at_k: rejected ? 0 : 1,
		beq_or_fidelity: beq.score,
		agentv_scores: {},
		preflight_reject_rate: rejected ? 1 : 0,
		cost_usd: 0,
		latency_ms: 0,
		seed: kind,
		model: "injector",
		prompt_digest: kind,
	});
	return Object.freeze({
		kind,
		original: tree,
		mutated,
		rejected,
		reasons: Object.freeze(reasons),
		row,
	});
}

export function runMismatchSuite(
	tree: OpenUiTree,
): readonly MismatchInjectionResult[] {
	return Object.freeze(
		(["rename", "role-swap", "style-skew"] as const).map((k) =>
			injectLibraryMismatch(tree, k),
		),
	);
}

function mutate(tree: OpenUiTree, kind: MismatchKind): OpenUiTree {
	const root = mapNode(tree.root, (n) => {
		switch (kind) {
			case "rename":
				return openUiNode({
					...n,
					kind: `Legacy${n.kind}`,
					binder: n.binder ? `old.${n.binder}` : n.binder,
				});
			case "role-swap":
				return openUiNode({
					...n,
					role: n.role === "main" ? "complementary" : `swapped-${n.role}`,
				});
			case "style-skew":
				return openUiNode({
					...n,
					attrs: {
						...n.attrs,
						className: "tw-prose-invert-v2",
						style: "margin:var(--legacy-space)",
					},
				});
			default:
				return n;
		}
	});
	return openUiTree(`${tree.id}-mismatch-${kind}`, root, "mismatch");
}

function mapNode(
	node: OpenUiNode,
	fn: (n: OpenUiNode) => OpenUiNode,
): OpenUiNode {
	const mapped = fn(node);
	return openUiNode({
		kind: mapped.kind,
		role: mapped.role,
		binder: mapped.binder,
		attrs: mapped.attrs,
		meaningBearing: mapped.meaningBearing,
		children: node.children.map((c) => mapNode(c, fn)),
	});
}
