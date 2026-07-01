package dx_resource_lifecycle_scenario_matrix

#RequiredRole: "app-developer" | "platform-engineer" | "gitops" | "secops" | "devops" | "sre" | "agent-mcp-caller"
#RequiredPath: "happy-path" | "blocked-path" | "stale-or-unknown-evidence" | "migration-or-rollback" | "support-handoff"
#ProofMode: "command-transcript" | "contract-fixture" | "projection-snapshot" | "support-safe-evidence"

#DxScenarioJourney: {
	id:                  =~"^[a-z0-9][a-z0-9-]+$"
	role:                #RequiredRole
	intent:              string & =~"\\S"
	commands:            [...string] & >0
	sdk_calls:           [...string] & >0
	api_calls:           [...string] & >0
	mcp_tools:           [...string] & >0
	expected_artifacts:  [...string] & >0
	proof_mode:          #ProofMode
	fixture_requirements: [...string] & >0
	scenario_paths:      [#RequiredPath, #RequiredPath, #RequiredPath, #RequiredPath, #RequiredPath]
	design_terms:        [...string] & >0
}

#DxResourceLifecycleScenarioMatrix: {
	issue:          "HOBO-567"
	phase:          "M1"
	target_package: "src/draft/exp-proofs/dx-resource-lifecycle-scenario-matrix"
	proof_note:     "docs/design/proofs/dx-resource-lifecycle-scenario-matrix/README.md"
	design_refs:    [...string] & >0
	design_terms:   [...string] & >0
	scope_out: [
		"production CLI/API/SDK implementation",
		"live providers",
		"real credentials",
		"customer data",
		"visual mockups that invent resource behavior before the matrix exists",
	]
	journeys: [...#DxScenarioJourney] & >=7
}
