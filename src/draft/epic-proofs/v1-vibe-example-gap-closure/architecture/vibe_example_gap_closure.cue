package vibe_example_gap_closure

#VibeChildIssue: {
	id: =~"^HOBO-[0-9]+$"
	title: =~"^Vibe slice:"
	project: string
	phase: "M1" | "M2" | "M5"
	estimate: 3 | 5
	target_package_path: =~"^src/draft/exp-proofs/[a-z0-9-]+$"
	proof_note_path: =~"^docs/design/proofs/hobo-[0-9]+-[a-z0-9-]+/README\\.md$"
	artifact_slices: [...string] & {if len(artifact_slices) < 1 {_|_}}
	required_scenarios: [...string] & {if len(required_scenarios) < 5 {_|_}}
	proof_modes: [...string] & {if len(proof_modes) < 4 {_|_}}
	source_design_docs: [...string] & {if len(source_design_docs) < 1 {_|_}}
	scope_out: [...string] & {if len(scope_out) < 5 {_|_}}
}

#VibeGapClosureBacklog: {
	parent_issue: "HOBO-539"
	parent_title: string
	child_issues: [...#VibeChildIssue] & {if len(child_issues) != 26 {_|_}}
	unblock_rule: string
}

#VibeGapClosureEvaluation: {
	ok: bool
	violations: [...string]
	unblock_outcome: string
}
