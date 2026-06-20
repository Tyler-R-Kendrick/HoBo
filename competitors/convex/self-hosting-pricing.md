# Convex — Self-Hosting, Pricing & Limits

> Part of the [Convex reference](./README.md). The open-source backend, license, Convex Cloud editions, and the hard limits.

## Self-hosting
Convex's backend is **open source** — `github.com/get-convex/convex-backend` (≈44% Rust / ≈44% TypeScript; `crates/` = Rust server incl. `local_backend/`, `npm-packages/` = TS).
```bash
docker compose up                                   # backend + dashboard
docker compose exec backend ./generate_admin_key.sh # admin credentials
```
- Endpoints: dashboard `http://localhost:6791`, backend `http://127.0.0.1:3210`, HTTP actions `http://127.0.0.1:3211`.
- Wire the CLI to it via `CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.local`; then `npx convex dev`/`deploy` as usual.
- **DB backends:** SQLite by default (Docker volume); **Postgres/MySQL** for production (Neon, AWS RDS, etc.); S3 for export/snapshot storage. Fly.io / Railway configs provided.
- **License:** **FSL-1.1-Apache-2.0** — *"almost anything Apache-2.0 allows, except create another product designed to compete with Convex Cloud"*; **converts to full Apache-2.0 after 2 years**.

## Convex Cloud editions
| Plan | Highlights |
|---|---|
| **Free / Starter** | 1M function calls/mo, 0.5 GB storage, hard caps, self-service, Discord support |
| **Professional** ($25/developer/mo) | 50 GB storage, 50 GB DB I/O, 50 GB egress, 250M calls/mo; log streams + exception reporting; per-seat + discounted usage-based |
| **Enterprise** | advanced telemetry/compliance, SSO, auditing, SLAs, custom pricing |
*(Startup program: up to 1 yr free Pro + usage discounts.)*

## Concurrency classes (SLA tiers)
| Class | Concurrent queries | Concurrent actions | Sessions |
|---|---|---|---|
| **S16** (free) | 16 | 64 | 1,000 |
| **S256** (pro) | 256 | 256 | 10,000 |
| **D1024** (enterprise/scale) | 1,024 | 1,024 | 100,000 |

## Hard limits (selected)
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
