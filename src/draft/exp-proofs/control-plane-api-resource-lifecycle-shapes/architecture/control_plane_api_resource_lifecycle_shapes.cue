// CUE constraints for every protobuf type in this package's schema, so the
// architecture guard can confirm the data shapes are bounded at parse time.

package architecture_evidence

#ControlPlaneApiProofMode: "reference-fixture" | "contract-fixture" | "projection-snapshot" | "support-safe-evidence"

#ControlPlaneApiOperation: {
	id:                     string & !=""
	human_name:             string & !=""
	cli_command:            string & !=""
	api_endpoint:           =~"^/"
	mcp_tool:               =~"^hobo_"
	request_shape:          [...string]
	response_shape:         [...string]
	domain_terms:           [...string]
	shared_result_envelope: true
	fixture_id:             string & !=""
}

#ControlPlaneApiRefusalEnvelope: {
	code:            "policy-denied" | "contract-incompatible" | "provider-capability-partial" | "provider-capability-none" | "stale-projection" | "unknown-evidence" | "non-reactive-sink" | "destructive-migration-blocked"
	trigger:         string & !=""
	remediation:     string & !=""
	proof_mode:      #ControlPlaneApiProofMode
	fixture_id:      string & !=""
	redaction_class: "public" | "tenant-safe" | "support-redacted"
}

#ControlPlaneApiContractFixtures: {
	protobuf: "architecture/control_plane_api_resource_lifecycle_shapes.proto"
	cue:      "architecture/control_plane_api_resource_lifecycle_shapes.cue"
	pact:     "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json"
}

#ControlPlaneApiResourceLifecycleContract: {
	issue:              "HOBO-569"
	phase:              "M1"
	target_package:     "src/draft/exp-proofs/control-plane-api-resource-lifecycle-shapes"
	proof_note:         "docs/design/proofs/control-plane-api-resource-lifecycle-shapes/README.md"
	design_refs:        [...string]
	operations:         [...#ControlPlaneApiOperation]
	refusal_envelopes:  [...#ControlPlaneApiRefusalEnvelope]
	contract_fixtures:  #ControlPlaneApiContractFixtures
	scope_out:          [...string]
}
