package formal_interop

// CUE mirrors for formal-interop invariants (parse-don't-validate).

#LibraryTier: "controlled" | "ecosystem" | "mismatch"

#OpenUiNode: {
	kind:            string & !=""
	role:            string
	binder:          string
	attrs:           {[string]: string}
	children:        [...#OpenUiNode]
	meaning_bearing: bool
}

#OpenUiTree: {
	id:           string & !=""
	root:         #OpenUiNode
	library_tier: #LibraryTier
}

#FormalCertificate: {
	claim_id:      string & !=""
	theorem_name:  string & !=""
	ir_digest:     string & !=""
	proof_digest:  string & !=""
	source_itp:    string & !=""
	typed:         true // untyped claims are unrepresentable
}

#Hypothesis: "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7"

#MetricsLedgerRow: {
	hypothesis:            #Hypothesis
	tier:                  #LibraryTier | "controlled" | "ecosystem" | "mismatch"
	method:                string & !=""
	pass_at_1:             number & >=0 & <=1
	pass_at_k:             number & >=0 & <=1
	beq_or_fidelity:       number & >=0 & <=1
	agentv_scores:         {[string]: number & >=0 & <=1}
	preflight_reject_rate: number & >=0 & <=1
	cost_usd:              number & >=0
	latency_ms:            int & >=0
	seed:                  string
	model:                 string
	prompt_digest:         string
}
