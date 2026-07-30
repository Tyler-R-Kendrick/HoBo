# `@hobo/yards`

Authoring topology for **Yard** — the provider-scoped control surface that holds
Camps, policy, and placement intent in the Bindle ⊂ Camp ⊂ **Yard** ⊂ Junction
model ([ADR-0026](../../docs/design/adr/01-architecture-core.md#adr-0026)).

This package is **thin by design**: topology objects and shape export, not the
full hosted control plane. Runtime composition lives in `@hobo/cloud` / `@hobo/hobo`
and examples such as [`self-host-yard`](../../examples/self-host-yard/README.md).

## API

```ts
import { yard, yardToShape, TOPOLOGY_CONTRACT_VERSION } from "@hobo/yards";

const y = yard({
  provider: "local",
  camps: ["dev"],
});

const shape = yardToShape(y);
// TOPOLOGY_CONTRACT_VERSION pins the authoring contract
```

## Honesty / maturity

| Concern | Status |
|---|---|
| Topology authoring (`yard()`) | Implemented |
| Full YardRuntime / planner / live cloud | **Not** this package — see `@hobo/cloud`, `@hobo/hobo` compose |
| Package maturity | Thin topology; do not equate “`@hobo/yards` exists” with “hosted Yard product” |

## Scripts

```sh
pnpm --filter @hobo/yards test
pnpm --filter @hobo/yards build
```

## Related

- `@hobo/camps` — Camp topology objects
- `@hobo/junctions` — cross-Yard federation topology (thin)
- `@hobo/cloud` — control-plane runtime (private)
- `examples/self-host-yard` — disk-backed Yard composition example
