package readiness

#Readiness: {
 integration: "cf"
 status: "implemented"
 executionAvailable: true
 targetSdk: "@cloudflare/ci"
 targetDocumentation: "https://github.com/cloudflare/ci"
 pendingGates: [string & =~"\\S", ...string & =~"\\S"]
}

#CommandEnvelope: {
 exitCode: int & >=0 & <=255
 stdoutBase64: string & =~"^[A-Za-z0-9+/]*={0,2}$"
 stderrBase64: string & =~"^[A-Za-z0-9+/]*={0,2}$"
}
#Cf: #Readiness | #CommandEnvelope
