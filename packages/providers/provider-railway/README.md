# @hobo/provider-railway

Railway as a HoBo `CloudProvider` for Examples out-of-the-box yards: an
equivalence table, Matching answers over it, a driver program per plan, and a
temporary Environment Station boundary that **refuses**.

Everything here is data and pure functions. There is no `fetch`, no
`Date.now()`, no `process.env`, and no filesystem access in `src/`. This package
talks to the Railway API not at all — it describes what Railway can be asked
for, and the deploy driver named in the emitted program is what would do the
asking.

## What the provider actually claims

| Abstract port | Railway resource class | Product | Features admitted |
|---|---|---|---|
| `compute` | `railway:service` | Railway Service | `http`, `container`, `managed` |
| `kv` | `railway:redis` | Railway Redis | `key-value`, `durable` |
| `queue` | `railway:queue` | Railway Queue | `queue` |

Three ports, and no fourth. A requirement for `data`, `bucket`, or anything
else gets `{ kind: "none" }` rather than an optimistic partial, because an
invented parity is what makes Matching place work somewhere it cannot run.

### Deliberately absent

Absences here are load-bearing: a missing structured capability fails a
`required` feature gate, while an optimistic one passes it.

| Not claimed | Why |
|---|---|
| Regions | `regions: ["global"]`. Railway does have regions; this package models none, so it will not promise one. |
| Cost | `cost.facts` is empty and every `estimateCost` returns `marginalPrice: "0"`. That means **unpriced here**, not free. A real price needs dated `COST_SOURCE` provenance this package does not carry. |
| Temporary / agent Environment Stations | `supportsAnonymousTemporaryDeploy = false`. Railway publishes no password-free temporary-account or agent-provision API, so the call **fails closed** rather than reaching for a permanent token. |
| IaC emission | `realize` returns a driver program (`hobo.driver-program/v1`), never a Pulumi/Terraform program. |

## Parse, don't validate

`src/parse.ts` is the only place untrusted input crosses into this package, and
what comes out the other side are **derived domain types** that cannot hold the
bad case:

- `parseRailwayResourcePlan` turns a deploy plan of `unknown` provenance into a
  `RailwayResourcePlan` whose `port` is one of the three ports the equivalence
  table actually claims and whose `name` is a branded `RailwayResourceName` —
  already a DNS label, because that name becomes part of a hostname downstream
  (ADR-0130). `realize()` calls it first, so nothing after it re-checks a port
  or re-sanitizes a name.
- `parseRailwayPort` is the same question where "not mine" is a contract
  violation; `railwayPortOrUndefined` is the same question where it is a normal
  Matching answer. Splitting them is why `satisfies()` can return `none` while
  `client()` throws.
- `parseRailwayBindings` refuses a deploy output that is a document rather than
  a locator: keys must be identifiers, values a single printable line of at most
  2048 characters. A multi-line value is how a credential arrives by accident.
- Rejections are one type, `RailwayInputRejectedError`, carrying the code
  `HOBO_RAILWAY_INPUT_REJECTED` and the offending field.

`data-models/provider_railway.proto` is the design-time wire view of these
shapes and `data-models/provider_railway.cue` carries the invariants the parsers
enforce (DNS-label names, the three-row equivalence table, a partial match that
must name what is missing, `prefer`-only option blocks, an unpriced cost signal,
and a refusal that cannot claim support). The parsed types above are the
executable view of that pair. No buf codegen is wired for this package, so the
two TypeScript declarations that share a proto message name are marked
`domain-view:` where they are declared.

## Event architecture

This package is a strategy leaf: it owns no reducer, no stream, and no store.
The durable machinery is the yard placement plane in `@hobo/broker`
(`src/yard-placement/`), and what this package contributes is one honest answer
per question.

1. The **command** side of the yard family is recorded as facts rather than a
   separate type: `yard.PlacementRequested` and `yard.GenerationRequested` are
   what a caller issues. `capabilityManifest()`, `satisfies()`, `estimateCost()`,
   `realize()`, and `client()` are the pure halves those commands consult here.
2. The plane turns those answers into the **events** of the `yard.*` family —
   `yard.MatchDecided`, `yard.GenerationReserved`, `yard.GenerationProvisioned`,
   `yard.GenerationFailed`, `yard.PlacementResolved`, `yard.PlacementRejected`.
   A refused temporary Environment Station lands as a `yard.PlacementRejected`
   carrying `HOBO_TEMP_PROVISION_UNAVAILABLE`; `railwayTemporaryStationRefusal()`
   exists so that reason is data the plane can record, not an exception it has to
   catch to find out.
3. `foldYardEventStore` is the **actor** over that stream: it consumes the
   family and rebuilds `YardEventStoreState` from the durable **event store**,
   which is the SQLite-backed journal behind the ports in `@hobo/storage-sqlite`
   (ADR-0135) — one partition, one writer, appends fenced by stream head.
4. `snapshotYardEventStore` / `restoreYardEventStore` are the **snapshot** pair
   the next fold resumes from instead of replaying the whole journal.
5. `inventorySnapshotFromFold` produces `YardInventorySnapshot`, the
   **materialized view** the placement **projection** reads, and
   `YardPlacementDecisionRow` / `YardGenerationAttemptRow` are the **read store**
   rows `hobo yard status` renders. Nothing this package emits reaches those rows
   as anything but a port name, a resource class, a locator, or a refusal code.

Because the refusal is a fact rather than a silence, a projection cannot show a
Railway yard as pending a temporary station that will never arrive.

## Usage

```ts
import { createRailwayProvider, railway } from "@hobo/provider-railway";

const provider = createRailwayProvider();

provider.capabilities
  .find((capability) => capability.port === "compute")
  ?.satisfies({ port: "compute", features: ["http"] }); // { kind: "full" }

provider.realize({ name: "sessions", port: "kv" });
// { driver: { apiVersion: "hobo.driver-program/v1", driver: "railway-deploy", … } }

railway.with.service({ replicas: 2 });
// Camp/Yard-scoped provider escape, negotiation: "prefer" — never a Bindle pin
```

## Tests

Fully offline.

```sh
pnpm --filter @hobo/provider-railway test
```

Gates protecting this package: TypeScript (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), the consumer-driven
contract in `contracts/provider-railway-yard-boundary.pact.json` — replayed
interaction by interaction against the real provider in
`test/boundary.contract.test.ts` — and the protobuf + CUE boundary shapes in
`data-models/`.
