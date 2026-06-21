# shoo.dev — Server Verification

> Part of the [shoo.dev competitor reference](./README.md). Source: `docs.shoo.dev/docs/server-verification` — excerpts quoted for analysis (see the [fair-use note](./README.md#sources--fair-use)). **Required for production.**

## Why
*"The browser auth flow gives the user a signed `id_token`, but the browser is an untrusted environment."* You must verify tokens server-side before authorizing users. *"Always verify the signature, issuer, audience, and expiration on your server."*

## What is verified
1. **Issuer** (`iss`) — must equal `https://shoo.dev`.
2. **Audience** (`aud`) — must equal `origin:{your_app_origin}` (the token targets *your* app).
3. **Expiration** (`exp`) — must be a future timestamp.
4. **Signature** — valid **ES256** against shoo's published JWKS keys.
5. **`pairwise_sub`** — must exist as a string (your stable user id).

Guarantees: blocks forged/tampered tokens, replay (via `exp` + unique JWT id), and use at an unintended origin (audience check). Key rotation is automatic at `/.well-known/jwks.json`.

## Verification function (`jose`)
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

## Next.js API route (quoted from the docs)
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

## Client → server hand-off
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
