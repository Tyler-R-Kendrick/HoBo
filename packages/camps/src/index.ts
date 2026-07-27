export {
	attachCampToYard,
	camp,
	campToShape,
	CAMP_BINDLE_OWNERSHIP_FORBIDDEN,
	CAMP_MIGRATION_CODE,
	parseLegacyCampMappings,
	withResolvers,
} from "./camp.js";
export { providerSelection } from "./provider-selection.js";
export {
	resolveLocalBindings,
	type ResolvedEnv,
} from "./resolve-local-bindings.js";
export {
	EMPTY_RESOLVER_CONFIG,
	TOPOLOGY_CONTRACT_VERSION,
	type Camp,
	type CampConfig,
	type CampShape,
	type JsonValue,
	type PrimitiveResolverConfig,
	type ProviderSelection,
	type ResolverPin,
	type ResourceMappingRule,
	type ResourceSelector,
} from "./types.js";

// public-contract: package identity for boundary contracts.
export const HOBO_CAMPS_PACKAGE = "@hobo/camps";
