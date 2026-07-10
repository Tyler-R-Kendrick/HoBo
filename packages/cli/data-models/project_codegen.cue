package project_codegen

#RelativePath: string & !=""
#UnitScore:    number & >=0 & <=1

#CodegenArtifact: {
	path:    #RelativePath
	content: string
}

#DriftEntry: {
	path:             #RelativePath
	status:           "extra" | "missing" | "changed"
	expected_digest?: string & =~"^sha256:[0-9a-f]{64}$"
	actual_digest?:   string & =~"^sha256:[0-9a-f]{64}$"
}

#CodegenReport: {
	mode: "write" | "check"
	written: [...#RelativePath]
	checked: [...#RelativePath]
}

#TrainableStub: {
	method_ref:   string & !=""
	export_name:  string & =~"^[a-zA-Z_$][a-zA-Z0-9_$]*$"
	resource:     string & !=""
	type_name:    string & !=""
	contract_ref: string & =~"^bindle://"
}
