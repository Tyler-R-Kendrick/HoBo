# Convex — Integrations & Operations

> Part of the [Convex reference](./README.md). Auth providers, log streams, exception reporting, the dashboard, and import/export.

## Auth providers
Convex validates tokens backend-side via `convex/auth.config.ts` and exposes the verified caller as `ctx.auth.getUserIdentity()`.
- **Convex Auth** — auth library running *on your Convex backend* (no external service): magic links/OTP, OAuth (GitHub/Google/Apple/80+), email+password (reset + optional verification), custom OIDC, custom JWT. Beta; ships no UI components. (`labs.convex.dev/auth`.)
- **Clerk** — `<ConvexProviderWithClerk>`; `auth.config.ts` `{ domain: CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }`.
- **Auth0** — `<ConvexProviderWithAuth0>`; `auth.config.ts` `{ domain, applicationID }`.
- **Custom OIDC** — any OpenID Connect issuer; `applicationID` must equal the JWT `aud` and `domain` must equal `iss`.
- **`customJwt`** — for issuers whose tokens may lack `aud`; configure `{ type: "customJwt", issuer, jwks, algorithm }`. **This is the hook [shoo.dev](../shoo/convex-integration.md) plugs into** (issuer `https://shoo.dev`, ES256, JWKS).

## Log streams (Pro)
Stream function executions, console logs, audit logs, scheduler/concurrency/storage stats to: **Axiom** (dataset + API key; auto dashboards), **Datadog** (site + API key + `ddtags`), **PostHog** (project token, OTLP), or a **custom webhook** (JSON event array; HMAC-SHA256 signature in `x-webhook-signature`, validate with constant-time compare + timestamp check).

## Exception reporting (Pro)
**Sentry** (captures function name/type/runtime/deployment/request-id/user identity), **PostHog Error Tracking** (+ stack traces), **Datadog Error Tracking** (via Sentry SDK).

## Dashboard
Function logs (timestamps + exec time), data explorer (browse/edit/filter), performance metrics (cache-hit/failure rates, scheduler lag), call-frequency graphs, health/insights (concurrency + limit hits), a Schedules page (scheduled fns + crons), and run/test functions directly. Open with `npx convex dashboard`.

## Import / export & streaming (Beta)
- **Import:** CSV/JSON into a single table via CLI; restore from a backup zip; **streaming import** via an **Airbyte** destination connector.
- **Export:** snapshot zip (dashboard or `npx convex export`); **streaming export** via **Fivetran** to a warehouse.
- CLI: `npx convex import [--table <t>] <file|zip>`, `npx convex export --path <dir|zip> [--include-file-storage] [--prod]`.

## `convex-helpers`
Companion npm package: custom functions, relationship helpers, stateful migrations, action-retry wrapper, rate limiting, sessions, row-level security, Zod validation, Hono HTTP, CRUD, query streaming + manual `paginator`, query caching, CORS for `HttpRouter`, an OpenAPI/TS-API generator, triggers, and Standard Schema support.
