---
type: Reference
title: "HoBo CLI Specification"
description: "This document is the canonical command contract for `@hobo/cli`. It keeps the CLI"
tags: [hobo, design]
---

# HoBo CLI Specification

This document is the canonical command contract for `@hobo/cli`. It keeps the CLI
small while preserving the design suite's role model: app developers and agents
drive one shared command path, while platform, policy, delivery, SRE, and
generation behavior are authored as SDK code or exposed through dashboard/MCP
surfaces.

## Canonical CLI Verbs

| Verb | Role | Semantics | Implementation issues |
|---|---|---|---|
| `up` | lifecycle | Realize the current object graph: build, plan, gate, provision, and deploy. `--camp`, `--strategy`, `--to`, `--rollback`, `--seed`, and `--restore` select target or revision without adding lifecycle verbs. | HOBO-130, HOBO-164, HOBO-198, HOBO-203, HOBO-208, HOBO-213, HOBO-219, HOBO-224 |
| `down` | lifecycle | Tear down what `up` realized, in reverse dependency order. | HOBO-132 |
| `dev` | local loop | Run against `runtime-local` with hot reload, replay, codegen-in-watch, and honest fidelity labels. | HOBO-122, HOBO-190, HOBO-198, HOBO-392, HOBO-612 (draft POC: `src/draft/technical-proofs/hobo-612-dev-local-loop-poc/`) |
| `new` | local loop | Scaffold a runnable SDK program. | HOBO-118, HOBO-198 |
| `login` | identity | Obtain a dev SVID through OIDC; never paste provider keys. | HOBO-136, HOBO-184 |
| `claim` | identity | Bind an anonymous `npx hobo up` deployment to an account while preserving state and URL. | HOBO-136, HOBO-164 |
| `plan` | read-only | Dry-run the `up` decision: DeploymentPlan, Matching choices, cost, and warnings as an approvable diff. | HOBO-125, HOBO-203, HOBO-208 |
| `verify` | read-only | Optional preflight for the unified Gatekeeper decision. `up` still runs the same gate automatically before mutation. | HOBO-146, HOBO-227 |
| `can-deploy` | read-only | Compatibility-matrix diagnostic for producer/consumer skew; an input to `verify` and `up`. | HOBO-123, HOBO-146 |
| `inspect` | read-only | Render projections and time-travel views such as `run`, `deploy`, and `topology`. | HOBO-140, HOBO-216 |
| `logs` | read-only | Live-tail logs and streams through the Camp runtime Streamer. | HOBO-143, HOBO-216 |
| `doctor` | diagnostics | Report environment, credential, connectivity, and portability hazards. | HOBO-147, HOBO-184, HOBO-190 |
| `codegen` | authoring | Regenerate checked-in `_generated/`; `--check` fails on drift. | HOBO-152 |
| `build` | authoring | Compile services to wasm components with an OCI fallback; fails on generated drift. | HOBO-156 |
| `collect` | authoring | Run resource collection and print the provider-agnostic manifest IR. | HOBO-160 |
| `stub` | authoring | Run with a contract-backed stub behind a WIT port while implementation is generated or deferred. | HOBO-160, HOBO-392 |
| `drift` | diagnostics | Report drift and route governed remediation through proposals or gated `up` convergence. | HOBO-216, HOBO-369 |
| `add` | distribution | Install a provider/listing as available to deterministic selection after signature, provenance, and conformance checks. | HOBO-362, HOBO-365 |
| `registry` | distribution | Registry administration subcommands, including signed offline bundle import for air-gapped Yards. | HOBO-350, HOBO-383 |
| `import` | migration | Adopt an existing estate in place as adopted/external resources; never destroy/recreate on import. | HOBO-225, HOBO-369 |
| `generate` | generation | Request the provider-generation loop for a backend/capability; certification still passes through conformance and Registry. | HOBO-207, HOBO-348 |
| `sandbox` | test loop | Run a system-under-test in an isolated lane with out-of-scope boundaries served from contracts. | HOBO-190, HOBO-392 |
| `test` | test loop | Alias for the contract-backed sandbox test lane; not a replacement for project test runners. | HOBO-190, HOBO-392 |
| `attest` | governance | Produce signed OCSF, control, or model-card evidence exports from replayable audit facts for external GRC tools. | HOBO-175, HOBO-196, HOBO-282 |
| `erase` | governance | Request crypto-shred erasure and projection rebuild for a data subject without rewriting historical events. | HOBO-295 |
| `derivative` | extensibility | Manage derived HoBo implementations; `derivative upgrade` checks descriptors, runs upcasters, and reruns conformance. | HOBO-36, HOBO-336, HOBO-386 |
| `runbook` | SRE | Execute or replay declarative incident runbooks; write actions still pass through policy obligations. | HOBO-260, HOBO-285 |

## Lifecycle Semantics

`up` and `down` are the only lifecycle verbs. `up` subsumes deploy,
promotion, rollback, self-host bootstrap, and restore through flags:

```bash
hobo up
hobo up --camp prod
hobo up --camp prod --to <revision>
hobo up --rollback
hobo up ./platform --seed
hobo up ./platform --restore <log>
hobo down --camp pr-123
```

`verify`, `can-deploy`, `plan`, `inspect`, and `logs` are read-only diagnostics.
They do not mutate infrastructure. `up` always reruns the applicable gate before
mutation, so a stale preflight result cannot authorize a deploy.

Local resilience diagnostics are read-only projections too. The HOBO-520 proof
command under `src/draft/technical-proofs/resilience-semantics-annex` demonstrates the shape that
`hobo dev`, `testRuntime`, or a later `inspect run` surface may render: retry
attempts, policy denial, cancellation cleanup, and deadline escalation are read
from replay-derived persisted facts, and stale in-memory snapshots are not an
authoritative source.

## Retired or Rejected Commands

| Command | Replacement | Decision |
|---|---|---|
| `deploy` | `up` | Retired. Shipping is convergence of an object graph, not a separate lifecycle. |
| `destroy` | `down` | Retired. Teardown is the inverse of `up`. |
| `teardown` | `down` | Retired. Use the same destructive verb everywhere. |
| `rollback` | `up` | Retired as a verb. Use `hobo up --rollback` or `hobo up --to <revision>`. |
| `promote` | `up` | Retired as a verb. Use `hobo up --camp <target> --to <revision>`. |
| `yard` | `up` | Rejected. A Yard is an SDK object/program; bootstrap it with `hobo up ./platform`. |
| `forge` | `build` | Rejected. Build/componentization is `hobo build`. |
| `train` | `up` | Rejected. Training is declared in code and promoted through the same gate. |
| `crew` | `inspect` | Rejected. The Crew is SDK code plus dashboard/MCP surfaces, observed through projections. |
| `fleet` | `inspect` | Rejected. Fleet views are dashboard projections and `hobo inspect` output. |

## Lint Contract

`npm run docs:cli-lint` scans Markdown command examples and `@hobo/cli`
package summaries. Fenced examples may use only canonical first-level `hobo`
verbs, and package summaries may not list retired verbs. This keeps examples
from reintroducing retired lifecycle, Yard, or Forge drift after this hardening
pass.
