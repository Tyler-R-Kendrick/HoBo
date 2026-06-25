# HOBO-114 PortabilityReport Contract POC

This draft pins the provider-side `PortabilityReport` contract emitted from `realize()` and attached
to `deployment.Planned`.

It proves:

- fully portable provider realization emits an empty non-portable surface
- provider-specific `.with(...)`, `.raw(...)`, cross-paradigm features, static keys, and
  external/adopted resources are explicit report entries
- static keys and brownfield dependencies also become zero-secret audit exceptions
- the same report object is the gate input consumed after planning
- conformance catches provider under-reporting before a gate evaluates the plan

Scope intentionally stops before `can-deploy` evaluation, `hobo doctor` UX, multi-cloud E2E
assertions, adopt/import runtimes, or concrete provider adapters.

Run:

```powershell
npm.cmd --prefix src\draft\portability-report-contract test
```

Relevant design records:

- `docs/design/adr/07-portability-extensibility.md`: ADR-0024 points 1 and 4, ADR-0041 point 2
- `docs/design/control-plane.md`: resolution pipeline, `realize()` provider authoring, and
  adopt-in-place notes
