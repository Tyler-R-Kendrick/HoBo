package closure_builder_resource_handles

#ClosureBuilderResourceManifest: {
	bindle_name: =~"^[a-z][a-z0-9-]*$"
	resources: [...#ClosureBuilderResource]
	relationships: [...#ClosureBuilderRelationship]
}

#ClosureBuilderResource: {
	generated_id: =~"^res_(api|cache|queue)_[0-9]{4}$"
	kind: "api" | "cache" | "queue"
	owner_bindle_id: =~"^[a-z][a-z0-9-]*$"
	workload?: #ClosureBuilderWorkloadDescriptor
	annotation_kinds: [...string]
}

#ClosureBuilderResourceIdentityDiagnostic: {
	alias: =~"^[A-Za-z_$][A-Za-z0-9_$]*$"
	generated_id: =~"^res_(api|cache|queue)_[0-9]{4}$"
	kind: "api" | "cache" | "queue"
	owner_bindle_id: =~"^[a-z][a-z0-9-]*$"
	physical_name_seed: =~"^[a-z][a-z0-9-]*:res_(api|cache|queue)_[0-9]{4}$"
}

#ClosureBuilderWorkloadDescriptor: {
	kind: "inert-workload-factory"
}

#ClosureBuilderRelationship: {
	from: =~"^res_(api|cache|queue)_[0-9]{4}$"
	to: =~"^res_(api|cache|queue)_[0-9]{4}$"
	verb: "dependsOn"
}

#ClosureBuilderEvidenceEvent: {
	event_id: =~"^evt_[a-z0-9]+$"
	event_type: "closureBuilder.ResourceHandlesCollected" | "closureBuilder.ResourceIdentityProjected"
	issue_id: "HOBO-533" | "HOBO-534"
	manifest: #ClosureBuilderResourceManifest
}
