# @hobo/bindles

Minimal v1 closure-builder surface for explicit Bindle authoring. Assembly creates
provider-agnostic manifest objects only — no runtime semantics (ADR-0072).

## Features · experiments · rollouts (Harness IfC)

```ts
import { features, declareExperiment, rollout } from "@hobo/bindles";

export const appFeatures = features({
  "new-checkout-flow": {
    state: "ENABLED",
    percentage: 10,
    variants: { control: false, treatment: true },
    defaultVariant: "control",
    killSwitch: false,
  },
});

export const checkoutExp = declareExperiment("checkout-exp", {
  flag: "new-checkout-flow",
  variants: ["control", "treatment"],
  metrics: ["conversion"],
});

export const canary = rollout({
  name: "checkout-canary",
  flag: "new-checkout-flow",
  stages: [{ percent: 5 }, { percent: 25 }, { percent: 100 }],
  traffic: "gateway-weighted",
  autoRollback: true,
});
```

Runtime evaluation and progressive composition live in `@hobo/identity`
(`FeatureFlagStore`, `createHarness`) — see [ADR-0044](../../docs/design/adr/02-identity-security.md#adr-0044)
and [ADR-0083](../../docs/design/adr/02-identity-security.md#adr-0083).

## Parse, don't validate

`bindle()` returns frozen `BindleManifest` derived types. Invalid dependency handles are
unrepresentable past the builder seam.

`pnpm --filter @hobo/bindles run test:schema` vets manifest fixtures with `HOBO_CUE_BIN`,
the root `.tools/cue/v0.14.0/` cache populated by `pnpm run test:schema`, or `cue` on `PATH`.

## Event architecture

Bindle collection is modeled as a command that emits manifest snapshot events for downstream
lowering actors. Projections materialize resource descriptors and `dependsOn` relationships;
snapshots land in the read store for SDK slices — actors emit events and never mutate read models
in place.
