// CUE constraints for every protobuf type in this package's schema, so the
// architecture guard can confirm the data shapes are bounded at parse time.

package architecture_evidence

#SupportDebugToolsEvidenceKind: "unspecified" | "design-record" | "contract-test" | "reference-fixture" | "audit-fixture" | "support-handoff" | "policy-fixture" | "replay-fixture"

#SupportDebugDiagnosticBundleClass: {
	id:                 string & !=""
	owner:              string & !=""
	eventFamilies:      [...string]
	customerVisible:    bool
	redactionRequired:  true
	safeFields:         [...string]
	safeFields:         [..."tenant", "project", "environment", "correlation-id", ...]
}

#SupportDebugRecoveryRoute: {
	id:                string & !=""
	owner:             string & !=""
	trigger:           string & !=""
	safeNextAction:    string & !=""
	mutationAllowed:   false
}

#SupportDebugToolsScopeRecord: {
	issue:             "HOBO-426"
	summary:           string & !=""
	personas:          [...string]
	diagnosticBundles: [...#SupportDebugDiagnosticBundleClass]
	recoveryRoutes:    [...#SupportDebugRecoveryRoute]
	evidence:          [...string]
}
