/**
 * Re-exports from `@hobo/runtime-wasm` for back-compat.
 * Prefer importing from `@hobo/runtime-wasm` in new code.
 */
export {
	applyHoboMeshEnvHeaders,
	bootWasmtimeSandbox,
	componentizePrivateGuest,
	defaultHoboHome,
	ensureIsolatedWasmToolchain,
	ensureWasmtimeBinary,
	HOBO_BINDLE_ENV_HEADER,
	HOBO_ENV_HEADER_PREFIX,
	PINNED_WASMTIME_VERSION,
	preparePrivateWasmComponent,
	resolvePrivateWasmGuest,
	type ComponentizeResult,
	type FetchHandler,
	type IsolatedWasmToolchain,
	type JcoTool,
	type ResolvedPrivateGuest,
	type WasmtimeBinary,
	type WasmtimeSandbox,
} from "@hobo/runtime-wasm";
