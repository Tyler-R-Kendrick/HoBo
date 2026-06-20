# HoBo — Competitor references

> Faithful captures of competing/adjacent products, plus a HoBo parity/mapping tracker for each. These ground the design suite ([`../docs/design/`](../docs/design/README.md)) in what already exists.

| Competitor | What it is | Reference | HoBo mapping |
|---|---|---|---|
| **Nitric** | Cloud-agnostic "infrastructure from code" framework | [`nitric/`](./nitric/README.md) | [`nitric/hobo-mapping.md`](./nitric/hobo-mapping.md) |
| **Humanitec** | Platform Orchestrator for Internal Developer Platforms (dynamic configuration management) | [`humanitec/`](./humanitec/README.md) | [`humanitec/hobo-mapping.md`](./humanitec/hobo-mapping.md) |
| **Aspire** | Code-first app composition + local orchestration + deploy (Microsoft; MIT) — *most detailed capture* | [`aspire/`](./aspire/README.md) | [`aspire/hobo-mapping.md`](./aspire/hobo-mapping.md) |
| **Convex** | Reactive TypeScript backend-as-a-service (DB + functions + sync) — *adjacent; possible HoBo provider* | [`convex/`](./convex/README.md) | [`convex/hobo-mapping.md`](./convex/hobo-mapping.md) |
| **shoo.dev** | Zero-config Google-sign-in auth broker (PKCE + ES256/JWKS) — *adjacent; identity* | [`shoo/`](./shoo/README.md) | [`shoo/hobo-mapping.md`](./shoo/hobo-mapping.md) |

Each folder captures positioning, the full feature surface (verbatim where it matters), differentiators, and gaps a competitor could exploit. The `hobo-mapping.md` in each shows HoBo's equivalent for every feature and where HoBo deliberately goes further. Some entries (Convex, shoo.dev) are **adjacent** rather than head-on — captured because they inform HoBo's design or could compose with it.

Pattern for future competitors (wasmCloud, Spin, Encore, Qovery, Northflank, Backstage, Crossplane, Radius, Supabase …): add a sibling folder with the same file layout.
