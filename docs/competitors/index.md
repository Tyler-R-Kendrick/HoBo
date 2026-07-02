# HoBo — Competitor references

> Faithful captures of competing/adjacent products, plus a HoBo parity/mapping tracker for each. These ground the design suite ([`../design/`](../design/index.md)) in what already exists.

| Competitor             | What it is                                                                                                                      | Reference                        | HoBo mapping                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| **Nitric**             | Cloud-agnostic "infrastructure from code" framework                                                                             | [`nitric.md`](nitric.md)         | [HoBo mapping](nitric.md#hobo-mapping)     |
| **Nomad + Nomad Pack** | Workload scheduler/orchestrator + reusable jobspec packaging (HashiCorp) — _direct scheduler/control-plane competitor_          | [`nomad.md`](nomad.md)           | [HoBo mapping](nomad.md#hobo-mapping)      |
| **Humanitec**          | Platform Orchestrator for Internal Developer Platforms (dynamic configuration management)                                       | [`humanitec.md`](humanitec.md)   | [HoBo mapping](humanitec.md#hobo-mapping)  |
| **Aspire**             | Code-first app composition + local orchestration + deploy (Microsoft; MIT) — _most detailed capture_                            | [`aspire.md`](aspire.md)         | [HoBo mapping](aspire.md#hobo-mapping)     |
| **Convex**             | Reactive TypeScript backend-as-a-service (DB + functions + sync) — _adjacent; possible HoBo provider_                           | [`convex.md`](convex.md)         | [HoBo mapping](convex.md#hobo-mapping)     |
| **InsForge**           | Agent-native backend-as-a-service (Postgres/auth/storage/realtime/functions/sites/AI gateway) — _adjacent; agent-ops benchmark_  | [`insforge.md`](insforge.md)     | [HoBo mapping](insforge.md#hobo-mapping)   |
| **Antimetal**          | AI-native production-operations layer (world model, RCA, fixes, MCP/coding-agent handoff) — _adjacent; SRE/operator benchmark_   | [`antimetal.md`](antimetal.md)   | [HoBo mapping](antimetal.md#hobo-mapping)  |
| **shoo.dev**           | Zero-config Google-sign-in auth broker (PKCE + ES256/JWKS) — _adjacent; identity_                                               | [`shoo.md`](shoo.md)             | [HoBo mapping](shoo.md#hobo-mapping)       |
| **Dapr**               | Distributed-application runtime: portable building-block APIs + pluggable components (sidecar) — _closest architectural analog_ | [`dapr.md`](dapr.md)             | [HoBo mapping](dapr.md#hobo-mapping)       |
| **Encore**             | Infrastructure-from-code for TS/Go (declare resources in code → provision AWS/GCP) — _closest product analog_                   | [`encore.md`](encore.md)         | [HoBo mapping](encore.md#hobo-mapping)     |
| **Lakebed**            | Agent-native closed PaaS (Capsules, sync RPC, llms.txt) — _named head-on competitor_                                            | [`lakebed.md`](lakebed.md)       | [HoBo mapping](lakebed.md#hobo-mapping)    |
| **Wasm hosts**         | The wasm component-hosting landscape (Wasmtime · Spin/SpinKube · wasmCloud) — _grounds ADR-0031's `component-host` adapters_    | [`wasm-hosts.md`](wasm-hosts.md) | [HoBo mapping](wasm-hosts.md#hobo-mapping) |
| **FinOps tooling**     | Cost allocation/estimation/optimization landscape (Kubecost/OpenCost · Infracost · Vantage · Cast.ai) — _adjacent; showback/FinOps benchmark_ | [`finops-tooling.md`](finops-tooling.md) | [HoBo mapping](finops-tooling.md#hobo-mapping) |

Each competitor is **one consolidated doc**: positioning, the feature surface (with quoted excerpts of factual API/CLI/config surface where it matters), differentiators, and gaps a competitor could exploit, ending with a `#hobo-mapping` section that shows HoBo's equivalent for every feature and where HoBo deliberately goes further. Some entries (Convex, shoo.dev) are **adjacent** rather than head-on — captured because they inform HoBo's design or could compose with it.

➡️ **Cross-competitor [gap analysis](./gap-analysis.md)** — a synthesis of where HoBo's design leads / matches / falls short of the captured set, with a comparison matrix, prioritized gaps (the standout: a **reactive/live-query model**, à la Convex), and recommended next design moves. New gaps are filed as [open questions #21–23](../design/generated-stack.md#plan-09).

Pattern for future competitors (wasmCloud, Spin/Fermyon, Winglang, SST/Ion, Qovery, Northflank, Backstage, Crossplane, Radius, Supabase …): add a sibling `<vendor>.md` doc with the same section layout (overview → feature surface → differentiators → `## hobo-mapping`).

## Sources & fair use

These are **third-party reference captures for competitive analysis**. Each file links its upstream source (official docs/repos). Excerpts of **factual interface surface** — API signatures, CLI flags, config/schema shapes, short illustrative snippets, and clearly-attributed status quotes — are reproduced under **fair use for commentary, comparison, and interoperability analysis**, deliberately limited to what's needed to map each product to HoBo. All product names, trademarks, documentation, and code remain the property of their respective owners and are governed by their own licenses; nothing here grants rights to that material. If you own one of these works and want an excerpt adjusted or removed, open an issue. These captures are _not_ part of the HoBo product and carry no HoBo license.
