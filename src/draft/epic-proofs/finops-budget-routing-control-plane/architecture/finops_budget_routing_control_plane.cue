package architecture_evidence

#ResourceIntent: {
	schema_version: "hobo.finops.resource-intent/v1"
	owner: {
		tenant:      string & !=""
		workspace:   string & !=""
		environment: "dev" | "test" | "staging" | "production"
	}
	capability: #CapabilityClass
	budget:     #Budget
	constraints: [...#Constraint]
	routing_objective: "cost" | "reliability" | "balanced" | "performance" | "customBlend"
}

#CapabilityClass: {
	category: "compute" | "storage" | "network" | "database" | "ai" | "queue" | "cache"
	requirements: [...string]
}

#OwnerRef: {
	tenant:      string & !=""
	workspace:   string & !=""
	environment: "dev" | "test" | "staging" | "production"
}

#Budget: {
	amount:               number & >0
	currency:             "USD"
	period:               "monthly" | "yearly"
	soft_limit_behavior:  "reroute" | "degrade" | "notify" | "requireApproval"
	hard_limit_behavior:  "deny" | "freeze" | "suspend"
}

#BudgetScope: {
	tenant:      string & !=""
	workspace:   string & !=""
	environment: string & !=""
}

#Constraint: {
	kind: "compliance" | "jurisdiction" | "security" | "maxCost" | "eligibility"
	value: string | number | bool
}

#MeterDefinition: {
	name:   string & !=""
	unit:   string & !=""
	source: string & !=""
}

#MeterMapping: {
	meter_name:       string & !=""
	capability_class: string & !=""
	cost_class:       string & !=""
}

#FocusCostLedgerEntry: {
	focus_version:    string & !=""
	charge_period:   string & !=""
	billing_currency: "USD"
	effective_cost:   number & >=0
}

#Forecast: {
	period:         string & !=""
	projected_cost: number & >=0
	currency:       "USD"
}

#BudgetRoutingPolicy: {
	id:                  string & !=""
	expression_language: "CEL" | "Rego"
	allowed_inputs:      [...string]
}

#PolicyBinding: {
	policy_id: string & !=""
	scope:     #BudgetScope
}

#RoutingCandidate: {
	id:               string & !=""
	capability_class: string & !=""
	marginal_cost:    number & >=0
	abstract_traits:  [...string]
}

#MetricContract: {
	name:          string & !=""
	tier:          "system" | "derived" | "user"
	unit:          string & !=""
	source:        string & !=""
	version:       =~"^v[0-9]+\\.[0-9]+\\.[0-9]+$"
	normalization: string & !=""
}

#DerivedMetric: {
	name:       string & !=""
	depends_on: [...string]
	transforms: [...("windowed_avg" | "p95" | "weighted_time_decay" | "weighted_sum" | "ratio")]
}

#UserMetric: {
	name:                string & !=""
	composition_sources: [...string]
	requires_approval:  true
}

#ConstraintResult: {
	candidate_id: string & !=""
	passed:       bool
	reasons:      [...string]
}

#MetricVector: {
	candidate_id: string & !=""
	cost:         number & >=0
	reliability:  number & >=0 & <=1
	latency:      number & >=0
	risk:         number & >=0 & <=1
}

#ParetoFrontier: {
	candidate_ids:           [...string]
	dominated_candidate_ids: [...string]
}

#PreferenceModel: {
	cost_weight:        number & >=0 & <=1
	reliability_weight: number & >=0 & <=1
	latency_weight:     number & >=0 & <=1
	risk_weight:        number & >=0 & <=1
}

#StabilityPolicy: {
	min_improvement_threshold: number & >=0
	cooldown_window:           string & !=""
	migration_penalty:         number & >=0
	flip_limit_per_window:     int & >=0
}

#DecisionGraph: {
	id:                      string & !=""
	generated_candidate_ids: [...string]
	constraint_results:      [...#ConstraintResult]
	metric_vectors:          [...#MetricVector]
	pareto_frontier:         #ParetoFrontier
	final_candidate_id:      string & !=""
	rationale:               [...string]
}

#RoutingDecision: {
	id:                    string & !=""
	effect:                "allow" | "deny" | "requireApproval"
	selected_candidate_id: string | *""
	decision_graph_id:     string & !=""
}

#ActionPlan: {
	id:               string & !=""
	decision_id:      string & !=""
	abstract_actions: [...("deploy" | "destroy" | "scale" | "migrate" | "pause" | "freeze" | "upgrade")]
	backend_neutral:  true
}

#ActionResult: {
	action_plan_id: string & !=""
	status:         "accepted" | "blocked" | "completed" | "failed"
}

#AllocationRule: {
	id:       string & !=""
	strategy: "usage-share" | "equal" | "weighted"
}

#ApprovalRequest: {
	id:            string & !=""
	decision_id:   string & !=""
	approver_role: string & !=""
}

#ExceptionGrant: {
	id:         string & !=""
	scope:      string & !=""
	expires_at: string & !=""
}

#FeedbackProposal: {
	id:     string & !=""
	source: "actual-cost" | "telemetry" | "incident" | "override" | "deployment-outcome"
	target: string & !=""
	effect: "propose-metric-change" | "propose-policy-review" | "propose-weight-review"
}

#MetricVersionChange: {
	metric_name:    string & !=""
	from_version:   =~"^v[0-9]+\\.[0-9]+\\.[0-9]+$"
	to_version:     =~"^v[0-9]+\\.[0-9]+\\.[0-9]+$"
	approval_state: "requires-approval" | "approved" | "rejected"
}

#RoutingDecisionHistory: {
	previous_candidate_id: string & !=""
	previous_decision_at:  string & !=""
	flips_in_window:       int & >=0
}

#SimulationRequest: {
	id:        string & !=""
	scenarios: [...string]
}

#SimulationResult: {
	request_id:         string & !=""
	decision_graph_ids: [...string]
	surface_views:      [...("dx" | "opsx" | "finx")]
}
