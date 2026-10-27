# @hobo/provider-lakebed

The Lakebed deploy-target `CloudProvider` (HOBO-714,
[ADR-0127](../../../docs/design/adr/07-portability-extensibility.md#adr-0127)):
HoBo's portability promise demonstrated against the **head-on competitor** —
the same Bindle that targets AWS/Azure/GCP lands on the closed Capsule PaaS,
with the gaps stated honestly instead of papered over.

| Port | Lakebed surface | Resource class | Honest gaps |
|---|---|---|---|
| `compute` | Capsule | `lakebed:capsule` | not `container` |
| `kv` | Capsule KV | `lakebed:capsule-kv` | — |
| `objectStore` | File Store | `lakebed:file-store` | not `s3-compatible` |
| `database` | Reactive DB | `lakebed:reactive-db` | not `postgres` |
| TrafficRouting (ADR-0143) | Deploy-time route binding | `lakebed:traffic-route` | no multi-LB API — in-process weighted selection lives in `@hobo/connectivity`; this resource binds capsule endpoints for `lakebed-deploy` |

No queue, no cache — a `require` the Capsule runtime can't satisfy surfaces
as `partial(missing)`/rejection with remediation naming a provider that can
(ADR-0033).

`realizeTrafficRoutingPlan(plan)` emits a one-resource `hobo.driver-program/v1`
with `lakebed:traffic-route` for dual-layer production routing (in-process
selection in connectivity + optional deploy binding here).

Matching surface: `LAKEBED_TRAFFIC_ROUTING_PROFILE` declares
`inprocess.weighted` + `driver.route-bind`.

- **Realization is a Driver, not IaC**: `realize()` emits a
  `hobo.driver-program/v1` targeting the `lakebed-deploy` driver — one
  Capsule deploy per deployment. Output-reference validation ignores non-string
  values rather than treating them as references.
- **Opt-in approval**: `hobo add lakebed` registers **held**; a second
  `hobo add lakebed` approves (HOBO-710 semantics) — deploying to the
  competitor's runtime is an explicit operator decision.
- **Secretless**: broker-minted, deployment-scoped deploy tokens;
  `staticSecrets: false` parse-enforced.
- **Anonymous temporary stations**: `provisionTemporaryEnvironmentStation()`
  runs Lakebed's password-free anonymous deploy (CLI transport by default;
  injectable for tests). Returns the shared
  `hobo.temporary-environment-station/v1` shape (`stationUrl` + `claimUrl` +
  TTL). **Never** uses `LAKEBED_TOKEN` on this path. Permanent-token operator
  deploys are out of scope for Examples.

Native ports (Matching truth): `compute`, `kv`, `objectStore`, `database` —
see `lakebedNativePorts()`. Queue/container are not native.

## Verification

```sh
pnpm --filter @hobo/provider-lakebed build
pnpm --filter @hobo/provider-lakebed test
```
