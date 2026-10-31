# Product CLI contracts

`hobo-composition-boundary.pact.json` pins the existing product composition
boundary. `ci-cli.pact.json` adds the account CI consumer: policy read, bound App
installation discovery, and isolated repository connection with bearer headers,
generated protobuf JSON and the current policy revision in `If-Match`.
`test/ci-command.test.ts` executes every interaction through the real CLI and
exported relay client and checks the complete request sequence. These are
hand-authored consumer expectations, not captured or provider-verified traffic.
The corresponding HTTP provider suite remains in
`../../ci-gh-actions/contracts/hosted-control-boundary.pact.json` and its provider
tests. The CLI adds no new server endpoint or response shape.

`test/ci-runs.test.ts` exercises the process contract to GitHub CLI with exact
argument arrays, repository/host selection, bounded JSON parsing, current commit
resolution, retry admission and new-attempt fencing. It uses a process seam;
live GitHub assignment, logs, and reruns remain release checks.

`e2e/ci.test.ts` additionally exercises the built executable over real HTTPS to
the production hosted control plane and native PostgreSQL journal. Restart and
lost-response cases verify idempotent recovery after a durable commit. GitHub App
identity is emulated; provider assignment remains a separate live acceptance.
The account HTTP client bounds responses to 2 MiB and rejects invalid UTF-8;
its consumer contract covers these failures without logging credentials.

TypeScript protects the command integration. `data-models/composition.proto`
owns the generated persisted CI link; `composition.cue` constrains its HTTPS
origin, account and repository. Checked-in valid/invalid fixtures run through the
package schema gate and reject insecure origins, malformed identities and embedded
credentials. Credentials stay outside the link. Relay writes
continue through the existing durable account/setup commands and projections;
the CLI does not introduce a parallel event journal or read model.

## Vercel API (`hobo-vercel-api.pact.json`)

`HoboVercelDeploy` to `VercelApi`: what the composed hobo's two Vercel paths
send (the resolver plane's project lookup and create, the deploy provider's
`POST /v13/deployments`) and the answers they read, including Vercel's 404
envelope for a project nobody created and for a deployment to one. Each
interaction names its Pact v3 provider state (`providerStates`: whether
`hobo-pact-site` or `hobo-pact-missing` exists), so none leans on the one
before it.

- Consumer: `test/hobo-vercel-api.contract.test.ts` (default lane) runs the
  real resolver and client against `createMockProviderFromPact`; every request
  must find its interaction and carry its declared headers, and every
  interaction must be used.
- Provider: `test/mirror/hobo-vercel-api.provider.mirror.test.ts` (the mirror
  lane, `pnpm run test:mirror` at the root, ADR-0174) sends each interaction
  over real HTTP to a mirror.cloud emulator and runs `verifyPact` on its
  answers, after setting up the interaction's provider state through the
  emulator's own API (`stateHandlers`). It verifies the pact as written and
  reversed. The ids Vercel generates are admitted by the pact's Pact v3 `regex`
  matching rules and nothing else. That is mirror's reading of Vercel's OpenAPI
  document, not `api.vercel.com`.

`test/mirror/vercel-deploy.mirror.test.ts` runs `createVercelClient` and
`createVercelDeployProvider` against the same emulator: a deployment it accepts
and records once, its `READY` state after the emulator's clock moves, and the
404 for a project nobody created. The deploy provider does not create the
project it deploys to; the branch that changes that (ADR-0174, consequences)
flips the test to `GetProject 200, CreateDeployment 200` and adds a case for a
missing project.
