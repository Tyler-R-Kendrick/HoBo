package readiness

#Readiness: {
 integration: "dagger"
 status: "implemented"
 executionAvailable: true
 targetSdk: "@dagger.io/dagger"
 targetDocumentation: "https://docs.dagger.io/"
 pendingGates: [string & =~"\\S", ...string & =~"\\S"]
}
