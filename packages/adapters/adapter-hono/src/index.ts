/**
 * `@hobo/adapter-hono` — L2 framework adapter.
 *
 * Wires Hono apps into HoBo bindle HTTP entrypoints without putting Hono in core.
 */

export const HOBO_ADAPTER_HONO_PACKAGE = "@hobo/adapter-hono" as const;
export const HOBO_ADAPTER_HONO_FRAMEWORK = "hono" as const;

export {
	honoEntrypoint,
	isHonoFetchApp,
	toFetchHandler,
	type BindleHttpEntrypoint,
	type FetchHandler,
	type HonoFetchApp,
} from "./fetch.js";
