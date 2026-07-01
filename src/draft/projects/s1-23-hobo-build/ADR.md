# ADR: S1-23 hobo build draft POC

## Context

HOBO-613 wires `hobo build` to `@hobo/componentize` with deterministic artifacts,
codegen drift gating, and OCI fallback for non-wasm guests.

## Decisions

### Parse-don't-validate

Raw `argv`, bindle service declarations, and manifest JSON cross exactly one parser
(`src/parse.ts`). Downstream `runBuild` accepts refined `BuildRequest` and
`ServiceDeclaration` types only.

### Event-sourced build record

`runBuild` appends `build.*` events and materializes `.hobo/build/build-manifest.json`
once via `projectBuildManifest`. Failed builds throw before writing the manifest;
no in-place mutation of artifacts or manifest.

### Injectable componentize seam

`runBuild` accepts `componentize` for tests. Default adapter delegates to
`hobo-componentize-contract` and calls `validateWasmComponentArtifact` before
returning wasm bytes.

### Determinism controls

`SOURCE_DATE_EPOCH` defaults to fixed `2026-01-01T00:00:00.000Z`. Sorted service
names, stable JSON serialization, and componentize contract pins enforce digest
parity with the S0-07 golden fixture.

## Commands / events

| Kind | Name | Notes |
|---|---|---|
| Command | `build.Requested` | implied by `runBuild` entry |
| Event | `build.Started` | runtime target + epoch |
| Event | `build.ArtifactProduced` | per service |
| Event | `build.Completed` | manifest digest |
| Projection | `BuildManifest` | `hobo.build-manifest/v1` |

## Boundaries

- Consumer: `@hobo/cli` (this POC's `createBuildCli`)
- Provider: `@hobo/componentize` (draft `componentizeHelloBindle`)
- Pact: `contracts/cli-componentize-boundary.pact.json`
