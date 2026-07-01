package vibe_snapshop_launch_demo_storyboard

#SnapshopStoryStep: "scaffold" | "local-run" | "inspect" | "plan" | "live-recording-slot" | "failure-recovery" | "support-docs-handoff"
#SnapshopAssetKind: "screenshots" | "recording-manifest" | "command-transcript" | "fixture-data" | "docs"
#SnapshopScenario: "happy-path" | "blocked-path" | "stale-or-unknown-evidence" | "support-handoff"
#SnapshopProofMode: "live" | "simulated" | "reference fixture" | "scope-out"

#VibeSnapshopLaunchDemoStoryboard: {
	issue: "HOBO-555"
	phase: "M5"
	packagePath: "src/draft/exp-proofs/vibe-snapshop-launch-demo-storyboard"
	proofPath: "docs/design/proofs/vibe-snapshop-launch-demo-storyboard/README.md"
	designRefs: [...string]
	proofModes: [...#SnapshopProofMode]
	quickstartFixtureRefs: [...#SnapshopQuickstartFixtureReference]
	storyboardSteps: [...#SnapshopStoryboardStep]
	assetMap: [...#SnapshopAssetMapEntry]
	scenarioPaths: [...#SnapshopScenarioPath]
	accessibilityNotes: [...=~"^.+$"] & {0: string}
	scopeOut: [...string]
}

#SnapshopQuickstartFixtureReference: {
	sourceIssue: "HOBO-577"
	fixtureId: =~"^rlq-"
	proofMode: "reference-fixture" | "simulated" | "live" | "scope-out"
	consumingStep: #SnapshopStoryStep
	storyboardUse: string & != ""
}

#SnapshopStoryboardStep: {
	id: #SnapshopStoryStep
	title: string & != ""
	commandOrSurface: string & != ""
	proofMode: #SnapshopProofMode
	fixtureId: string & != ""
	evidenceObject: string & != ""
	owner: string & != ""
	safeClaim: string & != ""
	supportDocsHandoff: string & != ""
}

#SnapshopAssetMapEntry: {
	kind: #SnapshopAssetKind
	source: string & != ""
	owner: string & != ""
	proofMode: #SnapshopProofMode
	refreshTrigger: string & != ""
	validationRoute: string & != ""
	staleDowngrade: string & != ""
}

#SnapshopScenarioPath: {
	id: #SnapshopScenario
	narrative: string & != ""
	stepIds: [...#SnapshopStoryStep] & {0: string}
	assetKinds: [...#SnapshopAssetKind] & {0: string}
	proofModeLabels: [...#SnapshopProofMode] & {0: string}
	accessibilityNote: string & != ""
	supportHandoff: string & != ""
	safeOutcome: string & != ""
}
