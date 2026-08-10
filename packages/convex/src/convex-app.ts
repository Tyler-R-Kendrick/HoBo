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
	(Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

/** DeclaredComponent for Bindle — only stamps `root` (repo-relative Convex app dir). */
export function convexApp(root: string): new () => object {
	const trimmed = typeof root === "string" ? root.trim() : "";
	if (!trimmed) throw new TypeError("convexApp(root) requires a non-empty path");

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

export function convexMetaOf(binding: unknown): ConvexWebAppMeta | undefined {
	if (typeof binding !== "function") return undefined;
	const meta = (binding as unknown as Record<symbol, unknown>)[
		CONVEX_WEBAPP_METADATA
	];
	if (!meta || typeof meta !== "object") return undefined;
	const m = meta as Partial<ConvexWebAppMeta>;
	if (m.framework !== "convex" || typeof m.root !== "string") return undefined;
	return meta as ConvexWebAppMeta;
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
		typeof annotation.config?.root === "string"
	);
}

export function convexRootFromAnnotations(
	annotations: readonly ProviderAnnotation[],
): string {
	const hit = annotations.find(isConvexWebAppAnnotation);
	const root = hit?.config.root;
	if (typeof root !== "string" || root.length === 0) {
		throw new Error("Bindle web Kit missing convexApp(root) annotation");
	}
	return root;
}
