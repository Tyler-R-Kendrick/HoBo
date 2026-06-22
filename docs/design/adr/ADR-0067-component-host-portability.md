# ADR-0067 — Component-host portability: conformance + version pinning across hosts

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering
- **Related:** [Plan 20 — WASM/WASI runtime](../20-wasm-wasi-runtime.md) · [ADR-0031 — wasm host of record & runtime substrate](./ADR-0031-wasm-host-of-record-and-runtime-substrate.md) · [ADR-0024 — Portability conformance guarantee](./ADR-0024-portability-conformance-guarantee.md) · [Plan 9 — Verification/conformance](../09-verification-open-questions.md) · [Plan 11 — Event model](../11-event-model.md) (determinism/replay) · [Plan 22 — Wiring/manifest IR](../22-wiring-manifest.md) · [ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)

## Context
[ADR-0031](./ADR-0031-wasm-host-of-record-and-runtime-substrate.md) makes the **`component-host`** a per-Camp port with several implementations — **Wasmtime** locally, **wasm-in-container** as the portable v1 prod default, **SpinKube / wasmCloud-lattice / provider-native** as opt-in adapters. [ADR-0024](./ADR-0024-portability-conformance-guarantee.md) commits to portability across **durable-store runtime backends** (EventStore/Queue/…) but says nothing about portability across **component-hosts**. Different hosts can silently diverge on the exact properties HoBo's guarantees depend on: deterministic **Clock**/replay semantics ([Plan 11](../11-event-model.md)), `wasi:*` interface fidelity, **link** late-binding semantics, and **capability-handle** deny-by-default isolation ([Plan 20](../20-wasm-wasi-runtime.md)). A component proven on Wasmtime locally must behave identically on wasm-in-container in prod — today that's assumed, not gated.

## Decision
Make the component-host a **conformance-gated, version-pinned** portability boundary, exactly like provider ports.

1. **`@hobo/conformance/component-host` suite** ([Plan 9](../09-verification-open-questions.md)). Any host claiming conformance must pass: **deterministic-clock trace replay** (same run → identical state across hosts), **`wasi:*` interface round-trip** (vendored/pinned interfaces behave identically), **link semantics** (imported-interface → provider-export late-binding resolves the same), and **capability-handle isolation** (deny-by-default; an un-linked capability call fails). A host may only be selected for a Camp if it passes.
2. **Host version pinned in the manifest IR** ([Plan 22](../22-wiring-manifest.md)). A Bindle records the `component-host` kind + version it was built/certified against; a Camp whose host is incompatible fails planning with a precise reason (mirrors the `wasi:*`/runtime version policy in [ADR-0024](./ADR-0024-portability-conformance-guarantee.md) §5). Host upgrades go through an explicit, gated path with an **upcaster** where semantics change — **no silent rewrite** of component behavior.
3. **Cross-host E2E** folded into the portability example. The `multi-cloud-shop` E2E ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)) is extended so the same component runs on **Wasmtime local → wasm-in-container → (opt-in) SpinKube** with identical behavior under trace replay. Host-specific capabilities (e.g. wasmCloud lattice link-migration) are typed as host-`.with()` options, inert on hosts that don't offer them, and flagged by `hobo doctor` as host lock-in (same model as provider `.with()`).

## Alternatives considered
- **Assume host equivalence (status quo).** Rejected: silent divergence in clock/WASI/link/capability semantics breaks replay determinism — a hard invariant ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)).
- **Single mandated host.** Rejected: contradicts [ADR-0031](./ADR-0031-wasm-host-of-record-and-runtime-substrate.md)'s per-Camp host choice + air-gap/provider-native needs.
- **Pin host but no conformance.** Rejected: pinning prevents accidental swaps but doesn't prove a *claimed* host is actually equivalent — conformance is the trust boundary.

## Consequences
- **(+)** "wasm-first, runs anywhere a container runs" is now *verified*, not asserted; the deterministic-replay invariant holds across hosts.
- **(+)** Host portability reuses the existing conformance + version-policy machinery — a new suite + a manifest field, not new architecture.
- **(−)** Authoring the host conformance suite (esp. deterministic-clock + WASI fidelity assertions) is real work; v1 ships the suite + Wasmtime/wasm-in-container reference passes, with SpinKube/wasmCloud as opt-in certified adapters.
- **(−)** Host-`.with()` options reintroduce a (typed, flagged) lock-in surface; mitigated by `hobo doctor` + the portability report ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)).
