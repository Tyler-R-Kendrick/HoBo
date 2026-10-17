package stage_gate

#DigestSha256: string & =~"^sha256:[a-f0-9]{64}$"
#IsoTimestamp: string & =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"

// not_run: the check could not be carried out (ai-bdd exit 3, ADR-0172); a
// record with one and no failed check is not_run, never passed or failed.
#CheckStatus:  "passed" | "failed" | "skipped" | "not_run"
#RecordStatus: "passed" | "failed" | "skipped" | "not_run"

#CheckResult: {
	check_id: string & !=""
	command: [...string]
	// -1: never started (a required check did not pass); status is then skipped.
	exit_code: int
	status:    #CheckStatus
	evidence?: {[string]: string}
}

#ComponentArtifact: {
	digest_sha256: #DigestSha256
	byte_length: int & >=0
	media_type: string & !=""
}

#SignatureEvidence: {
	verified: bool
	signer_identity: string
	provenance_tier: string
	conformance_report_digest: #DigestSha256 | ""
}

#StageGateRecord: {
	gate_id: "s0" | "release"
	status: #RecordStatus
	repo_commit: string
	ci_run_url?: string & =~"^https://" | ""
	started_at: #IsoTimestamp
	finished_at: #IsoTimestamp
	checks: [...#CheckResult]
	artifact?: #ComponentArtifact
	signature?: #SignatureEvidence

	if status == "passed" {
		checks: [...#CheckResult & {status: "passed"}]
	}
	// S0 attests a built, signed component.
	if gate_id == "s0" && status == "passed" {
		signature: verified: true
		artifact: digest_sha256: #DigestSha256
	}
	// The release gate attests a replay: its three checks in order, and the
	// digest of the report that says so (ADR-0172).
	if gate_id == "release" && status == "passed" {
		checks: [
			{check_id: "acceptance-plans-fresh"},
			{check_id: "acceptance-replay", evidence: report_digest: #DigestSha256},
			{check_id: "acceptance-evidence-intact"},
		]
	}
	if finished_at != "" && started_at != "" {
		finished_at: string
	}
}
