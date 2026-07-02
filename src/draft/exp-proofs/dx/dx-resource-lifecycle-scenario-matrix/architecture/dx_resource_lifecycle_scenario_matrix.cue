package dx_resource_lifecycle_scenario_matrix

#RequiredRole: "app-developer" | "platform-engineer" | "gitops" | "secops" | "devops" | "sre" | "agent-mcp-caller"
#RequiredPath: "happy-path" | "blocked-path" | "stale-or-unknown-evidence" | "migration-or-rollback" | "support-handoff"
#ProofMode: "command-transcript" | "contract-fixture" | "projection-snapshot" | "support-safe-evidence"

#DxScenarioJourney: {
	id:                  =~"^[a-z0-9][a-z0-9-]+$"
	role:                #RequiredRole
	intent:              string & =~"\\S"
	commands:            [...string] & >0
	sdkCalls:            [...string] & >0
	apiCalls:            [...string] & >0
	mcpTools:            [...string] & >0
	expectedArtifacts:   [...string] & >0
	proofMode:           #ProofMode
	fixtureRequirements: [...string] & >0
	scenarioPaths:       [#RequiredPath, #RequiredPath, #RequiredPath, #RequiredPath, #RequiredPath]
	designTerms:         [...string] & >0
}

#DxResourceLifecycleScenarioMatrix: {
	issue:          "HOBO-567"
	phase:          "M1"
	targetPackage:  "src/draft/exp-proofs/dx/dx-resource-lifecycle-scenario-matrix"
	proofNote:      "docs/design/proofs/dx-resource-lifecycle-scenario-matrix/README.md"
	designRefs:     [...string] & >0
	designTerms:    [...string] & >0
	scopeOut: [
		"production CLI/API/SDK implementation",
		"live providers",
		"real credentials",
		"customer data",
		"visual mockups that invent resource behavior before the matrix exists",
	]
	journeys: [...#DxScenarioJourney] & >=7
}
