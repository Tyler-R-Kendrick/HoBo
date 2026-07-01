package vibe_workspace_project_states

#WorkspaceProjectState: "empty" | "ready" | "blocked" | "recovering" | "failed" | "value-proven"
#ProofMode: "live" | "simulated" | "reference fixture" | "scope-out"
#JourneyCoverage: "happy path" | "blocked path" | "stale/unknown evidence path" | "support handoff" | "accessibility notes"
#Persona: "app developer" | "team admin" | "platform engineer" | "support operator"
#ProviderReadinessStatus: "not-required" | "ready" | "missing-prerequisite" | "recovering" | "failed" | "value-proven"
#Freshness: "current" | "stale" | "unknown" | "scope-out" | "future-live-gated"

#NamedSummary: {
	id:      =~"^(wsp|prj)-[a-z0-9-]+$"
	name:    string & =~"\\S"
	summary: string & =~"\\S"
}

#ProviderReadiness: {
	status: #ProviderReadinessStatus
	owner:  #Persona | "none"
	detail: string & =~"\\S"
}

#SafeNextAction: {
	label:             string & =~"\\S"
	owner:             #Persona
	evidenceRequired:  string & =~"\\S"
	destructive:       false
	opensLiveProvider: false
}

#EvidenceLink: {
	label:     string & =~"\\S"
	href:      =~"^docs/design/proofs/[a-z0-9-]+/README\\.md#[a-z0-9-]+$"
	fixtureId: =~"^vwp-[a-z0-9-]+-v[0-9]+$"
	freshness: #Freshness
	proofMode: #ProofMode
}

#MissingPrerequisiteBehavior: {
	ifMissing:     string & =~"\\S"
	userSees:      string & =~"\\S"
	systemDoesNot: string & =~"\\S"
}

#SupportHandoff: {
	required:  bool
	route:     string & =~"\\S"
	redaction: string & =~"\\S"
	note:      string & =~"\\S"
}

#Wireframe: {
	surface:         string & =~"\\S"
	caption:         string & =~"\\S"
	regions:         [...string] & >0
	primaryStatus:   string & =~"\\S"
	secondaryDetail: string & =~"\\S"
}

#ClaimPolicy: {
	safeClaims:      [...string] & >0
	forbiddenClaims: [...string] & >0
}

#WorkspaceProjectModeNote: {
	proofMode: #ProofMode
	label:     string & =~"\\S"
	meaning:   string & =~"\\S"
}

#WorkspaceProjectStateFixture: {
	id:                          =~"^vwp-[a-z0-9-]+-v[0-9]+$"
	state:                       #WorkspaceProjectState
	workspace:                   #NamedSummary & {id: =~"^wsp-[a-z0-9-]+$"}
	project:                     #NamedSummary & {id: =~"^prj-[a-z0-9-]+$"}
	providerReadiness:           #ProviderReadiness
	blockerOwner:                #Persona | "none"
	safeNextAction:              #SafeNextAction
	evidenceLink:                #EvidenceLink
	proofMode:                   #ProofMode
	pathCoverage:                [...#JourneyCoverage] & >0
	missingPrerequisiteBehavior: #MissingPrerequisiteBehavior
	supportHandoff:              #SupportHandoff
	accessibilityNotes:          [...string] & >=2
	wireframe:                   #Wireframe
	claimPolicy:                 #ClaimPolicy
}

#VibeWorkspaceProjectStateModel: {
	issue:         "HOBO-541"
	phase:         "M1"
	targetPackage: "src/draft/exp-proofs/vibe-workspace-project-states"
	proofNote:     "docs/design/proofs/vibe-workspace-project-states/README.md"
	designRefs:    [...string] & >0
	scopeOut: [
		"account service implementation",
		"auth or billing flows",
		"production dashboard UI",
		"live provider calls",
		"customer data",
		"launch claims without evidence",
	]
	modeNotes: [...#WorkspaceProjectModeNote] & >=4
	fixtures:  [...#WorkspaceProjectStateFixture] & >=6
}
