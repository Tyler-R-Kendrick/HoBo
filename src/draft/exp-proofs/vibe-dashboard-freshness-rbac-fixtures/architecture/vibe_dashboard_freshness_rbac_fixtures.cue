package vibe_dashboard_freshness_rbac_fixtures

#DashboardFreshnessRbacFixtureProof: {
	issue: "HOBO-545"
	phase: "M1"
	targetPackage: "src/draft/exp-proofs/vibe-dashboard-freshness-rbac-fixtures"
	proofNote: "docs/design/proofs/vibe-dashboard-freshness-rbac-fixtures/README.md"
	designRefs: [...string]
	fixtures: [...#DashboardReadStateFixture]
	scopeOut: [...string]
}

#DashboardReadStateFixture: {
	state: "fresh" | "stale" | "unavailable" | "redacted" | "unauthorized" | "partial" | "support-routed"
	fixtureId: =~"^hobo-545-dashboard-"
	projectionSource: =~"View$"
	scope: #DashboardFixtureScope
	owner: #DashboardFixtureOwner
	evidenceLink: =~"^proof://hobo-545/"
	customerSafeWording: =~"No customer payloads or provider credentials"
	nextAction: string & != ""
	proofMode: "reference fixture"
	correlationId: =~"^cor_hobo_545_"
	status: string & != ""
	freshness: #DashboardFixtureFreshness
	redaction: #DashboardFixtureRedaction
}

#DashboardFixtureScope: {
	tenantFirst: true
	tenant: string & != ""
	project: string & != ""
	environment: string & != ""
	rbacRole: string & != ""
	redactionState: "none" | "masked" | "denied"
}

#DashboardFixtureOwner: {
	actor: string & =~"Actor$"
	initiative: "Deployment Dashboard & Topology Explorer"
}

#DashboardFixtureFreshness: {
	projectionSequence: uint
	maxAgeSeconds: uint & >0
	observedAt: =~"^2026-07-01T"
}

#DashboardFixtureRedaction: {
	visibleFields: [...string]
	withheldFields: [...string]
}
