package code

#IsolationBackend: {
	kind:        "rift" | "worktree"
	platform:    string & !=""
	cow_capable: bool
	reason:      string & !=""
}

#IsolationContext: {
	schema_version: "hobo.code.isolation/v1"
	run_id:         string & !=""
	branch:         string & !=""
	root_path:      string & !=""
	backend:        #IsolationBackend
	station_id?:    string
	durable_root:   string & !=""
	created_at:     string & !=""
	status:         "open" | "cleaned" | "failed"
}

#PromotionRequest: {
	run_id:          string & !=""
	isolation_root:  string & !=""
	target_project:  string & !=""
	gate_results:    [...string]
	squash_only:     true
}

#PromotionResult: {
	ok:            bool
	code:          string & !=""
	message:       string & !=""
	merged_branch?: string
	cleaned:       bool
}

#EvidenceTriple: {
	flag_key:               string & !=""
	scenario:               string & !=""
	playwright_script_path: string & !=""
	recording_mp4_path:     string & !=""
	screenshot_paths:       [...string]
	durable_root:           string & !=""
}

#AgentPaneState: {
	agent_id:        string & !=""
	semantic_state:  "blocked" | "working" | "done" | "idle"
	summary:         string
	highlight_buffer: string
}

#InferenceBudgetSnapshot: {
	provider:              string & !=""
	spend_usd:             number & >=0
	cap_usd:               number & >=0
	monetization_enabled:  false | true
	routing_policy:        string & !=""
}
