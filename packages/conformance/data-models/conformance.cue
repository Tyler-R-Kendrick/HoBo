package data_models

#WorkspaceEdgeRecord: {
  from_path: string & =~"^(packages|examples)/"
  to_path:   string & !=""
}

#BoundaryViolationRecord: {
  rule: "core-imports-hobo" | "adapter-imports-adapter" | "adapter-imports-non-core" | "outward-dependency" | "workspace-cycle" | "unknown-package"
  from_path: string & !=""
  to_path:   string & !=""
  effect: "deny"
}

#WorkspaceSkeletonValidatedEvent: {
  workspace_rev: string & !=""
  edges: [...#WorkspaceEdgeRecord]
  violations: [...#BoundaryViolationRecord]
}
