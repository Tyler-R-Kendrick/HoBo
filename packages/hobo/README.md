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
Canonical verb list: **38** verbs in `@hobo/cli` (`packages/cli/src/shell/verbs.ts`).

## HONEST SCOPE (default deploy lane)

Default `up` / `down` / `plan` drive the real `@hobo/iac-pulumi` adapter with an
**in-memory Automation-API stand-in** (offline, deterministic). That is **not**
a live cloud apply. Selection lives in `src/compose.ts` (`selectIacProvider`):

| Path | When |
|---|---|
| In-memory Pulumi stand-in | **Default** (no special env) |
| Real Pulumi Automation/CLI | `HOBO_PULUMI_LIVE=1` (engine- and credential-gated) |
| Live Cloudflare Workers | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| Live Vercel | `VERCEL_TOKEN` |

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
