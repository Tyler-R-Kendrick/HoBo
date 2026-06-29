# Topology Objects Contract

Independent POC for HOBO-62. It pins the first-class topology object surface:

- `bindle(name, builder)` collects provider-agnostic resource declarations in code;
- `camp(name, ...)` maps one Bindle to one provider-specific target and records runtime, environment type, and mapping overrides;
- `yard(name, ...)` composes Camps for exactly one provider;
- `junction(name, ...)` composes one or more provider-specific Yards;
- per-port resolution precedence is recorded as `bindings -> tiers -> defaultProvider`.

Out of scope: Planner/Matching, inferred auto-placement, connectivity realization, and `camp().config(...)` secret-source mapping.

Run:

```sh
npm.cmd --prefix src/draft/topology-objects-contract test
```
