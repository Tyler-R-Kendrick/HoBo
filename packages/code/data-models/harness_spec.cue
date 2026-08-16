package code

#HarnessSpecKind: "coding-agent" | "inference" | "harness" | "eve-agent" | "sdk"
#HarnessConfigFormat: "toml-append" | "json-env" | "json-merge" | "note" | "eve-vfs" | "sdk-env" | "skip"

#HarnessConfigSpecRecord: {
	format:          #HarnessConfigFormat
	path?:           string & !=""
	configuredWhen?: [...string & !=""]
	block?:          string & !=""
	env?: {[string]: string}
	merge?:   _
	summary?: string & !=""
	after?:   string & !=""
	note?:    string & !=""
}

#HarnessSpecRecord: {
	schema?:       "hobo.code.harness-spec/v1"
	id:            string & =~"^[a-z0-9][a-z0-9-]{0,63}$"
	label:         string & !=""
	kind:          #HarnessSpecKind
	host?:         bool
	binaries?:     [...string & !=""]
	configPaths?:  [...string & !=""]
	command?:      string & !=""
	seat?:         int & >=0
	cwdMarkers?:   [...string & !=""]
	packageNames?: [...string & !=""]
	config?:       #HarnessConfigSpecRecord
}
