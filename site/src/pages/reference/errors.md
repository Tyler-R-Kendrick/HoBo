---
layout: ../../layouts/Docs.astro
title: Errors & codes
description: "Stable machine-readable error codes for EventStore, aggregates, contracts, queue, resilience, and identity — map at boundaries, never string-match prose."
---

# Errors & codes

Prefer **stable codes** over string matching. Map adapter errors at package boundaries. Do **not** leak SQL, filesystem paths, or secret material into app-facing errors.

## Shape conventions

Errors that cross a boundary should carry:

| Field | Role |
|---|---|
| `code` | Stable SCREAMING_SNAKE or dotted machine code |
| `message` | Human-safe summary (no secrets) |
| `retryable` | Explicit when known (do not infer from message) |
| `cause` chain | Internal only; strip before external MCP/CLI if sensitive |

Parse-don’t-validate constructors throw typed parse errors (`CoreParseError`, `EffectValidationError`, …) rather than returning “maybe invalid” DTOs.

## EventStore / storage

| Code | Meaning | Typical retry |
|---|---|---|
| `OPTIMISTIC_SEQUENCE_CONFLICT` | Stale `expectedSeq` | Yes — reload stream |
| `STALE_FENCE` | Fence below `owner_epoch` | No as OCC retry |
| `MISSING_FENCE` | Unfenced write to fenced stream | No — acquire lease |
| `CHECKPOINT_REGRESSION` | Non-monotonic checkpoint | No |
| `UNSUPPORTED_SCHEMA_VERSION` | DB newer than code | No — upgrade binary |
| `MIGRATION_FAILURE` | Migrate failed | No until fixed |
| `STREAM_INTEGRITY` | Noncontiguous / head mismatch | No |
| `UNSUPPORTED_CODEC` | Unknown payload codec | No |
| `PERSISTENCE_UNAVAILABLE` | e.g. OPFS required but missing | No / change mode |
| `SQLITE_BUSY` | Busy timeout | Maybe — backoff |
| `SNAPSHOT_AHEAD` | Snapshot seq > head | No |
| `STORAGE_WORKER_TERMINATED` | Worker crash | Restart worker |

## Aggregates 

| Code | Meaning | Retry? |
|---|---|---|
| `AGGREGATE_CONFLICT` | OCC / concurrent writers | Yes — reload & retry |
| `AGGREGATE_INVARIANT` | Business rule reject | No |
| Stale fence surfaced at aggregate | Lost lease | No blind retry |

## Resilience failure classes

| Class | Retry via ResilienceProfile? |
|---|---|
| `transient` | Yes (within profile) |
| `policy.Decided` | **Never** |
| `terminal` | **Never** |
| `cancellation` | **Never** |
| `deadline` | Policy-dependent; not infinite retry |

## Contracts / Gatekeeper

Compatibility and gate denials surface as structured reasons (`MachineReadableReason` with `gate: contracts | policy | obligations | cost | effects | resilience`), not only thrown exceptions. CLI/MCP should print reason codes agents can act on.

## Identity / config

Prefer ref-safe messages (“resolution rank failed at provider-federation”) over embedding token fragments. Static-escape expiry is a hard fail, not a silent fallback to plaintext.

## Related

[EventStore](/HoBo/reference/eventstore/) · [Effects](/HoBo/reference/effects/) · [ActorHost](/HoBo/reference/actor-host/) · [Contracts](/HoBo/reference/contracts/)
