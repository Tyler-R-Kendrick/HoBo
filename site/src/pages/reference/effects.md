---
layout: ../../layouts/Docs.astro
title: Effects & resiliency
description: "EffectSpec purity lattice, domain effects, EffectManifest capture, and secondary ResilienceProfile application rules."
---

# Effects & resiliency

ADR-0136. Names are locked: **Effects** on contracts; **Resiliency** as secondary visible layer. No Effect-TS / Polly / XState public dependencies.

## EffectSpec

```ts
interface EffectSpec {
  schemaVersion: "hobo.effect-spec/v1";
  purity: "pure" | "varies" | "transacts" | "noRollback";
  capabilities: ("decides" | "suspends" | "allocates" | "concurrent")[];
  domains: (
    | "network" | "storage" | "identity" | "policyEval" | "eventEmit"
    | "metering" | "overlayTunnel" | "iac" | "secretsResidual" | "clock"
    | "externalCall" | "agentTool"
  )[];
}
```

### Lattice helpers

| Helper | Meaning |
|---|---|
| `isPure` | No domain I/O; purity pure |
| `mayFail` | Has `decides` |
| `requiresNetwork` | `network` or `externalCall` |
| `effectUnion` | Join purity + union sets |
| `effectSubtype` | Safer provided ⊆ required |
| `isEffectWideningBreaking` | Next adds domains/caps or dirties purity |

### Defaults

Missing effects are valid (opt-in). `effectiveEffects()` applies a **conservative** default for external reasoning (`noRollback` + `decides` + network/externalCall) without rewriting the content hash of contracts that omitted effects.

## Capture

| Fact | When |
|---|---|
| `contract.EffectDeclared` | Contract effects registered |
| `contract.EffectInvoked` | Boundary invocation recorded |

`EffectTracer` writes to an `EffectSink`. Replay **reads facts** — does not re-execute handlers.

`EffectManifest` exports purity, domains, flags (`mayFail`, `requiresNetwork`, `isPure`) for external systems.

## ResilienceProfile (secondary)

Strategies (metadata + thin applicator):

- `retry` — deterministic seed, max attempts, delays; `retryOn: "transient-only"`
- `circuitBreaker`, `timeout`, `bulkhead`, `fallback`, `hedging`

Always enforce **neverRetry**: `policy.Decided`, `terminal`, `cancellation`.

`applyResilienceProfile` emits `resilience.Attempt` / `resilience.Terminal`. `inspectResilienceFromFacts` rebuilds terminal state without re-running ops.

Circuit-breaker / hedging require network/externalCall domains on the contract.

## Testing entry

[Effect-aware isolation](/HoBo/testing/effects/)
