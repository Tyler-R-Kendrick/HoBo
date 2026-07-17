# @hobo/events

The reactive-streams + saga kernel for the HoBo data plane (S1-15b): `emit` /
`subscribe` over the event log, a **Reactor** that folds materializations and
pushes recomputed snapshots over the `Streamer` port with reads-your-writes via
`seq`, and `defineSaga` for cross-aggregate choreography with compensation.

Builds on [`@hobo/data`](../data) (aggregates/commands) and
[`@hobo/core`](../core) (EventEnvelope, EventStore, Streamer ports). See
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

```ts
import { createReactor, defineMaterialization, defineSaga } from "@hobo/events";

const openOrders = defineMaterialization({
  name: "openOrders",
  readSet: ["order.Placed"],
  initialState: [] as { orderId: string }[],
  fold: (state, e) =>
    e.type === "order.Placed" ? [...state, { orderId: e.data.orderId }] : state,
});

const reactor = createReactor({ store, streamer });
const sub = await reactor.subscribe(openOrders, { subscriptionId: "sub:orders" });
const { seq } = await orders.execute(deps, "order:1", cmd, ctx);
await sub.awaitSeq(seq); // reads-your-writes: the just-placed order is now visible
```
