package hobo

// CUE constraints for the @hobo/mcp wire records (S3-01/S3-02). One constraint
// definition per protobuf message/enum in mcp.proto. Design source:
// docs/design/ai-native-agent-auth.md §6.4 + ADR-0023 item 3.

#McpToolDecisionEffect: "allow" | "deny"

#McpCapabilityScope: {
	port:     string & !=""
	resource: string & !=""
	verb:     string & !=""
}

#McpToolDescriptor: {
	name:            string & !=""
	verb:            string & !=""
	role:            string & !=""
	summary:         string & !=""
	capability:      #McpCapabilityScope
	inputSchemaJson: string & !=""
}

#McpToolCallRequest: {
	tool:          string & !=""
	correlationId: string & !=""
	cwd?:          string
	inputJson:     string
}

#McpToolCallResult: {
	tool:       string & !=""
	ok:         bool
	status:     string & !=""
	code:       string & !=""
	outputJson: string
}

#McpAuthDecisionEvent: {
	schemaVersion: "hobo.mcp-events/v1"
	type:          "mcp.ToolCallDecided"
	tool:          string & !=""
	subject:       string & !=""
	tenant:        string & !=""
	effect:        #McpToolDecisionEffect
	reason:        string & !=""
	seq:           int & >=0
	time:          string & !=""
	correlationId: string & !=""
}

#McpToolOutputObservation: {
	tool:                  string & !=""
	subject:               string & !=""
	recordedText:          string
	authorizedToolsBefore: [...string]
	authorizedToolsAfter: [...string]
	// Inert-output invariant: a tool output can never widen the grant set.
	widened: false
}
