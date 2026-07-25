---
layout: ../../layouts/Docs.astro
title: The hobo CLI
description: "The canonical hobo command surface: two lifecycle verbs (up, down), read-only diagnostics, authoring, governance, and generation commands."
---

# The `hobo` CLI

The CLI is deliberately small. **`up` and `down` are the only lifecycle verbs** — deploy, promotion, rollback, self-host bootstrap, and restore are all flags on the same convergence loop, not separate commands. The canonical contract is [`docs/design/cli-spec.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/cli-spec.md), and a lint gate (`docs:cli-lint`) keeps every documented example on this surface.

## Lifecycle

```bash
hobo up
hobo up --camp prod
hobo up --camp prod --to <revision>
hobo up --rollback
hobo up ./platform --seed
hobo down --camp pr-123
```

`up` realizes the current object graph: build, plan, gate, provision, deploy. `down` tears it back in reverse dependency order. `up` always reruns the applicable gate before mutation — a stale preflight can never authorize a deploy.

## The full verb surface

| Verb | Role | Semantics |
|---|---|---|
| `up` / `down` | lifecycle | Realize / tear down the object graph. |
| `dev` | local loop | Run against `runtime-local` with hot reload, replay, and honest fidelity labels. |
| `new` | local loop | Scaffold a runnable SDK program. |
| `login` / `claim` | identity | OIDC dev identity; bind an anonymous deployment to an account. |
| `plan` | read-only | Dry-run the `up` decision: plan, matching choices, cost, warnings. |
| `verify` | read-only | Optional preflight of the unified gate decision. |
| `can-deploy` | read-only | Compatibility-matrix diagnostic for producer/consumer skew. |
| `inspect` | read-only | Projections and time-travel views (`run`, `deploy`, `topology`). |
| `logs` | read-only | Live-tail logs/streams through the Camp runtime. |
| `doctor` | diagnostics | Environment, credential, connectivity, and portability hazards. |
| `codegen` / `build` / `collect` / `stub` | authoring | Regenerate `_generated/`; compile to wasm components; produce the manifest IR; run contract-backed stubs. |
| `drift` | diagnostics | Report drift; route governed remediation. |
| `add` / `registry` | distribution | Install providers after signature/provenance/conformance checks; registry administration. |
| `import` | migration | Adopt an existing estate in place — never destroy/recreate on import. |
| `generate` | generation | Request the provider-generation loop for a missing backend/capability. |
| `sandbox` / `test` | test loop | Isolated lanes with out-of-scope boundaries served from contracts. |
| `attest` / `erase` | governance | Signed audit evidence exports; crypto-shred erasure with projection rebuild. |
| `derivative` | extensibility | Manage derived HoBo implementations (fork + upgrade with conformance). |
| `runbook` | SRE | Execute/replay declarative incident runbooks under policy obligations. |

## Retired verbs

Where you'd expect a verb from other tools, HoBo folds it into the model instead: `deploy`, `destroy`, `teardown`, `rollback`, and `promote` are all retired in favor of `up`/`down` and flags; `train`, `crew`, and `fleet` are SDK code and projections, not commands. The [spec](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/cli-spec.md#retired-or-rejected-commands) records each decision.

## Status

The CLI is a **designed surface** with its scaffold in [`packages/cli`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/packages/cli); slices land through the staged build gates. Track progress via [Project status](/HoBo/guide/status/).
