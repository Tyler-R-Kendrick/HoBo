# Azure DevOps consumer contracts

`pipeline.pact.json` pins the named self-hosted pool and native Pipeline Artifact
publication inputs consumed by the YAML boundary. Its consumer test renders the
actual generator and compares those hand-authored expectations.

`live.pact.json` describes successful native producer/consumer tasks and jobs in
the Azure REST 7.1 timeline. `test/live.test.ts` consumes it through an injected
HTTP boundary while asserting pinned request provenance and failure behavior.
The generated-script acceptance test executes real subprocesses and uses a
filesystem stand-in for publication/download. These local checks are not live
provider verification. The `live` CLI is the separate, authenticated native
pipeline acceptance path.
