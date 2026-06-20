# Convex — Functions

> Part of the [Convex reference](./README.md). Queries, mutations, actions, internal functions, HTTP actions, validators, runtimes, errors. Functions are defined with builders from [`convex/_generated/server`](./generated-code.md).

## Three function kinds
| Kind | Reads DB | Writes DB | External calls | Reactive/cached | Transactional |
|---|---|---|---|---|---|
| **query** | ✅ | ✗ | ✗ | ✅ (subscribable) | ✅ (read txn) |
| **mutation** | ✅ | ✅ | ✗ | ✗ | ✅ (atomic) |
| **action** | via `runQuery`/`runMutation` | via `runMutation` | ✅ (`fetch`) | ✗ | ✗ |

- **Queries** are **deterministic** and **reactive** — auto-cached, auto-subscribed; re-run + pushed when their read-set changes.
- **Mutations** are **transactions** (OCC, all-or-nothing); no external calls.
- **Actions** are "normal serverless functions" for side effects (OpenAI/Stripe/Twilio…); no direct DB, no caching/reactivity, not auto-retried. Keep them small; coordinate via the scheduler.

```typescript
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";

export const listChannel = query({
  args: { channel: v.id("channels") },
  returns: v.array(v.object({ _id: v.id("messages"), body: v.string() })),
  handler: async (ctx, args) =>
    ctx.db.query("messages").withIndex("by_channel", q => q.eq("channel", args.channel)).collect(),
});

export const send = mutation({
  args: { channel: v.id("channels"), body: v.string() },
  handler: async (ctx, args) => { await ctx.db.insert("messages", args); },
});

export const summarize = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const res = await fetch("https://api.openai.com/…", { /* … */ });
    const summary = (await res.json()).summary;
    await ctx.runMutation(internal.messages.saveSummary, { summary });
  },
});
```

## Internal functions
`internalQuery` / `internalMutation` / `internalAction` — callable only from other functions (actions, HTTP actions, scheduled/cron jobs, dashboard, CLI), never directly from clients. Use them to shrink public surface area (e.g. charge a card in a public action, then call an `internalMutation` to update the user's plan).

## HTTP actions (`convex/http.ts`)
Build an HTTP API at `https://<deployment>.convex.site`:
```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();
http.route({
  path: "/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    await ctx.runMutation(internal.events.record, { body });
    return new Response(null, { status: 200 });
  }),
});
export default http;
```
`path` (exact) or `pathPrefix` (dynamic); standard `Request`→`Response`; call `ctx.runQuery/runMutation/runAction`. No built-in body validation (parse manually). Good for webhooks.

## Validators
Each function takes `{ args, handler, returns? }`. `args`/`returns` use the `v.*` validators (see [database.md](./database.md)); args are typed automatically and **extra properties are rejected**. Return validators enforce the output shape.

## `ctx` surface
- **`QueryCtx`** — `db` (read), `auth`, `storage` (read).
- **`MutationCtx`** — `db` (read/write), `auth`, `storage`, `scheduler`, `vectorSearch`.
- **`ActionCtx`** — `runQuery` / `runMutation` / `runAction`, `auth`, `scheduler`, `storage`, `vectorSearch` (no direct `db`).
- `ctx.auth.getUserIdentity()` → the verified caller identity or null ([auth](./integrations-ops.md)).

## Runtimes
- **Convex runtime** (default) — V8-based, Cloudflare-Workers-like, **no cold starts**, web-standard globals (`fetch`, `Blob`, Web Crypto, Web Streams), limited Node APIs (`process.env`). All queries/mutations run here and must be deterministic.
- **Node.js runtime** — opt in with `"use node";` at the top of a file; **actions only**; full npm/Node libs; Node 20/22/24; 5 MiB arg limit (vs 16 MiB); may cold-start.

## Error handling
Categories: **application** (`throw new ConvexError(data)` for expected failures — custom data survives to prod), **developer** (bugs), **read/write limit**, **internal** (auto-retried). Query errors throw from `useQuery` (use a React error boundary); retrying is pointless (deterministic). Mutation rejections roll back optimistic updates. Actions aren't auto-retried — caller handles retries. Dev shows full messages/stacks; prod shows only the function name + generic "Server Error" (except `ConvexError` data).
