# ADR — hobo-code-harness-experience

Experience proof companion to [ADR-0139](../../../../docs/design/adr/03-data-plane.md#adr-0139).

## Decision

Demonstrate the developer journey for `hobo code` as an executable DX proof that:

1. scaffolds the high-value OpenUI + Astryx Bindle template,
2. runs OpenUI → in-context edit → lock,
3. emits the evidence triple for a Gherkin + OpenFeature scenario,
4. completes isolation with zero orphans.

## Parse, don't validate

Untrusted experience outcomes cross `parseExperienceResult()` into a frozen
**derived domain type** (`ExperienceResult`). Tests and the example assert only
parsed types.

## Event architecture

- **Command** — run the experience harness once (template + visual + evidence + cleanup).
- **Event** — isolation created/cleaned, visual locked, evidence emitted (owned by `@hobo/code`).
- **Actor** — experience runner coordinates; `@hobo/code` session is the isolation actor.
- **Event store** — durable records under the temp `HOBO_HOME/durable/code/<runId>/`.
- **Materialized view / projection** — `ExperienceResult` is the end-of-run projection.
- **Snapshot** — session handback is the cleanup snapshot.
- **Read store** — example/tests read the projected `ExperienceResult` only.

## Status

Accepted with the production package `@hobo/code`.
