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

// Envelope only: world/event payload shapes are owned by package yardworld
// (packages/yard-world/data-models/yard_world.cue) — referenced, not duplicated.
#WorldStreamEvent: {
	event:         "world-snapshot" | "world" | "heartbeat"
	tick:          uint
	demo:          bool
	json_payload?: string
}
