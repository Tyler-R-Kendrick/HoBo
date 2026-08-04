// CUE constraints for every protobuf type in sdk.proto, so the architecture
// guard can confirm each SDK declaration is bounded at parse time.

package sdk

#WaiverDeclaration: {
	schema:      "hobo.sdk/v1.waiver"
	decision_id: string & !=""
	reason:      string & !=""
	approver:    string & =~"^(role|user|spiffe):.+"
	expires:     string & !="" // RFC 3339 timestamp
}

#ChaosInjection: {
	fault:  string & !=""
	target: string & !=""
}

#ChaosDeclaration: {
	schema:       "hobo.sdk/v1.chaos"
	name:         string & !=""
	steady_state: string & !=""
	inject:       #ChaosInjection
	blast_radius: string & !=""
	abort_if?:    string & !=""
}

#RunbookTrigger: {
	alert:     string & !=""
	severity?: string & !=""
}

#RunbookFixStep: {
	when:      string & !=""
	do:        string & !=""
	gate:      "auto" | "require-approval"
	args_json: string
}

#RunbookDeclaration: {
	schema: "hobo.sdk/v1.runbook"
	name:   string & !=""
	on:     #RunbookTrigger
	diagnose: [...string & !=""] & [_, ...]
	fix: [...#RunbookFixStep] & [_, ...]
}

#GenerateProviderRequest: {
	schema:   "hobo.sdk/v1.generate-provider"
	docs_url: string & =~"^https?://"
	pipeline: ["scaffold", "llm-fill", "sandbox-conformance", "sign"]
}

#RunnerDeclaration: {
	schema:      "hobo.sdk/v1.runner"
	kind:        "self-hosted" | "github" | "depot" | "blacksmith"
	provider_id: string & !=""
	category:    "runner"
	behind?:     "relay"
	list_unit_cost: number & >=0
	switching_cost: number & >=0
}
