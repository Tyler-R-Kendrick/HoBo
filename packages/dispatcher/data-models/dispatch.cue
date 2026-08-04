package data_models

#CreditGrantRecord: {
	credit_id:     string & !=""
	free_headroom: number & >=0
	expires_at?:   string
	window_end?:   string
}

#CreditAccountRecord: {
	provider_id:           string & !=""
	dimension:             string & !=""
	currency?:             string
	list_unit_cost?:       number & >=0
	free_headroom?:        number & >=0
	rate_headroom?:        number & >=0
	concurrency_headroom?: number & >=0
	budget_cap?:           number & >=0
	spend_to_date?:        number & >=0
	reserved_units?:       number & >=0
	credits: [...#CreditGrantRecord]
}

#ReservationRecord: {
	reservation_id:  string & !=""
	provider_id:     string & !=""
	dimension:       string & !=""
	units:           number & >0
	expected_seq:    int & >=0
	committed_seq:   int & >=0
	status:          "pending" | "confirmed" | "released" | "expired"
	expires_at?:     string
	release_reason?: string
}

#CreditLedgerViewRecord: {
	view:    "CreditLedgerView"
	seq:     int & >=0
	digest?: string & =~"^sha256:[a-f0-9]{64}$"
	as_of?:  string
	accounts: [...#CreditAccountRecord]
	reservations: [...#ReservationRecord]
}

#DispatchCandidateRecord: {
	id:             string & !=""
	provider_id:    string & !=""
	category:       "runner" | "build-machine" | "traffic-backend"
	registered:     bool
	dimension:      string & !=""
	list_unit_cost: number & >=0
	switching_cost: number & >=0
}

#PlacementCandidateRecord: {
	definition_id:  string & !=""
	provider_id:    string & !=""
	registered:     bool
	resource_type:  string & !=""
	dimension:      string & !=""
	list_unit_cost: number & >=0
	specificity:    number
	priority:       int
	region?:        string & !=""
	switching_cost: number & >=0
}

#HysteresisInputRecord: {
	incumbent_provider_id: string & !=""
	minimum_savings:       number & >=0
	dwell_window:          string & !=""
	observed_at:           string & !=""
}

#RankedCandidateRecord: {
	provider_id:             string & !=""
	category:                string & !=""
	dimension:               string & !=""
	rank:                    int & >0
	effective_marginal_cost: number & >=0
	total_cost:              number & >=0
	free_units:              number & >=0
	paid_units:              number & >=0
	switching_cost:          number & >=0
	budget_exceeded:         bool
	credit_facts:            "present" | "present-empty" | "missing" | "invalid"
	next_credit_expires_at?: string
	rationale:               string & !=""
}

#LedgerInputRecord: {
	view:           "CreditLedgerView"
	seq:            int & >=0
	reservation_id: string & !=""
	balance_hash:   string & =~"^sha256:[a-f0-9]{64}$"
}

#DispatchDecidedRecord: {
	dispatch_id:       string & !=""
	category:          "runner" | "build-machine" | "traffic-backend"
	selected_provider: string & !=""
	objective:         "maximize-credits"
	ledger_input:      #LedgerInputRecord
	candidates: [...#RankedCandidateRecord]
}
