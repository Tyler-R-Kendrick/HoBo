import type { BeqFailure, BeqResult, OpenUiNode, OpenUiTree } from "./types.js";

/**
 * Bidirectional structural + semantic equivalence for OpenUI trees (BEq analogue).
 * Not string equality: compares kind, role, binder, hierarchy, meaningBearing.
 */
export function beqOpenUi(
	generated: OpenUiTree,
	goldOrIntent: OpenUiTree,
): BeqResult {
	const failures: BeqFailure[] = [];

	if (generated.libraryTier === "mismatch") {
		failures.push({
			path: "tree.libraryTier",
			reason: "mismatch tier is not promotion-eligible",
		});
	}

	beqNode(generated.root, goldOrIntent.root, "root", failures);

	// Bidirectional: gold structure must also be covered by generated (no silent drops).
	beqNode(goldOrIntent.root, generated.root, "root(rev)", failures, true);

	const totalChecks = Math.max(1, countNodes(goldOrIntent.root) * 2);
	const score = Math.max(0, 1 - failures.length / totalChecks);
	const ok = failures.length === 0;
	return Object.freeze({
		ok,
		score: ok ? 1 : score,
		failures: Object.freeze(failures),
	});
}

function countNodes(node: OpenUiNode): number {
	return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
}

function beqNode(
	a: OpenUiNode,
	b: OpenUiNode,
	path: string,
	failures: BeqFailure[],
	reverse = false,
): void {
	const tag = reverse ? "rev" : "fwd";

	if (a.kind !== b.kind) {
		failures.push({
			path: `${path}.kind`,
			reason: `${tag}: kind ${a.kind} !== ${b.kind}`,
		});
	}
	if (a.role !== b.role) {
		failures.push({
			path: `${path}.role`,
			reason: `${tag}: role ${a.role || "(empty)"} !== ${b.role || "(empty)"}`,
		});
	}
	if (a.binder !== b.binder) {
		failures.push({
			path: `${path}.binder`,
			reason: `${tag}: binder mismatch`,
		});
	}
	if (a.meaningBearing !== b.meaningBearing) {
		failures.push({
			path: `${path}.meaningBearing`,
			reason: `${tag}: meaningBearing ${a.meaningBearing} !== ${b.meaningBearing}`,
		});
	}
	// Syntax-perfect meaning-zero: both may share kind shell but fail if gold requires meaning.
	if (!reverse && b.meaningBearing && !a.meaningBearing) {
		failures.push({
			path: `${path}.meaningBearing`,
			reason: "syntax-ok but meaning-zero against meaning-bearing intent",
		});
	}
	if (a.children.length !== b.children.length) {
		failures.push({
			path: `${path}.children`,
			reason: `${tag}: hierarchy length ${a.children.length} !== ${b.children.length}`,
		});
		return;
	}
	for (let i = 0; i < a.children.length; i++) {
		beqNode(
			a.children[i]!,
			b.children[i]!,
			`${path}.children[${i}]`,
			failures,
			reverse,
		);
	}
}
