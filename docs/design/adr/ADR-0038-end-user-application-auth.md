# ADR-0038 — End-user / application auth

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 36 — End-user auth](../36-end-user-auth.md) · [Plan 6 — AI-native & agent auth](../06-ai-native-agent-auth.md) (SVID/OIDC/JWKS, token broker, OBO) · [Plan 31](../31-config-secretless-secrets.md) (secretless) · [Plan 30 — Policy plane](../30-policy-plane.md) (authz) · [Plan 21](../21-resources-catalog.md) (`.allow()`) · [Plan 11](../11-event-model.md) (`actor: PrincipalRef`, events) · [Plan 32](../32-reactive-live-queries.md) (reactive re-eval) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md) (typed client) · [ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md) (offline built-in) · [competitors/shoo](../../../competitors/shoo/README.md) / [convex](../../../competitors/convex/integrations-ops.md) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G8)
- **Origin:** a competitive re-survey (after closing G1–G7) found `auth()` listed as a SaaS primitive but **only agent/workload auth specified** — no end-user/app-user story, while shoo / Convex Auth / Clerk / Auth0 ship it first-class (the same listed-but-unspecified shape as the search gap). Designed via brainstorming + grill-with-docs.

## Context
[Plan 6](../06-ai-native-agent-auth.md) is a deep treatment of **agent/workload** auth (SVIDs, the token broker, Hobo Code, OBO). But an app deployed on HoBo needs to authenticate its **end users** (humans), and `auth()` ([Plan 2](../02-sdk-api.md) §53) had no specification: sign-in, sessions, JWT/JWKS verification, IdP integration. HoBo already has the substrate — it issues + verifies OIDC/JWTs via JWKS for agents, is secretless-first, has a policy plane + `.allow()` for authorization, and the event envelope's `actor: PrincipalRef` already admits a `user`. The decision is how to assemble end-user auth from that substrate without reinventing a full identity provider.

## Decision
1. **`auth()` is a federation + verification port (`hobo:auth`), not a homegrown IdP.** It verifies OIDC/JWT from any provider — Google / GitHub / Clerk / Auth0 / **custom JWT** (the shoo/Convex-`customJwt` pattern) — reusing HoBo's existing **OIDC + JWKS + secretless** machinery. A **thin optional built-in** (passkey / email magic-link) covers zero-config dev and runs offline/air-gap ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)). HoBo does **not** build a full hosted IdP in v1.
2. **Unified principal model.** An end-user is a **`PrincipalRef`** (the event `actor` already admits `user`), exposed as **`ctx.user`** alongside `ctx.identity` (SVID). **Authorization is the same policy plane** ([Plan 30](../30-policy-plane.md)) **+ `.allow()`-style declarative rules** keyed on user claims (record-level), and **audit rides the existing event `actor`** ([Plan 11](../11-event-model.md)). One identity/authz/audit path for users + agents + services; agent **OBO** ([Plan 6](../06-ai-native-agent-auth.md)) carries the same user principal.
3. **Stateless JWKS verify per request + optional event-sourced sessions.** JWTs are verified via JWKS on each request (edge-friendly, matches `customJwt`); optional **`session.*`** records provide revocation / "sign out everywhere" + audit, and reactive queries ([Plan 32](../32-reactive-live-queries.md)) re-evaluate on auth-state change.
4. **Surface:** client `useAuth()`/`signIn()`/`signOut()` (peer to `useQuery()`); server `ctx.user` (typed verified claims). **Events:** `user.Authenticated` · `session.Started/Refreshed/Revoked` (authz decisions ride `policy.Decided`).

## Alternatives considered
- **Build a full first-class IdP** (accounts/passwords/passkeys/MFA, Convex-Auth-built-in style). Rejected for v1: auth is a deep, security-critical domain to own + maintain forever; federation + verification covers the need while reusing existing machinery. (The thin built-in is the dev/zero-config concession; it may grow later — an iteration hook.)
- **BYO auth only (`auth()` stays a hollow pass-through).** Rejected: abdicates the gap and makes a listed first-class primitive meaningless.
- **A separate end-user auth subsystem distinct from the principal model.** Rejected: duplicates identity/authz/audit, breaks the unified audit trail, and gives developers two authorization mechanisms; the `PrincipalRef`/policy-plane reuse is the coherent HoBo answer.
- **Server-side sessions only / pure stateless JWT with no sessions.** Rejected (both extremes): the former is stateful + a hot-path bottleneck against the edge/event-sourced grain; the latter has no pre-expiry revocation. Stateless verify + event-sourced sessions for revocation balances both.

## Consequences
- **(+)** Closes G8: HoBo apps get real end-user auth (sign-in/sessions/verification/IdP integration) that a Convex/shoo audience expects — reusing OIDC/JWKS, the policy plane, `.allow()`, and the event audit rather than new machinery.
- **(+)** The unified `PrincipalRef` model keeps "everything is a principal" coherent: users, agents, and services share one authz + audit path, and OBO chains (user → agent → resource) are one identity story.
- **(+)** Stateless JWKS verify is edge-friendly; the thin built-in works offline/air-gap; the typed `useAuth()`/`ctx.user` surface flows through codegen ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)).
- **(−)** Federation-first means HoBo depends on external IdPs for production-grade user management (the thin built-in is dev-grade); orgs needing a fully self-contained IdP must wait for the deferred build-out.
- **(−)** Record-level authorization expressed via policy/`.allow()` on user claims is powerful but adds modeling surface; conventions for claims→roles/tenancy are an iteration hook.
