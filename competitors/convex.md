# Convex — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026, from docs.convex.dev / convex.dev / get-convex GitHub). An exhaustive capture — Convex's deployment, generated-code, and management surfaces get dedicated files. HoBo↔Convex parity in [`hobo-mapping.md`](#hobo-mapping).
>
> Files: [database.md](#database) · [functions.md](#functions) · [scheduling-search-storage.md](#scheduling-search-storage) · [reactivity-clients-components.md](#reactivity-clients-components) · [cli-deployment.md](#cli-deployment) · [generated-code.md](#generated-code) · [management-platform-api.md](#management-platform-api) · [integrations-ops.md](#integrations-ops) · [self-hosting-pricing.md](#self-hosting-pricing) · [differentiators.md](#differentiators) · [hobo-mapping.md](#hobo-mapping)

## What it is
**Convex** is a **reactive, TypeScript-first backend platform** — *"the backend building blocks for your apps and agents."* You express the whole backend in pure TypeScript — **database**, schema, server **functions**, auth, scheduling, search — and Convex keeps frontend ↔ backend ↔ database **in sync in real time**. The three pillars:
- **Database** — an ACID document database (with vector search + file storage).
- **Functions** — server-side TypeScript: reactive **queries**, transactional **mutations**, side-effecting **actions**, HTTP actions, crons.
- **Sync** — automatic real-time subscriptions; clients always see a consistent snapshot.

### The deterministic query reactor (the core idea)
Queries must be **deterministic** (same inputs → same outputs). The database tracks each query's read dependencies; when any of that data changes, the query **re-runs** and all subscribed clients are pushed the new result **simultaneously**. No manual cache invalidation, no hand-rolled WebSockets.

## At a glance
| Dimension | Convex |
|---|---|
| Category | Reactive backend-as-a-service (DB + functions + sync) |
| Language | **TypeScript** end-to-end (codegen'd types) |
| Database | Document model, **schemas + indexes**, **OCC serializable** transactions |
| Functions | queries (reactive) · mutations (txn) · actions (external; Convex/Node runtime) · HTTP actions |
| Realtime | automatic subscriptions; consistent snapshots; optimistic updates |
| Extras | scheduled fns + cron, file storage, **full-text + vector search**, components |
| Deploy | `npx convex deploy`, deploy keys, dev/prod/preview, CI/Vercel/Netlify ([cli-deployment](#cli-deployment)) |
| Codegen | `convex/_generated/` `api`/`server`/`dataModel` ([generated-code](#generated-code)) |
| Programmatic | **Management API** `api.convex.dev/v1` + OAuth apps + HTTP API ([management-platform-api](#management-platform-api)) |
| Hosting | Convex Cloud (Free/Pro/Enterprise) **or self-host** (Rust, FSL license) |
| Clients | React, Next.js, Vue, Svelte, Python, Rust, iOS, Android, Node |

## Known gaps (vs HoBo's scope)
- **TS/JS-centric** runtime; document-model only (no relational SQL, no multi-model).
- **Single-vendor backend** (or self-host) — not a multi-cloud / IaC / control-plane story.
- Hard per-call limits (1s queries/mutations, 10-min actions, 1 MiB docs) — see [self-hosting-pricing.md](#self-hosting-pricing).
- The **Management/Platform API is Beta**; some endpoints undocumented outside the OpenAPI spec.

Convex is **adjacent** to HoBo, not a head-on competitor: it's the kind of backend HoBo could *target as a capability provider*, and a sharp reference point for HoBo's generated-clients + control-plane/provisioning APIs. See [hobo-mapping.md](#hobo-mapping).

## cli-deployment

**Convex — CLI & Deployment Model**

> Part of the [Convex reference](convex.md). The `npx convex` CLI and how code/config reach dev, prod, and preview deployments. (One of the three surfaces the user emphasized.)

### The `npx convex` CLI
Install: `npm install convex`. Key commands (with notable flags):

**Develop**
- `npx convex dev` — watch files → regenerate `convex/_generated/` ([generated-code.md](#generated-code)) → push code to your **dev** deployment. Creates `.env.local` with dev creds on first run. Flags: `--once` (config + codegen + one push, then exit), `--run <fn>`, `--tail-logs always|pause-on-deploy|disable`, `--until-success`.
- `npx convex codegen` — regenerate generated files without pushing (`--init`, `--typecheck`).
- `npx convex dashboard` / `npx convex docs` — open dashboard / docs.

**Deploy**
- `npx convex deploy` — typecheck, regenerate, bundle, **push to production** (or a preview). Flags: `--cmd 'npm run build'` (runs the frontend build with `CONVEX_URL` injected), `--cmd-url-env-var-name VITE_CONVEX_URL`, `--preview-create <name>`, `--preview-run <fn>`, `--message '…'`, `--dry-run`. Non-interactive in CI via `CONVEX_DEPLOY_KEY`.

**Run / data**
- `npx convex run <module:fn> '<jsonArgs>'` — execute any function (`--watch`, `--push`, `--prod`, `--component`, `--inline-query 'await ctx.db.query("messages").take(5)'`).
- `npx convex data [table]` — list tables / browse rows (`--limit`, `--order`).
- `npx convex import [--table <t>] <file|zip>` / `npx convex export --path <dir|zip> [--include-file-storage] [--prod]`.

**Env / ops**
- `npx convex env list|get|set|remove` (`--from-file`, `--prod`). Limits: name ≤256 chars, value ≤8 KiB, ≤512 vars, ≤512 KiB total.
- `npx convex logs [--prod]`, `npx convex insights [--details] [--prod]` (concurrency conflicts / limit hits over ~72h), `npx convex function-spec` (function arg/return metadata).

**Deployment / auth**
- `npx convex deployment select|create|token …` (see below).
- `npx convex login [--name] [--force]`, `npx convex login status`, `npx convex logout`.
- `npx convex update`, `npx convex mcp` (Beta, MCP server), `npx convex ai-files` (AI helper files).

### Deployment model
- Each project has **one shared production** deployment + **one dev deployment per team member**, plus **preview** deployments for feature branches. Deployments in a project usually run the same codebase.
- **Deployment URL:** `https://<adjective>-<animal>-<number>.convex.cloud` (e.g. `https://acoustic-panther-728.convex.cloud`); HTTP-actions host is `…convex.site`.
- **Key env vars:** `CONVEX_DEPLOYMENT` (selects the default deployment in local dev), `CONVEX_URL`/`VITE_CONVEX_URL` (frontend → backend; set by `deploy`), `CONVEX_DEPLOY_KEY` (non-interactive CI deploys), `CONVEX_SELF_HOSTED_URL`/`CONVEX_SELF_HOSTED_ADMIN_KEY` (self-host).

### Deploy keys (taxonomy)
| Type | Format (prefix) | Scope |
|---|---|---|
| Production deploy | `prod:<name>\|…` | deploy code to one prod deployment |
| Preview deploy | `preview:<team>:<project>\|…` | deploy to preview deployments |
| Project token | `project:<team>:<project>\|…` | whole project (create prod+dev) |
| Development deploy | `dev:<name>\|…` | one dev deployment (e.g. scoped agent work) |
| Admin key | `<name>\|…` | full deployment control (offline/self-host) |
Manage via `npx convex deployment token create <name> [--prod] [--deployment <ref>] [--save-env .env.local]` / `… token delete <nameOrToken>`.

### CI / Vercel / Netlify
Set `CONVEX_DEPLOY_KEY` in the build env, then make the build command:
```bash
npx convex deploy --cmd 'npm run build'
# custom frontend var name:
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL
```
`deploy` pushes the backend, sets `CONVEX_URL` for the build, then runs your build. Preview deployments use a **preview** deploy key + `--preview-create`/`--preview-run`; the Vercel marketplace integration syncs the deploy key automatically and supports separate Production/Preview configs.

## database

**Convex — Database**

> Part of the [Convex reference](convex.md). Document model, schema, indexes, reading/writing, transactions, pagination, limits. API surface quoted as factual excerpts (see the [fair-use note](README.md#sources--fair-use)).

### Document model & system fields
Documents are JSON-like objects (nested arrays/objects allowed). Tables spring into existence on first insert. Every document gets two **system fields** (auto-managed, immutable):
- `_id: Id<"tableName">` — unique id.
- `_creationTime: number` — ms since epoch.

### Schema (`convex/schema.ts`)
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    body: v.string(),
    user: v.id("users"),
    channel: v.id("channels"),
  })
    .index("by_channel", ["channel"])
    .index("by_channel_user", ["channel", "user"]),
  users: defineTable({
    name: v.string(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  channels: defineTable({ name: v.string() }),
});
```
- **Validators (`v.*`):** `v.string()`, `v.number()`, `v.boolean()`, `v.null()`, `v.int64()` (BigInt), `v.bytes()` (ArrayBuffer), `v.id("table")`, `v.array(...)`, `v.object({...})`, `v.record(k, v)`, `v.optional(...)`, `v.union(...)`, `v.literal(...)`, `v.any()`.
- Schema validation is **enforced by default** (disable per-table with `schemaValidation: false`). TypeScript types are **inferred** from validators; `Infer<typeof v>` extracts a type.

### Indexes
```typescript
const recent = await ctx.db
  .query("messages")
  .withIndex("by_channel", (q) =>
    q.eq("channel", channel)
     .gt("_creationTime", Date.now() - 2 * 60000)
     .lt("_creationTime", Date.now() - 60000))
  .collect();
```
**Range rules** (must step through index fields in order): zero+ `.eq()` equalities, then an optional lower bound (`.gt`/`.gte`), then an optional upper bound (`.lt`/`.lte`). Results are sorted by index order with `_creationTime` as tiebreaker. Limits: **16 fields/index**, **32 indexes/table**; staged indexes avoid blocking deploys on big tables.

### Reading
- `ctx.db.get(id)` → document | null.
- `ctx.db.query("table")` → chainable: `.withIndex(...)`, `.filter(q => …)`, `.order("asc"|"desc")` (default asc by `_creationTime`), then a terminator: `.collect()` / `.take(n)` / `.first()` / `.unique()` / `.paginate(opts)`.
- Joins/aggregations/group-by are done in **JavaScript** (`Promise.all` for parallel lookups), not SQL. Always bound unindexed scans with `.take`/`.first`/`.unique`/`.paginate`.

### Writing (all inside a transaction)
- `ctx.db.insert("table", doc)` → new `Id`.
- `ctx.db.patch(id, partial)` — shallow merge (set field `undefined` to remove it).
- `ctx.db.replace(id, doc)` — full replace.
- `ctx.db.delete(id)`.
A **mutation is one transaction**: all writes commit atomically when it returns.

### Transactions (OCC, serializable)
Convex uses **Optimistic Concurrency Control** (no locks): assume conflicts are rare, verify read/write sets at commit, **auto-retry** on conflict. Isolation is **serializable** — you never read inconsistent data. Rapid writes to the same document can surface OCC conflict errors (mitigate with sharding/components).

### Pagination (cursor-based)
```typescript
import { paginationOptsValidator } from "convex/server";
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) =>
    ctx.db.query("messages").order("desc").paginate(args.paginationOpts),
});
```
React: `const { results, status, loadMore } = usePaginatedQuery(api.messages.list, {}, { initialNumItems: 5 })` — status ∈ `LoadingFirstPage|CanLoadMore|LoadingMore|Exhausted`; pages stay **reactive** and resize as data changes.

### Key limits
1 MiB/document, 1,024 fields/doc, 16 nesting levels, 8,192 array elements; 10,000 tables/deployment; per-transaction: 32,000 docs scanned, 16,000 written, 16 MiB read & 16 MiB written, 4,096 index ranges. (Full table in [self-hosting-pricing.md](#self-hosting-pricing).)

## functions

**Convex — Functions**

> Part of the [Convex reference](convex.md). Queries, mutations, actions, internal functions, HTTP actions, validators, runtimes, errors. Functions are defined with builders from [`convex/_generated/server`](#generated-code).

### Three function kinds
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

### Internal functions
`internalQuery` / `internalMutation` / `internalAction` — callable only from other functions (actions, HTTP actions, scheduled/cron jobs, dashboard, CLI), never directly from clients. Use them to shrink public surface area (e.g. charge a card in a public action, then call an `internalMutation` to update the user's plan).

### HTTP actions (`convex/http.ts`)
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

### Validators
Each function takes `{ args, handler, returns? }`. `args`/`returns` use the `v.*` validators (see [database.md](#database)); args are typed automatically and **extra properties are rejected**. Return validators enforce the output shape.

### `ctx` surface
- **`QueryCtx`** — `db` (read), `auth`, `storage` (read).
- **`MutationCtx`** — `db` (read/write), `auth`, `storage`, `scheduler`, `vectorSearch`.
- **`ActionCtx`** — `runQuery` / `runMutation` / `runAction`, `auth`, `scheduler`, `storage`, `vectorSearch` (no direct `db`).
- `ctx.auth.getUserIdentity()` → the verified caller identity or null ([auth](#integrations-ops)).

### Runtimes
- **Convex runtime** (default) — V8-based, Cloudflare-Workers-like, **no cold starts**, web-standard globals (`fetch`, `Blob`, Web Crypto, Web Streams), limited Node APIs (`process.env`). All queries/mutations run here and must be deterministic.
- **Node.js runtime** — opt in with `"use node";` at the top of a file; **actions only**; full npm/Node libs; Node 20/22/24; 5 MiB arg limit (vs 16 MiB); may cold-start.

### Error handling
Categories: **application** (`throw new ConvexError(data)` for expected failures — custom data survives to prod), **developer** (bugs), **read/write limit**, **internal** (auto-retried). Query errors throw from `useQuery` (use a React error boundary); retrying is pointless (deterministic). Mutation rejections roll back optimistic updates. Actions aren't auto-retried — caller handles retries. Dev shows full messages/stacks; prod shows only the function name + generic "Server Error" (except `ConvexError` data).

## generated-code

**Convex — Generated Code (`convex/_generated/`)**

> Part of the [Convex reference](convex.md). The codegen that makes Convex end-to-end type-safe. (One of the three surfaces the user emphasized.) Regenerated automatically by `npx convex dev` and on demand by `npx convex codegen` ([cli-deployment.md](#cli-deployment)).

### Why it exists
Convex derives, from your schema (`schema.ts`) and your function modules, a set of files under `convex/_generated/` that give the **backend** correctly-typed function builders + `ctx` types, and give **callers** (client and server) **type-safe references** to every function — so `useQuery(api.messages.list, args)` is checked end-to-end (arg types and return types) at compile time. Commit your code before relying on the types; the generated files track the current module tree + schema.

### `api.js` / `api.d.ts` — function references
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

### `server.js` / `server.d.ts` — builders + ctx types
Pre-bound to your schema/data model. Exports the **function constructors**:
`query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`, `httpAction`.
Plus the context **types** (schema-aware):
- `QueryCtx` — read-only `db`, `auth`, `storage`.
- `MutationCtx` — read/write `db`, `auth`, `storage`, `scheduler`, `vectorSearch`.
- `ActionCtx` — `runQuery`/`runMutation`/`runAction`, `auth`, `scheduler`, `storage`, `vectorSearch`.
```typescript
import { query, mutation, internalMutation, httpAction } from "./_generated/server";
```

### `dataModel.d.ts` — schema-derived types
TypeScript types generated from `schema.ts`: a `Doc<"table">` document type per table and an `Id<"table">` id type, plus a `DataModel` type that parameterizes `ctx.db`. This is what makes `ctx.db.get(id)` and query results strongly typed.

### Components
For apps using/authoring **components** ([reactivity-clients-components.md](#reactivity-clients-components)), codegen also emits component API typings (`component.d.ts` / `api_cm.js`) describing the mounted component's `ComponentApi` (with `Id<"table">` surfaced as `string` across the boundary).

### How regeneration works
- `npx convex dev` watches and regenerates on every save (then pushes).
- `npx convex codegen` regenerates without pushing.
- `npx convex deploy` regenerates as part of the deploy.
Net effect: the generated `api`/`internal`/`server`/`dataModel` always reflect the current functions + schema, so renaming a function or changing a validator surfaces as a **compile error** at every call site.

## integrations-ops

**Convex — Integrations & Operations**

> Part of the [Convex reference](convex.md). Auth providers, log streams, exception reporting, the dashboard, and import/export.

### Auth providers
Convex validates tokens backend-side via `convex/auth.config.ts` and exposes the verified caller as `ctx.auth.getUserIdentity()`.
- **Convex Auth** — auth library running *on your Convex backend* (no external service): magic links/OTP, OAuth (GitHub/Google/Apple/80+), email+password (reset + optional verification), custom OIDC, custom JWT. Beta; ships no UI components. (`labs.convex.dev/auth`.)
- **Clerk** — `<ConvexProviderWithClerk>`; `auth.config.ts` `{ domain: CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }`.
- **Auth0** — `<ConvexProviderWithAuth0>`; `auth.config.ts` `{ domain, applicationID }`.
- **Custom OIDC** — any OpenID Connect issuer; `applicationID` must equal the JWT `aud` and `domain` must equal `iss`.
- **`customJwt`** — for issuers whose tokens may lack `aud`; configure `{ type: "customJwt", issuer, jwks, algorithm }`. **This is the hook [shoo.dev](shoo.md#convex-integration) plugs into** (issuer `https://shoo.dev`, ES256, JWKS).

### Log streams (Pro)
Stream function executions, console logs, audit logs, scheduler/concurrency/storage stats to: **Axiom** (dataset + API key; auto dashboards), **Datadog** (site + API key + `ddtags`), **PostHog** (project token, OTLP), or a **custom webhook** (JSON event array; HMAC-SHA256 signature in `x-webhook-signature`, validate with constant-time compare + timestamp check).

### Exception reporting (Pro)
**Sentry** (captures function name/type/runtime/deployment/request-id/user identity), **PostHog Error Tracking** (+ stack traces), **Datadog Error Tracking** (via Sentry SDK).

### Dashboard
Function logs (timestamps + exec time), data explorer (browse/edit/filter), performance metrics (cache-hit/failure rates, scheduler lag), call-frequency graphs, health/insights (concurrency + limit hits), a Schedules page (scheduled fns + crons), and run/test functions directly. Open with `npx convex dashboard`.

### Import / export & streaming (Beta)
- **Import:** CSV/JSON into a single table via CLI; restore from a backup zip; **streaming import** via an **Airbyte** destination connector.
- **Export:** snapshot zip (dashboard or `npx convex export`); **streaming export** via **Fivetran** to a warehouse.
- CLI: `npx convex import [--table <t>] <file|zip>`, `npx convex export --path <dir|zip> [--include-file-storage] [--prod]`.

### `convex-helpers`
Companion npm package: custom functions, relationship helpers, stateful migrations, action-retry wrapper, rate limiting, sessions, row-level security, Zod validation, Hono HTTP, CRUD, query streaming + manual `paginator`, query caching, CORS for `HttpRouter`, an OpenAPI/TS-API generator, triggers, and Standard Schema support.

## management-platform-api

**Convex — Management, Platform & HTTP APIs**

> Part of the [Convex reference](convex.md). The programmatic surfaces for provisioning + operating Convex (one of the three the user emphasized). **The Management/Platform API is Beta** — the authoritative shape is the published OpenAPI spec; some endpoints are documented only there. Contact `platforms@convex.dev` for capabilities beyond the beta.

### 1) Management API — provision teams/projects/deployments
- **Base:** `https://api.convex.dev/v1`
- **Auth:** `Authorization: Bearer <token>`, where the token is either a **Team Access Token** (manage your own team) or an **OAuth Application Token** (act on behalf of a user's team — how a third-party integration provisions Convex for users).
- **Spec / client:** OpenAPI at `https://api.convex.dev/v1/openapi.json`; official client `@convex-dev/platform` (npm).
- **Representative endpoints** (full list in the spec):
  - `GET  /projects/:project_id/list_deployments`
  - `POST /projects/:project_id/create_deployment`
  - `GET  /deployments/:deployment_name/list_deploy_keys`
  - `POST /deployments/:deployment_name/create_deploy_key`
  - project creation/management, deploy-key management, team-level ops.
- **Capabilities:** create/configure projects + deployments, mint/revoke deploy keys, manage env vars, programmatic provisioning of Convex infra.

### 2) Deployment Platform API — configure a single deployment
- **Auth:** an admin-scoped key with the **`Convex ` prefix**: `Authorization: Convex <access_key>` (accepts deploy keys, team-access tokens, or OAuth app tokens).
- **Purpose:** modify a deployment's configuration (e.g. environment variables — `list_environment_variables`, etc.).
- **Status:** openly available in **Beta**; not all endpoints are publicly documented.

### 3) Client HTTP API — call functions over HTTP
- **Base:** `<CONVEX_URL>/api/...`
- **Endpoints:** `POST /api/query`, `POST /api/mutation`, `POST /api/action`, and `POST /api/run/{functionIdentifier}`.
- **Request:** `{ "path": "module:function", "args": { … }, "format": "json" }` (the `/api/run/...` form omits `path`).
- **Response:** success `{ "status": "success", "value": …, "logLines": [...] }`; error `{ "status": "error", "errorMessage": …, "errorData": …, "logLines": [...] }`.
- **Auth:** end-user calls use `Authorization: Bearer <id_token>` (from your auth provider); admin/streaming use `Authorization: Convex <access_key>`. Only `json` format today; real-time subscriptions use the WebSocket client, not this HTTP API.

### 4) OAuth applications (third-party integrations)
Register in Dashboard → Team Settings → Applications → OAuth Apps (up to 20 redirect URIs incl. localhost; apps start "Unverified" — token issuance limited to your own team until verified). Standard **OAuth 2.0 Authorization Code flow (+ PKCE, S256)**:
1. **Authorize:** redirect to `https://dashboard.convex.dev/oauth/authorize/team` (or `/project`) with `client_id`, `redirect_uri`, `state`, `response_type=code`.
2. **Callback:** `<redirect_uri>?code=…&state=…`.
3. **Token:** `POST https://api.convex.dev/oauth/token` with `{ client_id, client_secret, code, grant_type: "authorization_code" }` (+ PKCE `code_verifier`) → `{ "access_token": "…", "token_type": "Bearer" }`.

**Token scopes:** *team-scoped* (create projects/deployments, access/modify data across the team's projects) or *project-scoped* (create deployments + manage data within one project). All tokens inherit the authorizing member's permissions.

### Notes / undocumented
- No `deployment token list` CLI command — track issued keys yourself.
- Streaming-import/export connector details (Airbyte/Fivetran) are referenced but lightly documented ([integrations-ops.md](#integrations-ops)).
- Treat the Management/Platform API as **moving** (Beta) — generate clients from the OpenAPI spec rather than hard-coding.

## reactivity-clients-components

**Convex — Reactivity, Clients & Components**

> Part of the [Convex reference](convex.md). The sync model, client libraries, and the Components system.

### Reactivity & consistency
The Convex DB is reactive: whenever data a query depends on changes, the query re-runs and **client subscriptions update**. Guarantees:
- **Consistent snapshots** — *"every client subscription gets updated simultaneously to the same snapshot of the database"*; you never observe a torn/partial state.
- **Automatic caching** — query results cached, invalidated on dependency change.
- Solves classic bugs (e.g. stale "in stock" counts) without manual cache or WebSocket code.

Transport: the reactive clients hold a **persistent WebSocket** for 2-way push; queries/mutations over plain HTTP are also possible (see [management-platform-api.md](#management-platform-api)).

### React client
```typescript
const data = useQuery(api.messages.list, { channel });   // undefined while loading; reactive after
const send = useMutation(api.messages.send);             // async fn; supports optimistic updates + retries
const run  = useAction(api.ai.summarize);                // async fn; no auto-retry/optimistic
await send({ channel, body: "hi" });
```
- `useQuery` subscribes (and unsubscribes on unmount), keeps multiple queries mutually consistent per render.
- **Optimistic updates** — `useMutation(api.x).withOptimisticUpdate((store, args) => { … })` updates local query results instantly, rolled back on failure.
- `Authenticated` / `Unauthenticated` / `AuthLoading` components + `useConvexAuth()` gate on auth state.

### Other clients
- **`ConvexReactClient`** — the React/WebSocket client (set up via `ConvexProvider`).
- **`ConvexClient`** — reactive client for Node/JS (`client.onUpdate(api.fn, args, cb)`, `client.mutation(...)`).
- **`ConvexHttpClient`** — one-shot `query`/`mutation`/`action` over HTTP (SSR, scripts, serverless, migrations).
- **Frameworks:** Next.js (incl. server rendering / preloading via provider SDKs), Vue (`convex-vue`)/Nuxt, Svelte (`convex-svelte`), Python, Rust, React Native, iOS (Swift), Android (Kotlin), Remix, TanStack Start, Bun, script tag. A `@convex-dev/react-query` adapter bridges TanStack Query.
- **`anyApi`** — untyped function access when functions aren't co-located with the client.

### Components (reusable backend modules)
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

## scheduling-search-storage

**Convex — Scheduling, Search & File Storage**

> Part of the [Convex reference](convex.md). Durable scheduling + cron, file storage, and full-text + vector search.

### Scheduled functions (`ctx.scheduler`)
Run a function once in the future (durably — stored in the DB, survives restarts), from a mutation or action:
```typescript
await ctx.scheduler.runAfter(5000, internal.messages.destruct, { messageId: id }); // ms delay
await ctx.scheduler.runAt(targetEpochMs, internal.billing.charge, { userId });      // absolute time
```
Returns the scheduled function id (for status/cancel). Schedule minutes→months out. Limits: ≤1000 functions scheduled per call; 4 MiB per scheduled-arg payload, 16 MiB total per mutation; up to 1,000,000 outstanding scheduled functions.

### Cron jobs (`convex/crons.ts`)
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("rotate", { minutes: 1 }, internal.jobs.rotate);
crons.cron("cleanup", "0 16 1 * *", internal.jobs.cleanup);   // 5-field, UTC
crons.hourly("sync", { minuteUTC: 0 }, internal.jobs.sync);
crons.daily("digest", { hourUTC: 9, minuteUTC: 0 }, internal.jobs.digest);
crons.weekly(/* … */); crons.monthly(/* … */);
export default crons;
```
Targets are mutations or actions. At most one run of a given cron executes at a time; long runs may cause skips. Static (defined at deploy); a Convex component offers dynamic create/update/delete crons.

### File storage
Three-step upload (large files): generate a short-lived upload URL in a mutation → client `POST`s the file → save the returned `storageId`.
```typescript
export const generateUploadUrl = mutation({
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});
// client:
const url = await generateUploadUrl();
const { storageId } = await (await fetch(url, { method: "POST",
  headers: { "Content-Type": file.type }, body: file })).json();
await sendImage({ storageId });
```
- Serve: `ctx.storage.getUrl(storageId)`. Download in an action: `ctx.storage.get(id)` → `Blob`; store a blob: `ctx.storage.store(blob)` → id (HTTP-action store is ≤20 MiB).
- Delete: `ctx.storage.delete(id)`. Metadata lives in the `_storage` system table — query it: `ctx.db.system.get("_storage", id)` (fields: `sha256`, `size`, `contentType`, `_id`, `_creationTime`).

### Full-text search
Reactive keyword/phrase search with **prefix matching** (typeahead). Stays live with your data. Limits: 4 search indexes/table, ≤1,024 results.

### Vector search (`ctx.vectorSearch`, actions only)
```typescript
export const similar = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const embedding = await embed(args.query);      // external embedding API
    return ctx.vectorSearch("foods", "by_embedding", {
      vector: embedding, limit: 16, filter: q => q.eq("cuisine", "French"),
    }); // → [{ _id, _score }] ranked by cosine similarity
  },
});
```
Define a vector index in the schema (field + `dimensions` + optional filter fields). Limits: 4 vector indexes/table, ≤256 results, dimensions 2–4,096. **Hybrid search** (text + vector via reciprocal rank fusion) is supported by combining the two.

## self-hosting-pricing

**Convex — Self-Hosting, Pricing & Limits**

> Part of the [Convex reference](convex.md). The open-source backend, license, Convex Cloud editions, and the hard limits.

### Self-hosting
Convex's backend is **open source** — `github.com/get-convex/convex-backend` (≈44% Rust / ≈44% TypeScript; `crates/` = Rust server incl. `local_backend/`, `npm-packages/` = TS).
```bash
docker compose up                                   # backend + dashboard
docker compose exec backend ./generate_admin_key.sh # admin credentials
```
- Endpoints: dashboard `http://localhost:6791`, backend `http://127.0.0.1:3210`, HTTP actions `http://127.0.0.1:3211`.
- Wire the CLI to it via `CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.local`; then `npx convex dev`/`deploy` as usual.
- **DB backends:** SQLite by default (Docker volume); **Postgres/MySQL** for production (Neon, AWS RDS, etc.); S3 for export/snapshot storage. Fly.io / Railway configs provided.
- **License:** **FSL-1.1-Apache-2.0** — *"almost anything Apache-2.0 allows, except create another product designed to compete with Convex Cloud"*; **converts to full Apache-2.0 after 2 years**.

### Convex Cloud editions
| Plan | Highlights |
|---|---|
| **Free / Starter** | 1M function calls/mo, 0.5 GB storage, hard caps, self-service, Discord support |
| **Professional** ($25/developer/mo) | 50 GB storage, 50 GB DB I/O, 50 GB egress, 250M calls/mo; log streams + exception reporting; per-seat + discounted usage-based |
| **Enterprise** | advanced telemetry/compliance, SSO, auditing, SLAs, custom pricing |
*(Startup program: up to 1 yr free Pro + usage discounts.)*

### Concurrency classes (SLA tiers)
| Class | Concurrent queries | Concurrent actions | Sessions |
|---|---|---|---|
| **S16** (free) | 16 | 64 | 1,000 |
| **S256** (pro) | 256 | 256 | 10,000 |
| **D1024** (enterprise/scale) | 1,024 | 1,024 | 100,000 |

### Hard limits (selected)
| Limit | Value |
|---|---|
| Document size | 1 MiB |
| Fields per document | 1,024 |
| Field nesting depth | 16 |
| Tables per deployment | 10,000 |
| Indexes per table / fields per index | 32 / 16 |
| Search & vector indexes per table | 4 each |
| Query / mutation execution time | **1 second** |
| Action execution time | **10 minutes** |
| Function arg / return size | 16 MiB (5 MiB for Node actions) / 16 MiB |
| HTTP action response | 20 MiB |
| Docs scanned / written per transaction | 32,000 / 16,000 |
| Data read / written per transaction | 16 MiB / 16 MiB |
| Outstanding scheduled functions | 1,000,000 |
| Env vars | ≤512 vars, ≤8 KiB each, ≤512 KiB total |

These per-call ceilings (1s queries, 10-min actions, 1 MiB docs) shape the architecture: keep functions small, push heavy/long work into actions + scheduled functions + components.

## differentiators

**Convex — Differentiators & Gaps**

> Part of the [Convex reference](convex.md). Strengths, gaps, and head-to-head comparisons.

### Differentiators (what's genuinely strong)
1. **Reactive by default** — the deterministic query reactor: queries auto-subscribe and re-run on dependency change; all clients get the **same consistent snapshot** simultaneously. No cache-invalidation or WebSocket plumbing.
2. **End-to-end TypeScript + codegen** — DB schema, functions, validators, and **typed function references** (`convex/_generated/`) make calls compile-checked from client to DB; renames/validator changes break at call sites.
3. **Serializable OCC transactions** — mutations are atomic; no locks; auto-retry on conflict.
4. **Batteries included** — scheduled functions + cron, file storage, full-text + **vector search**, HTTP actions, auth — in one backend.
5. **Components** — sandboxed, transactional, reusable backend modules (rate limiters, workflows, agents…).
6. **AI-friendly** — typed, SQL-less, low-boilerplate code that LLMs generate reliably; MCP server + agent skills.
7. **Programmable platform** — Management API + OAuth apps + deploy keys ([management-platform-api.md](#management-platform-api)) let third parties provision/operate Convex for users.
8. **OSS self-host** — full backend (Rust) under FSL→Apache-2.0; no hard lock-in.

### Gaps (relative to HoBo's scope)
1. **TS/JS-centric** runtime; **document model only** (no SQL/relational/multi-model; joins/aggregations are hand-written JS).
2. **Single-vendor backend** — Convex Cloud or self-host; **not multi-cloud, not IaC, not a control plane** for *other* infra.
3. **Hard per-call ceilings** (1s queries/mutations, 10-min actions, 1 MiB docs) shape (and constrain) architecture.
4. **No event-sourced replay/time-travel** of the whole system; reactivity ≠ an append-only audit log.
5. Management/Platform API is **Beta**; some surfaces documented only via OpenAPI.

### Head-to-head
| vs | Convex's edge | Their edge |
|---|---|---|
| **Firebase** | type-safe TS functions + real serializable transactions + reactive queries | bigger ecosystem, GCP integration, more mature mobile |
| **Supabase** | reactive-by-default + end-to-end TS + components | Postgres/SQL, relational power, broad SQL tooling |
| **Appwrite** | reactive queries + codegen + OCC transactions | self-host maturity, broader language SDKs |
| **PlanetScale / Neon** | full backend (functions/sync/auth), not just a DB | serverless SQL at scale, branching |
| **Aspire** ([../aspire](aspire.md)) | a *running managed backend* + reactivity | Aspire orchestrates *your* polyglot services to *your* infra (composition, not a hosted DB) |

### Net for HoBo
Convex is a **managed reactive backend**; HoBo is a **multi-cloud control plane / IfC platform**. They're adjacent: Convex's codegen + typed function references corroborate HoBo's WIT-generated-clients approach, its Management/OAuth API corroborates HoBo's control-plane/provisioning API, and Convex itself is the *kind of backend HoBo could target as a capability provider*. HoBo's deltas: multi-cloud + IaC + Resource Definitions/matching, event-sourced replay/audit, agents-as-principals + Forge generation, and a governed hosted plane. See [hobo-mapping.md](#hobo-mapping).

## hobo-mapping

**Convex → HoBo parity & mapping tracker**

> For each Convex surface, the HoBo equivalent. ✅ = HoBo has a comparable concept · ➕ = HoBo goes further · ↔ = adjacent/composes · n/a = out of scope. HoBo design lives in [`../../docs/design/`](../docs/design/README.md). Convex is **adjacent** to HoBo — a managed reactive backend, not a multi-cloud control plane — so this tracks *conceptual* correspondences (and where Convex could be a HoBo provider), not feature-for-feature competition.

### Core platform
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Deterministic reactive queries; consistent snapshots | Event-sourced, deterministic **replay** + projections; durable workflows | ↔➕ | [11](../docs/design/event-model.md#plan-11) |
| Mutations = OCC serializable transactions | Single-writer actor leases + exactly-once effects | ✅ | [05](../docs/design/reliability-observability-cost.md#plan-05) |
| Actions (external calls; Node runtime) | Provider/driver calls in sandboxed Executors; durable `step`/`workflow` | ✅ | [02](../docs/design/sdk-api.md#plan-02), [04](../docs/design/control-plane.md#plan-04) |
| Document DB + schema + indexes + vector search | A **capability/resource** in HoBo's catalog (`database`/`vector`/`blobstore` ports) | ↔ | [21](../docs/design/authoring-resources-wiring.md#plan-21), [24](../docs/design/wasm-runtime-wit.md#plan-24) |
| Scheduled functions + cron | Saga scheduling + Pipelines/triggers | ✅ | [05](../docs/design/reliability-observability-cost.md#plan-05), [28](../docs/design/platform-engineering.md#plan-28) |
| HTTP actions / webhooks | Provider HTTP ports + GitOps/webhook triggers | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22), [28](../docs/design/platform-engineering.md#plan-28) |

### The three user-emphasized surfaces
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| **Generated code** (`_generated/` `api`/`server`/`dataModel`; typed function refs) | **WIT-interface-generated typed clients** + typed `.with(...)`; codegen from ports | ✅➕ | [02](../docs/design/sdk-api.md#plan-02), [24](../docs/design/wasm-runtime-wit.md#plan-24), [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| **Deployment API/model** (`convex deploy`, deploy keys, dev/prod/preview, CI) | The **Yard** deploy lifecycle: manifest/Set, Deltas→Sets, ephemeral/preview Camps, publishers | ✅➕ | [04](../docs/design/control-plane.md#plan-04), [22](../docs/design/authoring-resources-wiring.md#plan-22), [26](../docs/design/platform-engineering.md#plan-26) |
| **Management/Platform API** (`api.convex.dev/v1`, OAuth apps, provision deployments) | The Yard's control-plane API + MCP + agents-as-OIDC-principals provisioning | ✅➕ | [04](../docs/design/control-plane.md#plan-04), [06](../docs/design/ai-native-agent-auth.md#plan-06) |

### Ops, extensibility & auth
| Convex | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Components (sandboxed reusable backends) | Capability providers + **Resource Packs** (signed, conformance-gated) | ✅➕ | [27](../docs/design/platform-engineering.md#plan-27), [03](../docs/design/control-plane.md#plan-03) |
| Log streams / exceptions / dashboard | Observability + run inspector + replay | ✅➕ | [14](../docs/design/reliability-observability-cost.md#plan-14), [07](../docs/design/developer-experience.md#plan-07) |
| Self-host (Rust backend; FSL→Apache) | Self-host = hosted (the Yard is a Bindle); OSS core | ✅ | [04](../docs/design/control-plane.md#plan-04), [17](../docs/design/positioning.md#plan-17) |
| Auth: `customJwt`/OIDC (Convex Auth/Clerk/Auth0) | Workload/agent identity (SVIDs, OIDC principals); **shoo** composes via `customJwt` | ↔ | [06](../docs/design/ai-native-agent-auth.md#plan-06), [12](../docs/design/security-networking.md#plan-12), [../shoo](shoo.md) |
| AI: MCP server + agent skills | Agents-as-principals + MCP control surface + Forge | ✅➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06), [23](../docs/design/forge-generated-stack.md#plan-23) |

### Convex-as-a-HoBo-provider (the composing relationship)
The cleanest framing: **Convex is a backend HoBo could realize as a capability provider**. A Bindle that declares `database`/`vector`/`blobstore`/`auth` ports could be mapped (via a Resource Definition, [Plan 25](../docs/design/platform-engineering.md#plan-25)) to a Convex deployment — HoBo's Planner would provision it through Convex's **Management API**, wire connection refs via the manifest ([Plan 22](../docs/design/authoring-resources-wiring.md#plan-22)), and brokers/agents would manage it. In that framing Convex is *infrastructure HoBo orchestrates*, not a competitor.

### Where HoBo deliberately differs
- **Multi-cloud + IaC + matching** — HoBo provisions *across providers* by context ([Plan 25](../docs/design/platform-engineering.md#plan-25)); Convex is one backend.
- **Event-sourced replay/time-travel + audit** as the substrate ([Plan 11](../docs/design/event-model.md#plan-11)).
- **WASM-first polyglot runtime** ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)) vs Convex's TS/JS runtime.
- **Agent-native Forge** generation of providers/implementations/definitions ([Plan 23](../docs/design/forge-generated-stack.md#plan-23)).
