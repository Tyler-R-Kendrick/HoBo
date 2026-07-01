package troubleshooting_guides_scope_acceptance

TroubleshootingGuidesScope: {
	issue: "HOBO-437"
	project: "Troubleshooting Guides"
	phase: "M0"
	goal: =~"Troubleshooting Guides"
	personas: [...Persona] & {
		[0]: _
		[1]: _
		[2]: _
		[3]: _
		[4]: _
	}
	scope_in: [...string] & {
		[0]: _
		[1]: _
		[2]: _
		[3]: _
		[4]: _
	}
	scope_out: [...string] & {
		[0]: _
		[1]: _
		[2]: _
		[3]: _
		[4]: _
	}
	non_goals: [...string] & {
		[0]: _
		[1]: _
		[2]: _
		[3]: _
	}
	boundaries: BoundarySet
	dependencies: [...Dependency]
	initiative_dependencies: [...InitiativeDependency]
	m1_evidence: [...EvidenceRequirement]
	follow_up_gate: FollowUpGate
}

Persona: {
	role: string & != ""
	need: string & != ""
}

BoundarySet: {
	service: string & != ""
	ux: string & != ""
	security: string & != ""
	support: string & != ""
}

Dependency: {
	source: string & =~"^docs/design/"
	reason: string & != ""
}

InitiativeDependency: {
	owner: string & != ""
	consumes: string & != ""
	scope_boundary: string & != ""
}

EvidenceRequirement: {
	kind: string & != ""
	owner: string & != ""
	proof_mode: "design-record" | "contract-test" | "reference-fixture" | "agent-fixture" | "redaction-rule" | "support-handoff"
	proves: string & != ""
}

FollowUpGate: {
	allowed_after: "M0 accepted"
	blocked_before: string & =~"M1"
}

TroubleshootingHandoffOwner: "guides" | "support-workflow" | "incident-communications" | "public-status-page"
