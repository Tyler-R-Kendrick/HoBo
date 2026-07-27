package data_models

#ScopeKind: "bindle" | "camp" | "yard" | "junction"

#PlacementObjective: "min-cost" | "pinned"

#PlacementPolicy: {
	id:         string & !=""
	scope_kind: #ScopeKind
	objective:  #PlacementObjective
	// Dependent constraint: a pinned objective must name its provider.
	if objective == "pinned" {
		pinned_provider_id: string & !=""
	}
	pinned_provider_id?: string
	allowed_providers?: [...string & !=""]
	denied_providers?: [...string & !=""]
	allowed_regions?: [...string & !=""]
	require_explicit_camps: bool | *false
}

#BillingPolicy: {
	quota:          string & !=""
	quota_used:     int & >=0
	quota_limit:    int & >=0
	budget_usd:     number & >=0
	spend_cap_usd:  number & >=0
	// Cross-field invariant: consumed quota never exceeds the limit.
	quota_used: <=quota_limit
}

#DeliveryPolicy: {
	engine:    "argo" | "in-proc"
	sync_mode: "auto" | "manual"
	prune:     bool | *false
	// Dependent constraint: the Argo engine needs a GitOps repo and namespace.
	if engine == "argo" {
		gitops_repo:           string & !=""
		destination_namespace: string & !=""
	}
	gitops_repo?:           string
	destination_namespace?: string
}

#ConnectorKind: "github-app" | "pulumi" | "azure" | "vercel" | "cloudflare" | "custom"

#ConnectorConfig: {
	id:           string & !=""
	kind:         #ConnectorKind
	display_name: string & !=""
	settings: {[string]: string}
	// A reference into the token broker / secret store, never a raw secret.
	credential_ref?: string
	enabled:         bool | *true
}

#BrokerPolicySet: {
	schema_version: "hobo.broker/v1"
	broker_id:      string & !=""
	placement_policies: [...#PlacementPolicy]
	billing:  #BillingPolicy
	delivery: #DeliveryPolicy
	required_connector_kinds?: [...#ConnectorKind]
}

#TopologyScope: {
	bindle_id:    string & !=""
	camp_id?:     string & !=""
	yard_id?:     string & !=""
	junction_id?: string & !=""
}

#ResourceRequirement: {
	resource_id: string & !=""
	port:        string & !=""
	features?: [...string & !=""]
	region?: string & !=""
}

#BrokerRequest: {
	schema_version: "hobo.broker/v1"
	request_id:     string & !=""
	scope:          #TopologyScope
	requirements: [...#ResourceRequirement] & [_, ...]
	spend_estimate_usd: number & >=0
}

#PlacementDecision: {
	resource_id:    string & !=""
	provider_id:    string & !=""
	definition_id:  string & !=""
	region:         string & !=""
	sku:            string & !=""
	unit:           string & !=""
	marginal_price: string & !=""
}

#ResolutionReceipt: {
	schema_version:      "hobo.broker/v1"
	request_id:          string & !=""
	broker_id:           string & !=""
	catalog_hash:        string & =~"^sha256:"
	policy_hash:         string & =~"^sha256:"
	placement_policy_id: string & !=""
	placements: [...#PlacementDecision] & [_, ...]
	station_id?: string
	rail_hash?:  string
}

#RejectionPlane: "policy" | "contracts" | "billing" | "placement" | "connectors"

#RejectionReason: {
	plane:   #RejectionPlane
	code:    string & !=""
	message: string & !=""
}

#ResolutionRejection: {
	schema_version: "hobo.broker/v1"
	request_id:     string & !=""
	broker_id:      string & !=""
	policy_hash:    string & =~"^sha256:"
	reasons: [...#RejectionReason] & [_, ...]
	station_id?: string
	rail_hash?:  string
}

#BrokerEnvironment: {
	environment_id: string & !=""
	approved_providers: [...string & !=""]
	catalog_hash?: string & =~"^sha256:"
	approved:      bool | *false
	// Dependent constraint: an approved environment records its approver.
	if approved {
		approved_by: string & !=""
	}
	approved_by?: string
}

#ResolutionSignature: {
	algorithm:      "ed25519"
	public_key_pem: string & =~"BEGIN PUBLIC KEY"
	signature:      string & !=""
	payload_digest: string & =~"^sha256:"
}

#ScaleDirection: "up" | "down" | "zero"

#ScaleDirective: {
	resource_id: string & !=""
	direction:   #ScaleDirection
	replicas:    int & >=0
	// Dependent constraint: scale-to-zero means zero replicas.
	if direction == "zero" {
		replicas: 0
	}
}
