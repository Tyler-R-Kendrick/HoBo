package readiness

#Readiness: {
 integration: "cf"
 status: "planned"
 executionAvailable: false
 targetSdk: "@cloudflare/ci"
 targetDocumentation: "https://github.com/cloudflare/ci"
 pendingGates: [string & =~"\\S", ...string & =~"\\S"]
}
