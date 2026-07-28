# `@hobo/replay`

Privacy-first **Session Replay** for HoBo web apps and Stations (ADR-0137).

Captures user sessions with an **rrweb-compatible** engine, stores heavy blobs
out-of-band (dual fixtures locally, object-storage port in production), and
emits lightweight `replay.*` lifecycle events for correlation with Trails,
Harness/OpenFeature, continuous identity, and the control-plane event log.

> **Naming.** Control-plane “replay” means replaying the durable event log for
> projections/audit. **Session Replay** is DOM/session reconstruction. Auth
> still owns `session.Started|Refreshed|Revoked`. This package uses the
> `replay.*` event family and package id `@hobo/replay`.

## Default local path

### Every Bindle `web` app is Session-Replay capable (no app code required)

`bindle("app", b => ({ web: b.web(handler) }))` auto-attaches a
`session-replay` platform annotation. Local Yard hosts (`hobo dev`) wrap web
entrypoints so that:

1. HTML responses get a privacy-first bootstrap (`data-hobo-replay`)
2. Batches POST to `/__hobo/replay/ingest` on the same origin
3. Agents/CLI can list via `hobo replay list` / `/__hobo/replay/sessions`

Opt out per resource:

```ts
import { bindle, sessionReplay } from "@hobo/bindles";

bindle("app", (b) => ({
  web: b.web(handler).with(sessionReplay({ enabled: false })),
}));
```

Kill switch: `HOBO_REPLAY=0`.

### Programmatic dual fixtures

```ts
import {
  createReplayService,
  createFixtureRecordEngine,
} from "@hobo/replay";

const replay = createReplayService({ stationId: "station:local", memory: true });
const tracker = replay.startRecording({
  seedEvents: [{ type: 2, timestamp: Date.now(), data: { tagName: "div" } }],
});
await tracker.flush();
const session = await tracker.stop();
console.log(await replay.summarize(session!.id));
// open: await replay.open(session!.id, [/* blob refs */])
```

CLI:

```bash
hobo replay doctor
hobo replay list
hobo replay get <sessionId>
hobo replay summarize <sessionId>
hobo replay open <sessionId>
hobo replay retention
```

Kill switch: `HOBO_REPLAY=0` (or OpenFeature flag `hobo.session-replay=false`).

## Privacy defaults

Client-side before send/persist:

- Mask password / email / tel inputs
- Mask `[data-hobo-mask]`, `.hobo-mask`, payment autocomplete fields
- Redact `Authorization` / `Cookie` headers in network capture
- Continuous-identity `principalRef` only (no free-text PII)

## Production gating

| Environment | Default |
|---|---|
| local-dev / dual fixtures / Station air-gap | **On** |
| production / staging | **Off** (flag or sample rate required) |

## Honest Scope

- Live multi-cloud object storage + Junction federation: **port present**, dual fixtures are the proof path
- Full OpenReplay Assist / Helm stack: **optional Station template**, not default
- High-volume ClickHouse product analytics: **residual**

## Performance budget

| Metric | Budget |
|---|---|
| Batch interval | 1000 ms |
| Batch size | 50 events |
| Main-thread per flush | ≤ 16 ms target |
| Tracker overhead beyond rrweb | ≤ ~15 KB gzipped |

## Related

- ADR-0137 (Session Replay)
- Experience proof: `src/draft/exp-proofs/dx/session-replay-local-path`
- Technical proof: `src/draft/technical-proofs/session-replay-contracts`
