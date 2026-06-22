# ADR-0051 — WIT records as the canonical domain schema (TS + protobuf + Zod generated)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 39 — Data plane: projections](../39-data-plane-projections.md) · [Plan 24 — WIT interfaces reference](../24-wit-interfaces-reference.md) (the canonical contract) · [ADR-0037 — SDK codegen surface](./ADR-0037-sdk-codegen-surface.md) (the four-source codegen this extends) · [Plan 11 — Event model](../11-event-model.md) (`EventEnvelope` bodies) · [Plan 29 — Contracts](../29-contracts-compatibility.md) ("Declared" contracts from WIT/Zod) · [Plan 2 — SDK/API](../02-sdk-api.md) (Zod I/O today) · [ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)
- **Origin:** the data-plane design needs a single domain-schema/DTO layer; today Zod (I/O), WIT (ports), and the declarative SQL schema are disjoint. Designed via brainstorming.

## Context
HoBo had three schema systems that never met: **Zod** validators for step/workflow/query I/O ([Plan 2](../02-sdk-api.md)), **WIT** types for ports ([Plan 24](../24-wit-interfaces-reference.md)), and the **declarative SQL schema** for migrations ([Plan 34](../34-app-data-migrations.md)). The new data plane ([ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md)) needs one **domain/DTO schema** that simultaneously defines event payload shapes, projection read-model shapes, and backend mappings. The user's original intent named protobuf for DTOs in event bodies; HoBo's existing canonical contract is WIT, and its codegen ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)) already flows from WIT.

## Decision
1. **WIT records are the canonical domain schema.** Domain types/DTOs are authored as **WIT records** ([Plan 24](../24-wit-interfaces-reference.md)) — HoBo's existing canonical contract — making one record family the single upstream for event payloads, projection/read-model shapes, and backend mappings.
2. **Generate everything else from the WIT record** (extending [ADR-0037](./ADR-0037-sdk-codegen-surface.md)'s codegen): **TS types** via `jco guest-types` (existing path); **protobuf** message descriptors as the **wire encoding for event bodies** (new emitter); **Zod validators** as a runtime-validation view (new emitter). All deterministic, checked into `_generated/`.
3. **protobuf is an encoding, not the authoring language.** Event bodies in the `EventEnvelope` ([Plan 11](../11-event-model.md)) are protobuf-encoded WIT records; developers never hand-author protobuf or `.proto` as the source of truth.
4. **Domain DTOs are WIT-first; Zod is generated for them.** Hand-written Zod remains valid for ad-hoc, non-domain step I/O, but domain DTOs are no longer Zod-first. This makes the WIT record the single upstream for the TS type, protobuf encoding, Zod validator, projection shape, and [Plan 29](../29-contracts-compatibility.md)'s "Declared" contract.
5. **Evolution stays split and explicit:** event bodies evolve via [Plan 11](../11-event-model.md) upcasters (forward-only, never rewrite history); projection-sink schemas evolve via [Plan 34](../34-app-data-migrations.md) expand→backfill→contract. A domain-record change wires to both.

## Alternatives considered
- **protobuf/IDL as the canonical authoring schema** (the original idea). Rejected as the *authoring* language: it would add a second schema system alongside WIT/Zod and is less ergonomic for the TS-first SDK — but its strengths (compact wire format, strict evolution) are captured by generating protobuf *encodings* from WIT.
- **Zod-first (status quo extended to domain data).** Rejected: Zod is a TS runtime-validation library, not a language-neutral contract; it can't be the upstream for WIT ports, protobuf wire, or polyglot guests, and would fork the contract story.
- **A bespoke HoBo schema language now.** Rejected/deferred: WIT already is the canonical contract; a friendlier authoring surface is the future [Hobo Code](../38-hobo-code-dsl.md) DSL, which can author the same records without changing this decision.

## Consequences
- **(+)** One domain schema → TS + protobuf + Zod + projection shape + Declared contract, all generated and consistent; closes the disjoint-schema gap.
- **(+)** Reuses the existing WIT/jco/codegen machinery and the canonical-contract stance; protobuf gives a compact, evolvable event-body wire format without a second authoring surface.
- **(+)** Polyglot-friendly: WIT records are language-neutral, so non-TS guests share the same domain types.
- **(−)** Two new codegen emitters (WIT→protobuf, WIT→Zod) to build and keep deterministic ([ADR-0037](./ADR-0037-sdk-codegen-surface.md) drift gate covers them).
- **(−)** WIT records are a less familiar authoring surface than TS interfaces for app developers; the generated TS types and (future) Hobo Code DSL mitigate this.
- **(−)** WIT's type system is the ceiling for domain types until Hobo Code adds sugar; rich TS-only constructs must be modeled within WIT records.
