# shoo.dev — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026, from docs.shoo.dev / shoo.dev). The HoBo↔shoo parity tracker is in [`hobo-mapping.md`](./hobo-mapping.md).
>
> Files: [how-it-works.md](./how-it-works.md) · [server-verification.md](./server-verification.md) · [convex-integration.md](./convex-integration.md) · [sdk-pricing-security.md](./sdk-pricing-security.md) · [hobo-mapping.md](./hobo-mapping.md)

## What it is
**shoo.dev** is a **minimal auth broker for Google sign-in** — *"AUTH IN 2LOC"* (auth in two lines of code). It removes the usual Google-OAuth friction (dashboard registration, client config, client-side secret handling) by **auto-deriving the OAuth `client_id` from your app's origin** and enforcing **PKCE (S256) on every flow**. It hands your app a standards-based, **ES256-signed JWT** that any backend can verify with plain JWKS — no proprietary SDK required server-side.

- **Category:** zero-config OAuth2 / Google-Sign-In broker (an alternative to standing up your own Google OAuth client, or to Auth0/Clerk/Firebase Auth for the narrow "just let users sign in with Google" case).
- **Status (verbatim):** "SUPER EARLY WIP — USE AT YOUR OWN RISK" (repeated in the docs).
- **Model:** **free forever, no sign-up required**; open source ("GitHub coming soon"); SaaS-hosted at `https://shoo.dev` (no self-host documented). Support: `support@ping.gg`.

## The three-party model
```
Your App (browser)  ──@shoojs/auth | @shoojs/react──►  shoo.dev service  ──OAuth──►  Google
   ▲  signed id_token (ES256 JWT)                         │  derives pairwise_sub,
   └─────────────────────────────────────────────────────┘  signs id_token

Your server  ──verify(id_token) against shoo's JWKS──►  trust the pairwise_sub
```
- **Your app** runs `@shoojs/auth` (vanilla) or `@shoojs/react`; starts sign-in, receives a signed `id_token`.
- **shoo** is the OAuth intermediary to Google; it derives a privacy-preserving identifier and signs the token.
- **Google** is the underlying identity provider.
- **Your server** must verify the token before trusting it (the browser is untrusted) — see [server-verification.md](./server-verification.md).

## At a glance
| Dimension | shoo.dev |
|---|---|
| Category | Zero-config Google-sign-in auth broker |
| Auth flow | OAuth 2.0 + **PKCE (S256 mandatory)** |
| Token | **ES256** JWT (`id_token`), verified via JWKS |
| Identity | **domain-scoped `pairwise_sub`** (no cross-site tracking) |
| Config | **auto-registered** `client_id` from origin; no dashboard |
| SDKs | `@shoojs/auth` (vanilla), `@shoojs/react`, `<script src="https://shoo.dev/shoo.js">` |
| Backends | standards-based (any JWKS verifier); **Convex** integration first-class |
| Pricing / hosting | Free; SaaS-only; OSS pending |
| Maturity | "super early WIP" |

## Known gaps (and what they imply)
- **Google-only** — no other providers, no email/password, no magic links.
- **SaaS-only** — no self-host; depends entirely on shoo's service + Google.
- **Pre-release** — explicit "use at your own risk"; sparse API/security docs (some pages 404).
- **Narrow** — an auth *broker*, not an identity platform (no user store, RBAC, orgs, MFA management).

See [hobo-mapping.md](./hobo-mapping.md) for how shoo's ideas map onto HoBo's identity/agent-auth model.
