package contract_harness

#ParticipantName: =~"^[A-Z][A-Za-z0-9]*$"

#PactParticipant: {
	name: #ParticipantName
}

#PactRequest: {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
	path:   =~"^/"
	headers?: {[string]: string}
	body?: _
}

#PactResponse: {
	status: int & >=100 & <=599
	headers?: {[string]: string}
	body?: _
}

#PactInteraction: {
	description: string & !=""
	request:    #PactRequest
	response:   #PactResponse
}

#PactSpecification: {
	version: "3.0.0"
}

#PactMetadata: {
	pactSpecification: #PactSpecification
}

#PactDocument: {
	consumer:     #PactParticipant
	provider:     #PactParticipant
	interactions: [#PactInteraction, ...#PactInteraction]
	metadata:     #PactMetadata
}

#InteractionFailure: {
	description: string & !=""
	reason:      string & !=""
}

#VerificationReport: {
	providerName: #ParticipantName
	ok:           bool
	failures:     [...#InteractionFailure]
	if ok {failures: []}
}

#HttpProviderTarget: {
	name:    #ParticipantName
	baseUrl: =~"^https?://[^/@?#]+(/[^?#]*)?$"
	host?:   =~"^([A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*|\\[[0-9A-Fa-f:.]+\\])(:[0-9]{1,5})?$"
	ca?:     =~"-----BEGIN CERTIFICATE-----"
	timeoutMs?:        int & >=1
	maxResponseBytes?: int & >=1
}

#HttpExchangeRequest: {
	method: =~"^[A-Z]+$"
	path:   =~"^/"
	headers?: {[string]: string}
	body?: string
}

#HttpExchangeResponse: {
	status: int & >=100 & <=599
	headers: {[string]: string}
	body: string
}

#MirrorJournalEntry: {
	requestId: string & !=""
	serviceId: string & !=""
	operation: string & !=""
	tier:      "emulate" | "mock" | "proxy"
	status:    int & >=100 & <=599
	errorCode: string
}

#ResponseMatcher: {
	match: "regex" | "type" | "equality"
	if match == "regex" {regex: string & !=""}
}

#ResponseMatchingRule: {
	path: =~"^\\$((\\.[A-Za-z_$][A-Za-z0-9_$-]*)|(\\[[0-9]+\\]))*$"
	matchers: [#ResponseMatcher, ...#ResponseMatcher]
}

#MirrorLaneReport: {
	consumer:     #ParticipantName
	provider:     #ParticipantName
	interactions: int & >=1
	ok:           bool
	failures:     [...#InteractionFailure]
	if ok {failures: []}
}
