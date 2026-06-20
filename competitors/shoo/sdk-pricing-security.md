# shoo.dev — SDK, Pricing & Security

> Part of the [shoo.dev competitor reference](./README.md). API surface, model, and threat model.

## Packages
- **`@shoojs/auth`** — framework-agnostic vanilla JS client.
- **`@shoojs/react`** — React hook + the Convex integration ([convex-integration.md](./convex-integration.md)).
- **Script tag** — `<script src="https://shoo.dev/shoo.js"></script>` (no bundler).

```bash
bun add @shoojs/react   # or: npm install @shoojs/react
```

## React API
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

## Vanilla JS API (`window.Shoo`)
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

## Environment variables (server verification / Convex)
```
SHOO_BASE_URL = "https://shoo.dev"
SHOO_ISSUER   = "https://shoo.dev"
APP_ORIGIN    = "http://localhost:3000"   # or your production domain
VITE_CONVEX_URL = "https://…"             # Convex integration
```

## Pricing & hosting
- **Free forever; no sign-up required.** No paid tiers documented.
- **Open source** — repo "coming soon".
- **SaaS-only** — hosted at `https://shoo.dev`; **no self-host** documented.
- Status: **"SUPER EARLY WIP — USE AT YOUR OWN RISK."** Support: `support@ping.gg`.

## Threat model — defends against
- **Auth-code interception** — PKCE S256.
- **Cross-site tracking** — domain-scoped `pairwise_sub`.
- **Token forgery/tampering** — ES256 signature verification.
- **Replay** — `exp` + unique JWT id.
- **Unauthorized cross-origin use** — server-side `aud` check.

Privacy: *"Shoo does not sell personal information."* Optional PII only with per-origin consent; codes/nonces expire and are deleted; users manage data at `/me`.

## Limitations
- Pre-release ("use at your own risk"); some API/SDK/security doc pages 404.
- **Google-only** (no GitHub/Discord/etc.); **no email/password / magic links**.
- **No self-host**; depends on shoo's service + Google.
- Narrow scope — an auth *broker*, not an identity platform (no user store/RBAC/orgs/MFA).
- Only the **Convex** backend integration is documented (no Supabase/Firebase guides).
