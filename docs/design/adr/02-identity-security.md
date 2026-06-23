# Identity, security & secrets — consolidated decisions

> Consolidated ADR decisions for **identity, security & secrets**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0008
**Keyless agent identity (SVID/OIDC federation) + token broker.**

**Context:** static keys vs federated identity. **Decision:** agents get short-lived SVIDs; the broker exchanges them for resource-scoped provider tokens (OIDC federation preferred, OAuth-OBO for human delegation). **Consequences:** no static secrets, full credential audit; we must run an OIDC IdP + per-provider trust setup ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 12](../security-networking.md#plan-12)).

## ADR-0009
**Capability Manifest capability/auth standard + Registry.**

**Decision:** providers publish machine-readable signs (`capabilities/auth/cost.json`) at a well-known path; the Registry indexes them. **Consequences:** agents self-discover + self-provision; we must define, version, and possibly standardize the schema ([Plan 6](../ai-native-agent-auth.md#plan-06)).

## ADR-0012
**Firecracker-sandboxed, credential-scoped executors.**

**Decision:** all IaC/build runs in microVMs with no ambient creds and a single scoped token. **Consequences:** strong isolation for untrusted/generated provider code; operational cost of running a microVM fleet ([Plan 4](../control-plane.md#plan-04), [Plan 12](../security-networking.md#plan-12)).

## ADR-0023
**Security posture commitments.**

- **Origin:** the requirements security review (see [`plans/README.md`](../../../plans/README.md), findings SEC-01…10).

### Context
The design (esp. [security-networking.md#plan-12](../security-networking.md#plan-12)) names the right threats — runaway/confused-deputy agents, Forge prompt-injection, supply-chain, cross-tenant access. The posture is **secure-by-default, zero-trust, defense-in-depth**: nothing is trusted by location or network position, every request authenticates and is authorized at each hop, and controls are layered so no single failure is fatal. For an agent-facing control plane that holds other people's cloud credentials and runs AI-generated code, the mitigations must be **verifiable requirements**, not threat-model prose — backed by industry-standard scanning, monitoring, and best-practice adherence.

### Decision
Commit the following security requirements (each lands as an `NFR`/`TR` with a verification method):
1. **Bound the static-key escape hatch** — any static API key carries a **maximum TTL (default ≤ 7 days)** and an enforced rotation schedule (expiry fails closed, does not hang), is **fully audited on every fetch** (not just grant/revoke), and is only reachable behind an explicit opt-in; federation is always preferred. (TR-051, NFR-005)
2. **Rate-limit & quota the Gateway/MCP surface** — per-principal (SVID/OIDC) and per-tenant limits with backpressure; exceeds return a typed throttle error. Protects against runaway agents and DoS. (TR-071, NFR-019)
3. **Forge generation is hardened against prompt injection** — source docs/OpenAPI fed to Forge are scanned/sanitized; the signed provenance includes a scrub report; conformance runs with **no egress** as a hard requirement. (TR-083)
4. **Confused-deputy default-deny** — before any agent obtains a scoped token, the policy engine checks `{principal, tenant, resource, action}`; cross-tenant issuance is denied unless explicitly delegated. (TR-053)
5. **Quantified audit retention** — `token.*`/`resource.*`/policy-decision streams are retained for a defined minimum and never compacted. (NFR-018, TR-052)
6. **Encryption everywhere it matters** — envelope encryption at rest for event streams across **all** runtimes (not just `runtime-local`); per-run payload decryption requires log-read **and** explicit authorization (run-owner / `decrypt:run`). (TR-111)
7. **Supply-chain specifics** — all published artifacts carry CycloneDX SBOMs; CI blocks publishing on CVSS ≥ 7.0 (with a documented waiver path); plugins signed with SLSA-style provenance. (TR-112)
8. **Redaction at capture, not export** — secret/PII values are scrubbed **before** a span/event is stored, so a value never enters the event log, OTel/OpenInference spans, error messages, or **training trajectories** ([Plan 31](../authoring-resources-wiring.md#plan-31)/[Plan 23](../forge-generated-stack.md#plan-23)). (TR-054, TR-111)
9. **Continuous scanning & monitoring** — supply-chain (SBOM/CVE), IaC/policy, and secret-leak scanners run in CI and continuously in production, wired to the audit/observability plane; controls map to recognized standards so adopters can assess them against their own frameworks.

Defense-in-depth: these layer — federation removes most secrets, the policy engine default-denies what remains, encryption protects data at rest, rate-limits cap blast radius, and continuous scanning catches regressions.

### Alternatives considered
- **Leave these in the threat model only** — rejected: a threat model is not a testable control; reviewers and customers need requirements.
- **Forbid static keys entirely** — rejected: some providers require them; a bounded, audited, opt-in escape hatch is the pragmatic compromise.
- **Single-layer controls** — rejected: a zero-trust, agent-facing surface needs overlapping defenses so one bypass is not a breach.

### Consequences
- **(+)** The security promises become verifiable gates, not prose; regulated adopters (BR-010) can assess them.
- **(+)** The agent-facing surface (the product's differentiator) gets explicit abuse-case defenses.
- **(−)** More requirements to implement and test (rate-limiting infra, per-runtime encryption, Forge doc-sanitization, continuous scanning). Some (e.g. encryption on every runtime) depend on the runtime adapter's capabilities — stated as opt-in-where-unsupported with the gap documented.
- **(−)** Rotation/TTL on static keys may friction a few provider integrations; mitigated by federation-first and the documented waiver path.

## ADR-0027
**Secretless-first configuration & secrets.**

- **Origin:** product direction — "env vars / secrets should be loaded somehow, leveraging secretless auth patterns." The suite had keyless identity + a token broker but no explicit *app config/secrets loading* surface.

### Context
HoBo already issues keyless workload identities (SVIDs) and brokers short-lived provider tokens ([ADR-0008](#adr-0008)), and forbids static secrets at rest ([Plan 12](../security-networking.md#plan-12)). What was missing: a defined way for an **app** to declare and load configuration and secrets. Without it, teams default to the antipattern — static secrets in env files/images/IaC, or worse, in the event log.

### Decision
Define a **secretless-first** config/secrets model ([Plan 31](../authoring-resources-wiring.md#plan-31)):
1. **References, not values.** `config()`/`secret()`/`env()` declarations resolve to **references**, resolved **per Camp at use-time**. A value never lives in the Bindle, the Camp config, or the event log.
2. **Resolution ladder (secretless-first):** (a) **bound resource** → SVID-brokered short-lived token (no secret exists); (b) **secret with provider federation** → broker a scoped token and read from the provider's secret store at use-time; (c) **non-secret config** → typed value from the Camp's Deployment Set; (d) **static-secret escape hatch** → only where no federation exists, **bounded** by TTL + rotation + audit + opt-in ([ADR-0023](#adr-0023)).
3. **Provider resolution is a pluggable adapter, scoped to the Camp.** The default identity/secrets model (SVID/SVID-brokered tokens, OIDC federation) stays the default, but cloud-specific IAM, keys, and certs plug in through a **`secrets` port adapter / extension** per provider. The Bindle declares *what it needs*; each Camp supplies *where it comes from* (Key Vault vs Secrets Manager vs Vault) via the matching adapter — so swapping clouds, or overriding the default identity path with a cloud-native one, is a Camp + extension change, not an app edit ([ADR-0024](07-portability-extensibility.md#adr-0024)).
4. **Audit + redaction.** Resolution is `config.Resolved` (ref → source, not value); secret reads are `secret.Accessed` joined to `token.Used`; values are redacted from logs/OTel/OpenInference spans and per-run-encrypted if they must transit a step's I/O ([TR-111](../../requirements/TRD.md)).

### Alternatives considered
- **Plain env-var injection** (12-factor) — rejected as the default: it normalizes static secrets and value-at-rest. Supported only as the bounded escape hatch.
- **A dedicated secrets manager product** — out of scope (a non-goal): HoBo brokers access to the provider's secret store rather than being one.
- **Resolve config at deploy-time and bake into the artifact** — rejected for secrets (value at rest); allowed for non-secret config via the Deployment Set.

### Consequences
- **(+)** The common case has **no secret to steal** (brokered tokens); secrets that do exist are referenced, short-lived, and audited. Strengthens the zero-secret KPI (NFR-005).
- **(+)** Config/secret sourcing is portable (declared in Bindle, sourced per Camp).
- **(−)** Requires a `secrets` port adapter per provider and a config-resolution path in the runtime; providers lacking federation fall back to the bounded static hatch (gap documented).
- **(−)** Adds `config.Resolved`/`secret.Accessed` events and redaction obligations to the runtime/observability surface.

## ADR-0038
**End-user / application auth.**

- **Origin:** a competitive re-survey (after closing G1–G7) found `auth()` listed as a SaaS primitive but **only agent/workload auth specified** — no end-user/app-user story, while shoo / Convex Auth / Clerk / Auth0 ship it first-class (the same listed-but-unspecified shape as the search gap). Designed via brainstorming + grill-with-docs.

### Context
[Plan 6](../ai-native-agent-auth.md#plan-06) is a deep treatment of **agent/workload** auth (SVIDs, the token broker, Capability Manifest, OBO). But an app deployed on HoBo needs to authenticate its **end users** (humans), and `auth()` ([Plan 2](../sdk-api.md#plan-02) §53) needs a specification: sign-in, sessions, JWT/JWKS verification, IdP integration. HoBo has the substrate — it issues + verifies OIDC/JWTs via JWKS for agents, is secretless-first, has a policy plane + `.allow()` for authorization, and the event envelope's `actor: PrincipalRef` admits a `user`. The decision is how to assemble end-user auth from that substrate without reinventing a full identity provider.

### Decision
1. **`auth()` is a federation + verification port (`hobo:auth`), not a homegrown IdP.** It verifies OIDC/JWT from any provider — Google / GitHub / Clerk / Auth0 / **custom JWT** (the shoo/Convex-`customJwt` pattern) — reusing HoBo's **OIDC + JWKS + secretless** machinery. A **thin optional built-in** (passkey / email magic-link) covers zero-config dev and runs offline/air-gap ([ADR-0036](07-portability-extensibility.md#adr-0036)). HoBo does **not** build a full hosted IdP; identity is federation + verification, with cloud-native IdPs plugged in as adapters.
2. **Unified principal model.** An end-user is a **`PrincipalRef`** (the event `actor` already admits `user`), exposed as **`ctx.user`** alongside `ctx.identity` (SVID). **Authorization is the same policy plane** ([Plan 30](../contracts-policy-flags.md#plan-30)) **+ `.allow()`-style declarative rules** keyed on user claims (record-level), and **audit rides the existing event `actor`** ([Plan 11](../event-model.md#plan-11)). One identity/authz/audit path for users + agents + services; agent **OBO** ([Plan 6](../ai-native-agent-auth.md#plan-06)) carries the same user principal.
3. **Stateless JWKS verify per request + optional event-sourced sessions.** JWTs are verified via JWKS on each request (edge-friendly, matches `customJwt`); optional **`session.*`** records provide revocation / "sign out everywhere" + audit, and reactive queries ([Plan 32](../data-plane.md#plan-32)) re-evaluate on auth-state change.
4. **Surface:** client `useAuth()`/`signIn()`/`signOut()` (peer to `useQuery()`); server `ctx.user` (typed verified claims). **Events:** `user.Authenticated` · `session.Started/Refreshed/Revoked` (authz decisions ride `policy.Decided`).

### Alternatives considered
- **Build a full first-class IdP** (accounts/passwords/passkeys/MFA, Convex-Auth-built-in style). Rejected: auth is a deep, security-critical domain to own + maintain forever; federation + verification covers the need while reusing existing machinery. (The thin built-in is the dev/zero-config concession.)
- **BYO auth only (`auth()` stays a hollow pass-through).** Rejected: abdicates the gap and makes a listed first-class primitive meaningless.
- **A separate end-user auth subsystem distinct from the principal model.** Rejected: duplicates identity/authz/audit, breaks the unified audit trail, and gives developers two authorization mechanisms; the `PrincipalRef`/policy-plane reuse is the coherent HoBo answer.
- **Server-side sessions only / pure stateless JWT with no sessions.** Rejected (both extremes): the former is stateful + a hot-path bottleneck against the edge/event-sourced grain; the latter has no pre-expiry revocation. Stateless verify + event-sourced sessions for revocation balances both.

### Consequences
- **(+)** Closes G8: HoBo apps get real end-user auth (sign-in/sessions/verification/IdP integration) that a Convex/shoo audience expects — reusing OIDC/JWKS, the policy plane, `.allow()`, and the event audit rather than new machinery.
- **(+)** The unified `PrincipalRef` model keeps "everything is a principal" coherent: users, agents, and services share one authz + audit path, and OBO chains (user → agent → resource) are one identity story.
- **(+)** Stateless JWKS verify is edge-friendly; the thin built-in works offline/air-gap; the typed `useAuth()`/`ctx.user` surface flows through codegen ([ADR-0037](05-config-matching-environments.md#adr-0037)).
- **(−)** Federation-first means HoBo depends on external IdPs for production-grade user management (the thin built-in is dev-grade); orgs needing a fully self-contained IdP supply one through the IdP adapter.
- **(−)** Record-level authorization expressed via policy/`.allow()` on user claims is powerful but adds modeling surface; HoBo ships conventions for claims→roles/tenancy.
