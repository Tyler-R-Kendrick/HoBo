/**
 * Structural webApp detection for Bindle Kit bindings.
 * Framework packages stamp `Symbol.for("hobo.webapp.meta")` with `{ framework, root }`
 * (Wasp also stamps `hobo.webapp.wasp`; Convex stamps `hobo.webapp.convex`).
 */
import type { ComponentBinding, ProviderAnnotation } from "./types.js";

// public-contract: identifies framework-neutral web application annotations.
export const WEBAPP_OPTION = "webapp" as const;
export const WEBAPP_META = Symbol.for("hobo.webapp.meta");
export const WASP_WEBAPP_METADATA = Symbol.for("hobo.webapp.wasp");
export const CONVEX_WEBAPP_METADATA = Symbol.for("hobo.webapp.convex");

type WebAppMeta = { framework?: unknown; root?: unknown };

function readMeta(
	binding: ComponentBinding,
	symbol: symbol,
): WebAppMeta | undefined {
	const meta = (binding as unknown as Record<symbol, unknown>)[symbol] as
		| WebAppMeta
		| undefined;
	return meta && typeof meta === "object" ? meta : undefined;
}

export function webAppAnnotationFromBinding(
	binding: ComponentBinding | undefined,
): ProviderAnnotation | undefined {
	if (typeof binding !== "function") return undefined;
	const meta =
		readMeta(binding, WEBAPP_META) ??
		readMeta(binding, WASP_WEBAPP_METADATA) ??
		readMeta(binding, CONVEX_WEBAPP_METADATA);
	if (!meta) return undefined;
	if (typeof meta.framework !== "string" || meta.framework.length === 0) {
		return undefined;
	}
	if (typeof meta.root !== "string" || meta.root.length === 0) return undefined;
	return Object.freeze({
		provider: "hobo",
		option: WEBAPP_OPTION,
		config: Object.freeze({ framework: meta.framework, root: meta.root }),
	});
}

export function isWebAppAnnotation(annotation: ProviderAnnotation): boolean {
	return (
		annotation.provider === "hobo" && annotation.option === WEBAPP_OPTION
	);
}
