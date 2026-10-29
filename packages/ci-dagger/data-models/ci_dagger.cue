package readiness

import "strings"

#CiDagger: #Readiness | #CheckConfig

#CheckConfig: {
 engine?: "" | "local" | =~"^(image|container|unix|tcp|tls|ssh|kube-pod)://[^[:space:]]+$"
 cliVersion: =~"^1\\.[0-9]+\\.[0-9]+(-beta\\.[0-9]+)?$"
 workspace?: string & strings.MaxRunes(500)
 if workspace != _|_ && workspace != "" && workspace != "." {
  workspace: !~"^/|\\\\|\\x00"
  _validPath: true
  for segment in strings.Split(workspace, "/") {
   _validPath: segment != "" && segment != "." && segment != ".."
  }
 }
 filters?: [...string & =~"^[^-[:space:]][^[:space:]]*$"]
 skip?: [...string & =~"^[^-[:space:]][^[:space:]]*$"]
 parallel?: int & >=0 & <=256
 failFast?: bool
}

#Readiness: {
 integration: "dagger"
 status: "implemented"
 executionAvailable: true
 targetSdk: "@dagger.io/dagger"
 targetDocumentation: "https://docs.dagger.io/"
 pendingGates: [string & =~"\\S", ...string & =~"\\S"]
}
