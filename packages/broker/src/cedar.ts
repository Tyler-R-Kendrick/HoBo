// The Cedar gate-plane adapter moved to `@hobo/provider-cedar`
// (docs/plans/0017 F30). This shim keeps the broker's historical import
// surface: the provider package's structural port types are assignable to
// the broker's GatePlane/GateDecision, so consumers notice nothing.
export {
	buildCedarRequest,
	CEDAR_ENGINE_ID,
	type CedarGatePlaneOptions,
	createCedarGatePlane,
} from "@hobo/provider-cedar";
