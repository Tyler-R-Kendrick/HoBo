export {
	applyFluxDeploy,
	FLUX_RIVET_RUNNER_RECIPE,
	type FluxApplyReceipt,
	type FluxDeploySpec,
	type FluxEnvironment,
	type FluxPrimitive,
	FluxProviderError,
	type FluxSourceKind,
	type FluxTier,
	type JsonValue,
	parseFluxDeploySpec,
} from "./parse.js";
export { FLUX_PIN } from "./upstream-pin.js";

// public-contract: package id compose and Matching pin.
export const HOBO_PROVIDER_FLUX_PACKAGE = "@hobo/provider-flux";
// public-contract: CloudProvider target id for Flux compute.
export const FLUX_PROVIDER_TARGET = "flux";
