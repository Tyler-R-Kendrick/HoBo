# HOBO-45 Resource Definition + Driver Contract POC

This draft pins the M0 Resource Definition and Driver seam:

- `defineResource()` normalizes provider, driver, match criteria, `.with` options, mapping, priority,
  and co-provisioned graph metadata.
- `createResourceCatalog().register(...)` accepts one definition or a provider's shipped default
  definitions, exposes definitions by resource type, and emits a stable content hash.
- `Driver` is the minimal `provision` / `destroy` / optional `refresh` interface named by a
  Resource Definition.
- Ambiguous definitions are surfaced in the catalog snapshot for Matching to resolve by
  priority/objective/tiebreak, instead of silently disappearing.
- The `echo` driver is explicitly read-only for externally managed resources.

Scope intentionally stops before matching/scoring, provider `realize()` implementations, concrete
Terraform/Pulumi/OpenTofu/Crossplane backends, and ResourceActor reconciliation.

Run:

```powershell
npm.cmd --prefix src\draft\resource-definition-driver-contract test
```

Relevant design records:

- `docs/design/platform-engineering.md`: Resource Definition shape, matching dimensions, mapping
  sugar, driver taxonomy, co-provisioning
- `docs/design/control-plane.md`: Planner resolves one Resource Definition per resource and
  providers ship default definitions through equivalence + `realize()`
- `docs/design/adr/01-architecture-core.md`: ADR-0006 and ADR-0033
