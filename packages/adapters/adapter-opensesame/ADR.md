# ADR — `@hobo/adapter-opensesame`

## Status

Accepted. The decision record is
[ADR-0170](../../../docs/design/adr/02-identity-security.md#adr-0170); this file is the package-local summary.

## Context

HoBo deploys with provider credentials (`VERCEL_TOKEN`, AWS keys). Holding them is the exposure the
secretless-first ranking (ADR-0027) exists to avoid, and the residual ports (ADR-0113) still hand the
workload a value. OpenSesame already runs a command with **secret references in place of credentials**
(`opensesame dev --agent run`, ADR 0150 there): the child holds an `osr_` surrogate; a plugin proxy swaps it
for the sealed token at the provider's own host, inside a declared scope, and revokes it when the run ends.

## Decision

Ship the receiving end as an **optional L2 adapter** under `packages/adapters/`:

- Package name `@hobo/adapter-opensesame`; depends on `@hobo/identity` (the `SecretsPort` vocabulary, the same
  reason as `@hobo/adapter-openbao`) and `@hobo/bindings` (secret-reference parsing). Not a default dependency of
  `@hobo/identity` or the composed `hobo` binary.
- A `SecretsPort` of kind `opensesame`: `access()` returns the run's surrogate as `provider-federation`
  material; `put()` is read-only (`read_only`); a placeholder is `placeholders_only`, never a success.
- Bindings (`hobo.credentials.json`) hold references and a bounded scope; an unbounded scope is unrepresentable.
- The existing locator `hobo-token://vercel/deploy` maps to a connection. No new SecretRef scheme.
- Vercel only. AWS is a typed `provider_not_brokered` refusal until OpenSesame's STS mint lands.
- Node `>= 22.21` is stated in this package's `engines` only.
- The real lane builds or points at a local kit (`HOBO_OPENSESAME_KIT`); no public test-build plugin is published.

## Consequences

- A HoBo process started this way never holds the real credential, and the adapter fails closed (`placeholders_only`)
  instead of passing a run that silently got a placeholder.
- The status of a proxied run is read from OpenSesame's exit status **and** its own stderr lines, because a child can
  exit with 77, 143 or 129 itself. That is advisory; the port is the gate.
- Deploys that need AWS credentials from OpenSesame wait for the STS mint (a slice in OpenSesame).
