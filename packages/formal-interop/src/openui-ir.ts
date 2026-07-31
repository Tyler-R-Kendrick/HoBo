import type { LibraryTier, OpenUiNode, OpenUiTree } from "./types.js";

export class OpenUiIrParseError extends Error {
	readonly path: string;
	constructor(path: string, message: string) {
		super(`${path}: ${message}`);
		this.name = "OpenUiIrParseError";
		this.path = path;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAttrs(
	value: unknown,
	path: string,
): Readonly<Record<string, string>> {
	if (value === undefined) return Object.freeze({});
	if (!isRecord(value)) {
		throw new OpenUiIrParseError(path, "attrs must be an object");
	}
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value)) {
		if (typeof v !== "string") {
			throw new OpenUiIrParseError(`${path}.${k}`, "attr values must be strings");
		}
		out[k] = v;
	}
	return Object.freeze(out);
}

export function parseOpenUiNode(value: unknown, path = "root"): OpenUiNode {
	if (!isRecord(value)) {
		throw new OpenUiIrParseError(path, "node must be an object");
	}
	const kind = value.kind;
	if (typeof kind !== "string" || kind.trim() === "") {
		throw new OpenUiIrParseError(`${path}.kind`, "non-empty string required");
	}
	const role = typeof value.role === "string" ? value.role : "";
	const binder = typeof value.binder === "string" ? value.binder : "";
	const meaningBearing =
		typeof value.meaningBearing === "boolean"
			? value.meaningBearing
			: typeof value.meaning_bearing === "boolean"
				? value.meaning_bearing
				: true;
	const childrenRaw = value.children ?? [];
	if (!Array.isArray(childrenRaw)) {
		throw new OpenUiIrParseError(`${path}.children`, "must be an array");
	}
	const children = childrenRaw.map((child, i) =>
		parseOpenUiNode(child, `${path}.children[${i}]`),
	);
	return Object.freeze({
		kind: kind.trim(),
		role,
		binder,
		attrs: parseAttrs(value.attrs, `${path}.attrs`),
		children: Object.freeze(children),
		meaningBearing,
	});
}

export function parseOpenUiTree(value: unknown): OpenUiTree {
	if (!isRecord(value)) {
		throw new OpenUiIrParseError("tree", "must be an object");
	}
	const id = value.id;
	if (typeof id !== "string" || id.trim() === "") {
		throw new OpenUiIrParseError("tree.id", "non-empty string required");
	}
	const tier = value.libraryTier ?? value.library_tier ?? "controlled";
	if (tier !== "controlled" && tier !== "ecosystem" && tier !== "mismatch") {
		throw new OpenUiIrParseError("tree.libraryTier", "invalid tier");
	}
	const root = parseOpenUiNode(value.root, "tree.root");
	return Object.freeze({
		id: id.trim(),
		root,
		libraryTier: tier as LibraryTier,
	});
}

/** Build a node without going through JSON (internal helpers / fixtures). */
export function openUiNode(
	partial: Omit<OpenUiNode, "attrs" | "children" | "meaningBearing"> & {
		attrs?: Readonly<Record<string, string>>;
		children?: readonly OpenUiNode[];
		meaningBearing?: boolean;
	},
): OpenUiNode {
	return Object.freeze({
		kind: partial.kind,
		role: partial.role,
		binder: partial.binder,
		attrs: Object.freeze({ ...(partial.attrs ?? {}) }),
		children: Object.freeze([...(partial.children ?? [])]),
		meaningBearing: partial.meaningBearing ?? true,
	});
}

export function openUiTree(
	id: string,
	root: OpenUiNode,
	libraryTier: LibraryTier = "controlled",
): OpenUiTree {
	return Object.freeze({ id, root, libraryTier });
}
