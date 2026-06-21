# shoo.dev — Convex Integration

> Part of the [shoo.dev competitor reference](./README.md). Source: `docs.shoo.dev/docs/convex` — excerpts quoted for analysis (see the [fair-use note](./README.md#sources--fair-use)). (See the [Convex reference](../convex/README.md) for the backend side — shoo plugs into Convex's **customJwt** auth provider.)

## What it adds
`@shoojs/react` provides **`createShooConvexAuth`**, which lets you authenticate Convex queries and mutations with shoo. It returns:
- **`useAuth`** — manages auth state + token exchange for Convex; yields `isLoading`, `isAuthenticated`, `fetchAccessToken`.
- **`signIn`** — starts the shoo flow.
- **`signOut`** — clears identity and reloads.

## Setup
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

## Note (quoted from the docs)
*"Always verify Shoo id_tokens on your server before trusting identity claims."* With Convex this is handled by the `customJwt` provider config + Convex's token validation — the JWKS/issuer/algorithm are checked backend-side, and `ctx.auth.getUserIdentity()` only returns a verified identity.
