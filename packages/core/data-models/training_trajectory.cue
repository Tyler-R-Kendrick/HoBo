package data_models

#GeneratedRegion: {
	region_id:    string & !=""
	artifact_ref: string & !=""
	start_offset: int & >=0
	end_offset:   int & >0
	owner:        string & !=""
}

#TrajectoryRun: {
	id:        string & !=""
	tenant_id: string & !=""
	bindle:    string & !=""
	agent: {
		id:            string & !=""
		principal_ref: string & !=""
	}
}

#OpenInferenceSpan: {
	id:         string & !=""
	parent_id?: string
	name:       string & !=""
	start_time: string & !=""
	end_time:   string & !=""
	attributes: {[string]: string}
}

#TrajectoryReward: {
	source:       string & !=""
	rubric_ref:   string & !=""
	event_id?:    string
	score:        number & >=0 & <=1
	observed_at?: string
}

#TrajectoryPayload: {
	classification?: string
	redaction?:      "none" | "tokenized" | "encrypted"
	token_ref?:      string
	encrypted_ref?:  string
}

#Trajectory: {
	schema:      "hobo.training.trajectory/v1"
	id:          string & !=""
	traceparent: string & =~"^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$"
	run:         #TrajectoryRun
	subject: {
		method:           string & !=""
		contract_ref:     string & !=""
		generated_region: #GeneratedRegion
	}
	spans: [...#OpenInferenceSpan] & [_, ...]
	payloads: {[string]: #TrajectoryPayload}
	reward: #TrajectoryReward
}
