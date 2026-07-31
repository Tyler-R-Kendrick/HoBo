# Architecture — `@hobo/formal-interop`

## Boundaries

- **Private package** — not part of the public HoBo SDK surface.
- **OpenUI IR** is parse-don't-validate (`parseOpenUiTree`); invalid shapes throw at the boundary.
- **Promotion** (`evaluateOpenUiPromotion`) is fail-closed: semantic BEq default-on for `artifactKind: "openui"`.
- **Certificates** (`replayFormalCertificate`) reject untyped free-form claims.
- **Training** (`runFormalInteropTraining`) declares `enginePort: "training-engine"` and `publicSdkExport: false`.
- **Formal package** lives under `formal/controlled-core` (Lean 4, no Mathlib on controlled imports).

## Data models

- `data-models/formal_interop.proto` + `.cue` — OpenUI tree, FormalCertificate, MetricsLedgerRow.
- PACT: `contracts/pacts/formal-interop-boundary.pact.json`.

## Event / CQRS note

This package is a pure evaluation/preflight plane. It does not own an event stream; consumers record promotion refusals via existing training-pipeline / code promotion audit paths.
