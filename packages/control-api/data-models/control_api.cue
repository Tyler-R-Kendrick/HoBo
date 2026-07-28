package control_api

// CUE constraints for every protobuf message in control_api.proto.

#ControlApiError: {
	code:    string
	message: string
	remediation: [...string]
}

#ControlApiResponse: {
	ok:         bool
	code:       string
	message:    string
	json_data?: string
}

#YardStreamEvent: {
	event:          "yard" | "heartbeat"
	seq:            uint
	json_snapshot?: string
}
