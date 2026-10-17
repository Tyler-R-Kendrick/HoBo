package stage_gate

// AcceptanceEvidence: the release gate's reading of one ai-bdd run report
// (ADR-0172). parseAiBddRunReport in src/acceptance.ts enforces the same
// constraints and also checks totals against the scenarios themselves.
#AcceptanceEvidence: {
	// One directory name under .ai-bdd/runs/.
	run_id:          string & =~"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
	report_digest:   #DigestSha256
	scenarios_total: int & >=0
	passed:          int & >=0
	healed:          int & >=0
	failed:          int & >=0
	inconclusive:    int & >=0
	blocked:         int & >=0
	error:           int & >=0
	skipped:         int & >=0
	fuzzy_steps:     int & >=0

	// Replay-only: committed plans, recordings and nothing else.
	model_calls: 0
	frozen:      true
	no_agent:    true

	exit_code: 0 | 1 | 2 | 3 | 4

	scenarios_total: passed + healed + failed + inconclusive + blocked + error + skipped

	_notPassed: failed + inconclusive + blocked + error
	_replayed:  passed + healed
	if exit_code == 0 {
		_notPassed: 0
		// An empty or all-skipped run exits 0 too; it replayed nothing.
		scenarios_total: >0
		_replayed:       >0
	}
}
