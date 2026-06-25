# HoBo Manifest Contract POC

This draft pins `hobo.manifest/v1`, the deployment IR emitted by resource
collection and consumed by Planner/Orchestrator.

It covers:

- `schema: "hobo.manifest/v1"` plus a required `componentHost` kind/version pin.
- Resource entries for `data.v1`, `component.v1`, and `website.v1`.
- Lazy tokens such as `{db.connectionString}`.
- Humanitec-style placeholders such as
  `${resources.data.postgres#db.outputs.connectionString}` and `${context.*}`.
- Aspire fallback environment conventions:
  `ConnectionStrings__<name>` and `services__<name>__...`.
- Stable content hashing from canonical JSON.
- Fail-closed validation for dangling tokens and unresolved capability links.

Run:

```powershell
npm.cmd --prefix src\draft\hobo-manifest-contract test
```
