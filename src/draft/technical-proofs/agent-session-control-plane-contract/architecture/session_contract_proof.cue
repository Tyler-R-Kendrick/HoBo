package sessioncontractproof

#SessionContractProof: {
	command_schema:         "hobo.code.session-command/v1"
	snapshot_schema:        "hobo.code.session-snapshot/v1"
	accepted_command_cases: [...string & !=""]
}
