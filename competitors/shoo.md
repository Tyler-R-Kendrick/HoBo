# shoo.dev — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026, from docs.shoo.dev / shoo.dev). The HoBo↔shoo parity tracker is in [`hobo-mapping.md`](#hobo-mapping).
>
> Files: [how-it-works.md](#how-it-works) · [server-verification.md](#server-verification) · [convex-integration.md](#convex-integration) · [sdk-pricing-security.md](#sdk-pricing-security) · [hobo-mapping.md](#hobo-mapping)

## What it is
**shoo.dev** is a **minimal auth broker for Google sign-in** — *"AUTH IN 2LOC"* (auth in two lines of code). It removes the usual Google-OAuth friction (dashboard registration, client config, client-side secret handling) by **auto-deriving the OAuth `client_id` from your app's origin** and enforcing **PKCE (S256) on every flow**. It hands your app a standards-based, **ES256-signed JWT** that any backend can verify with plain JWKS — no proprietary SDK required server-side.

- **Category:** zero-config OAuth2 / Google-Sign-In broker (an alternative to standing up your own Google OAuth client, or to Auth0/Clerk/Firebase Auth for the narrow "just let users sign in with Google" case).
- **Status (quoted from the docs):** "SUPER EARLY WIP — USE AT YOUR OWN RISK" (repeated in the docs).
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
- **Your server** must verify the token before trusting it (the browser is untrusted) — see [server-verification.md](#server-verification).

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

See [hobo-mapping.md](#hobo-mapping) for how shoo's ideas map onto HoBo's identity/agent-auth model.

## Sources & fair use
These files are **competitive-research notes**, not redistribution of shoo.dev's documentation. Source: **`docs.shoo.dev` / `shoo.dev`** (captured 2026). Only **short excerpts are quoted** — shown in quotation marks with attribution — for **commentary, analysis, and parity comparison** (fair use); all rights in the quoted material remain with shoo.dev. Where a passage was paraphrased it is HoBo's own summary. No license over shoo's content is claimed or implied; follow the source links for the authoritative, current text. If a rights-holder objects to any excerpt, we will revise or remove it.

## convex-integration

**shoo.dev — Convex Integration**

> Part of the [shoo.dev competitor reference](shoo.md). Source: `docs.shoo.dev/docs/convex` — excerpts quoted for analysis (see the [fair-use note](shoo.md#sources--fair-use)). (See the [Convex reference](convex.md) for the backend side — shoo plugs into Convex's **customJwt** auth provider.)

### What it adds
`@shoojs/react` provides **`createShooConvexAuth`**, which lets you authenticate Convex queries and mutations with shoo. It returns:
- **`useAuth`** — manages auth state + token exchange for Convex; yields `isLoading`, `isAuthenticated`, `fetchAccessToken`.
- **`signIn`** — starts the shoo flow.
- **`signOut`** — clears identity and reloads.

### Setup
```bash
bun add @shoojs/react
```

**1) Tell Convex to trust shoo's tokens** — `convex/auth.config.ts`:
```typescript
export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://shoo.dev",
      jwks: "https://shoo.dev/.well-known/jwks.json",
      algorithm: "ES256",
    },
  ],
};
```
> Optional audience validation: add `applicationID: "origin:https://your-app-origin"`.

**2) Create the shoo auth module** — `src/shoo.ts`:
```typescript
import { createShooConvexAuth } from "@shoojs/react";

export const { useAuth, signIn, signOut } = createShooConvexAuth({
  callbackPath: "/shoo/callback",
});
```

**3) Wire it into the Convex provider** — `src/main.tsx`:
```typescript
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuth } from "./shoo";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function Root() {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <App />
    </ConvexProviderWithAuth>
  );
}
```

**4) Sign-in / sign-out:**
```typescript
import { signIn, signOut } from "./shoo";

function AuthButtons() {
  return (
    <div>
      <button onClick={() => signIn()}>Sign in</button>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
```

**5) Read identity inside a Convex function** — `convex/users.ts`:
```typescript
import { query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      userId: identity.subject,
      email: identity.email ?? null,
      name: identity.name ?? null,
    };
  },
});
```

### Note (quoted from the docs)
*"Always verify Shoo id_tokens on your server before trusting identity claims."* With Convex this is handled by the `customJwt` provider config + Convex's token validation — the JWKS/issuer/algorithm are checked backend-side, and `ctx.auth.getUserIdentity()` only returns a verified identity.

## how-it-works

**shoo.dev — How It Works**

> Part of the [shoo.dev competitor reference](shoo.md). The end-to-end mechanism. Source: `docs.shoo.dev/docs/how-it-works` — excerpts quoted for analysis (see the [fair-use note](shoo.md#sources--fair-use)).

### Core idea
The browser auth flow gives the user a signed `id_token` (ES256 JWT). shoo is the OAuth intermediary between your app and Google; it **auto-registers** your app from its origin and enforces **PKCE (S256)** on every flow. *"The browser auth flow gives the user a signed `id_token`, but the browser is an untrusted environment"* — so production apps must verify server-side ([server-verification.md](#server-verification)).

### The 7-step flow
1. **Client initiates** — your app calls `startSignIn()`, which generates a PKCE bundle: a 64-char random **`code_verifier`** kept in `sessionStorage`, and its SHA-256 **`code_challenge`** sent on the redirect to shoo's `/authorize`.
2. **shoo → Google** — using the **auto-derived `client_id`** (from your origin), shoo requests authentication from Google.
3. **User authenticates** — Google verifies credentials and redirects back to shoo with an authorization code.
4. **shoo derives identity** — exchanges Google's code for identity data and computes a **domain-scoped, stable user identifier** (`pairwise_sub`).
5. **Token signing** — shoo signs the `id_token` with **ES256** and returns it (with an authorization code) to the client.
6. **Client verifies & stores** — the app verifies the token signature against shoo's public keys (`/.well-known/jwks.json`) and stores identity locally.
7. **Session management** — apps should periodically validate via `POST /session/check`, which reports active status or revocation/expiry.

### Auto-registration (zero config)
The `client_id` is derived from the app origin:
```js
"origin:" + new URL(redirect_uri).origin
```
*"First `/authorize` request from a new origin auto-registers the client"* — no dashboard step.

### PKCE (mandatory S256)
*"Shoo enforces S256 (SHA-256) challenges on every flow. There is no 'plain' challenge option."* PKCE prevents authorization-code interception, which is critical for browser-based apps. Components: the random verifier, its SHA-256 challenge, and verification at token exchange.

### Domain-scoped `pairwise_sub`
A privacy-preserving, per-origin stable identifier:
```
pairwise_sub = HMAC-SHA256(server_secret, google_sub + client_id)
```
- Format: begins with `ps_` followed by base64url.
- Same user → consistent ID **per origin**, but **different IDs across apps** → no cross-site tracking, while remaining stable for a given app.

### Token structure (ES256)
- Algorithm: **ES256** (ECDSA P-256).
- Required claims: `iss` (issuer, `https://shoo.dev`), `aud` (audience, `origin:{your_app_origin}`), `sub`/`pairwise_sub`, expiration, unique JWT ID.
- Optional **PII** claims: `email`, `name`, `picture` — only present when the user grants per-origin consent (request via `startSignIn({ requestPii: true })`).

### Endpoints
- `https://shoo.dev/authorize` — start the OAuth flow (PKCE/state auto-applied by the SDK).
- `https://shoo.dev/.well-known/jwks.json` — ES256 public keys (auto key rotation).
- `https://shoo.dev/.well-known/openid-configuration` — OIDC discovery metadata.
- `POST https://shoo.dev/session/check` — session validity / revocation check.
- `https://shoo.dev/me` — user dashboard (sign out / delete account data).

## sdk-pricing-security

**shoo.dev — SDK, Pricing & Security**

> Part of the [shoo.dev competitor reference](shoo.md). API surface, model, and threat model.

### Packages
- **`@shoojs/auth`** — framework-agnostic vanilla JS client.
- **`@shoojs/react`** — React hook + the Convex integration ([convex-integration.md](#convex-integration)).
- **Script tag** — `<script src="https://shoo.dev/shoo.js"></script>` (no bundler).

```bash
bun add @shoojs/react   # or: npm install @shoojs/react
```

### React API
```typescript
import { useShooAuth } from "@shoojs/react";

const { identity, loading, signIn, clearIdentity } = useShooAuth();
// identity.userId  -> "ps_…" (pairwise_sub) or null
// identity.token   -> signed ES256 JWT
// loading          -> auth-state resolving
// signIn()         -> trigger flow
// clearIdentity()  -> sign out
```
Next.js callback page:
```typescript
// app/auth/callback/page.tsx
"use client";
import { useShooAuth } from "@shoojs/react";
export default function ShooCallback() {
  useShooAuth();
  return <p>Signing in…</p>;
}
```

### Vanilla JS API (`window.Shoo`)
```javascript
const identity = window.Shoo.getIdentity();           // { userId, token }
window.Shoo.startSignIn();                             // basic
window.Shoo.startSignIn({ returnTo: "/dashboard" });  // post-login redirect
window.Shoo.startSignIn({ requestPii: true });        // request email/name/picture
window.Shoo.clearIdentity();                          // sign out
```
Direct link (the SDK auto-upgrades it with PKCE + state, then handles the `/shoo/callback` exchange):
```html
<a href="https://shoo.dev/authorize?redirect_uri=https://your-app.com/shoo/callback">Sign in</a>
```

### Environment variables (server verification / Convex)
```
SHOO_BASE_URL = "https://shoo.dev"
SHOO_ISSUER   = "https://shoo.dev"
APP_ORIGIN    = "http://localhost:3000"   # or your production domain
VITE_CONVEX_URL = "https://…"             # Convex integration
```

### Pricing & hosting
- **Free forever; no sign-up required.** No paid tiers documented.
- **Open source** — repo "coming soon".
- **SaaS-only** — hosted at `https://shoo.dev`; **no self-host** documented.
- Status: **"SUPER EARLY WIP — USE AT YOUR OWN RISK."** Support: `support@ping.gg`.

### Threat model — defends against
- **Auth-code interception** — PKCE S256.
- **Cross-site tracking** — domain-scoped `pairwise_sub`.
- **Token forgery/tampering** — ES256 signature verification.
- **Replay** — `exp` + unique JWT id.
- **Unauthorized cross-origin use** — server-side `aud` check.

Privacy: *"Shoo does not sell personal information."* Optional PII only with per-origin consent; codes/nonces expire and are deleted; users manage data at `/me`.

### Limitations
- Pre-release ("use at your own risk"); some API/SDK/security doc pages 404.
- **Google-only** (no GitHub/Discord/etc.); **no email/password / magic links**.
- **No self-host**; depends on shoo's service + Google.
- Narrow scope — an auth *broker*, not an identity platform (no user store/RBAC/orgs/MFA).
- Only the **Convex** backend integration is documented (no Supabase/Firebase guides).

## server-verification

**shoo.dev — Server Verification**

> Part of the [shoo.dev competitor reference](shoo.md). Source: `docs.shoo.dev/docs/server-verification` — excerpts quoted for analysis (see the [fair-use note](shoo.md#sources--fair-use)). **Required for production.**

### Why
*"The browser auth flow gives the user a signed `id_token`, but the browser is an untrusted environment."* You must verify tokens server-side before authorizing users. *"Always verify the signature, issuer, audience, and expiration on your server."*

### What is verified
1. **Issuer** (`iss`) — must equal `https://shoo.dev`.
2. **Audience** (`aud`) — must equal `origin:{your_app_origin}` (the token targets *your* app).
3. **Expiration** (`exp`) — must be a future timestamp.
4. **Signature** — valid **ES256** against shoo's published JWKS keys.
5. **`pairwise_sub`** — must exist as a string (your stable user id).

Guarantees: blocks forged/tampered tokens, replay (via `exp` + unique JWT id), and use at an unintended origin (audience check). Key rotation is automatic at `/.well-known/jwks.json`.

### Verification function (`jose`)
```bash
bun add jose
```
```typescript
import { createRemoteJWKSet, jwtVerify } from "jose";

const SHOO_BASE_URL = "https://shoo.dev";
const SHOO_ISSUER = "https://shoo.dev";
const jwks = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", SHOO_BASE_URL),
);

export async function verifyShooToken(idToken: string, appOrigin: string) {
  const audience = `origin:${new URL(appOrigin).origin}`;
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: SHOO_ISSUER,
    audience,
  });
  if (typeof payload.pairwise_sub !== "string") {
    throw new Error("Shoo token missing pairwise_sub");
  }
  return payload;
}
```

### Next.js API route (quoted from the docs)
```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import { createRemoteJWKSet, jwtVerify } from "jose";

const SHOO_BASE_URL = process.env.SHOO_BASE_URL || "https://shoo.dev";
const SHOO_ISSUER = process.env.SHOO_ISSUER || SHOO_BASE_URL;
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";

const jwks = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", SHOO_BASE_URL),
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
  if (!idToken) return res.status(400).json({ error: "Missing idToken" });
  try {
    const audience = `origin:${new URL(APP_ORIGIN).origin}`;
    const { payload } = await jwtVerify(idToken, jwks, { issuer: SHOO_ISSUER, audience });
    if (typeof payload.pairwise_sub !== "string") {
      return res.status(401).json({ error: "Missing pairwise_sub claim" });
    }
    return res.status(200).json({ userId: payload.pairwise_sub, email: payload.email, name: payload.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return res.status(401).json({ error: message });
  }
}
```

### Client → server hand-off
```javascript
const identity = auth.identity;
if (identity.token) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: identity.token }),
  });
  const data = await res.json(); // data.userId is now server-verified
}
```

## hobo-mapping

**shoo.dev → HoBo parity & mapping tracker**

> How shoo's ideas map onto HoBo's identity/auth model. ✅ = HoBo has an equivalent · ➕ = HoBo goes further · n/a = out of HoBo's scope. HoBo design lives in [`../../docs/design/`](../docs/design/README.md). shoo is *adjacent* to HoBo (an end-user auth broker), not a head-on competitor — the interesting overlap is the identity/token model.

| shoo.dev | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Auth broker (intent: "sign-in with ~zero config") | HoBo's identity model is for **workloads + agents**, not human Google sign-in — but the "keyless, zero-config credential" goal is shared | ➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| ES256 `id_token` + JWKS verification | HoBo principals carry **SVIDs**/OIDC tokens verified the same standards-based way; brokered, short-lived | ➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06), [12](../docs/design/security-networking.md#plan-12) |
| OIDC discovery (`/.well-known/openid-configuration`, JWKS) | HoBo issues/consumes OIDC; agents are first-class **OIDC principals** | ✅ | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| Domain-scoped `pairwise_sub` (no cross-site tracking) | Tenant/audience-scoped identities; least-privilege, per-scope tokens | ✅ | [12](../docs/design/security-networking.md#plan-12) |
| Mandatory PKCE (S256) | HoBo's agent OAuth/token brokering uses PKCE + audience-scoping | ✅ | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| Mandatory server-side verification (browser untrusted) | HoBo's invariant: the control plane never trusts client claims; everything is verified + event-logged | ➕ | [12](../docs/design/security-networking.md#plan-12), [11](../docs/design/event-model.md#plan-11) |
| `customJwt`/JWKS integration into a backend (Convex) | A HoBo app could trust shoo (or any OIDC issuer) for **end-user** auth via the `secrets`/identity ports — orthogonal to HoBo's **workload** identity | ✅ | [21](../docs/design/authoring-resources-wiring.md#plan-21), [06](../docs/design/ai-native-agent-auth.md#plan-06) |

### How they relate (not competitors)
shoo answers **"how do end users sign in"** (human → Google). HoBo answers **"how do workloads and AI agents prove identity and get scoped credentials to clouds"** (machine → infra). They compose: a HoBo-deployed app could use shoo for its end-user login while HoBo handles the workload/agent identity + secret brokering underneath. shoo's design choices HoBo already shares — standards-based tokens (not proprietary SDKs), JWKS verification, PKCE, audience-scoping, mandatory server verification — are good corroboration of HoBo's [Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)/[Plan 12](../docs/design/security-networking.md#plan-12) choices, extended to agents-as-principals and event-sourced auditing.

### Where HoBo deliberately differs
- **Subject is machines/agents**, not humans — HoBo's identity exists to let workloads/agents self-provision cloud credentials with zero developer involvement.
- **Event-sourced, auditable** — every credential issuance/use is an event ([Plan 11](../docs/design/event-model.md#plan-11)); shoo is a stateless token broker.
- **Self-hostable, multi-provider** — HoBo identity isn't tied to one IdP or a single SaaS.
