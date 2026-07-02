export { camp, providerSelection, resolutionPrecedenceFor } from "./camp.js";
export {
	BindingResolutionError,
	canonicalManifestHash,
	resolveLocalBindings,
} from "./resolve-local-bindings.js";
export type { ResolvedEnv } from "./resolve-local-bindings.js";
export type {
	Camp,
	CampConfig,
	ProviderSelection,
	ResolutionPrecedenceRecord,
	ResolutionStep,
} from "./types.js";

export const HOBO_CAMPS_PACKAGE = "@hobo/camps";
