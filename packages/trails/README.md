# @hobo/trails

**HoBo Trails** — versioned, app-owned, composable continuous migration
runbooks/recipes. Platform continuous identity duals remain hands-off (zero
Bindle config); app-authored Trails cover schema/data transforms and cross-cloud
moves over junctions.

## Quick start

```ts
import {
  createContractAssertedTrailFixtures,
  defineTrail,
  TrailRunner,
  evaluateCanTrail,
  runTrailGoldenSuite,
  PLATFORM_RECIPES,
  activateIdentityContinuousFromMatching,
  createHandsOffIdentityTrail,
} from "@hobo/trails";

// Hands-off continuous identity (Matching-driven; zero authoring)
// Public surface is Trails-owned DTOs only — no @hobo/identity types leak.
const id = createHandsOffIdentityTrail({ tenant: "acme" });
activateIdentityContinuousFromMatching({ handle: id });

// App-authored data Trail composed with platform recipes
const trail = defineTrail({
  id: "app.checkout.migrate",
  version: "2026.07.27.1",
  recipeList: [PLATFORM_RECIPES.IdentityContinuous, PLATFORM_RECIPES.ValidationOracle],
  steps: [
    {
      id: "schema-v1",
      kind: "schema",
      schema: { mode: "expand-contract", version: "1" },
      progressive: true,
    },
    {
      id: "data-dual",
      kind: "continuous-dual-data",
      dependsOn: ["schema-v1"],
      data: {
        mode: "cdc-dual",
        transformId: "checkout.backfill",
        checksum: "sha256:" + "a".repeat(64),
      },
    },
  ],
});

const runner = new TrailRunner({ tenant: "acme", target: "staging" });
const plan = runner.plan(trail);
const result = runner.run(trail);
const golden = runTrailGoldenSuite(result, {
  bindleConfigRequired: false,
  continuousDefault: true,
});
```

## Local fixtures

```ts
const fx = createContractAssertedTrailFixtures({ tenant: "local" });
// fx.fidelity === "simulated"
fx.runner.run(fx.appTrail);
fx.identity; // hands-off continuous identity handle
```

## CLI

```
hobo trails status
hobo trails plan
hobo trails inspect <id>
```

## Principles

1. Continuous identity = platform recipe, Matching/policy, dual fixtures — **no Trail authoring required**.
2. App Trails = versioned schema/data/junction steps composed with platform recipes.
3. Progressive ramp via existing Harness `FeatureFlagStore`.
4. Fail-closed dual oracles + compensation; history is durable and idempotent.
