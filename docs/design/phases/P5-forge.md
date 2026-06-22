# Build stage 5 — Forge (AI-generated providers + implementations)

> [Phases index](./README.md) · realizes [Plan 6](../06-ai-native-agent-auth.md), [Plan 23](../23-stubbable-ai-implementations.md), [Plan 9](../09-verification-open-questions.md).

**Objective.** Break the human bottleneck on breadth: AI generates **providers** (new backends) and **implementations** (components behind WIT ports), certified by conformance + trace replay, promoted through gates.
**Depends on.** Stage 3 (identity/registry/sandbox) and stage 4 (multiple providers as reference adapters).

> **Explicit promotion gate:** the promotion gate is now explicit — **conformance(contract) + eval thresholds + policy** ([Plan 23](../23-stubbable-ai-implementations.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md)) with champion/challenger + shadow traffic; Forge can also generate **policy packs** and **contracts** + **remediation** fixes (shim/migration-window) for failed gates.

> **Forge-generated Resource Definitions/Packs:** the Forge generates not just providers/implementations but **Resource Definitions** and **Resource Packs** ([Plan 25](../25-resource-definitions-matching.md)/[Plan 27](../27-drivers-packs-profiles.md)) — given a backend's Capability Manifest + a target context, propose a definition, validate it sandboxed against the **Driver** conformance suite, and certify it (signed, with provenance) into the Registry.

## Workstream 1 — Full conformance coverage
1. Author `@hobo/conformance` suites **per WIT interface** (every capability port) — the trust boundary ([Plan 9](../09-verification-open-questions.md)).
2. Coverage report; gate publishing on per-interface pass.

## Workstream 2 — Forge: provider generation
1. Pipeline: ingest backend docs/OpenAPI/Terraform provider/Capability Manifest → generate a candidate `@hobo/provider-x` (ports + IaC mappings + equivalence classes + Capability Manifest manifest).
2. **Sandbox** (Firecracker + wasm capability sandbox, no egress) → run conformance for the claimed ports.
3. On pass: **sign + publish** to the Registry with provenance + the test report (`forge.PluginCertified`); on fail: feed errors back ([Plan 6](../06-ai-native-agent-auth.md)).

## Workstream 3 — Stubs & implementation generation
1. Stub system: any WIT port backed by a recording/typed stub so apps run before implementations exist ([Plan 23](../23-stubbable-ai-implementations.md)).
2. Forge generates **stub → full implementation** from the WIT interface + conformance + **recorded traces**; validate sandboxed + **replay traces as tests**.

## Workstream 4 — Auto-evolve & gated live-fix
1. Policy engine: classify a change low-risk (auto) vs prod/high-risk (human-approval hook) ([Plan 12](../12-security-multitenancy.md)).
2. Auto-evolve on new traces/SLO/cost signals; **live-fix** applies via the gated canary/rollback saga ([Plan 5](../05-reliability-ha.md)); failing trace becomes a permanent regression test.
3. Record every generation/validation/gate/apply as events ([Plan 11](../11-event-model.md)).

## Deliverables
- Per-interface conformance suites; the Forge (providers + implementations); the stub system; the gated evolution/live-fix engine.

## Exit criteria (acceptance)
- `hobo forge <provider-url>` yields a **certified provider** that passes conformance and appears (signed) in the Registry.
- A **stubbed port** gets an **AI-generated implementation** that passes conformance **and reproduces recorded traces**, promoted through a gate.
- A simulated SLO regression triggers a **gated live-fix** that auto-rolls-back on failure and keeps the failing trace as a test.

## Risks / iteration hooks
- "Low-risk auto" threshold definition (shared with [Plan 5](../05-reliability-ha.md)/[Plan 12](../12-security-multitenancy.md)).
- Forge model/eval design; human-certification threshold for high-trust ports.
- Plugin signing/provenance (SLSA) + supply-chain trust ([Plan 12](../12-security-multitenancy.md)).
