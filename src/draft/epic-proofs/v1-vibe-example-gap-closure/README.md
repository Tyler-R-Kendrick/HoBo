# V1 Vibe Example Gap Closure Reference Implementation

HOBO-539 is the parent blocker for the v1 vibe example backlog. This package proves the parent
acceptance by checking that every child issue is a branch-sized artifact slice under the current
draft taxonomy instead of production implementation work.

## What is real

- `src/vibe-gap-closure.ts` contains a deterministic child issue matrix for HOBO-540 through
  HOBO-565.
- Tests prove each child targets `src/draft/exp-proofs/<slug>` and
  `docs/design/proofs/<issue-slug>/README.md`.
- Tests prove the shared vibe coverage requirements: happy path, blocked path, stale/unknown
  evidence path, support handoff, accessibility notes, and proof-mode labels.
- Pact-style fixtures record the mocked backlog, scope guard, and unblock ledger boundaries.

## What is mocked

- Linear child issue retrieval is represented by a checked-in fixture so tests do not need live
  Linear access.
- The production UI, provider calls, customer data, credentials, support tooling, and launch-site
  publication are explicitly out of scope.

## Running

```powershell
npm.cmd --prefix src\draft\epic-proofs\v1-vibe-example-gap-closure test
npm.cmd --prefix src\draft\epic-proofs\v1-vibe-example-gap-closure run simulate
```

## BDD slices

```gherkin
Feature: V1 vibe example backlog closure

  Persona: Product/design maintainer
  Scenario: coordinate branch-sized artifact children
    Given HOBO-539 blocks the vibe example child backlog
    When the child matrix is evaluated
    Then every child targets an isolated exp proof package and proof note

  Persona: Reviewer
  Scenario: reject production scope creep
    Given a requested addition to live UI, providers, customer data, credentials, or launch claims
    When the scope guard evaluates the request
    Then the request is rejected as outside HOBO-539

  Persona: Automation worker
  Scenario: unblock downstream Backlog work after merge
    Given the parent acceptance is branch-reviewable and tests pass
    When HOBO-539 is merged and moved Done
    Then the 26 child issues can become normal claimable Backlog work
```

## Files

- `src/vibe-gap-closure.ts`
- `tests/vibe-gap-closure.test.ts`
- `contracts/consumer/vibe-gap-boundaries.test.ts`
- `contracts/pact-inventory.md`
- `poc-rollup-ledger.md`
- `reference-implementation.yaml`
- `architecture.md`

## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` - protobuf data shapes and CUE constraints for the child backlog and evaluation.
- `architecture/pacts/` - Pact fixture for the package boundary.
- `architecture.md` - parse-don't-validate and event-architecture evidence.
