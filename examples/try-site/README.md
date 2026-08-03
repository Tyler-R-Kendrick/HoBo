# Try-site examples

These four examples drive the static `/examples/` Home Station console. Each
`apps/<id>/` folder owns display metadata, a Bindle definition with its
executable runtime routes, and sparse deployment policy. `yards.json` is the registered
provider-specific Yard pool; each Yard has exactly one provider, while a
Junction composes the Yards selected by policy.

To add an example:

1. Copy an existing app folder and give `meta.json` a unique DNS-safe id.
2. Declare required Bindle capabilities and the exported executable `runtime`
   contract together in `app.ts`.
3. Keep policy sparse. Values merge as defaults → app policy → deployment
   policy; `maxReplicas` limits independent host previews and `maxConcurrent`
   only limits bootstrap workers. Redundancy and routing values are placement
   intent here; the static demo does not implement cross-host failover or mirroring.
4. Add the Yard ids the example may use. An omitted allow-list means any Yard
   in its declared Junction, never every provider automatically.
5. Run `pnpm --prefix examples/try-site test` and the site tests/build.

GitHub Pages never receives provider credentials. Browser-WIT, Webernetes,
Lakebed, and Kubernetes-simulation targets are local blob Environment Stations.
Remote providers remain unavailable until a trusted out-of-browser bootstrap
executor returns only a public URL and TTL.
