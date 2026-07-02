package data_models

#PrincipalKind: "user" | "agent" | "service" | "system"

#PrincipalRef: {
	kind: #PrincipalKind
	id:   string & !=""
	delegated_by?: #PrincipalRef
}

#EventEnvelope: {
	id:              string & !=""
	type:            string & =~"^[a-z][a-zA-Z0-9]*\\.[A-Z][A-Za-z0-9]*$"
	v:               int & >0
	stream_id:       string & !=""
	seq:             int & >0
	ts:              string & !="" & =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"
	actor:           #PrincipalRef
	tenant:          string & !=""
	project?:        string & !=""
	causation_id?:   string & !=""
	correlation_id?: string & !=""
	lane?:           string & !=""
	data?:           bytes
	meta?:           [string]: string
}

#EventInput: {
	type: string & =~"^[a-z][a-zA-Z0-9]*\\.[A-Z][A-Za-z0-9]*$"
	v:    int & >0
	data?: bytes
	meta?: [string]: string
}

#AppendRequest: {
	stream_id:       string & !=""
	events:          [...#EventInput] & [_, ...]
	expected_seq:    int & >=0
	actor:           #PrincipalRef
	tenant:          string & !=""
	project?:        string & !=""
	causation_id?:   string & !=""
	correlation_id?: string & !=""
	lane?:           string & !=""
}

#AppendResult: {
	stream_id: string & !=""
	appended:  [...#EventEnvelope]
	deduped:   [...#EventEnvelope]
}

#SnapshotRecord: {
	stream_id: string & !=""
	seq:       int & >0
	state:     bytes
	saved_at:  string & !="" & =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"
}

#QuarantineFact: {
	offending_seq:  int & >0
	offending_type: string & !=""
	reason:         string & !=""
}
