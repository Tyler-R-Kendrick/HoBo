---
layout: ../../layouts/Docs.astro
title: Config & secrets
description: "Secretless-first resolution ladder, config schema, fromBinding, residual secrets, local overrides, and never-plaintext audit."
---

# Config & secrets

HoBo is **secretless-first** (ADR-0027). Long-lived static secrets are a **residual** Nitric-parity path, not the default architecture.

## Authoring (`@hobo/bindles`)

| Surface | Role |
|---|---|
| `config({ ... })` | Schema of env + secret fields |
| `env.string()` / dual `env({...})` | Non-secret configuration |
| `secret.string().source(...)` | Residual secret fields with explicit source |
| `secretRef` / `fromBinding` | References, not values |
| `secret(name)` resource | Catalog secret resource (residual) |

Codegen: `generateCtxConfigSource`. Gate: `evaluateSecretlessConfigGate` (Gatekeeper dimension `secretlessConfig`).

## Resolution ladder (`@hobo/identity`)

`resolveConfigSchema` ranks sources:

1. **bound-resource** — capability from bound infrastructure  
2. **provider-federation** — OIDC/workload identity exchange  
3. **camp-value** — Camp-provided non-secret or brokered material  
4. **static-escape** — time-boxed residual (≤7d class constraints)

Camp adapters (Vault JWT/OIDC, AWS SM, Azure KV, …) fetch through **brokered** paths — workloads do not hold master keys.

## Events

| Event | Payload rule |
|---|---|
| `config.Resolved` | Refs and ranks only |
| `secret.Accessed` | Refs only — **never** material |

CredentialAudit streams are never-compact.

## Local overrides

`encryptLocalOverrides` / `decryptLocalOverrides` for non-sensitive local DX. Agents and `hobo dev` use **schemaOnlyView** + contract-asserted fixtures — **no plaintext** in agent context, events, or IaC.

## Conformance

`requireNoPlaintextConformance` fails closed on plaintext leakage patterns in the residual path.

## WIT

Experimental `hobo:secrets@0.1.0` under `@hobo/wit`; bridge with `asHoboSecretsStore` when hosting components.

## Related

[Identity](/HoBo/reference/identity/) · [Identity guide](/HoBo/security/identity/) · [Resources](/HoBo/primitives/resources/) · [Agent credentials](/HoBo/security/credentials/)
