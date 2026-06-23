# Identity, security & secrets — consolidated decisions

> Consolidated ADR decisions for **identity, security & secrets**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0008
**Keyless agent identity (SVID/OIDC federation) + token broker.**

**Context:** static keys vs federated identity. **Decision:** agents get short-lived SVIDs; the broker exchanges them for resource-scoped provider tokens (OIDC federation preferred, OAuth-OBO for human delegation). **Consequences:** no static secrets, full credential audit; we must run an OIDC IdP + per-provider trust setup ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 12](../security-networking.md#plan-12)).

## ADR-0009
**Capability Manifest capability/auth standard + Registry.**

**Decision:** providers publish machine-readable signs (`capabilities/auth/cost.json`) at a well-known path; the Registry indexes them. **Consequences:** agents self-discover + self-provision; we must define, version, and possibly standardize the schema ([Plan 6](../ai-native-agent-auth.md#plan-06)).

## ADR-0012
**Credential-scoped executors; isolation tier chosen per workload.**

**Decision:** IaC/build and untrusted/generated code run with **no ambient creds and a single scoped token**, in a sandbox whose **isolation tier is selected per workload/trust level** via Matching ([ADR-0033](05-config-matching-environments.md#adr-0033)) — microVM (Firecracker) for untrusted/generated provider code, with gVisor or container tiers where the workload allows. The hosting/isolation tech is optimized for the specific workload, not fixed globally. **Consequences:** strong isolation where it's needed without paying microVM cost for every workload; the executor manages several isolation backends behind one contract ([Plan 4](../control-plane.md#plan-04), [Plan 12](../security-networking.md#plan-12)).

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
8. **Redaction at capture, not export** — secret/PII values are scrubbed **before** a span/event is stored, so a value never enters the event log, OTel/OpenInference spans, error messages, or **training trajectories** ([Plan 21](../authoring-resources-wiring.md#plan-21)/[Plan 23](../forge-generated-stack.md#plan-23)). (TR-054, TR-111)
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
Define a **secretless-first** config/secrets model ([Plan 21](../authoring-resources-wiring.md#plan-21)):
1. **References, not values, declared in a varlock-style typed schema.** `config()`/`secret()`/`env()` declarations resolve to **references**, resolved **per Camp at use-time** — a value never lives in the Bindle, the Camp config, or the event log. The declaration surface is a **typed, annotation/decorator-driven schema** in the spirit of varlock's `.env.schema`: each config/secret item declares its **type**, **required-ness**, **sensitivity** (secret vs non-secret config), and **source** (bound resource / provider-federated store / Camp value / static escape hatch). The schema is the committed, agent-readable *shape* (validated, coerced, and codegen'd to typed `ctx.config`, [ADR-0037](05-config-matching-environments.md#adr-0037)) while the *values* stay out of reach — going beyond varlock's vault-resolution by preferring no secret at all (the brokered path in (2)).
2. **Resolution ladder (secretless-first):** (a) **bound resource** → SVID-brokered short-lived token (no secret exists); (b) **secret with provider federation** → broker a scoped token and read from the provider's secret store at use-time; (c) **non-secret config** → typed value from the Camp's Deployment Set; (d) **static-secret escape hatch** → only where no federation exists, **bounded** by TTL + rotation + audit + opt-in ([ADR-0023](#adr-0023)).
3. **Provider resolution is a pluggable adapter, scoped to the Camp.** The default identity/secrets model (SVID/SVID-brokered tokens, OIDC federation) stays the default, but cloud-specific IAM, keys, and certs plug in through a **`secrets` port adapter / extension** per provider. The Bindle declares *what it needs*; each Camp supplies *where it comes from* (Key Vault vs Secrets Manager vs Vault) via the matching adapter — so swapping clouds, or overriding the default identity path with a cloud-native one, is a Camp + extension change, not an app edit ([ADR-0024](07-portability-extensibility.md#adr-0024)).
4. **Audit + redaction.** Resolution is `config.Resolved` (ref → source, not value); secret reads are `secret.Accessed` joined to `token.Used`; values are redacted from logs/OTel/OpenInference spans and per-run-encrypted if they must transit a step's I/O ([TR-111](../../requirements/requirements.md)).

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
1. **`auth()` is a federation + verification port (`hobo:auth`), not a homegrown IdP.** It verifies OIDC/JWT from any provider — Google / GitHub / Clerk / Auth0 / **custom JWT** (the shoo/Convex-`customJwt` pattern) — reusing HoBo's **OIDC + JWKS + secretless** machinery. The IdP is a **swappable adapter**, with a default set of **WorkOS · Auth0 · Supabase Auth · Microsoft Entra ID** (+ Google/GitHub/Clerk/customJwt) selected per Camp/Yard by Matching — only registered adapters are considered, and the set is non-limiting + Forge-extensible ([ADR-0073](07-portability-extensibility.md#adr-0073)). A **thin optional built-in** (passkey / email magic-link) covers zero-config dev and runs offline/air-gap ([ADR-0036](07-portability-extensibility.md#adr-0036)). HoBo does **not** build a full hosted IdP; identity is federation + verification, with cloud-native IdPs plugged in as adapters.
2. **Unified principal model.** An end-user is a **`PrincipalRef`** (the event `actor` already admits `user`), exposed as **`ctx.user`** alongside `ctx.identity` (SVID). **Authorization is the same policy plane** ([Plan 29](../contracts-policy-flags.md#plan-29)) **+ `.allow()`-style declarative rules** keyed on user claims (record-level), and **audit rides the existing event `actor`** ([Plan 11](../event-model.md#plan-11)). One identity/authz/audit path for users + agents + services; agent **OBO** ([Plan 6](../ai-native-agent-auth.md#plan-06)) carries the same user principal.
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

## ADR-0070
**Dev-mode auth bypass via integrated contract testing.**

### Context
Local dev needs to skip real authentication — no IdP round-trips, works offline — without the dev code path **diverging** from production. The usual "set `AUTH_DISABLED=true`" flag runs untested logic in dev and silently differs from prod. HoBo already treats every boundary as a consumer-driven **contract** ([ADR-0015](04-governance-verification.md#adr-0015)) and authenticates principals via the `auth` port ([ADR-0008](#adr-0008)/[ADR-0038](#adr-0038)); the dev bypass should ride that machinery, not a bespoke flag.

### Decision
**Dev auth is a contract-satisfied fixture, not a disabled check.**
1. The `auth` port carries a **consumer-driven contract** describing the principal/claims the app expects (subject, roles, tenancy, scopes). It is the same contract the app declares for prod.
2. In **`hobo dev`**, the runtime satisfies that contract with a **contract-asserted dev principal** — a fixture identity generated to match the contract — instead of calling a real IdP. Auth still "runs"; it's just fulfilled by the contract fixture. The developer can override claims per-request/session (e.g. assume a role/tenant) within what the contract allows, making role/tenancy testing first-class.
3. **The same contract is enforced at `can-deploy`** ([ADR-0015](04-governance-verification.md#adr-0015)): a real IdP/Camp must satisfy the identical `auth` contract, so dev and prod are **contract-equivalent** — the bypass cannot drift from production semantics.
4. **Deny-by-default still holds** ([ADR-0069](01-architecture-core.md#adr-0069)): the dev principal only obtains the capabilities granted by `.allow()`/links. Bypassing *authentication* never bypasses *authorization*.

### Alternatives considered
- **A global `AUTH_DISABLED` flag.** Rejected: runs a code path that never ships, and gives no guarantee dev matches prod claims/roles.
- **Hand-mocked IdP per test.** Rejected: bespoke per project/test, no shared contract, drifts as the app's claim needs change.
- **Always require a real IdP in dev.** Rejected: slow, online-only, and hostile to the inner loop and air-gapped dev.

### Consequences
- **(+)** Fast, offline inner loop that is still **faithful to prod** because the dev identity is defined by the same contract that gates deploys; role/claim testing is built in.
- **(+)** No new mechanism — reuses the contract plane + `auth` port; the four-lens taxonomy now also defines the dev identity.
- **(−)** Requires the app to declare an `auth` contract (lint-enforced like other contracts); apps with no declared auth contract get a minimal default dev principal and a `hobo doctor` nudge.

## ADR-0074
**Organizational governance: RBAC + mandatory guardrails over HoBo's own control-plane surface.**

- **Origin:** the ask — enterprises must be able to **lock down** cloud capabilities, policy config, and resource access **not only on deployed infra (which HoBo already governs) but on HoBo itself**: who may register a provider, change policy, set the Dispatcher objective, run the Forge, approve a deploy, read the audit log. Designed via brainstorming; decisions: governance **attaches to the existing Yard/Junction scopes** (no new scope noun) and org guardrails are **per-rule `mandatory | default`, defaulting to mandatory**.

### Context
HoBo's policy plane ([Plan 29](../contracts-policy-flags.md#plan-29)) is already the universal decision engine: `request = { subject{kind,id,roles?,scopes?,delegatedBy?}, action, resource, phase, context } → { effect, obligations }`, deny-by-default, signed/versioned **policy packs**, every decision an event. It already governs *deploy/runtime* actions and already carries `subject.roles` + phases spanning `author→plan→apply→runtime`. What was missing for enterprise governance: (1) HoBo's **own control-plane operations** (register a provider, edit a Resource Definition, change a policy pack, set the Dispatcher objective, run the Forge, approve a Delta, read the audit log, manage roles) were not declared as **first-class policy subjects/resources**, so they couldn't be uniformly locked down; (2) there was no **org-level RBAC** or **mandatory hierarchical guardrail** model — [ADR-0019](08-scope-and-requirements.md#adr-0019) deferred the org/multi-tenant-operator surface, and [ADR-0023](#adr-0023) covered confused-deputy default-deny + per-tenant limits but not org administration. This is platform governance (what enterprises require of any control plane), **not** an app-business/SaaS function — the [ADR-0064](08-scope-and-requirements.md#adr-0064) cut (no billing/monetization) is unaffected; the *hosted-operator-as-a-business* stays out, the governance *mechanism* comes in.

### Decision
1. **HoBo's own control-plane operations are first-class policy subjects/resources.** A `hobo:*` **admin action/resource taxonomy** makes every control-plane action a governed, deny-by-default, event-sourced policy decision — the same engine as deploys, at the `author/plan/apply/...` phases. The set: register/deprecate a provider · author/edit a **Resource Definition** / install a **Resource Pack** or **listing** · change a **policy pack** · set the **Dispatcher objective** / register a **runner·build-machine·artifact-repo·IdP** adapter ([ADR-0071](05-config-matching-environments.md#adr-0071)/[ADR-0073](07-portability-extensibility.md#adr-0073)) · open/approve/promote a **Delta** · run the **Forge** · configure a **Yard/Camp/Junction** · **read the event log / audit / secrets-broker** · manage **roles/guardrails** themselves. "Govern the deployed cloud" and "govern HoBo" are the same policy plane over two resource namespaces.
2. **Governance attaches to the existing Yard & Junction scopes — no new scope noun.** RBAC roles, SSO/SCIM org identity, and guardrail policy packs are carried by the **Yard** (single-provider estate) and the **Junction** (cross-cloud estate). Org-wide rules that span Junctions are **shared signed guardrail packs**, distributed by the **Junction's existing "federates signed policy packs"** mechanism ([ADR-0043](07-portability-extensibility.md#adr-0043)) — so a multi-Junction org stays consistent without a new top-level scope (honoring [ADR-0026](01-architecture-core.md#adr-0026)/[ADR-0028](05-config-matching-environments.md#adr-0028)'s resistance to extra scope nouns). "The org" is realized as the governance config a Yard/Junction carries, not a fifth deploy noun.
3. **RBAC binds principals to roles that populate `subject.roles`.** Built-in roles — **Org-Admin · Security/Policy-Admin · Platform-Engineer · Deployer · Operator-Supervisor · Auditor (read-only)** — plus **custom roles** composed from the action taxonomy (1). Roles bind to principals via **SSO/SCIM groups** through the existing `auth` port ([ADR-0038](#adr-0038)/[ADR-0073](07-portability-extensibility.md#adr-0073)); the resolved roles populate the policy `subject.roles` already in the model. **Operator Agents (the Crew) are principals under the same RBAC** ([Plan 40](../operators-sre.md#plan-40)) — an operator can never exceed its assigned role.
4. **Guardrails are per-rule `mandatory | default`, defaulting to mandatory.** An org guardrail (a signed policy pack at the Yard/Junction) declares each rule's enforcement: **`mandatory`** = a **hard deny-ceiling** — a lower scope (Yard→Camp→Bindle) may only **further restrict, never widen** what a higher scope denies (the AWS-SCP property, enforced by deny-by-default + policy composition: a higher-scope deny can't be overridden below); **`default`** = an **overridable recommendation**. Org guardrails default to `mandatory`, giving full lockdown while leaving room for soft defaults. Examples (all expressible as `mandatory`): providers only from an allow-list, prod only in approved regions, **no `.with()` escape hatches in prod**, no external-egress integration ports, agents capped at `$N`, air-gap mode can't be disabled, **2-person approval** for policy-pack changes.
5. **Separation of duties via approval obligations; org-scoped, event-sourced audit.** Sensitive control-plane actions carry **approval obligations** ([Plan 29](../contracts-policy-flags.md#plan-29) — the durable obligation mechanism), with the org setting which role approves (e.g. a Platform-Engineer's policy change needs Security-Admin approval). Every control-plane decision is a `policy.Decided` event; role/guardrail/membership changes ride the existing policy-pack + `identity.*`/`token.*` families — **no new event families** — and the **OCSF audit export** ([ADR-0046](04-governance-verification.md#adr-0046)) feeds the org's GRC tooling. Audit is org-scoped and (per [ADR-0023](#adr-0023)) retained + never compacted.

### Alternatives considered
- **A new top-level `Org` scope noun above Junction.** Considered (the AWS-Organizations analog) but **rejected** for the no-extra-scope-noun discipline ([ADR-0026](01-architecture-core.md#adr-0026)/[ADR-0028](05-config-matching-environments.md#adr-0028)): the Yard/Junction already are the broadest scopes, and the Junction already federates signed policy packs ([ADR-0043](07-portability-extensibility.md#adr-0043)), so org-wide rules ride that rather than a fifth noun.
- **All guardrails mandatory (pure SCP, no overridable defaults).** Rejected: orgs legitimately want some rules as hard ceilings and others as overridable defaults (matching Azure Policy `Deny` vs `Audit` / GCP enforced vs dry-run); per-rule `mandatory|default` (defaulting mandatory) subsumes pure-SCP without losing flexibility.
- **A separate admin-authz system distinct from the policy plane.** Rejected: duplicates the decision engine, audit, and `.allow()`/deny-by-default; governing HoBo's surface is *the same* policy plane over a `hobo:*` resource namespace.
- **Leave control-plane authz implicit (rely on deploy-time gates only).** Rejected: that governs *what's deployed* but not *who may change HoBo* — exactly the lockdown gap enterprises name; control-plane actions must be explicit policy subjects.
- **Build org governance only in a hosted SaaS tier.** Rejected: it is OSS-core platform governance (self-host = hosted), not a monetized feature ([ADR-0064](08-scope-and-requirements.md#adr-0064)); the hosted-operator *business* stays cut, the mechanism ships in core.

### Consequences
- **(+)** Orgs can lock down **HoBo itself**, not just the infra: who registers providers, changes policy, runs the Forge, sets cost routing, approves deploys, or reads audit — each a deny-by-default, role-gated, audited decision, with mandatory guardrails a lower scope can't widen.
- **(+)** Reuses the policy plane + `subject.roles` + signed packs + obligations ([Plan 29](../contracts-policy-flags.md#plan-29)), the `auth` port for SSO/SCIM ([ADR-0038](#adr-0038)/[ADR-0073](07-portability-extensibility.md#adr-0073)), the Junction's pack federation ([ADR-0043](07-portability-extensibility.md#adr-0043)), the event log + OCSF export ([ADR-0046](04-governance-verification.md#adr-0046)), and the Crew-as-principals ([Plan 40](../operators-sre.md#plan-40)) — net-new is the `hobo:*` admin action/resource taxonomy + the RBAC role model + the per-rule guardrail enforcement flag. **No new scope noun, no new event families.**
- **(+)** Resolves the [ADR-0019](08-scope-and-requirements.md#adr-0019) org-model deferral (the governance mechanism) while keeping the [ADR-0064](08-scope-and-requirements.md#adr-0064) business-scope cut intact.
- **(−)** The `hobo:*` admin taxonomy is a new maintained surface (every control-plane action needs an action id + default role mapping) and must stay complete or an ungoverned action is a hole — `hobo doctor`/conformance should assert coverage.
- **(−)** Mandatory guardrails can over-restrict and block legitimate work if mis-authored; the `default` enforcement + a gated **waiver** path ([Plan 29](../contracts-policy-flags.md#plan-29) `policy.WaiverRequested/Approved`) are the escape valve, themselves audited.
- **(−)** SSO/SCIM org onboarding depends on the registered IdP adapter ([ADR-0073](07-portability-extensibility.md#adr-0073)); the thin dev built-in covers local/dev, but production org identity needs a real IdP (WorkOS/Entra/etc.).
