import { openUiNode, openUiTree } from "./openui-ir.js";
import type { OpenUiTree } from "./types.js";

/** Gold OpenUI tree: hierarchy + roles + binders + meaning. */
export const goldTree: OpenUiTree = openUiTree(
	"gold-primary-form",
	openUiNode({
		kind: "form",
		role: "main",
		binder: "session.form",
		attrs: { testid: "primary" },
		children: [
			openUiNode({
				kind: "heading",
				role: "title",
				binder: "session.title",
				attrs: { level: "1" },
			}),
			openUiNode({
				kind: "field",
				role: "input",
				binder: "session.email",
				attrs: { name: "email" },
			}),
			openUiNode({
				kind: "button",
				role: "submit",
				binder: "session.submit",
				attrs: { action: "submit" },
			}),
		],
	}),
	"controlled",
);

/** Hierarchy/binder broken: wrong nesting and binder. */
export const hierarchyBrokenTree: OpenUiTree = openUiTree(
	"hierarchy-broken",
	openUiNode({
		kind: "form",
		role: "main",
		binder: "session.form",
		children: [
			openUiNode({
				kind: "button",
				role: "submit",
				binder: "WRONG.binder",
				children: [
					openUiNode({
						kind: "heading",
						role: "title",
						binder: "session.title",
					}),
				],
			}),
		],
	}),
	"controlled",
);

/**
 * Syntax-perfect but meaning-zero: same kind shell as gold-shaped form,
 * empty roles/binders, meaningBearing=false.
 */
export const meaningZeroTree: OpenUiTree = openUiTree(
	"meaning-zero",
	openUiNode({
		kind: "form",
		role: "",
		binder: "",
		meaningBearing: false,
		attrs: { testid: "primary" },
		children: [
			openUiNode({
				kind: "heading",
				role: "",
				binder: "",
				meaningBearing: false,
			}),
			openUiNode({
				kind: "field",
				role: "",
				binder: "",
				meaningBearing: false,
			}),
			openUiNode({
				kind: "button",
				role: "",
				binder: "",
				meaningBearing: false,
			}),
		],
	}),
	"controlled",
);

/** Controlled-library production (axiomatized core only). */
export const controlledProduction: OpenUiTree = openUiTree(
	"controlled-prod",
	openUiNode({
		kind: "box",
		role: "region",
		binder: "core.box",
		children: [
			openUiNode({
				kind: "text",
				role: "label",
				binder: "core.label",
			}),
		],
	}),
	"controlled",
);

/** Ecosystem-library production (extra roles/operators). */
export const ecosystemProduction: OpenUiTree = openUiTree(
	"ecosystem-prod",
	openUiNode({
		kind: "DataGridVirtualized",
		role: "grid-virtual",
		binder: "lib.datagrid.v3.row",
		attrs: { operator: "mapFilterSort", plugin: "ag-grid-compat" },
		children: [
			openUiNode({
				kind: "ColumnDefFactory",
				role: "column-factory",
				binder: "lib.datagrid.v3.col",
				attrs: { operator: "withMetaSelectors" },
			}),
			openUiNode({
				kind: "AsyncCellRenderer",
				role: "cell-async",
				binder: "lib.datagrid.v3.cell",
				attrs: { operator: "suspenseBoundary" },
			}),
		],
	}),
	"ecosystem",
);

export const fixtures = {
	gold: goldTree,
	hierarchyBroken: hierarchyBrokenTree,
	meaningZero: meaningZeroTree,
	controlled: controlledProduction,
	ecosystem: ecosystemProduction,
} as const;
