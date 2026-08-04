# @hobo/provider-convex

Thin Convex deploy-target `CloudProvider` (ADR-0144 thin-adapter rule): the
reactive TypeScript BaaS realized behind HoBo's agnostic ports with
honest-partial capability verdicts, typed impedance limits, and a
credential-gated Management API client.

## What it provides

- **Equivalence classes** (`src/equivalence.ts`): `web/service` →
  `convex:function-host`, `database/reactive` → `convex:document-db`,
  `objectStore` → `convex:file-storage`. Vector search (`search.vector`) and
  scheduled functions (`functions.scheduled`, `crons`) are capability
  *features* — HoBo has no `vector` or scheduler port today, and this package
  does not pretend otherwise.
- **Capability manifest** (`src/manifest.ts`): the four
  `/.well-known/capability-manifest/*` documents with declared public-pricing
  cost facts and a **`deploy-key-brokered`** auth posture — Convex deploy keys
  are static credentials, so the Yard broker holds them and mints short-lived
  grants; `staticSecrets: false` is enforced at parse time and no key ever
  lands in a Bindle, Camp, or this package.
- **Realization** (`src/realize.ts`): `realize(plan)` emits a `convex-deploy`
  **driver program** (`hobo.driver-program/v1`) — a closed BaaS exposes a
  deploy surface, not IaC state. Outputs use the platform's
  `${resources.<name>.outputs.<key>}` placeholders.
- **Impedance boundaries** (`src/impedance.ts`): the hard vendor limits
  (1 s query/mutation, 1 MiB documents, 10 min actions, transaction caps),
  the `document` paradigm fact, and `convexImpedanceFindings()` producing
  plan-time evidence for the PortabilityReport (ADR-0024). Narrative:
  [docs/competitors/convex.md](../../../docs/competitors/convex.md#impedance-boundaries-for-the-provider-path).
- **Management API client** (`src/management-api.ts`): injected-`fetch`,
  presence-only credential gating, fails closed with remediation when no
  broker-minted key is present.

## Architecture evidence

This package follows parse, don't validate: untrusted manifest documents,
Management API payloads, and emitted driver programs become parsed derived
types (or structured errors) at the boundary — `parsePublishedManifest`,
`parseDeployment`, `assertDriverProgram`. It emits no events itself: the
provisioning lifecycle rides the platform's command → event pipeline, where
the Orchestrator's actors append `resource.*` facts to the event store and
projections / materialized views (with snapshots feeding read stores) expose
deployment state — this provider only supplies the derived driver program and
capability documents those flows consume.

## Honesty scope

Realize/IR paths are deterministic and offline. The Management API lane is
**credential-gated**: without `CONVEX_DEPLOY_KEY` (see
`describeConvexTarget`) every live call throws `ConvexCredentialsError` —
fail closed, never a stub. Registered in
[docs/design/live-provider-matrix.md](../../../docs/design/live-provider-matrix.md).
