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
}
#Configuration: {accounts: [...#Account], connections: [...#Connection]}
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
}
#CiEvent: {type: string & !="", accountId: string, leaseId: string, at: string & !="", detail: string}
#Snapshot: {leases: [...#Lease], events: [...#CiEvent]}

#Ci: #Offer | #Account | #Connection | #Configuration | #Job | #Lease | #CiEvent | #Snapshot | #PipelineStep | #Pipeline | #PipelineStepResult | #PipelineArtifact | #PipelineResult

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
