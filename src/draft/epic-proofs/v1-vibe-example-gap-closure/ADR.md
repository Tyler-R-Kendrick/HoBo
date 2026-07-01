# V1 Vibe Example Gap Closure - Architecture Evidence

## Decision

Represent HOBO-539 as an epic proof package that validates the child Linear backlog as deterministic
artifact-proof metadata. The proof does not build the children; it proves they are shaped so later
automation runs can claim them independently once the parent blocker is Done.

## Alternatives

- Mark HOBO-539 Done from Linear inspection only. Rejected because the acceptance would not be
  branch-reviewable or protected by repo gates.
- Implement one child proof while leaving HOBO-539 open. Rejected because every child is currently
  blocked by HOBO-539, so that would violate the claim protocol.
- Build production vibe UI or launch assets. Rejected because HOBO-539 is coordination work and the
  child issues own the artifact implementations.

## Consequences

- The unblock evidence is deterministic and reviewable without live Linear during tests.
- Child issue implementation remains isolated under `src/draft/exp-proofs/<slug>` in future runs.
- Linear status remains authoritative for the actual unblock; this branch only supplies the proof
  needed to review and merge the blocker.

## Guardrail Evidence

Parse, don't validate: child backlog entries cross a parser boundary into a typed
`VibeChildIssue` fixture before the simulation evaluates paths, phases, proof modes, and scope-out
rules. Core functions consume the parsed fixture shape, not raw Linear descriptions.

Event architecture: the parent acceptance is modeled as an unblock ledger event. Future child issue
claiming is a read-model consequence of HOBO-539 moving Done; this package does not mutate child
states directly.
