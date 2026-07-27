---
layout: ../../layouts/Docs.astro
title: Contracts & PACT
description: "Executable consumer-driven contracts: package contracts/ layout, subset matching, inventory drift, and how PACT sits under Contract IR."
---

# Contracts & PACT

Every service boundary that crosses a package owns **executable contracts**. HoBo’s source of truth is the **Contract IR** (`BoundaryContract` in `@hobo/contracts`). PACT documents are the common **export/import shape** and the local test harness format — not a parallel product model.

## Package layout

```text
packages/<pkg>/
  contracts/
    pact-inventory.md
    pacts/<boundary>.pact.json
    consumer/<boundary>.contract.test.ts
    provider/<boundary>.provider.test.ts
    provider/fixtures/
```

Inventory columns track boundary → consumer → provider → protocol → status (`consumer_tested` → `provider_verified`).

## Consumer and provider

1. **Consumer tests** generate or refresh the pact document against expected interactions.
2. **Provider verification** replays interactions against the real implementation with **subset matching**: the expected response must be a subset of actual, so providers may grow fields without breaking consumers.
3. The same interactions feed **[Bridge](/HoBo/guide/bridge/)** activation: a local fork must pass the boundary contract before carrying traffic.

## Harness API (`@hobo/contract-harness`)

| Symbol | Role |
|---|---|
| `parsePactDocument` | Parse-don’t-validate pact JSON |
| `loadPactDirectory` | Load `*.pact.json` |
| `createMockProviderFromPact` | In-process consumer mock |
| `verifyPact` | Provider verification |
| `checkPactInventory` | Drift gate: inventory ↔ files |

## Contract IR vs PACT

- **Contract IR** — versioned producer/consumer edge + shape + optional **EffectSpec** / **ResilienceProfile**; `checkCompatibility` / can-deploy / Gatekeeper.
- **PACT** — interaction-level request/response evidence for a boundary implementation.
- Developers usually never “turn PACT on”; it is the harness detail under the contract engine.

## Compatibility gates

`can-deploy` / Gatekeeper answer version-skew: *will this next revision still satisfy deployed consumers?* Removed required fields and (when declared) **effect widening** are breaking. See [Reference: contracts](/HoBo/reference/contracts/).

## Next

- [Effect-aware isolation](/HoBo/testing/effects/)
- [Deployment rehearsal](/HoBo/testing/deployment/)
