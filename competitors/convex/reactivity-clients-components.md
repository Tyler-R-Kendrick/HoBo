# Convex — Reactivity, Clients & Components

> Part of the [Convex reference](./README.md). The sync model, client libraries, and the Components system.

## Reactivity & consistency
The Convex DB is reactive: whenever data a query depends on changes, the query re-runs and **client subscriptions update**. Guarantees:
- **Consistent snapshots** — *"every client subscription gets updated simultaneously to the same snapshot of the database"*; you never observe a torn/partial state.
- **Automatic caching** — query results cached, invalidated on dependency change.
- Solves classic bugs (e.g. stale "in stock" counts) without manual cache or WebSocket code.

Transport: the reactive clients hold a **persistent WebSocket** for 2-way push; queries/mutations over plain HTTP are also possible (see [management-platform-api.md](./management-platform-api.md)).

## React client
```typescript
const data = useQuery(api.messages.list, { channel });   // undefined while loading; reactive after
const send = useMutation(api.messages.send);             // async fn; supports optimistic updates + retries
const run  = useAction(api.ai.summarize);                // async fn; no auto-retry/optimistic
await send({ channel, body: "hi" });
```
- `useQuery` subscribes (and unsubscribes on unmount), keeps multiple queries mutually consistent per render.
- **Optimistic updates** — `useMutation(api.x).withOptimisticUpdate((store, args) => { … })` updates local query results instantly, rolled back on failure.
- `Authenticated` / `Unauthenticated` / `AuthLoading` components + `useConvexAuth()` gate on auth state.

## Other clients
- **`ConvexReactClient`** — the React/WebSocket client (set up via `ConvexProvider`).
- **`ConvexClient`** — reactive client for Node/JS (`client.onUpdate(api.fn, args, cb)`, `client.mutation(...)`).
- **`ConvexHttpClient`** — one-shot `query`/`mutation`/`action` over HTTP (SSR, scripts, serverless, migrations).
- **Frameworks:** Next.js (incl. server rendering / preloading via provider SDKs), Vue (`convex-vue`)/Nuxt, Svelte (`convex-svelte`), Python, Rust, React Native, iOS (Swift), Android (Kotlin), Remix, TanStack Start, Bun, script tag. A `@convex-dev/react-query` adapter bridges TanStack Query.
- **`anyApi`** — untyped function access when functions aren't co-located with the client.

## Components (reusable backend modules)
Components are *"mini self-contained Convex backends"* — bundled functions + schema + persistent state, distributed as npm packages or local modules.
- **Isolation/sandboxing:** a component has its **own tables + functions**; it **cannot** read your app's data/functions, and your app **cannot** mutate its data, unless explicitly wired. *"Installing them is always safe."*
- **Transactional across boundaries** — calls between app and component participate in the same consistency model; runtime validation on all data crossing the boundary.
- **Mount** in `convex/convex.config.ts`:
  ```typescript
  import { defineApp } from "convex/server";
  import rateLimiter from "@convex-dev/rate-limiter/convex.config";
  const app = defineApp();
  app.use(rateLimiter);
  export default app;
  ```
- **Constraints:** no `ctx.auth` inside a component (pass the user id as an arg); `Id<"table">` appears as a string across the `ComponentApi`; no built-in pagination (use `paginator` from `convex-helpers`).
- **Examples:** sharded counters, workflows, leaderboards, rate limiters, persistent text streaming, agents.
