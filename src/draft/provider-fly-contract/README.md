# HOBO-174 Fly Provider Contract

Independent POC for `@hobo/provider-fly`.

Executable surface:

- `createFlyProvider()` publishes the Fly provider factory, `.with` builders,
  `capabilityManifest()`, `client()`, provider-owned default definitions, and
  declarative `realize()` output.
- Fly resource equivalence maps portable ports to Fly Machines, Fly Volumes, Fly
  Postgres, Tigris, NATS, and Upstash.
- The provider claims `compute`, `volume`, `database`, `objectStore`, `queue`,
  and `cache` in its capability manifest.
- The shared provider-capability conformance suite is used for seed ports:
  `compute`, `database`, `objectStore`, `queue`, and `cache`.
- Volumes are proved with a package-local conformance check because the current
  shared seed suite has no `volume` capability lane.
- Subtype guards fail closed for non-container compute and non-Postgres database
  requests.

Scope boundary:

- No Fly API calls or IaC backend execution.
- No global anycast routing or multi-region failover.
- No broad Fly surface beyond the seed ports named by HOBO-174.

Verification:

```powershell
npm.cmd --prefix src\draft\provider-fly-contract test
```
