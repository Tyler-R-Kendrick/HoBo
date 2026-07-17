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

// ---- S2-03a/b: Orchestrator + ResourceActor FSM + Executor constraints ----
// One constraint per new protobuf message in cloud.proto.

#ResourceActorState: "Pending" | "Planning" | "Provisioning" | "Provisioned" |
	"Updating" | "Failed" | "Compensating" | "Destroying" | "Destroyed"

#IacProgram: {
	programId:    string & !=""
	deploymentId: string & !=""
	resourceId:   string & !=""
	provider:     string & !=""
	driver:       string & !=""
	action:       "preview" | "apply" | "destroy"
	stackName:    string & !=""
}

#ScopedCredential: {
	id:         string & !=""
	scope:      string & !=""
	ttlSeconds: uint & >0
	ambient:    false
}

#ExecOutputRecord: {
	execId: string & !=""
	stream: "stdout" | "stderr"
	line:   string
}

#ExecDiffRecord: {
	execId:  string & !=""
	summary: string
	changes: uint
}

#ExecSucceededRecord: {
	execId:      string & !=""
	outputsHash: string & !=""
	outputs: {[string]: string}
}

#ExecFailedRecord: {
	execId:         string & !=""
	classification: "retryable" | "fatal"
	reason:         string & !=""
}

#ResourceActorSnapshot: {
	deploymentId: string & !=""
	resourceId:   string & !=""
	state:        #ResourceActorState
	sequence:     uint
	outputs: {[string]: string}
	deps: [...string]
}

#ResourceProvisioningRecord: {
	deploymentId: string & !=""
	resourceId:   string & !=""
	execId:       string & !=""
	programHash:  string & !=""
}

#ResourceProvisionedRecord: {
	deploymentId: string & !=""
	resourceId:   string & !=""
	outputs: {[string]: string}
	execId:       string & !=""
}

#ResourceFailedRecord: {
	deploymentId:          string & !=""
	resourceId:            string & !=""
	reason:                string & !=""
	classification:        "retryable" | "fatal"
	crossedNoGoThreshold:  bool
}

#ResourceDestroyingRecord: {
	deploymentId: string & !=""
	resourceId:   string & !=""
	reason:       string & !=""
}

#ResourceDestroyedRecord: {
	deploymentId:   string & !=""
	resourceId:     string & !=""
	finalStateHash: string & !=""
}

#DeploymentDeployedRecord: {
	deploymentId: string & !=""
	setId:        string & !=""
	resourceIds: [...string]
}

#DeploymentRolledBackRecord: {
	deploymentId: string & !=""
	targetSetId:  string & !=""
	reason:       string & !=""
}

// ---- S3-04: CredentialAudit projection constraints (one per protobuf message) ----

#CredentialAuditScope: {
	port:     string & !=""
	resource: string & !=""
	action:   string & !=""
}

#CredentialGrantAudit: {
	grantId:        string & !=""
	svidSubject?:   string
	scope?:         #CredentialAuditScope
	tokenRef?:      string
	status:         "granted" | "used" | "revoked"
	grantedAt?:     string
	usedAt?:        string
	revokedAt?:     string
	revokedReason?: string
	useCount:       uint
}

#CredentialAuditTimelineEntry: {
	seq:      uint
	type:     string & !=""
	grantId?: string
}

#CredentialAuditRecord: {
	correlationId: string & !=""
	grants: {[string]: #CredentialGrantAudit}
	identityIds: [...string]
	sessionIds: [...string]
	timeline: [...#CredentialAuditTimelineEntry]
	grantCount:  uint
	useCount:    uint
	revokeCount: uint
}
