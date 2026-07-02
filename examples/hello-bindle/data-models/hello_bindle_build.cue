package data_models

#SourceFileDigest: {
	path:   string & !=""
	digest: string & =~"^sha256:[0-9a-f]{64}$"
}

#ToolchainPin: {
	jco:            "1.24.3"
	componentize_js: "0.21.0"
	wasm_tools:     "1.235.0"
	wasmtime:       "46.0.1"
}

#HelloBindleBuildRecord: {
	schema:            "hobo.componentize/v1"
	name:              "hello-bindle"
	wit_world:         "hobo:examples/hello-bindle@0.1.0/service"
	source_date_epoch: string & !=""
	toolchain:         #ToolchainPin
	sources:           [...#SourceFileDigest]
	component_digest:  string & =~"^sha256:[0-9a-f]{64}$"
	media_type:        "application/vnd.wasm.component.v1+wasm"
}

#ArtifactSignature: {
	alg:            "Ed25519"
	key_id:         string & !=""
	payload_digest: string & =~"^sha256:[0-9a-f]{64}$"
	value:          string & !=""
}

#SignedComponentArtifact: {
	digest:                string & =~"^sha256:[0-9a-f]{64}$"
	signature:             #ArtifactSignature
	provenance_tier:       "slsa-build-l3"
	conformance_suite_id:  string & !=""
}

#ComponentBuilt: {
	record: #HelloBindleBuildRecord
}

#ArtifactSigned: {
	artifact: #SignedComponentArtifact
}

#ArtifactVerified: {
	digest: string & =~"^sha256:[0-9a-f]{64}$"
	passed: bool
}

smoke_stdout: "hello-bindle:ok\n"
