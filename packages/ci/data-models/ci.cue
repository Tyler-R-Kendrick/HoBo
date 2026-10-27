package ci

#Offer: {
 id: string & !=""
 provider: "github" | "blacksmith" | "depot" | "warpbuild" | "kubernetes" | "dagger" | "cloudflare"
 providerAccountId: string & !=""
 enabled: bool
 runsOn: string & !=""
 freeMinutes: number & >=0
 priceMicrosPerMinute: int & >=0
 budgetMicros: int & >=0
 spentMicros: int & >=0
 concurrency: int & >=1 & <=1000
 observedAt: string & !=""
 validUntil: string & !=""
 sourceUrl: string & =~"^https://"
 bridgeAcknowledged: bool
 backend?: "" | "gh-actions" | "dagger" | "cf"
}
#Account: {
 id: string & !=""
 budgetMicros: int & >=0
 spentMicros: int & >=0
 maxRuntimeMinutes: int & >=1 & <=330
 startupMinutes: int & >=1 & <=20
 offers: [...#Offer]
 usageObservedAt?: string
}
#Connection: {
 accountId: string & !=""
 repository: string & =~"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
 repositoryId: int & >0
 installationId: int & >0
 bridgeWorkflow: string & =~"^[A-Za-z0-9_-]+[.]ya?ml$"
 bridgeSha: string & =~"^[a-f0-9]{40}$"
 runnerGroupId: int & >=1
 allowedEvents: [...("push" | "workflow_dispatch")]
 allowedRefs: [...string]
 trustedRepositoryAcknowledged: true
 bridgeRef: string & =~"^[A-Za-z0-9_/-]+$"
 dispatcherActorId: int & >0
 publicRepositoryAcknowledged?: bool
}
#Configuration: {accounts: [...#Account], connections: [...#Connection]}
#ConfigurationState: {revision: int & >=1, configuration: #Configuration, updatedAt: string & !=""}
#ControlRecord: {key: string & !="", accountId: string & !="", bodyJson: string & !="", updatedAt: string & !=""}
#AccountState: {revision: int & >=1, account?: #Account, connections: [...#Connection], updatedAt: string & !=""}
#RepositorySetupRequest: {
 repository: string & =~"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
 repositoryId?: int & >=0, installationId?: int & >=0
 runnerGroupId?: int & >=0
 allowedRefs?: [...(string & =~"^refs/heads/")]
 trustedRepositoryAcknowledged: true
 publicRepositoryAcknowledged?: bool
}
#ReconcileRequest: {hostRunId: int & >0}
#ControlCredential: {
 accountId: string & =~"^[A-Za-z0-9_-]{1,80}$"
 installationIds: [...(int & >0)]
 tokenSha256: string & =~"^[a-f0-9]{64}$"
 scopes: [...("policy:read" | "policy:write" | "repositories:write" | "operations:write")]
}
#ControlCredentials: {tokens: [#ControlCredential, ...#ControlCredential]}
#Job: {
 id: int & >0, runId: int & >0, runAttempt: int & >=1
 repositoryId: int & >0, installationId: int & >0
 repository: string & !="", labels: [...string]
 action: "queued" | "in_progress" | "completed", runnerName: string
}
#Lease: {
 id: string & !="", accountId: string & !="", offerId: string & !=""
 provider: string & !="", jobId: int & >=0, originalRunId: int & >=0
 runAttempt: int & >=0, repositoryId: int & >=0, repository: string
 installationId: int & >=0
 state: "reserved" | "dispatching" | "dispatched" | "claiming" | "running" | "uncertain" | "completed" | "cancelled"
 reservedMinutes: number & >0, reservedFreeMinutes: number & >=0
 reservedPaidMicros: int & >=0, runnerName: string, createdAt: string & !=""
 hostRunId: int & >=0, runnerId: int & >=0, actualJobId: int & >=0
 billedMinutes: number & >=0, paidMicros: int & >=0, settledAt: string, priceMicrosPerMinute: int & >=0
 freeValidUntil: string, billedFreeMinutes: number & >=0
 pipelineId?: string, result?: #PipelineResult, pipelineDigest?: string
 usageCompletedAt?: string
}
#CiEvent: {type: string & !="", accountId: string, leaseId: string, at: string & !="", detail: string}
#Snapshot: {leases: [...#Lease], events: [...#CiEvent]}

#Ci: #Offer | #Account | #Connection | #Configuration | #ConfigurationState | #ControlRecord | #AccountState | #RepositorySetupRequest | #ReconcileRequest | #ControlCredential | #ControlCredentials | #Job | #Lease | #CiEvent | #Snapshot | #PipelineStep | #Pipeline | #PipelineStepResult | #PipelineArtifact | #PipelineResult

#PipelineStep: {id: string & !="", argv: [string & !="", ...string], cwd: string, env: [string]: string}
#Pipeline: {
 id: string & =~"^[A-Za-z0-9_-]{1,100}$"
 accountId: string & !=""
 steps: [#PipelineStep, ...#PipelineStep]
 artifactPaths: [...string]
 timeoutSeconds: int & >=1 & <=19800
 requiredCapabilities: [...("commands" | "artifacts" | "cancellation")]
}
#PipelineStepResult: {id: string & !="", exitCode: int & >=0 & <=255, stdout: string, stderr: string}
#PipelineArtifact: {path: string & !="", data: string, sha256: string & =~"^[a-f0-9]{64}$"}
#PipelineResult: {
 id: string & !="", backend: "" | "gh-actions" | "dagger" | "cf"
 status: "succeeded" | "failed" | "cancelled" | "timed_out" | "uncertain" | "blocked"
 steps: [...#PipelineStepResult], artifacts: [...#PipelineArtifact], error: string
}
