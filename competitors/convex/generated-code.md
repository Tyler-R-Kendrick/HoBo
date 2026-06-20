# Convex — Generated Code (`convex/_generated/`)

> Part of the [Convex reference](./README.md). The codegen that makes Convex end-to-end type-safe. (One of the three surfaces the user emphasized.) Regenerated automatically by `npx convex dev` and on demand by `npx convex codegen` ([cli-deployment.md](./cli-deployment.md)).

## Why it exists
Convex derives, from your schema (`schema.ts`) and your function modules, a set of files under `convex/_generated/` that give the **backend** correctly-typed function builders + `ctx` types, and give **callers** (client and server) **type-safe references** to every function — so `useQuery(api.messages.list, args)` is checked end-to-end (arg types and return types) at compile time. Commit your code before relying on the types; the generated files track the current module tree + schema.

## `api.js` / `api.d.ts` — function references
Exports two objects whose nested shape **mirrors the `convex/` directory**:
- **`api`** — references to all **public** functions. A function exported from `convex/messages.ts` as `list` is `api.messages.list`; nested dirs nest (`api.admin.users.ban`).
- **`internal`** — same structure for **internal** functions (`internalQuery`/`internalMutation`/`internalAction`).

Each leaf is a typed **`FunctionReference`** carrying the function's arg + return types. Used as a *handle*, never imported directly:
```typescript
// React
const msgs = useQuery(api.messages.list, { channel });
// server (action / scheduler / cron)
await ctx.runQuery(api.helpers.getData, { id });
await ctx.scheduler.runAfter(0, internal.jobs.process, { id });
```
(For clients not co-located with the backend, `anyApi` gives untyped references.)

## `server.js` / `server.d.ts` — builders + ctx types
Pre-bound to your schema/data model. Exports the **function constructors**:
`query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`, `httpAction`.
Plus the context **types** (schema-aware):
- `QueryCtx` — read-only `db`, `auth`, `storage`.
- `MutationCtx` — read/write `db`, `auth`, `storage`, `scheduler`, `vectorSearch`.
- `ActionCtx` — `runQuery`/`runMutation`/`runAction`, `auth`, `scheduler`, `storage`, `vectorSearch`.
```typescript
import { query, mutation, internalMutation, httpAction } from "./_generated/server";
```

## `dataModel.d.ts` — schema-derived types
TypeScript types generated from `schema.ts`: a `Doc<"table">` document type per table and an `Id<"table">` id type, plus a `DataModel` type that parameterizes `ctx.db`. This is what makes `ctx.db.get(id)` and query results strongly typed.

## Components
For apps using/authoring **components** ([reactivity-clients-components.md](./reactivity-clients-components.md)), codegen also emits component API typings (`component.d.ts` / `api_cm.js`) describing the mounted component's `ComponentApi` (with `Id<"table">` surfaced as `string` across the boundary).

## How regeneration works
- `npx convex dev` watches and regenerates on every save (then pushes).
- `npx convex codegen` regenerates without pushing.
- `npx convex deploy` regenerates as part of the deploy.
Net effect: the generated `api`/`internal`/`server`/`dataModel` always reflect the current functions + schema, so renaming a function or changing a validator surfaces as a **compile error** at every call site.
