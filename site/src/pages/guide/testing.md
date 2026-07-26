---
layout: ../../layouts/Docs.astro
title: Testing
description: "How to test a HoBo app at every layer: unit tests with PACT-mocked boundaries, executable contracts, deployment rehearsal on the local lane, replay-equals-live, and runtime availability with session-scoped chaos."
---

# Testing

> *Trust the bindle, test the journey.*

Everything in HoBo routes through typed boundaries with contracts, and everything that happens is a replayable event. That collapses most of the usual testing tooling into one idea: **point a boundary at a different route**. Live for production, mock for unit tests, replay for dependency-free re-runs, fault for chaos — the same [ADR-0076 boundary modes](/HoBo/guide/bridge/) everywhere, so nothing about your tests is provider-specific.

## Testing code

Your services, actors, and workflows are plain functions — test them with your test runner (the reference stack uses vitest). Dependencies are boundaries, and boundaries **auto-mock from their contract examples** — no hand-written mocks, ever:

```ts
import { createBoundaryRouter } from "@hobo/runtime";
import { expect, test } from "vitest";

const router = createBoundaryRouter();

// The payments boundary, served straight from its PACT interactions.
const payments = router.boundary<Charge, Receipt>("payments").mock([
  {
    input: { orderId: "o-1", amount: 42 },
    output: { orderId: "o-1", status: "charged" },
  },
]);

test("checkout charges the cart", async () => {
  const receipt = await payments.call({ orderId: "o-1", amount: 42 });
  expect(receipt.status).toBe("charged");
});
```

Matched inputs return their example's output; unmatched inputs get the first example as a canned, correctly-typed response. Dependencies that don't exist yet are the same story — a [declared operation's](/HoBo/primitives/bindles/#greenfield-declare-the-bindle-generate-the-code) contract-derived stub serves it, and every stub call is recorded as a specification-by-example trace.

**Trainables test themselves.** A `@trainable`/`@operation` contract's examples double as its eval suite: resolve the same instance by token (`resolveTrainable(token)`) in a test, and the assertions you write are the eval cases the live training loop reuses. One example table, two jobs.

## Testing contracts

Every service boundary ships **executable PACT contracts** (`contracts/pacts/` in each package). The consumer side runs them against the provider's verifier; certification is mechanical:

- Consumer tests generate/refresh the pact document.
- Provider verification replays every interaction against the real implementation with **subset matching** — the expectation must be a subset of the actual response, so providers can grow without breaking consumers.
- The same interactions feed [the Bridge](/HoBo/guide/bridge/): a local implementation must pass the boundary's contract *before* it may carry any traffic.

## Testing deployments

Deploys are plans before they're actions, which makes them testable at three speeds:

1. **`hobo plan`** — the pure rehearsal. A blocked gate is a no-op: nothing was provisioned, prod is untouched, and the plan output *is* the test result (resolution, cost, policy verdicts).
2. **The local lane** — full `hobo up` against the default local, in-memory camp: build, plan, gate, provision, deploy, all in-process. Your CI runs a complete deployment on every commit without a cloud account.
3. **Replay** — because every move is an event, a recorded deployment replays deterministically. The `replay-equals-live` discipline: re-running the log must converge to the same state, and boundaries in replay mode serve recorded outputs so the re-run needs none of the original dependencies:

```ts
const payments = router.boundary<Charge, Receipt>("payments").live(deployed);
await payments.call({ orderId: "o-1", amount: 42 }); // recorded

payments.replay(); // now serve the recording — the dependency can be gone
const again = await payments.call({ orderId: "o-1", amount: 42 });
```

## Testing runtime availability

- **Synthetics.** The Crew's endpoint-monitor operator probes your camps' endpoints continuously; results land as events, so "was it up at 3am" is a query, not a dashboard screenshot.
- **SLOs as projections.** Availability targets are materialized views over the event log — testable in CI against replayed history.
- **Chaos without blast radius.** Fault injection is a boundary mode, and it's **session-scoped**: break a dependency for your dev session only, against the real topology, while every other request flows normally.

```ts
payments.fault({ message: "simulated outage", session: "tyler/chaos" });

await payments.call(charge, { session: "tyler/chaos" }); // throws — for you
await payments.call(charge);                             // fine — for everyone else
```

- **Shadow lanes.** Point a candidate implementation at real traffic with `.shadow(candidate)`: it receives every served input, its output is compared and reported (`shadowDiffs()`), and it is **never** returned to a caller. Availability testing for the next version, paid for by the current one.

## Where each test runs

| Layer | Runs in | Needs a cloud? |
|---|---|---|
| Code (unit) | your test runner, boundaries mocked from PACT | no |
| Contracts | consumer + provider PACT verification | no |
| Deployment | `hobo plan` / local lane / replay | no |
| Availability | live camps: synthetics, SLO projections, scoped faults, shadows | yes — that's the point |

The first three layers are fully offline by construction. Only availability testing touches real infrastructure, and even there the blast radius is a session tag.

## Related

- [The Bridge](/HoBo/guide/bridge/) — the same boundary routing, used for local/remote development.
- [Bindles: greenfield](/HoBo/primitives/bindles/#greenfield-declare-the-bindle-generate-the-code) — contract-derived stubs and specification-by-example.
- [The trail map](/HoBo/guide/status/) — which lanes ship today.
