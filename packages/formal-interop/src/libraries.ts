import type { LibraryTier, OpenUiTree } from "./types.js";

/** Controlled-tier axiomatized productions (H2a). */
export const CONTROLLED_LIBRARY = Object.freeze({
	tier: "controlled" as const,
	productions: Object.freeze([
		"box",
		"text",
		"form",
		"field",
		"button",
		"heading",
	]),
	roles: Object.freeze(["region", "label", "main", "input", "submit", "title"]),
	operators: Object.freeze([] as string[]),
});

/** Ecosystem-tier full component/role/operator library (H2b). */
export const ECOSYSTEM_LIBRARY = Object.freeze({
	tier: "ecosystem" as const,
	productions: Object.freeze([
		...CONTROLLED_LIBRARY.productions,
		"DataGridVirtualized",
		"ColumnDefFactory",
		"AsyncCellRenderer",
		"ThemeProviderBridge",
		"LegacyMuiAdapter",
	]),
	roles: Object.freeze([
		...CONTROLLED_LIBRARY.roles,
		"grid-virtual",
		"column-factory",
		"cell-async",
		"theme-bridge",
	]),
	operators: Object.freeze([
		"mapFilterSort",
		"withMetaSelectors",
		"suspenseBoundary",
		"legacyPropShim",
	]),
});

export type LibraryDefinition =
	| typeof CONTROLLED_LIBRARY
	| typeof ECOSYSTEM_LIBRARY;

export function libraryForTier(tier: LibraryTier): LibraryDefinition {
	if (tier === "ecosystem") return ECOSYSTEM_LIBRARY;
	return CONTROLLED_LIBRARY;
}

/** True when every node kind/role/operator is in the controlled set. */
export function isControlledTree(tree: OpenUiTree): boolean {
	return walk(tree.root, (n) => {
		if (!CONTROLLED_LIBRARY.productions.includes(n.kind as never)) return false;
		if (n.role && !CONTROLLED_LIBRARY.roles.includes(n.role as never)) {
			return false;
		}
		const op = n.attrs.operator;
		if (op) return false;
		return true;
	});
}

function walk(
	node: { kind: string; role: string; attrs: Readonly<Record<string, string>>; children: readonly unknown[] },
	pred: (n: typeof node) => boolean,
): boolean {
	if (!pred(node)) return false;
	for (const child of node.children as Array<typeof node>) {
		if (!walk(child, pred)) return false;
	}
	return true;
}
