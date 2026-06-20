# Convex — Database

> Part of the [Convex reference](./README.md). Document model, schema, indexes, reading/writing, transactions, pagination, limits. Verbatim API.

## Document model & system fields
Documents are JSON-like objects (nested arrays/objects allowed). Tables spring into existence on first insert. Every document gets two **system fields** (auto-managed, immutable):
- `_id: Id<"tableName">` — unique id.
- `_creationTime: number` — ms since epoch.

## Schema (`convex/schema.ts`)
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

## Indexes
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

## Reading
- `ctx.db.get(id)` → document | null.
- `ctx.db.query("table")` → chainable: `.withIndex(...)`, `.filter(q => …)`, `.order("asc"|"desc")` (default asc by `_creationTime`), then a terminator: `.collect()` / `.take(n)` / `.first()` / `.unique()` / `.paginate(opts)`.
- Joins/aggregations/group-by are done in **JavaScript** (`Promise.all` for parallel lookups), not SQL. Always bound unindexed scans with `.take`/`.first`/`.unique`/`.paginate`.

## Writing (all inside a transaction)
- `ctx.db.insert("table", doc)` → new `Id`.
- `ctx.db.patch(id, partial)` — shallow merge (set field `undefined` to remove it).
- `ctx.db.replace(id, doc)` — full replace.
- `ctx.db.delete(id)`.
A **mutation is one transaction**: all writes commit atomically when it returns.

## Transactions (OCC, serializable)
Convex uses **Optimistic Concurrency Control** (no locks): assume conflicts are rare, verify read/write sets at commit, **auto-retry** on conflict. Isolation is **serializable** — you never read inconsistent data. Rapid writes to the same document can surface OCC conflict errors (mitigate with sharding/components).

## Pagination (cursor-based)
```typescript
import { paginationOptsValidator } from "convex/server";
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) =>
    ctx.db.query("messages").order("desc").paginate(args.paginationOpts),
});
```
React: `const { results, status, loadMore } = usePaginatedQuery(api.messages.list, {}, { initialNumItems: 5 })` — status ∈ `LoadingFirstPage|CanLoadMore|LoadingMore|Exhausted`; pages stay **reactive** and resize as data changes.

## Key limits
1 MiB/document, 1,024 fields/doc, 16 nesting levels, 8,192 array elements; 10,000 tables/deployment; per-transaction: 32,000 docs scanned, 16,000 written, 16 MiB read & 16 MiB written, 4,096 index ranges. (Full table in [self-hosting-pricing.md](./self-hosting-pricing.md).)
