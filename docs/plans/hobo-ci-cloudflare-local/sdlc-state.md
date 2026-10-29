# Cloudflare CI local execution delivery

- Phase: reviewed; preparing PR delivery.
- Branch: `feat/ci-cf-local-runtime`; one coherent package change, no stack.
- User authorization: self-review, resolve findings, PR, monitor, squash-merge.
- Scope: existing `@hobo/ci-cf` adapter plus opt-in local Workflow/Sandbox/R2 configuration.
- Self-review fixes: clear inherited Git repository selectors; bind trigger metadata
  to the unique preparation so stale dev sessions cannot run another pipeline;
  describe tracked source inclusion precisely; name the asynchronous command
  `local:trigger` so a successful trigger is not presented as passed CI.
- Evidence: package tests, actual Git archive preparation, SDK/Worker/script
  type checks, config characterization, local-source Pact and protobuf/CUE drift.
- Native acceptance: image built and local Worker/Workflow/R2 started; command
  execution is unverified because this host lacks the iptables socket kernel
  module required by Cloudflare's local proxy. Local mode is explicitly experimental.
- Validation: all 15 staged gates passed, including 35 package tests and 290 root
  tests; final PR-base validation follows commit/rebase.
- Designer consensus: required for the CLI/config/docs surface; current-head
  exact-six review will run after the final implementation commit.
- PR: pending.
- No cloud deployment, provider resources or outbound messages are part of this change.
