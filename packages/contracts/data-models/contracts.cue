package hobo

// CUE constraints for the @hobo/contracts wire records (S2-07). One constraint
// definition per protobuf message/enum in contracts.proto.

#ContractMode: "declared" | "inferred" | "observed" | "promoted"

#GatekeeperEffect: "allow" | "allow-degraded" | "deny" | "require-approval"

#ContractEdge: {
  kind: "http" | "event" | "message" | "topic" | "resource-binding" |
        "capability-scope" | "runtime-slo" | "semantic-function" |
        "agent-tool" | "provider-interface" | "service" | "actor" | "workflow"
  producer:  string & != ""
  consumer:  string & != ""
  channel:   string & != ""
  operation: string & != ""
}

#RequiredShape: {
  format:         string & != ""
  requiredFields: [...string]
  providedFields: [...string]
}

#BoundaryContract: {
  schemaVersion: "hobo.contract-ir/v1"
  id:            string & != ""
  version:       =~"^[0-9]+\\.[0-9]+\\.[0-9]+"
  mode:          #ContractMode
  edge:          #ContractEdge
  requiredShape: #RequiredShape
  contractHash:  =~"^sha256:[a-f0-9]{64}$"
}

#CompatibilityReason: {
  code:        string & != ""
  message:     string & != ""
  contractId:  string & != ""
  channel:     string & != ""
  prevVersion: string & != ""
  nextVersion: string & != ""
  fields:      [...string]
}

#DeployedContractState: {
  contracts: [...#BoundaryContract]
}

#CanDeployResult: {
  schemaVersion: "hobo.can-deploy/v1"
  ok:            bool
  target:        string & != ""
  reasons:       [...#CompatibilityReason]
  summary:       string & != ""
  suggestedFixes: [...string]
}

#MachineReadableReason: {
  gate:    "contracts" | "policy" | "obligations" | "cost"
  code:    string & != ""
  message: string & != ""
}

#ObligationRecord: {
  id:        string & != ""
  kind:      string & != ""
  satisfied: bool
  deadline?: string & != ""
}

#CostQuotaRecord: {
  quota:     string & != ""
  used:      number & >= 0
  requested: number & >= 0
  limit:     number & >= 0
  remaining: number
  ok:        bool
}

#GatekeeperDecision: {
  schemaVersion: "hobo.gatekeeper/v1"
  decision:      #GatekeeperEffect
  reasons:       [...#MachineReadableReason]
  obligations:   [...#ObligationRecord]
  canDeploy:     #CanDeployResult
  costQuota:     #CostQuotaRecord
}
