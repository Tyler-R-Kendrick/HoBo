package stage_gate

#DigestSha256: string & =~"^sha256:[a-f0-9]{64}$"
#IsoTimestamp: string & =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"

#CheckStatus: "passed" | "failed" | "skipped"
#RecordStatus: "passed" | "failed" | "skipped"

#CheckResult: {
	check_id: string & !=""
	command: [...string]
	exit_code: int
	status: #CheckStatus
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
	gate_id: "s0"
	status: #RecordStatus
	repo_commit: string
	ci_run_url?: string & =~"^https://" | ""
	started_at: #IsoTimestamp
	finished_at: #IsoTimestamp
	checks: [...#CheckResult]
	artifact?: #ComponentArtifact
	signature?: #SignatureEvidence

	if status == "passed" {
		checks: [#CheckResult & {status: "passed"}, ...]
		signature.verified: true
		artifact.digest_sha256: #DigestSha256
	}
	if finished_at != "" && started_at != "" {
		finished_at: string
	}
}
