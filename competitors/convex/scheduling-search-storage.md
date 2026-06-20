# Convex — Scheduling, Search & File Storage

> Part of the [Convex reference](./README.md). Durable scheduling + cron, file storage, and full-text + vector search.

## Scheduled functions (`ctx.scheduler`)
Run a function once in the future (durably — stored in the DB, survives restarts), from a mutation or action:
```typescript
await ctx.scheduler.runAfter(5000, internal.messages.destruct, { messageId: id }); // ms delay
await ctx.scheduler.runAt(targetEpochMs, internal.billing.charge, { userId });      // absolute time
```
Returns the scheduled function id (for status/cancel). Schedule minutes→months out. Limits: ≤1000 functions scheduled per call; 4 MiB per scheduled-arg payload, 16 MiB total per mutation; up to 1,000,000 outstanding scheduled functions.

## Cron jobs (`convex/crons.ts`)
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

## File storage
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

## Full-text search
Reactive keyword/phrase search with **prefix matching** (typeahead). Stays live with your data. Limits: 4 search indexes/table, ≤1,024 results.

## Vector search (`ctx.vectorSearch`, actions only)
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
