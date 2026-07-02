---
type: Reference
title: "HOBO-638 Provider AWS Full Catalog Proof"
description: "Acceptance evidence for the @hobo/provider-aws full capability port catalog draft POC."
tags: [hobo, design, proof]
---

# HOBO-638 Provider AWS Full Catalog Proof

This proof records acceptance evidence for the independent draft POC at
`src/draft/technical-proofs/provider-aws-full-capability-catalog-contract`.

## Acceptance Mapping

| Requirement | Executable proof |
|---|---|
| Full capability port catalog (`web/service`, `kv`, `bucket`, `queue`, `topic`, `sql`, `secret`) with equivalence mappings and typed `.with(...)` builders. | `factory publishes full catalog ports, equivalence mappings, typed builders, and OIDC auth.json` |
| Published Capability Manifest includes OIDC-federation `auth.json` for the S3 broker. | Same test asserts `oidc-federation` flow and `brokerTargets.bucket`. |
| `@hobo/conformance` provider-capability suite green for claimed ports. | `AWS full catalog provider passes provider-capability conformance for every claimed port` |
| Multi-cloud-shop topology realizes through `@hobo/iac-pulumi`. | `multi-cloud-shop fixture realizes all seven catalog ports through Pulumi-shaped AWS nodes` |
| Brokered (keyless) apply succeeds without static secrets. | `brokered keyless apply succeeds with OIDC-federation S3 broker and no static secrets` |

## Adversarial Mapping

| Adversarial case | Executable proof |
|---|---|
| API-key-only manifests must not pass brokered apply. | `adversarial cases reject api-key-only auth, unsupported regions, and unsatisfied require facts` |
| Unsupported regions reject with precise reasons. | Same test rejects `ap-south-2` with `aws-region-service-unavailable`. |
| Unsatisfied `require` facts reject precisely. | Same test rejects missing `global-writes` with `aws-capability-require-unsatisfied`. |
| Quota exhaustion is explicit. | Same test rejects zero `web/service` quota with `aws-quota-exhausted`. |

## Scope Boundary

Draft POC only. Production promotion to `packages/providers/provider-aws/` waits on
S4-01 (HOBO-637) M0 acceptance record merge.

## Local Gate

```bash
pnpm --prefix src/draft/technical-proofs/provider-aws-full-capability-catalog-contract test
```
