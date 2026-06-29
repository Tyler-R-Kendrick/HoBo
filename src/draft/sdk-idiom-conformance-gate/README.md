# SDK Idiom Conformance Gate POC

Independent POC for HOBO-32: a branch-sized `@hobo/conformance/sdk` gate for the TypeScript
`@hobo/bindles` idiom layer over the canonical `hobo:sdk` WIT contract.

## Requirements Source

- `docs/design/wasm-runtime-wit.md#plan-20`: SDK parity is proven, not trusted.
- `docs/design/adr/01-architecture-core.md#adr-0072`: generated bindings plus a thin idiom layer.
- `docs/design/adr/01-architecture-core.md#adr-0093`: semantics-annex parity is separate from
  golden-IR lowering equality.
- `src/draft/hobo-sdk-aggregate-wit-contract`: the `hobo:sdk@0.1.0` aggregate contract from HOBO-16.
- `src/draft/idiom-layer-lowering-contract`: the HOBO-106 lowering corpus.
- `src/draft/idiom-semantics-annex`: the HOBO-31 negative semantics vectors.

## What This Proves

- The gate has two required behavior lanes: golden-IR lowering equivalence and the semantics annex.
- The passing TypeScript idiom-layer fixture lowers to identical `hobo:sdk` calls and manifest IR,
  then passes error mapping, cancellation, async ordering, and IfC side-effect vectors.
- A deliberately divergent fixture fails the golden-IR lane.
- A layer that lowers correctly but swallows WIT errors fails the semantics-annex lane.
- Hand-authored and generated idiom layers use the same gate; there is no trusted-by-convention path.
- The report states the corpus boundary explicitly: off-corpus semantics require annex vectors or an
  unsupported-behavior callout before parity can be claimed.

## Scope Boundary

This does not author non-TS idiom layers, build the full `@hobo/bindles` fluent surface, or implement
the AI-generation loop. It composes the existing HOBO-16, HOBO-31, and HOBO-106 proof packages into
the SDK conformance gate that those future implementations must pass.

## Verification

```powershell
npm.cmd --prefix src\draft\sdk-idiom-conformance-gate test
```


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Sdk Idiom Conformance Gate.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
