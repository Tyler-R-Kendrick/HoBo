# @hobo/hobo

**Product composition root** for the end-user `hobo` CLI (and `hobo-mcp`).
This package is the composed product binary; **`@hobo/cli`** is the shell,
parser, registry, and command factories. Un-injected factories fall back to
intentional stubs; this package supplies the default runtimes so lifecycle verbs
run end to end in-process.

```ts
import { createComposedHoboCli } from "@hobo/hobo";

const cli = createComposedHoboCli();
await cli.run(["up", "--json"], { cwd: projectDir });
```

- `createComposedHoboCli(options?)` — the composed CLI (one shared YardRuntime
  across plan/up/down; login/new/build/codegen keep the `@hobo/cli` defaults).
- `createDefaultYardRuntime(options?)` — the default cloud runtime.
- `createDefaultDevRuntime(options?)` — the default offline dev runtime.
- `createDefaultCollectionTarget(projectDir?)` — the default collect target.

Composed binaries: `dist/bin/hobo.js` (product `hobo`) and `dist/bin/hobo-mcp.js`.
Each keeps its throwaway event store in a `hobo-yard-*` directory under `TMPDIR` and
removes it when it ends: normally, on an error, or on SIGTERM, SIGHUP, SIGINT or
SIGQUIT (`src/owned-temp-dir.ts`; not on SIGKILL or a crash).
Canonical verb list: **38** verbs in `@hobo/cli` (`packages/cli/src/shell/verbs.ts`).

## HONEST SCOPE (default deploy lane)

Default `up` / `down` / `plan` drive the real `@hobo/iac-pulumi` adapter with an
**in-memory Automation-API stand-in** (offline, deterministic). That is **not**
a live cloud apply. Selection lives in `src/compose.ts` (`selectIacProvider`):

| Path | When |
|---|---|
| In-memory Pulumi stand-in | **Default** (no special env) |
| Real Pulumi Automation/CLI | `HOBO_PULUMI_LIVE=1` (engine- and credential-gated); its programs and `file://` state go in `HOBO_PULUMI_WORKDIR`, else in a `hobo-pulumi-live-*` directory removed when the process ends, so set `HOBO_PULUMI_WORKDIR` to keep the state |
| Direct-HTTP resolver plane | a cloud credential **plus** `HOBO_DEPLOY_RESOLVERS=1` (opt-in) |
| Live Cloudflare Workers | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| Live Vercel | `VERCEL_TOKEN` |

**Credentials from OpenSesame (`HOBO_CREDENTIALS=opensesame`, [ADR-0170](../../docs/design/adr/02-identity-security.md#adr-0170)).**
The composed `hobo` then relaunches itself once, before composing anything, as
`opensesame dev --agent --schema <generated> run -- <this invocation>` (through
[`@hobo/adapter-opensesame`](../adapters/adapter-opensesame/README.md)), reading
`hobo.credentials.json` (references only) from the directory the verb works in
(`--cwd`, else the working directory), and exits
with the run's status: the command's own, 77 for a tripwire, 128+n for a signal,
1 for a run that left placeholders or never started. The relaunched process
holds an `osr_` surrogate in `VERCEL_TOKEN`; `selectIacProvider` refuses anything
else with `OPENSESAME_PLACEHOLDERS_ONLY` before any request (it runs when the
runtime is composed, so a placeholder run stops there with status 1). Vercel only; AWS is
not brokered. `src/credentials-opensesame.ts`. An invocation that runs no verb
(`--help`, no verb, an unknown verb or option) needs no credential: it is answered
without starting OpenSesame, composed with none.

`hobo-mcp` relaunches the same way (its tools run the same verbs), stdin and stdout
passing through to the relaunched server, but only with `OPENSESAME_STORE_PASSWORD`
in its environment: its stdin is the MCP stream, which OpenSesame would otherwise
read the store passphrase from. Without it, it starts nothing and exits 1 with one
`hobo: OPENSESAME_STORE_PASSWORD_REQUIRED` line. The library entry points
(`createComposedHoboCli`, `createDefaultYardRuntime`, `openBareMetalYard`) never
relaunch; outside a proxied run they throw the typed `OpenSesameCredentialsError`
when the runtime is composed.

The relaunch gets only the Node options that read no environment or code from disk
(`src/relaunch-node-options.ts`): `node --env-file=.env hobo up` does not re-read
`.env` in the run, and `--require`, any `--import` but hobo's own TypeScript loader,
and `--inspect` are left out too, from the command line and from `NODE_OPTIONS`, and
named on one `hobo:` line. A relaunched process that still holds another provider's credential
(`CLOUDFLARE_API_TOKEN`, `AWS_*`, `PULUMI_ACCESS_TOKEN`, … beside its surrogate) is
refused with `OPENSESAME_CREDENTIALS_BESIDE_SURROGATE`, which names the variables and
never their values. `HOBO_PULUMI_LIVE=1` is refused there too
(`OPENSESAME_LANE_NOT_BROKERED`): the live Pulumi engine authenticates with credentials
found outside OpenSesame, which only brokers Vercel's token.

Related honesty elsewhere in this package:

- **`hobo login`** — fixture/OIDC session under `HOBO_HOME`; full production OIDC/SPIRE is not the default (`src/login-command.ts` `HONEST SCOPE`).
- **WASM build path** — when `hobo build` uses `@hobo/componentize`, artifacts are **synthetic wasm contract bytes**, not a real jco/`componentize-js` pipeline (see [`packages/componentize/README.md`](../componentize/README.md)).

**Pre-release:** `@hobo/hobo` is **not published to npm** as a stable install story yet. Prefer the monorepo workspace binary until publish hygiene and CI-proven release land. Ship targets: [`docs/design/launch-ship-targets.md`](../../docs/design/launch-ship-targets.md), [ADR-0140](../../docs/design/adr/07-portability-extensibility.md#adr-0140).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for layering and runtime assembly.

Validate integration changes with `pnpm --filter @hobo/hobo run test`.

## Local substrate auto-discovery (`src/local-substrates.ts`)

`seedLocalhostYard()` (`@hobo/yards`, ADR-0157) gives a default localhost
Station exactly one Yard — `yard:local` — decided from capability observations
alone. That seed is substrate-blind: it does not know whether this machine can
run WASM, OCI containers, a WSL2 guest, LXC/Incus, systemd-nspawn, or
Firecracker microVMs. `local-substrates.ts` supplies that axis and registers a
Yard per *available hosting substrate*, so the Station reflects what the box can
actually host.

```ts
import {
  defaultLocalSubstrateProbes,
  registerLocalSubstrateYards,
} from "@hobo/hobo";

const { report, yards } = registerLocalSubstrateYards({
  probes: defaultLocalSubstrateProbes(),
  observations: stationCapabilityObservations,
});
```

- `LOCAL_SUBSTRATE_KINDS` — closed, frozen vocabulary: `firecracker`, `lxc`,
  `nspawn`, `oci`, `process`, `wasm`, `wsl2`.
- `defaultLocalSubstrateProbes(env?)` / `parseLocalSubstrateProbes(input)` — the
  only host access. Discovery itself is **pure over the injected probes**: no
  `process.env`, no `execSync`, no network, no clock, no randomness. Tests
  describe a whole machine as data.
- `discoverLocalSubstrates(probes, { now? })` — frozen report, one finding per
  kind, sorted by kind. Two calls with the same probes are deep-equal.
- `localSubstrateYards(report, { observations? })` / `registerLocalSubstrateYards`
  — Yards named `yard:local-<kind>` (`process` keeps `yard:local` and reuses the
  seed's own Yard record). `process` and `wsl2` reuse `seedLocalhostYard()`'s
  rows rather than duplicating its row table.
- `LocalSubstrateError` — typed, fail-closed refusals
  (`LOCAL_SUBSTRATE_PROBES_INVALID`, `LOCAL_SUBSTRATE_REPORT_INVALID`,
  `LOCAL_SUBSTRATE_KIND_UNKNOWN`, `LOCAL_SUBSTRATE_EVIDENCE_MISSING`), each
  carrying a `remediation` naming what to change.

### Detection rules and evidence

| Substrate | Present when | Evidence rows |
|---|---|---|
| `process` | always (this code runs in one) | `platform:<p>`, `node:<version>` |
| `wasm` | a toolchain binary (`wasmtime`/`wasmer`/`wasmedge`/`jco`) **or** Node >= 20's `WebAssembly` embedder | `bin:<path>`, `node-webassembly:<version>` |
| `oci` | a client binary (`docker`/`podman`/`nerdctl`) **or** an engine socket | `bin:<path>`, `sock:<path>` |
| `wsl2` | Linux **and** `/proc/version` carries the `WSL2` kernel marker | `file:/proc/version`, `file:/run/WSL`, `env:WSL_INTEROP`, `env:WSL_DISTRO_NAME`, `file:/proc/sys/fs/binfmt_misc/WSLInterop` |
| `lxc` | Linux **and** an `lxc`/`lxd`/`incus` binary or daemon socket | `bin:<path>`, `sock:<path>` |
| `nspawn` | Linux **and** `systemd-nspawn` on PATH **and** `/run/systemd/system` | `bin:<path>`, `file:/run/systemd/system` |
| `firecracker` | Linux **and** the `firecracker` binary **and** `/dev/kvm` | `bin:<path>`, `dev:/dev/kvm` |

`firecracker`, `lxc`, `nspawn`, and `wsl2` are Linux-only: on any other platform
they are reported absent with the platform as the reason and **no** evidence,
because nothing was probed.

### ADR-0042 fidelity per substrate

| Substrate | Fidelity | Why |
|---|---|---|
| `process` | seed rows (`real` / `simulated`) | reuses `seedLocalhostYard()`, whose labels are already audited (Node HTTP server `real`, in-memory queue `simulated`) |
| `wsl2` | seed rows (`real` / `simulated`) | detected from *inside* the guest, so hosting is the same in-process Node executor as `yard:local` |
| `wasm` | `simulated` | `runtime-local` does not execute real `.wasm` bytes today ([`docs/design/yard-bindings.md`](../../docs/design/yard-bindings.md)); a `wasmtime` binary on the box does not change what HoBo executes |
| `oci` | `camp-only` | `@hobo/runtime-oci` schedules through kubectl against a cluster; there is no path that places a workload into the local daemon |
| `lxc`, `nspawn`, `firecracker` | `camp-only` | the substrate is genuinely on the box, but HoBo has no local placement path — satisfying the profile needs a Camp |

### HONEST SCOPE (substrate discovery)

Discovery reports **evidence**, not working capability. Specifically:

- **A binary on PATH is not a running daemon.** `docker` or `lxc` on PATH proves
  the client exists; the engine may be stopped, remote, or unauthorized. When
  only a client is found, the finding's `detail` says "client binary only".
- **A socket on disk is not a reachable, authorized daemon.** No request is ever
  made — no network, no `execSync` — so an engine socket proves a path exists at
  a well-known location, nothing about whether a container would start.
- **`/dev/kvm` existing is not read/write access to it**, and `systemd-nspawn`
  plus a live systemd is not root privilege.
- **WSL1 vs WSL2** is distinguished only by the `WSL2` marker in the kernel
  string. When WSL interop is observed without that marker, the weaker claim is
  reported (`present: false`, evidence kept) rather than an unproven v2.
- **Node's `WebAssembly` embedder runs core modules, not components.** Without a
  toolchain binary the `wasm` finding says exactly that.
- **No substrate row means HoBo executes there.** Only the `process`/`wsl2` rows
  (inherited from the seed) are backed by an executor in this repo; everything
  else is `simulated` or `camp-only` on purpose.

## Resolver-backed deploy lane (`src/resolver-iac-provider.ts`)

`@hobo/core`'s `hobo.resource-resolver/v1` plane calls provider REST APIs
directly — no IaC engine, no state file. Until this module existed it stood
*beside* the deploy path rather than behind it: `cloudflareResolverRegistry()`
and `vercelResolverRegistry()` were reachable from a test and from nothing else.
`createResolverBackedIacProvider()` puts the plane behind `@hobo/cloud`'s
`IacProvider` port, so `hobo up` / `down` / `drift` can drive it.

```ts
import {
  createFetchHttpTransport,
  createResolverBackedIacProvider,
} from "@hobo/hobo";
import {
  cloudflareResolverRegistry,
  guardedCloudflareTransport,
} from "@hobo/provider-cloudflare";

const iac = createResolverBackedIacProvider({
  store,                        // the durable store holding `deployment.Planned`
  registry: cloudflareResolverRegistry({ accountId, resolveCredential }),
  transport: guardedCloudflareTransport(
    createFetchHttpTransport(globalThis.fetch),
  ),
  credentialRef: "hobo-token://cloudflare/api-token", // a LOCATOR, never material
});
```

`IacProgram` is a thin execution descriptor and carries no desired state, so —
exactly like `src/pulumi-iac-provider.ts` — desired state is **recovered from the
durable `deployment.Planned` fact**, never fabricated: the plan node's
`productId` keys the resolver lookup (ADR-0157) and its `realizationParameters`
become `ResolveRequest.desired`.

### Selection precedence (`selectIacProvider`)

1. an explicit Pulumi `adapter` override, or `HOBO_PULUMI_LIVE=1` → the Pulumi
   lane (unchanged);
2. no cloud credential at all → the in-memory Pulumi stand-in (unchanged);
3. a cloud credential **plus `HOBO_DEPLOY_RESOLVERS=1`** → the resolver plane
   (Cloudflare when `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are set,
   else Vercel when `VERCEL_TOKEN` is);
4. otherwise → today's Cloudflare Workers / Vercel deploy providers (unchanged).

The lane is **opt-in and sits inside the cred-gated bracket**: it can only
replace the two bespoke deploy providers, never the Pulumi lanes and never the
credential-free default. Silently swapping someone's deploy backend on an
upgrade is a behaviour change nobody asked for, so the env switch is required.

### Fail-closed refusals (`ResolverIacError`, each with a `remediation`)

| Code | Fires when |
|---|---|
| `RESOLVER_IAC_PLAN_MISSING` | the deployment stream carries no `deployment.Planned` fact |
| `RESOLVER_IAC_RESOURCE_UNPLANNED` | the stored plan has no resource by that name |
| `RESOLVER_IAC_PRODUCT_UNDECIDED` | the plan node carries no `productId` |
| `RESOLVER_IAC_SLOT_UNDECIDED` | the node's capability port is outside the slot vocabulary |
| `RESOLVER_IAC_PRODUCT_UNREGISTERED` | no resolver is registered for that product |
| `RESOLVER_IAC_OUTPUT_RESERVED_KEY` | a resolver output would collide with the `hobo.resolver.` namespace |

`productId` and `realizationParameters` exist only on plans built with Yard
binding authority. **Absent means "not decided here", never "any product will
do"**, so a node without one is refused — the product is never inferred from the
port or the provider id, which is the naming-convention inference ADR-0144
forbids.

### Outputs, diff, and drift

`ResolveOutcome.outputs` land in `IacOutputs` under their own keys (non-string
JSON values are JSON-encoded rather than dropped; encoding is deterministic
because `parseResolveOutcome` sorts keys by code unit). The outcome's own
metadata lands under a reserved `hobo.resolver.` namespace:
`…contract`, `…action`, `…physicalId`, and `…diagnostics` (a JSON array, present
only when the resolver emitted any). A resolver output inside that namespace is
refused rather than shadowed.

### HONEST SCOPE (resolver deploy lane)

- **Nothing here has run against a live provider.** The whole module is proven
  against an *injected fake* transport modelling a provider account. A live
  deploy additionally needs real credentials, real network egress, and a real
  account — none of which a unit test supplies.
- **`preview` never claims zero changes it did not verify.** `IacDiff.changes`
  is a bare count with no "unknown", so a preview that could not look reports
  `RESOLVER_PREVIEW_UNDETERMINED` (`-1`) and says so in the summary. It reports
  `0` only when every declared parameter was observed *and* matched. A resolver
  with no `read()` is always undetermined; so is a declared parameter the
  provider's read surface has no counterpart for (the change count is then a
  lower bound, and the summary says so).
- **`refresh` errs toward drift.** `IacDriftReport.drift` is a boolean with no
  "unknown" and `drift: false` is the claim "I looked and it matches", so
  anything unverified is reported as drift with
  `hobo.resolver.drift.determined = "false"` and a reason.
- **No state of its own.** This driver threads no `physicalId`, so convergence
  rests entirely on each resolver's deterministic-name lookup. The visible
  consequence is that a re-apply reports `adopt` rather than `noop` — honest,
  since the run neither created the resource nor knew its id.
- **`destroy` refuses what it cannot route.** "Already gone" at the provider is
  success (the resolvers treat a 404 that way), but a teardown whose plan cannot
  be recovered throws rather than reporting a green no-op over a real, billed
  resource.
- **No credential material anywhere.** `credentialRef` is a locator the host
  resolves at call time; provider error text is redacted by the resolvers
  themselves (`redactCloudflareText` and the Vercel equivalent) and re-raised
  here rather than re-redacted.
- **`describeDeployTarget` (`src/deploy-preflight.ts`) does not yet know about
  this lane** and still reports `cloudflare`/`vercel`/`in-memory` only; that file
  was outside this change.
