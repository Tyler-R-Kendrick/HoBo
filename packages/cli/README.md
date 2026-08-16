# @hobo/cli

HoBo command-line **shell and command factories** — parser, verb registry,
renderer, dispatch seam, offline `hobo new` scaffolds, and un-injected stub
handlers for the local developer loop.

The **product** `hobo` / `hobo-mcp` binaries ship from **`@hobo/hobo`**
(`packages/hobo/`), which injects default runtimes so lifecycle verbs run end to
end. This package is the library surface (`dispatchCommand`, `CANONICAL_VERBS`,
command factories). Prefer `@hobo/hobo` for end-user CLI use.

**Dual-bin / install story:** the composed product bin is `@hobo/hobo`. Treat
this package as the shell/factories dependency, not as a second product CLI.
Ship and publish policy: [ADR-0140](../../docs/design/adr/07-portability-extensibility.md#adr-0140),
[`docs/design/launch-ship-targets.md`](../../docs/design/launch-ship-targets.md),
[`docs/plans/0012-ship-remediation-plan.md`](../../docs/plans/0012-ship-remediation-plan.md).

Promotes:

- `src/draft/technical-proofs/hobo-cli-shell-contract/` (CLI shell, parser, registry, renderer, dispatch seam)
- `src/draft/technical-proofs/hobo-new-scaffold-contract/` (`hobo new` offline scaffolds)

`hobo new -t todo|api|agent|fullstack` is a compatibility adapter. File bodies
come from `@hobo/patterns` `starter.cli.*` catalog trees (ADR-0153). Aliases
stay the public contract; do not fork starter text back into this package.
- `src/draft/technical-proofs/hobo-build-cli-contract/` (`hobo build` orchestration, HOBO-613 / S1-23)
- `src/draft/epic-proofs/cli-mcp-developer-experience/` (CLI↔MCP parity boundary)

`hobo build` can wire `@hobo/componentize` for wasm component artifacts, a codegen
drift gate (via S1-21 draft contract), event-sourced manifest projection, and
digest parity tests against the S0-07 golden fixture. **HONEST SCOPE:**
`@hobo/componentize` produces **synthetic wasm contract bytes**
(`buildWasmContractBytes`), not a real jco/`componentize-js` pipeline — see
[`packages/componentize/README.md`](../componentize/README.md).

## Surface

Canonical verbs: **38**, defined in `src/shell/verbs.ts` — including lifecycle
(`up`, `down`, `dev`), identity (`login`, `connection`, `identity`, `access`,
`claim`), delivery (`feature`, `deploy`, `incident`), control plane (`broker`,
`yard`, `station`), observability (`replay`, `logs`, `inspect`), governance
(`attest`, `erase`, `runbook`), and the authoring/diagnostics set
(`plan`, `verify`, `can-deploy`, `doctor`, `codegen`, `build`, `collect`, `stub`,
`drift`, `add`, `registry`, `import`, `generate`, `sandbox`, `test`, `derivative`,
`trails`, `new`).

Global flags: `--json`, `--camp <camp>`, `--cwd <path>`, `--verbose`, `-q`, `--help`.

This package exposes `dispatchCommand` for MCP parity; the composed MCP binary
ships from `@hobo/hobo` (`hobo-mcp`).

## Usage

Library consumers import from `@hobo/cli`. For a local shell binary without the
composition root, run the built entry with Node (factories may return stubs
until runtimes are injected):

```bash
pnpm exec turbo run build --filter @hobo/cli
node packages/cli/dist/bin/hobo.js --help
node packages/cli/dist/bin/hobo.js new my-app -t api
```

Product composition (recommended for end-to-end local lane):

```bash
pnpm hobo --help          # root script: builds @hobo/hobo on first use
# or: node packages/hobo/dist/bin/hobo.js --help
```

**Pre-release:** `@hobo/*` is **not published to npm** as a stable external
install story yet. Prefer the monorepo workspace until publish hygiene lands.
Default deploy through `@hobo/hobo` uses an **in-memory Pulumi stand-in** (see
[`packages/hobo/README.md`](../hobo/README.md) HONEST SCOPE).

## Contracts

- `contracts/cli-command-path.pact.json` — shell ↔ command registry boundary
- `contracts/hobo-new-scaffold.pact.json` — scaffold boundary
- `contracts/cli-componentize-boundary.pact.json` — build ↔ componentize boundary

Data models live in `data-models/` (protobuf + CUE), including `build_manifest.*` for `hobo build` records and `build.*` event families.
