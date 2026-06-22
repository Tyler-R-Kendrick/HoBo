# Plan 12 — Security & multi-tenancy

> Part of the [HoBo Design Plan Suite](./README.md). Security is load-bearing here because HoBo holds the keys to other people's clouds and runs AI-generated code. See also [agent auth](./06-ai-native-agent-auth.md) and the [event model](./11-event-model.md).

> **v3 (Humanitec):** the **HoBo Relay** ([Plan 28](./28-relay-gitops-pipelines.md)) keeps cloud credentials inside the customer's network — outbound-only TCP 443 reverse tunnel, SVID-authenticated, no inbound; Executors run behind it. This unlocks regulated/air-gapped/sovereign deploys without the Yard ever connecting into the private network.

> **v4 (policy plane):** the governance rules here are expressed as **policy packs** — signed, versioned resources evaluated by the **policy plane** ([Plan 30](./30-policy-plane.md)). Decisions can carry **obligations** (require signed+attested artifact / encryption / approved region for a data classification), tracked to completion as events. Supply-chain attestation and data-classification/region constraints become gate dimensions, not prose.

> **v2 update.** **WASM capability security** ([Plan 20](./20-wasm-wasi-runtime.md)) is now a runtime isolation layer: deny-by-default, unforgeable handles, and `.allow()`-scoped links ([Plan 21](./21-resources-catalog.md)) mean a component (incl. Forge-generated ones) can only touch what it's explicitly linked to — strengthening the sandbox for AI-generated providers/implementations ([Plan 23](./23-stubbable-ai-implementations.md)).

> **Isolation tiers.** Default multi-tenancy isolates tenants *within one Yard* (per-tenant streams/keys/pools, below). For **extreme isolation** (sovereign/regulated tenants, air-gap [ADR-0036](./adr/ADR-0036-air-gapped-sovereign-mode.md)) a tenant gets a **wholly separate Yard**; sovereign Yards interoperate only via a **`Junction`** peer federation (trust + signed artifacts, no shared state — [ADR-0043](./adr/ADR-0043-multi-yard-federation-junction.md)), so the isolation boundary is the Yard itself.

## Threat model (who/what we defend against)
| Asset | Threats | Primary mitigations |
|---|---|---|
| **Provider credentials** | theft, over-broad scope, long-lived leakage | keyless OIDC federation by default; short-lived, resource-scoped tokens; no static secrets at rest; every issuance audited |
| **Tenant data & event streams** | cross-tenant read/write, replay leakage | per-tenant isolation of streams/keys/pools; tenant claim enforced at the Gateway and in the store |
| **Executors (run IaC + builds)** | malicious/compromised provider code, supply-chain | Firecracker isolation, no ambient creds, no egress except the scoped target, ephemeral |
| **Forge plugins (AI-generated)** | exfiltration, backdoors, prompt injection in source docs | sandboxed conformance run with no egress; signed provenance; capability-scoped; human gate for high-trust |
| **The Yard itself** | privilege escalation, tampering with history | append-only log + fencing tokens; least-privilege services; immutable audit; quorum writes |
| **Agents** | confused-deputy, runaway spend/destroy | scoped SVIDs; policy gates on high-risk actions; spend caps; full replay |

## Multi-tenancy isolation model
A **tenant** is the hard isolation boundary. Isolation applies across four dimensions:
1. **Data** — event streams are namespaced and (optionally) encrypted per tenant; projections enforce the tenant claim; a query can never fold another tenant's stream. Sharding can be per-tenant logs for large tenants.
2. **Compute** — Executor pools are partitioned per tenant (and bulkheaded per provider) so one tenant's workload/storm can't observe or starve another's ([Plan 5](./05-reliability-ha.md)).
3. **Credentials** — SVIDs and brokered provider tokens are scoped to the tenant; a tenant's federation trust is established only with that tenant's provider accounts.
4. **Network** — data-plane resources of different tenants never share a trust domain; mTLS identities are tenant-scoped ([Plan 13](./13-networking-connectivity.md)).

**Deployment tiers:** self-host = single-tenant (the whole Yard is one trust domain); hosted = multi-tenant on the same code with the boundaries above. A "dedicated" tier can pin a tenant to isolated infra.

## Identity & authorization
- **Authentication:** humans via OIDC (SSO); agents/workloads via SVIDs ([Plan 6](./06-ai-native-agent-auth.md)).
- **Authorization:** ABAC over `(principal, tenant, port, resource, action)` evaluated at the Gateway and again at the broker. Roles are sugar over attributes (owner/maintainer/deployer/viewer/agent).
- **Policy gates** for high-risk actions (destroy, prod, spend > cap) — auto / require-approval (a resolvable hook) / deny. Policy is versioned and event-sourced (decisions are auditable facts).

## Secrets management
> Full model + SDK surface: [Plan 31 — Configuration & secretless secrets](./31-config-secretless-secrets.md). Summary below.
- **Goal: no static secrets (secretless-first).** Config/secret declarations resolve to *references per Camp*, not values; the runtime reaches bound resources via a brokered short-lived token (no secret at all) or fetches a genuine secret from the provider's `secrets` port at use time.
- **When secrets are unavoidable** (legacy `api-key` flow): stored with envelope encryption (KMS-backed DEK/KEK), never in the Bindle or the plaintext log; access is itself an audited `token.Used`.
- **Per-run encryption:** sensitive step inputs/outputs in the event log are encrypted with a per-run key (so log access ≠ payload access), decryptable on demand for the run owner — mirrors the Vercel `getEncryptionKeyForRun` model.

## Supply-chain security (plugins & images)
- **Plugins** (human or Forge): signed; carry SLSA-style provenance + the conformance report; the Registry refuses unsigned/unverified plugins; consumers can pin versions and require a trust level.
- **Images**: built reproducibly (Dagger), scanned, and referenced by digest; provenance attached.
- **Dependencies**: SBOMs generated in CI; vuln scanning gates publishing.
- **Air-gapped supply chain** ([ADR-0036](./adr/ADR-0036-air-gapped-sovereign-mode.md)): in a zero-egress/sovereign Yard, plugins/Capability Manifest/packs/images/model weights enter only via a **signed offline bundle** (`hobo registry import`) verified against this **same** signature + SLSA-provenance + conformance trust boundary (a tampered bundle is refused; `registry.BundleImported` audits it). Trust roots stay in-boundary: Identity issues SVIDs locally, certs via an **internal CA / private ACME** ([ADR-0035](./adr/ADR-0035-custom-domains-and-multi-cloud-ingress.md)), secrets via in-boundary KMS/HSM, and no telemetry phone-home.

## Audit & compliance
- The event log *is* the audit log: who (principal/SVID), what (event), when (clock), why (causation/correlation), and — for credentials — every grant/use/revoke.
- **SIEM export via OCSF** ([ADR-0046](./adr/ADR-0046-boundary-standards-cloudevents-ocsf-otlp.md)): security-relevant events (`token.*`, `identity.*`, `policy.Decided`, `domain.Cert*`, `registry.BundleImported`, `flag.Changed`, …) map to **[OCSF](../../standards/ocsf.md)** classes via an exporter/projection (no change to how they're stored), so the audit trail drops straight into an enterprise SIEM.
- Retention: audit streams (`token.*`, `resource.*`, policy decisions) retained per policy and never compacted; runtime streams have shorter retention.
- Data residency: a tenant can constrain regions; the Planner enforces it ([Plan 3](./03-providers-iac.md)) and residency violations are rejected at plan time.
- **Metering/billing data is tenant-scoped.** The `MeteringView` + showback attribution ([Plan 16](./16-cost-finops.md)/[ADR-0039](./adr/ADR-0039-billing-quota-cost-attribution.md)) are projections over the same per-tenant-isolated streams, so usage/cost data inherits the tenant isolation above — no cross-tenant metering leakage.

## v2 isolation layer (integrated)
- **Wasm capability sandbox = a fifth isolation dimension** alongside data / compute / credentials / network: deny-by-default, unforgeable handles, and `.allow()`-scoped **links** ([Plan 20](./20-wasm-wasi-runtime.md)/[Plan 21](./21-resources-catalog.md)). A component — including a Forge-generated one — can reach *only* what it is explicitly linked to.
- **`.allow()` is the single grant.** One declaration scopes least-privilege IAM **+** the wasm capability link **+** the brokered token, so the three enforcement layers can't drift apart.
- **AI-generated code is contained.** Forge runs in this sandbox + Firecracker with **no egress** during conformance; promotion requires per-WIT-interface conformance + signed provenance ([Plan 23](./23-stubbable-ai-implementations.md)), keeping the threat-model row "Forge plugins" fully mitigated for *implementations* too, not just providers.

## Iteration hooks
- Encryption granularity (per-tenant vs per-stream vs per-run) and KMS strategy.
- ABAC policy engine choice (typed TS vs Rego/CEL) — shared with [Plan 6](./06-ai-native-agent-auth.md) guardrails.
- Trust tiers for Forge plugins and the human-certification threshold.
- Compliance targets to design toward (SOC2/ISO/FedRAMP) and what each implies for the log.
