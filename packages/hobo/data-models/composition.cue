package hobo

// CUE constraints for the @hobo/hobo composed default-runtime manifest
// (architecture-guard evidence; one definition per protobuf message in
// data-models/composition.proto). The composed CLI only ever runs the
// LOCAL/MOCKED lane, so the lane and backend fields are pinned literals.
#ComposedRuntimeManifest: {
	lane:       "local-mocked"
	eventStore: "runtime-local"
	actorHost:  "data.in-memory"
	executor:   "cloud.in-process"
	iacBackend: "in-memory-mock"
	providers: [...string] & != []
	verbs: [...string] & != []
}
