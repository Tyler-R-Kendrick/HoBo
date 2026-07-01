package vibe_topology_status_prototype

#Issue: "HOBO-561"
#SourceIssue: "HOBO-544" | "HOBO-545"
#State: "fresh" | "stale" | "unavailable" | "redacted" | "unauthorized" | "partial" | "failed" | "rolled-back" | "completed"
#ProofMode: "live" | "simulated" | "reference fixture" | "scope-out"

#SourceDependency: {
	sourceIssue: #SourceIssue
	status:      "accepted"
	evidence:    string & != ""
}

#Surface: {
	id:                string & != ""
	title:             string & != ""
	consumesFrom:      [...#SourceIssue]
	operatingQuestion: string & != ""
}

#SupportHandoff: {
	issue:               #Issue
	sourceIssue:         #SourceIssue
	correlationId:       string & != ""
	customerSafeWording: =~"No customer payloads or provider credentials"
	visibleFields:       [...string]
	withheldFields:      [...string]
	ownerRoute:          string & != ""
	nextAction:          string & != ""
	liveTicketCreated:   false
}

#Snapshot: {
	state:                 #State
	surface:               string & != ""
	sourceIssue:           #SourceIssue
	sourceFixtureId:       string & != ""
	projectionSource:      =~".*View$"
	freshnessLabel:        string & != ""
	tenantRbacDisposition: =~".*(tenant|RBAC|redact|denied|scope).*"
	safeNextAction:        =~".*(inspect|wait|route|rollback|review|handoff|escalate).*"
	proofMode:             #ProofMode
	supportHandoff?:       #SupportHandoff
}

#Scenario: {
	id:              string & != ""
	title:           string & != ""
	snapshotStates:  [...#State]
	proofModeLabels: [...#ProofMode]
	safeOutcome:     string & != ""
}

#Prototype: {
	issue:              #Issue
	phase:              "M2"
	targetPackage:      "src/draft/exp-proofs/vibe-topology-status-prototype"
	proofNote:          "docs/design/proofs/vibe-topology-status-prototype/README.md"
	sourceDependencies: [...#SourceDependency]
	surfaces:           [...#Surface]
	snapshots:          [...#Snapshot]
	scenarios:          [...#Scenario]
}
