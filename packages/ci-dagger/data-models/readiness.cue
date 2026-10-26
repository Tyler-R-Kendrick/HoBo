package readiness

#Readiness: {
 integration: "dagger"
 status: "planned"
 executionAvailable: false
 targetSdk: "@dagger.io/dagger"
 targetDocumentation: "https://docs.dagger.io/"
 pendingGates: [string & =~"\\S", ...string & =~"\\S"]
}
