export {
	componentizeHelloBindle,
	DEFAULT_CI_MATRIX,
	PINNED_TOOLCHAIN,
	runWasmtimeSmoke,
	validateWasmComponentArtifact,
} from "./componentize.js";

export const COMPONENT_MEDIA_TYPE = "application/vnd.wasm.component.v1+wasm";

export type {
	ComponentizeOptions,
	ComponentizeResult,
	WasmComponentArtifact,
} from "./componentize.js";

export const HOBO_COMPONENTIZE_PACKAGE = "@hobo/componentize";
