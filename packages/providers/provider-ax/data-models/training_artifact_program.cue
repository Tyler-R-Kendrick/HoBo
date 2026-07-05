package data_models

#ProgramDemo: {
	input_json:  string & !=""
	output_json: string & !=""
}

#TrainingArtifactProgram: {
	instructions: string & !=""
	demos: [...#ProgramDemo]
	ax_program_json?: string
}
