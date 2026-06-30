// CUE constraints for every protobuf type in this package's schema, so the
// architecture guard can confirm the data shapes are bounded at parse time.

package architecture_evidence

#V1CutlineContractEvidenceKind: "unspecified" | "design-record" | "contract-test" | "m1-dogfood-alpha"

#V1CutlineContractRecord: {
	issue:    string & !=""
	summary:  string & !=""
	evidence: [...string]
}

#V1CutlineDogfoodAlphaEvidence: {
	issue:                      "HOBO-454"
	phase:                      "M1"
	milestone_gate:             "M1 Dogfood/alpha proof"
	required_evidence_ids:      [...string]
	blockers:                   [...string]
	accepted_risks:             [...string]
	cross_project_dependencies: [...string]
	missing_evidence:           [...string]
	follow_up_issues:           [...string]
	parent_status_updated:      bool
}
