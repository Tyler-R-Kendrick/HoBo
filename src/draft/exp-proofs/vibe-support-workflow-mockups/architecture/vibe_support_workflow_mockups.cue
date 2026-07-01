// CUE constraints for every protobuf type in this package's schema.

package architecture_evidence

#VibeSupportWorkflowProofMode: "live" | "simulated" | "reference fixture" | "scope-out"

#NonEmptyStringList: [string, ...string]

#VibeSupportWorkflowMockupState: "received" | "classified" | "evidence-linked" | "owner-routed" | "customer-updated" | "closed"

#VibeSupportWorkflowMockup: {
	id:                 string & !=""
	state:              #VibeSupportWorkflowMockupState
	title:              string & !=""
	personas:           #NonEmptyStringList
	questions_answered: #NonEmptyStringList
	fixture_ids:        #NonEmptyStringList
}

#VibeSupportWorkflowFixture: {
	id:                    string & !=""
	requester:             string & !=""
	customer_safe_summary: string & !=""
	severity:              "SEV0" | "SEV1" | "SEV2" | "SEV3"
	affected_surface:      string & !=""
	owner_route:           string & !=""
	evidence_links:        #NonEmptyStringList
	redaction_state:       "customer-safe" | "internal-only" | "requires-security-approval" | "scope-out"
	next_update_condition: string & !=""
	proof_mode:            #VibeSupportWorkflowProofMode
}

#VibeSupportWorkflowScenarioPath: {
	id:          "happy-path" | "blocked-path" | "stale-or-unknown-evidence" | "support-handoff"
	narrative:   string & !=""
	fixture_ids: #NonEmptyStringList
	safe_outcome: string & !=""
}

#VibeSupportWorkflowQuickstartFixtureReference: {
	source_issue: "HOBO-577"
	fixture_id:   "rlq-deploy-run-accepted-v1" | "rlq-manage-stale-evidence-v1" | "rlq-recover-snapshot-restore-v1" | "rlq-recover-scope-out-v1"
	proof_mode:   "reference-fixture" | "simulated" | "live" | "scope-out"
	support_use:  string & !=""
}

#VibeSupportWorkflowMockupsRecord: {
	issue:                   "HOBO-550"
	phase:                   "M1"
	package_path:            "src/draft/exp-proofs/vibe-support-workflow-mockups"
	proof_path:              "docs/design/proofs/vibe-support-workflow-mockups/README.md"
	design_refs:             #NonEmptyStringList
	quickstart_fixture_refs: [#VibeSupportWorkflowQuickstartFixtureReference, ...#VibeSupportWorkflowQuickstartFixtureReference]
	personas:                #NonEmptyStringList
	mockups:                 [#VibeSupportWorkflowMockup, ...#VibeSupportWorkflowMockup]
	fixtures:                [#VibeSupportWorkflowFixture, ...#VibeSupportWorkflowFixture]
	scenario_paths:          [#VibeSupportWorkflowScenarioPath, ...#VibeSupportWorkflowScenarioPath]
	accessibility_notes:     #NonEmptyStringList
	scope_out:               #NonEmptyStringList
}
