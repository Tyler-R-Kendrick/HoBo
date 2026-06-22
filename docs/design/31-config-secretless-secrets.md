# Plan 31 — Configuration & secretless secrets

> Part of the [HoBo Design Plan Suite](./README.md). How an app loads **configuration** and **secrets** without scattering static credentials. Stance: **secretless-first** — prefer workload identity + brokered, short-lived tokens over any stored secret; when a secret is unavoidable, store a *reference*, never a value. Builds directly on agent/workload identity ([Plan 6](./06-ai-native-agent-auth.md)) and the security model ([Plan 12](./12-security-multitenancy.md)); resolved **per Camp** (the provider-specific layer, [README glossary](./README.md#glossary--naming-thematic-all-tunable)).

## The problem
Apps need configuration (URLs, flags, tuning) and credentials (DB access, third-party API keys). The antipattern everyone falls into: static secrets baked into env files, images, IaC, or — worst — the event log. HoBo already issues **keyless workload identities** and brokers short-lived provider tokens ([Plan 6](./06-ai-native-agent-auth.md)); this plan makes that the *default* path for app config/secrets too, and defines the SDK surface for loading them.

## Principles
1. **Secretless-first.** The best secret is no secret: a bound resource is reached via the app's **SVID → brokered short-lived token**, so there is nothing to store or leak ([ADR-0008](./adr/README.md)).
2. **References, not values.** Config/secret declarations resolve to **refs** (a pointer to a provider secret store path, a binding, or a federation trust), resolved **at use-time, per Camp**. A value never lives in the `Bindle`, the Camp config, or the event log.
3. **Provider-specific resolution belongs to the Camp.** Because a Camp is the provider-specific layer, *where* a secret/config actually comes from (Key Vault vs Secrets Manager vs Vault; which region) is a Camp concern; the Bindle only declares *what it needs*.
4. **Every access is audited; values are never telemetry.** Secret reads are `token.Used` / `secret.Accessed` events; OTel/OpenInference spans and `ctx.log` redact values ([Plan 14](./14-observability.md)).

## SDK surface
Declared inline (IfC, [Plan 21](./21-resources-catalog.md)) alongside resources; typed; read via `ctx.config`.
```ts
import { config, secretRef, env, fromBinding } from "@hobo/sdk";

export const cfg = config({
  DB:        fromBinding("db"),            // secretless: brokered client/token via the bind (Plan 13)
  STRIPE:    secretRef("stripe/api-key"),  // a real secret → resolved from the Camp's secret store at use-time
  LOG_LEVEL: env("info"),                  // non-secret typed config (per-Camp overridable)
});

export const charge = step(async (o: Order) => {
  const stripe = await ctx.config.STRIPE();   // fetched now via a brokered token; in-memory only
  // ...
});
```
- `fromBinding(name)` — **preferred**: no secret at all; the bound resource is reached with the app's SVID-brokered token (the `bind` edge already wires identity-aware connectivity, [Plan 13](./13-networking-connectivity.md)).
- `secretRef(ref)` — a genuine third-party secret; `ref` is a logical name resolved per-Camp to the provider's `secrets` port path; the value is fetched at use-time and held in memory, never persisted. *(Named `secretRef`, **not** `secret`, to avoid colliding with the catalog's `secret()` resource in [Plan 21](./21-resources-catalog.md), which **declares a managed secret store**; `secretRef` only **reads** a value from one.)*
- `env(default)` — non-secret configuration; lives in the Camp's Deployment Set ([Plan 26](./26-environments-deltas.md)) and is overridable per Camp/Delta.

## The resolution ladder (secretless-first)
```mermaid
flowchart TD
  NEED["app needs config/secret X"] --> KIND{declared as}
  KIND -->|fromBinding| BIND["SVID -> brokered short-lived token<br/>(no secret stored)"]
  KIND -->|secretRef| FED{provider federation<br/>available?}
  KIND -->|env| CFG["non-secret value from the Camp's Deployment Set"]
  FED -->|yes| STS["broker token -> read from provider secret store at use-time<br/>(Key Vault / Secrets Manager / Vault)"]
  FED -->|no| LEGACY["bounded static-secret escape hatch<br/>(TTL + rotation + audited + opt-in, ADR-0023)"]
  BIND --> AUDIT["token.Used / secret.Accessed event; value never logged"]
  STS --> AUDIT
  LEGACY --> AUDIT
```
1. **Bound resource** → SVID-brokered token (zero stored secret). Default for `database`/`queue`/`objectStore`/etc.
2. **Secret with provider federation** → broker a scoped token, read the value from the provider's secret store at use-time.
3. **Non-secret config** → typed value from the Camp's Deployment Set (no broker needed).
4. **Static-secret escape hatch** → only when a provider offers no federation/secret-store path. **Bounded, concretely:** max TTL **≤ 7 days** (default; per-Camp tunable down), **rotation enforced** (a key past TTL fails closed with a typed `SecretExpiredError`, it does not hang), **every fetch audited** (not just grant/revoke), and **in-process cache bounded** (short TTL; each cache miss re-audits) — explicit opt-in ([ADR-0023](./adr/ADR-0023-security-posture-commitments.md)). `hobo doctor` warns when this path is used where federation exists ([Plan 15](./15-cli-dx.md), FR-014).

## Per-Camp binding (where values actually come from)
The Bindle declares *needs*; each Camp supplies the *source* (provider-specific), e.g.:
```ts
// hobo.config.ts — Camp "prod-aws"
camp("prod-aws").config({
  STRIPE: fromSecretStore("aws:secretsmanager", "prod/stripe"),   // resolved via brokered token
  LOG_LEVEL: "warn",
});
```
The same Bindle on `prod-azure` resolves `STRIPE` from Key Vault — **no app-code change** (the portability promise, [ADR-0024](./adr/ADR-0024-portability-conformance-guarantee.md)). Resolution decisions are recorded as `config.Resolved` (ref → source **+ Camp**, never the value).

**Multi-Camp drift.** Because each Camp sources secrets independently, the *same logical secret* can diverge across Camps (rotated in AWS, stale in Azure). HoBo does **not** sync secret values (it never holds them), but `hobo doctor` / `hobo verify` compare resolved **refs across an environment group** and warn on a key that is missing or maps inconsistently; `config.Resolved` (ref + Camp) makes drift inspectable in the audit log. Value correctness remains the secret-store owner's responsibility.

## Events & audit
- `config.Resolved` — a declared key bound to a source (binding / secret-store path / federation trust); carries the *ref* + Camp, never the value.
- `secret.Accessed` — a use-time fetch, joined to the run/agent + the brokered `token.Used` (the [CredentialAudit](./11-event-model.md) projection answers "who read which secret, when, with which token"). `secret.Unavailable` — a failed fetch (store down / denied).
- **Redaction is at capture time, not export.** Values are scrubbed **before** a span/event is stored — so a secret never lands in the event log, OTel/OpenInference spans, error messages, or **training trajectories** ([Plan 23](./23-stubbable-ai-implementations.md): a `"use training"` method that calls `ctx.config.STRIPE()` must not leak the value into its trajectory). Values that must transit a step's I/O are per-run encrypted ([TR-111](../requirements/TRD.md)).

## Local development (`hobo dev`)
The local Camp (`runtime-local`) has no cloud secret store, so `secretRef` resolves against a **dev-only** source, in order: (1) a gitignored **`.env.local`**, (2) the OS keychain, (3) an interactive prompt (skipped in CI; CI uses `.env.local` or stubbed providers). Dev secrets are **clearly marked non-production**, audited as `secret.Accessed { camp: "local", source: "dev" }`, and never satisfy a production `can-deploy`. Tests prefer `stub()`ed providers ([Plan 23](./23-stubbable-ai-implementations.md)) so unit runs need no real secret at all.

## Availability & failure modes
If a Camp's secret store is unreachable, `secretRef` resolution **fails fast after a bounded retry** (a small capped-backoff budget), emits `secret.Unavailable`, and surfaces a typed error the step can handle — it does **not** silently fall back to a static value. A short, bounded in-process cache (above) may serve a recently-fetched value within its TTL; beyond that, the call fails rather than serve stale/unknown credentials. Treat secret-store availability as a dependency in the SLO budget ([Plan 5](./05-reliability-ha.md)).

## App-facing crypto (keys the app never holds)
The secretless model extends to **cryptography**: a `crypto(name)` resource (`hobo:crypto` port, [Plan 21](./21-resources-catalog.md)/[Plan 24](./24-wit-interfaces-reference.md)) offers `encrypt`/`decrypt` (envelope) + `sign`/`verify` where the **key material never enters app code** — the app holds a brokered key *handle* (via Identity, [Plan 6](./06-ai-native-agent-auth.md)), and the operation runs against a per-Camp **KMS / Key Vault / Cloud KMS / in-boundary HSM** behind the port (air-gap: in-boundary KMS, [ADR-0027](./adr/ADR-0027-secretless-config-and-secrets.md)/[ADR-0036](./adr/ADR-0036-air-gapped-sovereign-mode.md)). Same secretless guarantee as tokens: nothing key-shaped at rest in the app. (Closes the Dapr-crypto parity item, [gap-analysis G9](../../competitors/gap-analysis.md).)

## Why this is safe
- **Nothing to steal by default** — the common case (bound resources) uses brokered tokens, so there is no secret at rest ([ADR-0008](./adr/README.md)).
- **Blast radius is bounded** — tokens are short-lived + resource-scoped; the static fallback is TTL'd, rotated, and audited ([ADR-0023](./adr/ADR-0023-security-posture-commitments.md)).
- **Portable** — the Bindle declares needs, the Camp supplies sources; swapping clouds is a Camp change, never an app edit.

## Iteration hooks
- The exact `config()`/`secretRef()` DSL vs a thinner `ctx.env`-style accessor.
- Caching/TTL of fetched secrets in-process (re-fetch cadence vs latency) — defaults above are a starting point.
- Whether non-secret config supports live reload (push from the Camp's Deployment Set) or is deploy-time only.
- Per-Camp secret-store adapter coverage (which providers expose a `secrets` port natively vs need a shim).
