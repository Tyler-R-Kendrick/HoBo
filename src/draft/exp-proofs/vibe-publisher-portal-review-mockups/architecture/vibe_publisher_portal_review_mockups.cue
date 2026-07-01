// CUE constraints for every protobuf type in this package's schema.

package architecture_evidence

#VibePublisherPortalProofMode: "live" | "simulated" | "reference fixture" | "scope-out"

#NonEmptyStringList: [string, ...string]

#VibePublisherPortalState: "submission-draft" | "evidence-upload" | "review-status" | "rejection-remediation" | "resubmission" | "yank-remediation" | "payout-support-handoff"

#VibePublisherPortalMockup: {
	id:                string & !=""
	state:             #VibePublisherPortalState
	title:             string & !=""
	personas:          #NonEmptyStringList
	questionsAnswered: #NonEmptyStringList
	fixtureIds:        #NonEmptyStringList
}

#VibePublisherPortalFixture: {
	id:                        string & !=""
	artifactMetadata:          string & !=""
	evidenceState:             string & !=""
	reviewOutcome:             string & !=""
	payoutReadinessHandoff:    string & !=""
	supportWording:            string & !=""
	customerVisibleLimitation: string & !=""
	proofMode:                 #VibePublisherPortalProofMode
}

#VibePublisherPortalScenarioPath: {
	id:          "happy-path" | "blocked-path" | "stale-or-unknown-evidence" | "support-handoff"
	narrative:   string & !=""
	fixtureIds:  #NonEmptyStringList
	safeOutcome: string & !=""
}

#VibePublisherPortalReviewMockupsRecord: {
	issue:              "HOBO-548"
	phase:              "M1"
	packagePath:        "src/draft/exp-proofs/vibe-publisher-portal-review-mockups"
	proofPath:          "docs/design/proofs/vibe-publisher-portal-review-mockups/README.md"
	designRefs:         #NonEmptyStringList
	personas:           #NonEmptyStringList
	mockups:            [#VibePublisherPortalMockup, ...#VibePublisherPortalMockup]
	fixtures:           [#VibePublisherPortalFixture, ...#VibePublisherPortalFixture]
	scenarioPaths:      [#VibePublisherPortalScenarioPath, ...#VibePublisherPortalScenarioPath]
	accessibilityNotes: #NonEmptyStringList
	scopeOut:           #NonEmptyStringList
}
