package role_journey_cli_mcp_transcripts

#RoleJourneyCliMcpTranscripts: {
  issue: "HOBO-557"
  phase: "M2"
  target_package: "src/draft/exp-proofs/role-journey-cli-mcp-transcripts"
  proof_note: "docs/design/proofs/role-journey-cli-mcp-transcripts/README.md"
  source_quickstart_issue: "HOBO-577"
  source_quickstart_proof: "docs/design/proofs/resource-lifecycle-quickstart-examples/README.md"
  design_refs: [...string]
  scope_out: [...string]
  journeys: [...#RoleJourney]
}

#RoleJourney: {
  role: "app-developer" | "platform-engineer" | "gitops" | "secops" | "devops" | "sre"
  title: string
  audience: string
  intent: string
  primary_quickstart_fixture_id: =~"^rlq-[a-z0-9-]+-v[0-9]+$"
  coverage: [...("deploy" | "manage" | "migrate" | "rollback" | "policy-or-contract-denial" | "support-handoff")]
  negative_paths: [...("blocked" | "stale-or-unknown-evidence")]
  sequence: [...#RoleJourneyStep]
}

#RoleJourneyStep: {
  id: string
  command: =~"^hobo "
  expected_terminal_output: string
  quickstart_fixture_id: =~"^rlq-[a-z0-9-]+-v[0-9]+$"
  proof_mode: "reference-fixture" | "simulated" | "scope-out"
  json_result: #RoleJourneyJsonResult & {
    fixture_id: quickstart_fixture_id
    proof_mode: proof_mode
  }
  mcp_result: #RoleJourneyMcpResult & {
    fixture_id: quickstart_fixture_id
    proof_mode: proof_mode
  }
  support_handoff: =~"(?i)support"
  accessibility_note: =~"(?i)(plain text|screen reader|non-color|stable heading)"
}

#RoleJourneyJsonResult: {
  schema: "hobo.role-journey-cli-mcp-result/v1"
  status: "ready" | "blocked" | "stale" | "support" | "rollback" | "migrate" | "deploy"
  fixture_id: string
  proof_mode: "reference-fixture" | "simulated" | "scope-out"
  summary: string
  support_handoff: string
}

#RoleJourneyMcpResult: {
  tool: =~"^hobo_"
  status: "ready" | "blocked" | "stale" | "support" | "rollback" | "migrate" | "deploy"
  fixture_id: string
  proof_mode: "reference-fixture" | "simulated" | "scope-out"
  result_schema: "hobo.role-journey-cli-mcp-result/v1"
}

#RoleJourneyScopeDecision: {
  allowed: bool
  reason: string
}
