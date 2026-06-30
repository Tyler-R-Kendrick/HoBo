// CUE constraints for every protobuf type in
// proto/resilience_semantics_annex.proto. These bound the HOBO-516 resilience
// fixtures and case results so the SDK conformance lane can reject malformed
// fixtures at parse time.

package resilience_semantics_annex_v1

#ResilienceSemanticsSpec: {
	version: string & !=""
	suite:   string & !=""
	cases:   [...string] & [_, ...]
}

#RetryPlan: {
	delayMs:     [...uint]
	maxAttempts: uint & >=1
	seed:        string & !=""
}

#ResilienceFact: {
	type:     string & !=""
	attempt?: uint
	atMs:     uint
	failure?: string
	reason?:  string
	allow?:   bool
	delayMs?: uint
	state?:   string
	source?:  string
	from?:    string
	event?:   string
	to?:      string
	causedBy?: string
	childId?: string
	spawnContractId?: string
}

#ResilienceFixture: {
	name:       string & !=""
	assertions: [...string] & [_, ...]
	retryPlan?: #RetryPlan
	facts:      [...#ResilienceFact] & [_, ...]
}

#ResilienceCaseResult: {
	name:     string & !=""
	category: string & !=""
	status:   "passed" | "failed"
	code?:    string
	reason?:  string
	seed?:    string
}
