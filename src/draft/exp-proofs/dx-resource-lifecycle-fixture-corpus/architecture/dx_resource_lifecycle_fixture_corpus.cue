package architecture_evidence

#DxFixtureProofMode: "unspecified" | "reference fixture" | "simulated" | "live" | "scope-out"

#DxLifecycleScenario: {
	id:             string & !=""
	persona:        string & !=""
	lifecycle_step: string & !=""
	commands:       [...string]
	artifacts:      [...string]
	fixture_ids:    [...string]
	proof_mode:     "reference fixture" | "simulated" | "live" | "scope-out"
	deterministic:  true
	redacted:       true
	tenant_safe:    true
}

#DxResourceLifecycleFixtureCorpus: {
	issue:              "HOBO-572"
	package_path:       "src/draft/exp-proofs/dx-resource-lifecycle-fixture-corpus"
	proof_note:         "docs/design/proofs/dx-resource-lifecycle-fixture-corpus/README.md"
	source_refs:        [...string]
	boundary_contracts: [...string]
	consumers:          [...string]
	scenarios:          [...#DxLifecycleScenario]
}
