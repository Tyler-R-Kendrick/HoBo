package cli_error_refusal_examples

#ProofMode: "reference-fixture" | "simulated-transcript" | "live"
#McpStatus: "error" | "blocked" | "needs-human"

#CliJsonOutput: {
	status:         "blocked" | "refused" | "unknown" | "handoff"
	code:           =~"^[a-z]+\\.[a-z_]+\\.[a-z_]+$|^[a-z]+\\.[a-z_]+$"
	message:        string & != ""
	remediation:    string & != ""
	proof_mode:     #ProofMode
	fixture_id:     =~"^cli-error-refusal\\."
	correlation_id: =~"^corr-"
}

#McpContent: {
	type: "text"
	text: string & != ""
}

#McpMetadata: {
	code:            string & != ""
	proof_mode:      #ProofMode
	fixture_id:      =~"^cli-error-refusal\\."
	exit_code:       int & >0
	redaction_class: "public" | "tenant-safe" | "support-safe"
}

#McpToolResult: {
	tool_name: =~"^hobo\\."
	status:    #McpStatus
	is_error:  true
	content:   [#McpContent, #McpContent, ...#McpContent]
	metadata:  #McpMetadata
}

#CliErrorRefusalExample: {
	case_id: "missing-dependency" | "credential-auth-failure" | "policy-denial" | "contract-incompatibility" | "stale-projection" | "unknown-evidence" | "non-reactive-sink" | "provider-capability-partial-none" | "destructive-migration-blocked" | "support-bundle-handoff"
	operations: [_, ...("doctor" | "plan" | "up" | "inspect" | "logs" | "mcp-action")]
	code:       string & != ""
	title:      string & != ""
	human_terminal_copy: [_, _, ...string]
	json_output:          #CliJsonOutput
	mcp_tool_result:      #McpToolResult
	mcp_status:           #McpStatus
	exit_code:            int & >0
	proof_mode:           #ProofMode
	fixture_id:           =~"^cli-error-refusal\\."
	accessibility_notes:  [_, _, ...string]
	customer_safe_wording: [_, _, ...string]
}

#ScopeBoundary: {
	in_scope:      [_, _, _, ...string]
	out_of_scope: [_, _, _, _]
}

#CliErrorRefusalCatalog: {
	issue:          "HOBO-558"
	phase:          "M1"
	target_package: "src/draft/exp-proofs/cli-error-refusal-examples"
	proof_note:     "docs/design/proofs/cli-error-refusal-examples/README.md"
	design_refs:    [_, _, _, ...string]
	examples:        [#CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, #CliErrorRefusalExample, ...#CliErrorRefusalExample]
	scope_boundary: #ScopeBoundary
}
