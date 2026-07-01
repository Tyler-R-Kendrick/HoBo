package vibe_troubleshooting_decision_trees

#ProofMode: "live" | "simulated" | "reference fixture" | "scope-out"
#PathState: "happy" | "blocked" | "stale-or-unknown" | "support-handoff"

#RedactionEvidence: {
  redacted: true
  visibleFields: [...string] & [..._, string]
  withheldFields: [...string] & [..._, string]
}

#TroubleshootingDecisionCase: {
  caseId: string
  pathState: #PathState
  symptom: string
  diagnosticEvidence: [...string] & [..._, string]
  owner: string
  safeNextAction: string
  customerSafeWording: string
  escalationRoute: string
  proofMode: #ProofMode
  quickstartFixtureRefs: [...string] & [..._, string]
  accessibilityNotes: [...string] & [..._, string]
  redaction: #RedactionEvidence
}

#VibeTroubleshootingDecisionTrees: {
  issue: "HOBO-553"
  phase: "M1"
  targetPackage: "src/draft/exp-proofs/vibe-troubleshooting-decision-trees"
  proofNote: "docs/design/proofs/vibe-troubleshooting-decision-trees/README.md"
  designRefs: [...string] & [..._, string]
  proofModes: ["live", "simulated", "reference fixture", "scope-out"]
  cases: [...#TroubleshootingDecisionCase] & [..._, _]
  scopeOut: [...string] & [..._, string]
}
