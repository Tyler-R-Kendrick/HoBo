# @hobo/runtime-local

Wasmtime-based runtime-local **component host** for HoBo S1. Loads descriptor-defined
guest components, routes WIT imports through a deny-by-default **link table**, and
appends `component.*` / `link.*` events to an injected event-log sink.

## Scope

**In:** component lifecycle, in-process link table, `wasi:http/incoming-handler@0.2.0`
dispatch, trap isolation, teardown cleanup, Wasmtime engine seam (in-process stub +
CLI version gate), in-process wRPC membrane link layer (import routing, wire-version
negotiation, `link.Called` evidence).

**Out:** wRPC cross-process / lattice transport, fuel/epoch limits, real `.wasm` byte execution,
OCI/wasmCloud adapters, conformance suite, grant inference from manifests.

## Usage

```ts
import { createRuntimeLocalComponentHost } from "@hobo/runtime-local";

const host = createRuntimeLocalComponentHost({
  appendEvent: (event) => eventLog.append(event),
});
```

## Tests

```bash
pnpm --filter @hobo/runtime-local test
```

## Architecture evidence

See [ARCHITECTURE.md](./ARCHITECTURE.md) for protobuf/CUE contracts, PACT boundary,
parse-don't-validate parsers, and event-sourced state naming.

Promoted from `src/draft/technical-proofs/runtime-local-component-host` in S1-02
(HOBO-591). wRPC in-process link layer promoted from
`src/draft/technical-proofs/wrpc-link-layer-contract` in S1-03 (HOBO-592).
