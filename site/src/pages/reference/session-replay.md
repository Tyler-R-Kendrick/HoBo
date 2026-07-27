---
layout: ../../layouts/Docs.astro
title: Session Replay
description: "Privacy-first Session Replay (@hobo/replay, ADR-0137): rrweb-compatible capture, dual fixtures, replay.* events, CLI, and naming split from event-log replay."
---

# Session Replay

**Session Replay** reconstructs user DOM/sessions for debugging and support. Package **`@hobo/replay`** (ADR-0137). It is **not** control-plane event-log replay and **not** auth `session.*`.

## Naming split (critical)

| Concept | Meaning | Family / surface |
|---|---|---|
| **Event-log replay** | Fold durable facts for projections/audit | EventStore / `hobo inspect` |
| **Auth session** | Login/refresh/revoke | `session.Started` / `Refreshed` / `Revoked` |
| **Session Replay** | DOM/session reconstruction | `replay.*` + `@hobo/replay` |

Heavy rrweb streams **never** enter the control-plane event log — only content-addressed blob refs.

## Defaults

| Environment | Default |
|---|---|
| Local / dual fixtures / Station air-gap / web templates | **On** (zero Bindle config) |
| Production / staging | **Off** unless OpenFeature `hobo.session-replay` or sample rate |
| Kill switch | `HOBO_REPLAY=0` (or flag false) |

## Privacy (client-side before send/persist)

- Mask password / email / tel inputs
- Mask `[data-hobo-mask]`, `.hobo-mask`, payment autocomplete fields
- Redact `Authorization` / `Cookie` in network capture
- Continuous-identity **`principalRef` only** — no free-text PII

## CLI / MCP

```text
hobo replay doctor
hobo replay list
hobo replay get <sessionId>
hobo replay summarize <sessionId>
hobo replay open <sessionId>
hobo replay retention
```

MCP tool parity via canonical verbs. Player surfaces are read-oriented; mutation stays on CLI under policy/PAM.

## Event family (`replay.*`)

`Started` · `ChunkIngested` · `Ended` · `ErrorLinked` · `RetentionApplied` · `Accessed` · `Disabled` · `Metered`

## Composition

| Composes with | How |
|---|---|
| **Station** | Isolation + local path |
| **Harness / OpenFeature** | Prod enablement + sampling |
| **Trails** | Platform recipe `replay.retention` |
| **Continuous identity** | Principal refs only |
| **Metering** | Ingest bytes, storage, player access |
| **PAM** | Access policy for open/list |

## Performance budget (targets)

| Metric | Budget |
|---|---|
| Batch interval | 1000 ms |
| Batch size | 50 events |
| Main-thread per flush | ≤ 16 ms |
| Tracker overhead beyond rrweb | ≤ ~15 KB gzipped |

## Honest scope

- Live multi-cloud object storage + Junction federation: **ports present**; dual fixtures prove the path
- Full OpenReplay Assist / Helm stack: **optional**, not default
- High-volume product analytics warehouse: **residual**

## Related

[Trail map](/HoBo/guide/status/) · [Harness](/HoBo/reference/harness/) · [CLI](/HoBo/reference/cli/) · [Event families](/HoBo/reference/events/) · [Dual fixtures](/HoBo/testing/dual-fixtures/) · [Stations](/HoBo/primitives/stations/)
