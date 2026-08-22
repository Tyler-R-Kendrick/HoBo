/**
 * Minimal Convex webApp marker for `b.web(convexApp(root))`.
 * Swaghaus: https://github.com/JamesCowling/swaghaus
 */
import type { ProviderAnnotation } from "@hobo/bindles";
import { COMPONENT_METADATA } from "@hobo/runtime";

export const CONVEX_WEBAPP_METADATA = Symbol.for("hobo.webapp.convex");
/** Shared meta symbol — Bindle detects any `{ framework, root }` webApp. */
export const WEBAPP_META = Symbol.for("hobo.webapp.meta");
// public-contract: Bindle provider annotations use this stable option name.
export const WEBAPP_OPTION = "webapp" as const;

export type ConvexWebAppMeta = {
	readonly framework: "convex";
	readonly root: string;
};

const METADATA_SYMBOL =
	// SAFETY: Symbol.metadata is an optional standard well-known symbol.
	(Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

type ConvexMetaRecord = {
	readonly framework?: unknown;
	readonly root?: unknown;
};

function isString<T>(value: T): value is T & string {
	return value === String(value);
}

function isMetaRecord<T>(value: T): value is T & ConvexMetaRecord {
	return value !== null && Object(value) === value;
}

function isConvexMeta<T>(value: T): value is T & ConvexWebAppMeta {
	return (
		isMetaRecord(value) &&
		value.framework === "convex" &&
		isString(value.root)
	);
}

/** DeclaredComponent for Bindle — only stamps `root` (repo-relative Convex app dir). */
export function convexApp(root: string): new () => object {
	const trimmed = isString(root) ? root.trim() : "";
	if (!trimmed)
		throw new TypeError("convexApp(root) requires a non-empty path");

	const meta: ConvexWebAppMeta = Object.freeze({
		framework: "convex",
		root: trimmed,
	});

	class ConvexApp {}
	Object.defineProperty(ConvexApp, CONVEX_WEBAPP_METADATA, {
		value: meta,
		enumerable: false,
	});
	Object.defineProperty(ConvexApp, WEBAPP_META, {
		value: meta,
		enumerable: false,
	});
	Object.defineProperty(ConvexApp, METADATA_SYMBOL, {
		value: {
			[COMPONENT_METADATA]: {
				intent: `convex:${trimmed}`,
				name: "ConvexApp",
				operations: [],
			},
		},
		configurable: true,
	});
	return ConvexApp;
}

export function convexMetaOf<T>(binding: T): ConvexWebAppMeta | undefined {
	if (Object.prototype.toString.call(binding) !== "[object Function]")
		return undefined;
	const meta = Object.getOwnPropertyDescriptor(
		Object(binding),
		CONVEX_WEBAPP_METADATA,
	)?.value;
	if (!isConvexMeta(meta)) return undefined;
	return meta;
}

export function convexAnnotation(meta: ConvexWebAppMeta): ProviderAnnotation {
	return Object.freeze({
		provider: "hobo",
		option: WEBAPP_OPTION,
		config: Object.freeze({
			framework: meta.framework,
			root: meta.root,
		}),
	});
}

export function isConvexWebAppAnnotation(
	annotation: ProviderAnnotation,
): boolean {
	return (
		annotation.provider === "hobo" &&
		annotation.option === WEBAPP_OPTION &&
		annotation.config?.framework === "convex" &&
		isString(annotation.config?.root)
	);
}

export function convexRootFromAnnotations(
	annotations: readonly ProviderAnnotation[],
): string {
	const hit = annotations.find(isConvexWebAppAnnotation);
	const root = hit?.config.root;
	if (!isString(root) || root.length === 0) {
		throw new Error("Bindle web Kit missing convexApp(root) annotation");
	}
	return root;
}
