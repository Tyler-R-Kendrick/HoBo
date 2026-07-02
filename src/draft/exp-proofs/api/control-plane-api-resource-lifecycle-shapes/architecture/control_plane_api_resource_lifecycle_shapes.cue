// CUE constraints for every protobuf type in this package's schema, so the
// architecture guard can confirm the data shapes are bounded at parse time.

package architecture_evidence

#ControlPlaneApiProofMode: "reference-fixture" | "contract-fixture" | "projection-snapshot" | "support-safe-evidence"

#ControlPlaneApiOperation: {
	id:                   string & !=""
	humanName:            string & !=""
	cliCommand:           string & !=""
	apiEndpoint:          =~"^/"
	mcpTool:              =~"^hobo_"
	requestShape:         [...string] & >0
	responseShape:        [...string] & >0
	domainTerms:          [...string] & >0
	sharedResultEnvelope: true
	fixtureId:            string & !=""
}

#ControlPlaneApiRefusalEnvelope: {
	code:            "policy-denied" | "contract-incompatible" | "provider-capability-partial" | "provider-capability-none" | "stale-projection" | "unknown-evidence" | "non-reactive-sink" | "destructive-migration-blocked"
	trigger:         string & !=""
	remediation:     string & !=""
	proofMode:       #ControlPlaneApiProofMode
	fixtureId:       string & !=""
	redactionClass:  "public" | "tenant-safe" | "support-redacted"
}

#ControlPlaneApiContractFixtures: {
	protobuf: "architecture/control_plane_api_resource_lifecycle_shapes.proto"
	cue:      "architecture/control_plane_api_resource_lifecycle_shapes.cue"
	pact:     "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json"
}

#ControlPlaneApiResourceLifecycleContract: {
	issue:              "HOBO-569"
	phase:              "M1"
	targetPackage:      "src/draft/exp-proofs/api/control-plane-api-resource-lifecycle-shapes"
	proofNote:          "docs/design/proofs/control-plane-api-resource-lifecycle-shapes/README.md"
	designRefs:         [...string] & >0
	operations:         [...#ControlPlaneApiOperation] & >=8
	refusalEnvelopes:   [...#ControlPlaneApiRefusalEnvelope] & >=8
	contractFixtures:   #ControlPlaneApiContractFixtures
	scopeOut:           [...string] & >0
}
