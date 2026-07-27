import type { ProviderAnnotation } from "./types.js";

/**
 * Injectable env for bindle resources (Camp injects at serve time).
 *
 * Author once, attach with `.with(...)` on each resource that should receive it:
 *
 * ```ts
 * const campEnv = env({ GREETING_PREFIX: "howdy", APP_TITLE: "howdy" });
 * const a = b.api(handler).with(campEnv);
 * const w = b.web(handler).with(campEnv).dependsOn(a);
 * ```
 *
 * Local hosts set `process.env`; isolated-wasm gets mesh headers (`x-hobo-env-*`).
 * Not a provider pin — placement never hard-fails on `option: "env"`.
 */
export function env(
	config: Readonly<Record<string, string | number | boolean>>,
): ProviderAnnotation {
	const frozen: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(config)) {
		if (key.length === 0) {
			throw new TypeError("env() keys must be non-empty strings");
		}
		frozen[key] = value;
	}
	return Object.freeze({
		provider: "hobo",
		option: "env",
		config: Object.freeze(frozen),
	});
}
