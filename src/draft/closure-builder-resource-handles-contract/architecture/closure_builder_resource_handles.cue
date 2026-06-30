package closure_builder_resource_handles

#ClosureBuilderResourceManifest: {
	bindle_name: =~"^[a-z][a-z0-9-]*$"
	resources: [...#ClosureBuilderResource]
	relationships: [...#ClosureBuilderRelationship]
}

#ClosureBuilderResource: {
	generated_id: =~"^res_[0-9]{4}$"
	kind: "api" | "cache" | "queue"
	owner_bindle_id: =~"^[a-z][a-z0-9-]*$"
	workload?: #ClosureBuilderWorkloadDescriptor
	annotation_kinds: [...string]
}

#ClosureBuilderWorkloadDescriptor: {
	kind: "inert-workload-factory"
}

#ClosureBuilderRelationship: {
	from: =~"^res_[0-9]{4}$"
	to: =~"^res_[0-9]{4}$"
	verb: "dependsOn"
}

#ClosureBuilderEvidenceEvent: {
	event_id: =~"^evt_[a-z0-9]+$"
	event_type: "closureBuilder.ResourceHandlesCollected"
	issue_id: "HOBO-533"
	manifest: #ClosureBuilderResourceManifest
}
