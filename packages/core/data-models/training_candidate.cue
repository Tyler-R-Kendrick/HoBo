package data_models

#CandidateEdit: {
	start_offset: int & >=0
	end_offset:   int & >=0
	replacement:  string & !=""
}

#CandidateProvenance: {
	trajectory_hashes: [...string & =~"^sha256:[a-f0-9]{64}$"] & [_, ...]
	rubric_ref:   string & !=""
	contract_ref: string & !=""
}

#TrainingArtifact: {
	schema:         "hobo.training.artifact/v1"
	engine_id:      string & !=""
	engine_version: string & !=""
	method_ref:     string & !=""
	program_json:   string & !=""
}

#TrainingCandidate: {
	schema:     "hobo.training.candidate-patch/v1"
	id:         string & !=""
	engine_id:  string & !=""
	provenance: #CandidateProvenance

	{
		kind:   "patch"
		region: #GeneratedRegion
		edits: [...#CandidateEdit] & [_, ...]
	} | {
		kind:     "artifact"
		artifact: #TrainingArtifact
	}
}
