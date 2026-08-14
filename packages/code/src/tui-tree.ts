import type { AccentName } from "./rubberhose.js";

export type TuiRole =
	| "application"
	| "region"
	| "status"
	| "list"
	| "listitem"
	| "dialog"
	| "text";

export interface TuiStyle {
	readonly accent?: AccentName;
	readonly title?: string;
	readonly width?: number;
	readonly color?: string;
	readonly backgroundColor?: string;
}

export interface TuiNode {
	readonly type: string;
	readonly id?: string;
	readonly role: TuiRole;
	readonly classList: readonly string[];
	readonly props: Readonly<
		Record<string, string | number | boolean | undefined>
	>;
	readonly style: TuiStyle;
	readonly children: readonly TuiNode[];
	readonly text?: string;
}

export type TuiChild =
	| TuiNode
	| string
	| number
	| false
	| null
	| undefined
	| readonly TuiChild[];

export type TuiComponent = (props: Record<string, unknown>) => TuiNode;

export interface TuiElementProps {
	readonly id?: string;
	readonly role?: TuiRole;
	readonly className?: string;
	readonly style?: TuiStyle;
	readonly children?: TuiChild;
	readonly [key: string]: unknown;
}

function flatten(
	children: TuiChild | undefined,
	into: TuiNode[] = [],
): TuiNode[] {
	if (children === undefined || children === null || children === false) {
		return into;
	}
	if (Array.isArray(children)) {
		for (const child of children) flatten(child as TuiChild, into);
		return into;
	}
	if (typeof children === "string" || typeof children === "number") {
		into.push({
			type: "text",
			role: "text",
			classList: [],
			props: {},
			style: {},
			children: [],
			text: String(children),
		});
		return into;
	}
	into.push(children as TuiNode);
	return into;
}

function textNode(value: string): TuiNode {
	return {
		type: "text",
		role: "text",
		classList: [],
		props: {},
		style: {},
		children: [],
		text: value,
	};
}

export function h(
	type: string | TuiComponent,
	props: TuiElementProps | null,
	...rest: TuiChild[]
): TuiNode {
	const raw = props ?? {};
	if (typeof type === "function") {
		return type({
			...raw,
			children: rest.length > 0 ? rest : raw.children,
		});
	}
	const className = typeof raw.className === "string" ? raw.className : "";
	const classList = className
		.split(/\s+/u)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	const style = raw.style ?? {};
	const children = flatten(rest.length > 0 ? rest : raw.children);
	const role = raw.role ?? (type === "strap" ? "status" : "region");
	const id = typeof raw.id === "string" ? raw.id : undefined;
	const reserved = new Set([
		"id",
		"role",
		"className",
		"style",
		"children",
		"key",
	]);
	const extra: Record<string, string | number | boolean | undefined> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (reserved.has(key)) continue;
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === undefined
		) {
			extra[key] = value;
		}
	}
	return {
		type,
		...(id !== undefined ? { id } : {}),
		role,
		classList,
		props: extra,
		style,
		children,
		...(type === "text" &&
		children.length === 0 &&
		typeof raw.children === "string"
			? { text: raw.children }
			: {}),
	};
}

export function Fragment(props: { readonly children?: TuiChild }): TuiNode {
	return {
		type: "fragment",
		role: "region",
		classList: [],
		props: {},
		style: {},
		children: flatten(props.children),
	};
}

export function jsx(
	type: string | TuiComponent,
	props: TuiElementProps,
	_key?: string,
): TuiNode {
	return h(type, props);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function getChildren(node: TuiNode): readonly TuiNode[] {
	return node.children;
}

export function findDescendantById(
	node: TuiNode,
	id: string,
): TuiNode | undefined {
	if (node.id === id) return node;
	for (const child of node.children) {
		const hit = findDescendantById(child, id);
		if (hit) return hit;
	}
	return undefined;
}

export function getRenderable(node: TuiNode, id: string): TuiNode | undefined {
	return node.children.find((child) => child.id === id);
}

function matches(node: TuiNode, selector: string): boolean {
	const trimmed = selector.trim();
	if (trimmed.startsWith("#")) return node.id === trimmed.slice(1);
	if (trimmed.startsWith(".")) return node.classList.includes(trimmed.slice(1));
	const role = /^\[role=(?:"([^"]+)"|'([^']+)'|([^\]]+))\]$/u.exec(trimmed);
	if (role) {
		return node.role === (role[1] ?? role[2] ?? role[3]);
	}
	return node.type === trimmed;
}

export function queryAll(node: TuiNode, selector: string): TuiNode[] {
	const hits: TuiNode[] = [];
	if (matches(node, selector)) hits.push(node);
	for (const child of node.children) hits.push(...queryAll(child, selector));
	return hits;
}

export function query(node: TuiNode, selector: string): TuiNode | undefined {
	return queryAll(node, selector)[0];
}

export function collectText(node: TuiNode): string[] {
	if (node.text !== undefined) return [node.text];
	return node.children.flatMap(collectText);
}

export function textNodeLine(value: string): TuiNode {
	return textNode(value);
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			box: TuiElementProps;
			text: TuiElementProps;
			strap: TuiElementProps;
		}
		interface ElementChildrenAttribute {
			children: unknown;
		}
	}
}
