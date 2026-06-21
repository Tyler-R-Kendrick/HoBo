# shoo.dev — How It Works

> Part of the [shoo.dev competitor reference](./README.md). The end-to-end mechanism. Source: `docs.shoo.dev/docs/how-it-works` — excerpts quoted for analysis (see the [fair-use note](./README.md#sources--fair-use)).

## Core idea
The browser auth flow gives the user a signed `id_token` (ES256 JWT). shoo is the OAuth intermediary between your app and Google; it **auto-registers** your app from its origin and enforces **PKCE (S256)** on every flow. *"The browser auth flow gives the user a signed `id_token`, but the browser is an untrusted environment"* — so production apps must verify server-side ([server-verification.md](./server-verification.md)).

## The 7-step flow
1. **Client initiates** — your app calls `startSignIn()`, which generates a PKCE bundle: a 64-char random **`code_verifier`** kept in `sessionStorage`, and its SHA-256 **`code_challenge`** sent on the redirect to shoo's `/authorize`.
2. **shoo → Google** — using the **auto-derived `client_id`** (from your origin), shoo requests authentication from Google.
3. **User authenticates** — Google verifies credentials and redirects back to shoo with an authorization code.
4. **shoo derives identity** — exchanges Google's code for identity data and computes a **domain-scoped, stable user identifier** (`pairwise_sub`).
5. **Token signing** — shoo signs the `id_token` with **ES256** and returns it (with an authorization code) to the client.
6. **Client verifies & stores** — the app verifies the token signature against shoo's public keys (`/.well-known/jwks.json`) and stores identity locally.
7. **Session management** — apps should periodically validate via `POST /session/check`, which reports active status or revocation/expiry.

## Auto-registration (zero config)
The `client_id` is derived from the app origin:
```js
"origin:" + new URL(redirect_uri).origin
```
*"First `/authorize` request from a new origin auto-registers the client"* — no dashboard step.

## PKCE (mandatory S256)
*"Shoo enforces S256 (SHA-256) challenges on every flow. There is no 'plain' challenge option."* PKCE prevents authorization-code interception, which is critical for browser-based apps. Components: the random verifier, its SHA-256 challenge, and verification at token exchange.

## Domain-scoped `pairwise_sub`
A privacy-preserving, per-origin stable identifier:
```
pairwise_sub = HMAC-SHA256(server_secret, google_sub + client_id)
```
- Format: begins with `ps_` followed by base64url.
- Same user → consistent ID **per origin**, but **different IDs across apps** → no cross-site tracking, while remaining stable for a given app.

## Token structure (ES256)
- Algorithm: **ES256** (ECDSA P-256).
- Required claims: `iss` (issuer, `https://shoo.dev`), `aud` (audience, `origin:{your_app_origin}`), `sub`/`pairwise_sub`, expiration, unique JWT ID.
- Optional **PII** claims: `email`, `name`, `picture` — only present when the user grants per-origin consent (request via `startSignIn({ requestPii: true })`).

## Endpoints
- `https://shoo.dev/authorize` — start the OAuth flow (PKCE/state auto-applied by the SDK).
- `https://shoo.dev/.well-known/jwks.json` — ES256 public keys (auto key rotation).
- `https://shoo.dev/.well-known/openid-configuration` — OIDC discovery metadata.
- `POST https://shoo.dev/session/check` — session validity / revocation check.
- `https://shoo.dev/me` — user dashboard (sign out / delete account data).
