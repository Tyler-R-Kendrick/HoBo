# `@hobo/adapter-opensesame`

**Optional.** Run HoBo under [OpenSesame](https://github.com/Tyler-R-Kendrick/OpenSesame)'s
proxied invocation (`opensesame dev --agent run`, like `op run`) with secret
**references** in place of credentials, so the process holds an `osr_` surrogate
and never the real token. OpenSesame's `surrogate-proxy` plugin swaps the
surrogate for the token, once, at the provider's own host (`api.vercel.com`),
inside the scope the binding declared.

It is a `SecretsPort` of kind `opensesame` (ADR-0113 residual port, ADR-0027
rank `provider-federation`): `access()` returns the run's surrogate and nothing
else. See [ADR-0170](../../../docs/design/adr/02-identity-security.md#adr-0170).

## Scope, honestly

| | |
|---|---|
| **Vercel** | Brokered. Verified against the real `opensesame` and the plugin's test build (`test:real`), with global `fetch`. |
| **AWS** | **Not brokered.** A binding with `provider: "aws"` fails with `provider_not_brokered`. AWS requests are signed with SigV4 in process from a live secret key, which header substitution cannot serve, and OpenSesame's AWS helper fails closed until its STS mint exists. |
| Other providers | `provider_not_brokered`. |
| Platforms | Linux. The real lane reads `/proc`. |
| Node | `>= 22.21` (the adapter's `engines`): `NODE_USE_ENV_PROXY` is what sends `fetch` through `HTTPS_PROXY`. Without it `fetch` ignores `HTTPS_PROXY` and dials the provider directly, with a surrogate only the proxy can redeem, so the launch refuses (`node_proxy_unsupported`). |

## The bindings file

`hobo.credentials.json` holds **references only**: where a credential lives and how far a
surrogate for it may reach. It is a `CredentialBindings` document
([`data-models/adapter_opensesame.proto`](./data-models/adapter_opensesame.proto), constraints in the
[`.cue`](./data-models/adapter_opensesame.cue)).

```json
{
  "bindings": [
    {
      "locator": "hobo-token://vercel/deploy",
      "connection": "conn://acme/vercel",
      "provider": "vercel",
      "env_name": "VERCEL_TOKEN",
      "paths": ["/v9/projects", "/v13/deployments"],
      "methods": ["GET", "POST"],
      "projection": "legacy-token"
    }
  ]
}
```

- `locator` is the `hobo-token://` reference the resolvers already ask for (`packages/hobo/src/compose.ts`): no new scheme.
- `connection` is the OpenSesame connection; its last segment names the provider.
  The token is the sealed entry `connections/acme/vercel`, put there by a person with
  `opensesame pass insert connections/acme/vercel` (HoBo never writes it).
- `paths` and `methods` are required and non-empty: an unbounded scope cannot be written.

## Use

```ts
import {
  createOpenSesameCredentialResolver,
  createOpenSesameSecretsPort,
  exitCodeOf,
  outcomeError,
  parseCredentialBindings,
  runProxied,
} from "@hobo/adapter-opensesame";

const bindings = parseCredentialBindings(JSON.parse(readFileSync("hobo.credentials.json", "utf8")));

// Parent: relaunch under OpenSesame. The schema is written 0600 and removed after.
const outcome = await runProxied({ bin: "opensesame", bindings, argv: [process.execPath, "hobo", "up"] });
const failure = outcomeError(outcome);   // typed refusal, or undefined for a clean child
process.exitCode = exitCodeOf(outcome);  // never 0 for a run that left placeholders

// Child (HOBO_OPENSESAME_CHILD=1): serve the surrogate to resolvers that ask by locator.
const port = createOpenSesameSecretsPort({ bindings, env: process.env });
const resolveCredential = createOpenSesameCredentialResolver(port);
```

`runProxied` passes `SIGTERM` and `SIGHUP` on to OpenSesame, which revokes the run
and stops the child; it never reads or sets the store passphrase (OpenSesame takes it from the
terminal or `OPENSESAME_STORE_PASSWORD` and strips it from the child).

## Failures

Every refusal is an `OpenSesameAdapterError` with one `code`, and no message carries a
rejected value: `binding_invalid`, `launch_invalid`, `opensesame_bin_missing`,
`bridge_missing`, `scope_unbounded`, `provider_not_brokered`, `placeholders_only`,
`store_unreadable`, `plugin_pin_mismatch`, `tripwire_misdirected`, `signalled`,
`child_exit`, `node_proxy_unsupported`, `recursion_guard`, `schema_injection`, `read_only`.

The one that matters most is `placeholders_only`. With the plugin missing or off, `opensesame dev run --agent`
**still starts the child and exits 0**, handing it an `ostest_…` placeholder. Against an emulator that
accepts any token that is a false green, so the adapter treats it as a failure: the port denies anything
that is not `osr_` + 32 hex, and a run that printed OpenSesame's placeholder line is `placeholders_only`
whatever its status.

## What the binary really does (checked against `apps/cli` at OpenSesame `b60790eb3`)

Where the docs and the code are not the same thing, or the status alone is not enough:

- A **tripwire** exits `77`, **SIGTERM/SIGHUP** exit `143`/`129`. A child can exit with any of them, so the adapter reads a
  status as one of these only beside OpenSesame's own line (`opensesame: surrogate.misdirected: …`,
  `opensesame: SIGTERM: the run is ended …`).
- A child **killed by a signal** makes OpenSesame exit `1`, not `128+n`.
- Every refusal before the child starts (pin mismatch, unreadable entry, no bounded scope, a schema
  that does not parse) is `Error: <message>` on stderr and status `1`.
- `--schema` is a global flag of `dev`: `opensesame dev --agent --schema <file> run -- <cmd>`.
- The classification reads stderr, which the child shares, so it is advisory. The gate that a surrogate
  was really delivered is the port, which checks the child's own variable.

## Tests

```bash
pnpm --filter @hobo/adapter-opensesame test                    # default lane: no binary needed
pnpm --filter @hobo/adapter-opensesame test:contract:consumer
pnpm --filter @hobo/adapter-opensesame test:contract:provider  # the pact, against a stand-in binary
HOBO_OPENSESAME_KIT=<dir> pnpm --filter @hobo/adapter-opensesame test:real
```

The default lane runs a stand-in `opensesame` (`test/fixtures/fake-opensesame.mts`) that takes exactly the
real argv and prints the real lines. It is a model; the **real lane** is what says it is right.

### The real lane, and how to build its kit

`test:real` runs against the real `opensesame`, the surrogate-proxy plugin's **test build**
(`--features upstream-override`, the only build that can be aimed at a loopback server; it prints
`TEST BUILD` and must never see a real token), a sealed store, the real `@env-spec/parser`, and a
recording TLS server for `api.vercel.com` with a certificate minted by `openssl`. It needs
`openssl` and `node` on `PATH`, and **fails, never skips**, without a kit.

No release publishes a test-build plugin, so build the kit yourself. From an OpenSesame checkout (Rust 1.88.0;
one heavy build at a time; point `CARGO_TARGET_DIR` at a shared target and keep `CARGO_INCREMENTAL=0
CARGO_BUILD_JOBS=2` on a busy machine; check `df -h /` first, the debug build needs a few GB):

```bash
cd OpenSesame
export CARGO_TARGET_DIR=$HOME/.cache/packages/cargo-target CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2
cargo +1.88.0 build --locked -p opensesame-surrogate-proxy --features upstream-override --bin opensesame-surrogate-proxy
cp "$CARGO_TARGET_DIR/debug/opensesame-surrogate-proxy" "$KIT/"      # copy now: the next build of the other flavour overwrites it
cargo +1.88.0 build --locked -p opensesame-cli --bin opensesame
cp "$CARGO_TARGET_DIR/debug/opensesame" "$KIT/"
mkdir -p "$KIT/bridge" && cp packages/env-spec-bridge/bin/opensesame-env-parse.mjs "$KIT/bridge/"
# @env-spec/parser@0.4.1 in $KIT/bridge/node_modules, from any package manager
export HOBO_OPENSESAME_KIT=$KIT
```

Build the plugin and the CLI as **two** commands: `opensesame-cli` must never link the plugin (a gate in OpenSesame
fails if it does), and `--features upstream-override` on the CLI build would not reach it. If the disk is short,
`CARGO_PROFILE_DEV_DEBUG=0` with a `CARGO_TARGET_DIR` on a RAM-backed `/dev/shm` builds the CLI in about nine minutes
and `~1.7 GB` of memory without touching the disk.

`HOBO_REAL_EVIDENCE=<file>` appends one JSON line per case (upstream requests, what the child held, exit status)
so a run can be saved and attached.
