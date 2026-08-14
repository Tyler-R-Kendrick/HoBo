# celld

**Checked:** 2026-08-14  
**Pin:** `ghcr.io/denoland/celld:v0.2.1@sha256:7a4380721b6400073f2a26afe70a828410169f658d31b5ef61383e648ca0c530`  
**Sources:** [github.com/denoland/celld](https://github.com/denoland/celld), [v0.2.1](https://github.com/denoland/celld/releases/tag/v0.2.1), [celld.dev/docs](https://celld.dev/docs)  
**License:** Apache-2.0  
**HoBo role:** experimental Durable Objects dialect (`@hobo/runtime-celld`), sibling of `runtime-cloudflare`. Not a WASM Component Model host.

## Impedance

| Fact | HoBo consequence |
|---|---|
| One SQLite per cell, S3/GCS CAS ownership, LTX | Grain key → cell name; journal is HoBo’s |
| No filesystem mode | Never `hobo dev` default |
| No TLS on peers; unauthenticated operator API | Overlay required; public operator port fails closed |
| Unsafe hostile multi-tenant | One fleet per trust boundary |
| WASM inside V8 Worker | Not `runtime-wasm` / WIT |
| One app per fleet | Not a shared public actor SaaS |
| Queues/KV/R2/Cron incomplete | Do not claim private Cloudflare |

celld-on-Flux is **unsupported** until the ten overlay/capacity proofs in `@hobo/runtime-celld` pass.

## HoBo mapping

| HoBo | celld |
|---|---|
| `actor()` | Named cell + HoBo inbox/journal in cell SQLite |
| Station | Isolation domain that may own one fleet — not a new topology noun |
| Bucket | User-owned S3/R2/GCS with proven CAS; NATS OS unproven |
