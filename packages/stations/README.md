# `@hobo/stations`

**Station** is the hard control-plane isolation boundary a Conductor occupies
([ADR-0131](../../docs/design/adr/01-architecture-core.md#adr-0131)). App topology
stays **Bindle ⊂ Camp ⊂ Yard ⊂ Junction** — Station does **not** contain Yards.

This package owns Station aggregates, Rails (content-addressed profiles), local
Station client under `HOBO_HOME/stations/`, and StationService fold/events.

## Install / consume

Workspace package. Prefer importing from `@hobo/stations` after monorepo build:

```ts
import {
  station,
  initStation,
  createStationClient,
  createBootstrapRail,
  StationService,
} from "@hobo/stations";
```

## Authoring

```ts
import { station } from "@hobo/stations";

export const acme = station("acme-platform", {
  isolation: {
    tenant: "acme",
    residency: "us",
    airgap: false,
    trustDomain: "acme.hobo.local",
  },
  rails: ["rail-prod"],
});
```

CLI (ops/setup, not lifecycle verbs): `hobo station init|up|down|status|rails *`.

## Station capabilities (ADR-0155)

`stationCapability()` declares a schema-versioned facility a Station offers its
occupants (`hobo.station-capability/v1`; closed kind vocabulary; provenance
`default | discovered | declared`); declarations attach via
`station(..., { capabilities })`. `matchStationCapabilities()` matches a
declared set against host observations **fail-closed** (declared-but-unobserved
is missing) and produces a `hobo.station-capability-manifest/v1`, persisted
beside the Station data (`stationCapabilitiesPath` →
`HOBO_HOME/stations/<id>/capabilities.json`). Consumed by `hobo-code init`
machine discovery — see `docs/design/stations.md`.

```ts
import { matchStationCapabilities, stationCapability } from "@hobo/stations";

const git = stationCapability({
  kind: "vcs",
  slug: "git",
  title: "git on PATH",
  required: true,
  remediation: "install git",
});
const manifest = matchStationCapabilities({
  stationId: "station:local",
  declared: [git],
  observations: [
    { capabilityId: git.id, present: true, evidence: ["bin:/usr/bin/git"] },
  ],
});
```
Missing Station fails closed — run `hobo station init`. See
[`examples/self-host-station`](../../examples/self-host-station/README.md).

## Station capability coverage (ADR-0157)

`matchStationCapabilities()` above answers "what facilities does the **host**
under this Station offer". `aggregateStationCapabilities()` answers the sibling
question one layer out: **which ADR-0151 capability profiles can this Station
satisfy at all, through which Yards, on which providers — and which expected
profiles can it not satisfy.**

A **Yard is a catalog, not an inventory** (ADR-0157 decision 1): a binding row
says the Yard is *able to* allocate an offering, not that anything is selected,
pooled, or running. Several rows per profile is therefore the **normal** case —
Azure's `web` is legitimately Static Web Apps *and* App Service *and* Container
Apps *and* AKS. So the report states **coverage breadth** (how many distinct
offerings, in which Yards) and **never picks a winner**: selection stays
ADR-0151's job at resolution time (hard gates, then lexicographic ordering).
Ordering here is a canonical sort on identifiers, carrying no preference.

Catalogs are taken **structurally** (`StationYardCatalogInput` mirrors
`YardBindingInput` without importing `@hobo/yards`) — Station is not app-topology
containment (ADR-0131: a Station *seeds* a Yard, it does not contain one), so the
aggregation takes the data and leaves the layer dependency un-taken. The record
holds identifiers only, never realization parameters, so it cannot carry a
credential.

```ts
import {
  aggregateStationCapabilities,
  renderStationCapabilityCoverage,
} from "@hobo/stations";

const coverage = aggregateStationCapabilities({
  stationId: "station:acme",
  yards: [
    {
      yardName: "yard:azure-east",
      providerId: "azure",
      bindings: [
        { profile: "web.hosted/v1", productId: "azure:app-service" },
        { profile: "web.hosted/v1", productId: "azure:static-web-apps" },
        { profile: "data.postgres/v1", productId: "azure:flexible-server" },
      ],
    },
    {
      yardName: "yard:cf",
      providerId: "cloudflare",
      bindings: [{ profile: "web.hosted/v1", productId: "cf:workers" }],
    },
  ],
  expected: ["web.hosted/v1", "data.postgres/v1", "bucket.s3-compatible/v1"],
});

console.log(renderStationCapabilityCoverage(coverage)); // hobo station status digest
```

The deep-frozen report carries `served` (offerings per profile, sorted by
profile → yard → productId, with counts, yards and providers), `gaps` (expected
profiles no Yard can satisfy, each naming what to add), `singlySourced`
(profiles served by exactly one offering — a **resilience signal, not an
error**: one catalog edit away from a gap), `providerConcentration` (factual
dependency accounting, so "every capability here is Cloudflare" is visible
without arithmetic — counts and sole-source facts, never a score), and `ok`
(no gaps in the expected set). `renderStationCapabilityCoverage()` produces a
short deterministic plain-text digest with gaps first; it takes no TUI or
design-system dependency.

Parse-don't-validate and fail-closed: a bad profile grammar, a row constraining
neither `productId` nor `connectivityId`, a duplicate row or Yard, or a
malformed catalog is a typed `StationCapabilityCoverageError` (`code` +
`remediation`), never a silently skipped row — a dropped row would understate
coverage, which is a portability lie. The report is a pure function of its input
and carries **no timestamp**: nothing about coverage depends on when it was
computed, and a `generatedAt` would make two equal inputs compare unequal.

### Honesty: what coverage does and does not mean

Coverage means a Yard **declares** it can allocate an offering for the profile.
It is **not** evidence that a Resource Definition is registered, that the named
product exists in the catalog, that the provider matches, or that a deploy would
succeed. Those are resolution-time gates and surface as `YARD_BINDING_PRODUCT_UNKNOWN`,
`YARD_BINDING_PROVIDER_MISMATCH`, and `YARD_BINDING_EXCLUDED_ALL` (ADR-0157
decision 4) — not here. Aggregation deliberately does not infer a product's
provider from its id (ADR-0144 forbids naming-convention inference), so
`ok: true` reads exactly as "every expected profile has at least one declared
offering", and nothing stronger.

## Traffic routing synthesis

`applyRoutingObservations` merges provider `observe.health` / `observe.location`
signals into a topology before synthesis. Missing signals stay best-effort
(degraded notes); confirmed health/location can yield a non-degraded plan.

`synthesizeRoutingPlan` is the pure Station-side bridge from a portable topology
snapshot plus an existing `PolicyDecision` to a parsed `RoutingPlan`. Missing
Station context, a mismatched/denied policy decision, or a confirmed minimum-
availability violation returns a typed denial. Known-unhealthy backends are
excluded; unknown health/location signals produce a degraded best-effort plan
with explicit notes. Synthesis does not call clouds or take ownership of Junction overlay configuration. See
[ADR-0143](../../docs/design/adr/07-portability-extensibility.md#adr-0143).

## CI budget routing

For the hosted relay, publish the desired policy with
`createCiRelayClient().putDesiredPolicy(policy, {revision})`. Set its thresholds
in the SDK policy, then connect a scoped observation publisher to Broker:

```ts
import { createCiRelayClient } from "@hobo/ci-gh-actions/client";
import { createHostedCiBudgetRoutingBridge } from "@hobo/stations";

const bridge = createHostedCiBudgetRoutingBridge({
  accountId: "acme",
  tenantId: "acme",
  client: createCiRelayClient({
    origin: "https://ci.example.com",
    accountToken: () => readObservationToken(), // observations:write
  }),
});
// Deliver Broker's {type, data} facts and acknowledge only after success.
await bridge.accept(JSON.stringify({ type: signal.type, data: signal.data }));
```

The hosted bridge retries revision conflicts up to five times. Replaying an
already applied fact is idempotent. Policy thresholds and enabled providers
remain operator-owned; the signal publisher cannot change provider balances or
operator intent. The subscriber must retain and retry failed facts.

For the legacy self-hosted v1 relay, `createCiBudgetRoutingBridge()` turns tenant-scoped Broker
`budget.ThresholdCrossed` and `budget.Recovered` facts into eligibility changes
on a HoBo CI account. The relay selects the eligible offer with the lowest
projected cost after applicable free allocation, within account and provider budgets.
Offer IDs below refer to offers already configured on that account.

```ts
import type { BudgetSignal } from "@hobo/broker";
import { createCiRelayClient } from "@hobo/ci-gh-actions/client";
import { createCiBudgetRoutingBridge } from "@hobo/stations";

export function ciBudgetSubscriber(accountToken: () => Promise<string>) {
  const bridge = createCiBudgetRoutingBridge({
    client: createCiRelayClient({
      origin: "https://ci.example.com",
      accountToken,
    }),
    policy: {
      accountId: "acme",
      tenantId: "acme",
      normalOfferIds: ["github", "blacksmith", "depot", "k8"],
      thresholds: [
        { thresholdFraction: 0.8, offerIds: ["depot", "k8"] },
        { thresholdFraction: 1, offerIds: ["k8"] },
      ],
    },
  });
  return {
    deliver: (signal: BudgetSignal) =>
      bridge.accept(JSON.stringify({ type: signal.type, data: signal.data })),
    reconcile: () => bridge.reconcile(),
  };
}
```

Attach `deliver` to the existing Broker budget-fact subscription, passing only
its `{type, data}` projection. The host supplies the account-token callback from
its secret binding. A revision conflict propagates to the subscriber; retry the
same journal fact after rereading policy. Do not acknowledge a failed delivery.

The bridge rejects malformed and foreign-tenant facts before calling the relay.
It persists each threshold's cycle and crossed state in the account's revisioned
policy, so restart and duplicate delivery preserve ordering. The highest active
configured threshold selects the profile, including when different thresholds
arrive out of order. Recovery restores the next active profile or
`normalOfferIds`. An empty offer list explicitly pauses admission. Unknown offer
IDs fail without a policy write.

Call `reconcile()` after changing the configured profiles to apply them to the
persisted crossing state without inventing another Broker event. Changes affect
future execution eligibility; they do not migrate a running job. The bridge
preserves monetary snapshots and lease accounting. Its runtime dependencies are
the shared CI protobuf contracts and a structural policy-client port; it does
not import the Broker or GitHub Actions runtime.

Tests feed real `foldBudgetSignals()` output into the bridge and durable relay
policy, then exercise CI routing, recovery, replay and conflict handling. The
Station Pact artifact pins the policy read/write boundary. These tests require
no live provider account.

## Honesty

- Control-plane isolation primitive; not a multi-tenant hosted product by itself.
- Privileged access gateway helpers re-export from `@hobo/connectivity` where applicable.
- Live multi-Station federation remains out of this package’s local client path.

## Scripts

```sh
pnpm --filter @hobo/stations test
pnpm --filter @hobo/stations build
```

## Related

- `@hobo/broker` — pure Conductor (receipts pin `stationId` + `railHash`)
- `@hobo/connectivity` — overlay / PAM / policy foundations
- Design: ADR-0131, package map in `docs/design/package-namespaces.md`
