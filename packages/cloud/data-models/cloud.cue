package hobo

// CUE constraints for the Yard control-plane kernel (S2-01) and Planner (S2-02)
// wire records. One constraint per protobuf message in cloud.proto.

#ResourceIntent: {
	name:        string & !=""
	port:        string & !=""
	require: [...string]
	prefer: [...string]
	negotiation: "require" | "prefer"
	deps: [...string]
	region?:   string
	objective: string & !=""
}

#ResourceDefinitionRef: {
	id:            string & !=""
	providerId:    string & !=""
	port:          string & !=""
	features: [...string]
	regions: [...string]
	specificity:   uint
	priority:      uint
	costSku:       string
	costUnit:      string
	marginalPrice: string
}

#CapabilityVerdict: {
	kind: "full" | "partial" | "none"
	missing: [...string]
}

#MatchDecided: {
	deploymentId: string & !=""
	resource:     string & !=""
	winner:       string & !=""
	providerId:   string & !=""
	port:         string & !=""
	specificity:  uint
	rejected: [...string]
	objective:    string & !=""
	region?:      string
	rationale:    string
	catalogHash:  string & !=""
}

#ResourcePlan: {
	name:         string & !=""
	port:         string & !=""
	provider:     string & !=""
	deps: [...string]
	strategy?:     string
	region?:       string
	deploymentId?: string
}

#DeploymentPlan: {
	schema: "hobo.deployment-plan/v1"
	resources: [...#ResourcePlan]
	dependencyOrder: [...string]
	objective: string & !=""
}

#DeploymentPlanned: {
	deploymentId: string & !=""
	planHash:     =~"^sha256:[a-f0-9]{64}$"
	plan:         #DeploymentPlan
}

#PlanRemediation: {
	resource:     string & !=""
	code:         string & !=""
	requiredPort: string & !=""
	requiredFeatures: [...string]
	missing: [...string]
	suggestedProvider?: string
	remediation:  string & !=""
}

#DeploymentPlanRejected: {
	deploymentId: string & !=""
	reason:       string & !=""
	remediations: [...#PlanRemediation] & !=[]
}

#RegistryCatalogEntry: {
	providerId: string & !=""
	definitions: [...#ResourceDefinitionRef]
	manifestIndexDigest: string
}
