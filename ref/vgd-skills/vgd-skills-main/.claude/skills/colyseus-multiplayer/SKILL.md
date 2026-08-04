---
name: colyseus-multiplayer
description: "Design and implement multiplayer games with Colyseus (authoritative Node.js server + state sync). Use when adding networking to a game, designing rooms/state schemas, debugging sync/reconnection issues, deploying to Colyseus Cloud, or wiring a client framework (Phaser, Three.js, React) to a Colyseus room. Triggers: 'multiplayer', 'colyseus', 'websocket game', 'room state sync', 'matchmaker', 'joinOrCreate'."
metadata:
  short-description: "Colyseus architecture, state sync, deployment, and engine integration."
---

# Colyseus Multiplayer

A framework for thinking about — and building with — Colyseus, an authoritative multiplayer server for Node.js/Bun. This skill covers the server model, client reconciliation, deployment, and per-framework integration. The goal is to make the right architectural calls *before* writing netcode, then implement them cleanly.

## Philosophy: The server owns truth, the client reflects it

Colyseus is **server-authoritative**. Every networking decision flows from that one fact. If you ever find yourself writing "the client will just tell the server where it is," stop — you're about to build a cheatable, desync-prone system.

**Before writing any networked code, ask**:

- **What is state vs. what is a message?** State is replicated truth (positions, HP, inventory). Messages are *intents* ("I pressed fire", "I want to move left") going up, or *events* ("you got hit", "game started") going down. Confusing these is the #1 cause of Colyseus bugs.
- **What is the simulation model?** Fixed-step tick loop (real-time action), event-driven (turn-based, card games), or lobby/chat (no simulation)? The answer dictates `setSimulationInterval` vs. pure `onMessage` handlers.
- **Who needs to see what?** One global state, or per-client filtered views? Filtered sync (`@filter`) costs CPU but prevents wallhacks.
- **What happens on disconnect?** `onLeave(client, consented)` — the `consented` flag matters. Add `allowReconnection` for any session worth rejoining.
- **How are rooms found?** `joinOrCreate` + `filterBy` covers 90% of cases. Plan metadata and filters up front, not after the matchmaker gets chaotic.

**Core principles**:

1. **State is declarative, not imperative.** Mutate `this.state.players[id].x = 10` on the server and the patch goes out automatically. Don't also send a "playerMoved" message — that's duplicate truth.
2. **Tick rate ≠ patch rate.** Simulation (`setSimulationInterval`) runs your physics; patch rate (`setPatchRate`) controls how often deltas flush to clients. Default 20Hz is usually fine; tune separately.
3. **Clients reconcile, they don't decide.** The client renders `room.state`, predicts locally if needed, and reconciles when server updates arrive. Never treat `room.state` as writable.
4. **Rooms are cheap, isolated, and disposable.** One match = one room instance. Dispose cleanly. Don't build a monolith "GameManager" across rooms — use `matchMaker.remoteRoomCall` or presence channels if rooms need to talk.
5. **Schema is a wire format, not your data model.** Keep `Schema` classes minimal (only synced fields). Put derived state, caches, and AI behavior trees in plain classes the room owns separately.

## When to use this skill

- Designing a new multiplayer game (any genre)
- Adding netplay to an existing single-player Phaser / Three.js / React game
- Debugging state desync, late joins, or reconnection flows
- Planning matchmaking (ranked/casual/private rooms, regions, filters)
- Deploying to Colyseus Cloud or self-hosting on Fly/Railway/etc.
- Choosing between "send as state" vs "send as message" for a given piece of data

## Working model (primitives glossary)

- **`Room`** — authoritative boundary for one session (match, lobby, shard). One instance per game session.
- **`Schema`** — declarative state tree replicated to clients; only `@type`-decorated fields sync.
- **`setSimulationInterval(cb, ms)`** — fixed-step server tick; the *simulation* clock.
- **`patchRate`** (via `setPatchRate(ms)`) — how often state deltas flush to clients; the *network* clock. Independent from sim rate.
- **`onMessage("type", handler)`** — receive client intents (moves, button presses).
- **`broadcast(type, payload, opts?)`** / **`client.send(type, payload)`** — fire transient server events to many / one client. Use for things that don't belong in durable state.
- **`onDrop(client, code)`** — server-side hook for unexpected disconnect; call `allowReconnection(client, seconds)` inside it.
- **`onReconnect(client)`** — fires when a dropped client returns within the grace window.
- **`onLeave(client, consented)`** — permanent departure (consented close or reconnection timeout).
- **`matchMaker`** — server-side orchestration: `query`, `joinOrCreate`, `reserveSeatFor`, `remoteRoomCall`.
- **`onAuth(client, token, request)`** — trust boundary; return the auth object passed into `onJoin`.

## Read-first pointer table

Before doing substantial work in the matching area, load the listed reference. Each is self-contained.

| When working on... | Read first |
|---|---|
| Room design, schema modeling, message boundaries, lifecycle hooks, matchmaker, auth | `references/server.md` |
| Connecting a web client, state callbacks, reconnect flow, prediction/reconciliation | `references/client.md` |
| Production topology, Vercel + separate backend, TLS/CORS, env vars, rollout | `references/deployment.md` |
| Phaser scene integration, sprite registry, interpolation, listener cleanup | `references/frameworks/phaser.md` |
| Wiring a different renderer (Three.js, React, Godot, etc.) | `references/frameworks/README.md` |
| Debugging a specific symptom (desync, duplicated players, lost input, bandwidth) | `references/anti-patterns.md` |

## Standard workflow

1. **Sketch the state schema first** — before any netcode, write the `Schema` classes. What fields *must* replicate? What's derived/local?
2. **List the message types** — up-messages (client intents) and down-messages (one-shot events like "you died", damage numbers). Avoid messages that duplicate state.
3. **Pick a simulation model** — tick-based (`setSimulationInterval(dt, 1000/20)`) for action games; event-driven for turn-based.
4. **Implement the room** — `onCreate`, `onJoin`, `onLeave`, `onDispose`, message handlers. Validate inputs with Zod or equivalent.
5. **Wire the client** — `joinOrCreate`, attach state callbacks, send input as messages. Test with two browser tabs before anything else.
6. **Plan matchmaking** — filters, sorts, metadata, max clients, public/private.
7. **Handle disconnects** — `allowReconnection` grace period; client-side `reconnect(reconnectionToken)`.
8. **Deploy** — Colyseus Cloud for managed; Fly/Railway for DIY. Client points at `wss://…`.

See `references/server.md` for server patterns, `references/client.md` for TS SDK usage, `references/deployment.md` for Cloud, and `references/frameworks/` for engine-specific integration.

### 9. Add a runtime-debug surface early

- Add a small `/health` route before production rollout.
- Report: service liveness, protocol version, build label, whether critical runtime envs are actually visible to the process.
- Distinguish clearly between dashboard env state, deployed git revision, and active process runtime state.
- If platform behavior is ambiguous, add explicit health/debug fields and targeted log lines rather than inferring from UI or deployment dashboards.

### 10. Treat analytics and replay as authoritative backend concerns

- Emit analytics from accepted server intents and authoritative outcomes, not from browser telemetry.
- Separate summary analytics from replay storage.
- For exact replay, prefer input/event logs plus periodic authoritative snapshots over position sampling alone.
- Add observable confirmation for sink activation (e.g. "analytics sink enabled", "first match/session write attempt").
- Force final checkpoints once at match end; never bypass throttles every simulation tick.

### 11. Keep asset/body/render contracts explicit

- If the multiplayer server simulates bodies while the client renders sprites, define an explicit anchor contract.
- Prefer first-class metadata such as `feetLine` or `contactY` for all entities rendered from authoritative state.
- Keep single-player and multiplayer aligned on: collision box semantics, contact point semantics, facing/direction semantics.
- If multiplayer uses simplified collision geometry instead of tile bodies, keep that geometry in sync with real level data or expect drift.

## Deployment playbook (summary — detail in `references/deployment.md`)

Use this shape by default for small web games:

- Static frontend on Vercel (or equivalent)
- Always-on Colyseus backend on Colyseus Cloud or another persistent Node host
- Persistence/analytics backend separate from the room server when needed

**Colyseus Cloud checklist**:
- GitHub deploy key or linked GitHub app access configured.
- Backend package has a `build` script (even if it's a no-op).
- Project contains `ecosystem.config.cjs` or equivalent PM2 ecosystem file with a valid `script`.
- Runtime env set in Cloud dashboard.
- Production health endpoint checked after deploy, not just the dashboard status.

**General deployment lessons**:
- Expect Cloud deploys to use pushed repository state, not your current local working tree.
- Distinguish between configured env vars, deployed revision, and active runtime process state.
- Use health endpoints and first-write logs to verify the active process, not just the deployment dashboard.

## Anti-patterns (summary — full list in `references/anti-patterns.md`)

❌ **Sending positions as messages instead of state.** Every frame, 60Hz, multiplied by N clients → bandwidth hell and no reconciliation. Positions belong in `Schema`.

❌ **Mutating `room.state` on the client.** It's a local mirror. Your mutation vanishes on the next patch and you'll "debug" for hours.

❌ **Async work blocking `onCreate` / `onJoin`.** The matchmaker has timeouts. Long DB fetches should happen in `onAuth` or be kicked off and awaited carefully.

❌ **One giant Schema with every game entity.** Break it up. Use `MapSchema<Player>`, `ArraySchema<Projectile>`, nested schemas. Keep non-synced data off the schema entirely.

❌ **No `filterBy` on matchmaking.** Every player lands in the same global room, or in randomly-fragmented rooms. Define filters (mode, map, region, private-code) up front.

❌ **Treating `client.send` and `broadcast` as interchangeable.** `client.send(type, payload)` is to one client; `this.broadcast(type, payload, { except: client })` is to everyone (optionally except the originator). Pick deliberately.

❌ **Ignoring `consented` in `onLeave`.** `consented=false` means they dropped — that's where `allowReconnection` goes, not on every leave.

❌ **Hardcoding `ws://localhost:2567` in the client.** Use env vars; the production URL is `wss://` and may be on a different host than the static client.

❌ **Retrofitting multiplayer directly into single-player scene logic.** Trying to make one scene serve both local-authority and server-authority flows creates confused ownership and brittle conditionals. Keep SP intact; create a dedicated MP scene/adapter that renders authoritative room state.

❌ **Assuming dashboard env configuration means the runtime sees it.** Deployment UIs often show configured values even when the active process is still stale. Confirm env visibility through `/health` and startup/runtime logs.

❌ **Relying on local working copy for Cloud deploys.** Git-based platforms deploy pushed repo state, not the current editor buffer. Commit, push, deploy, then verify the running build explicitly.

❌ **Making pre-match waiting fully inert by default.** Dead waiting rooms feel broken and are hard to test. Allow movement and optionally warmup attacks during `waiting` / `countdown`, but gate damage until `playing`.

## Variation guidance

**The right Colyseus shape depends heavily on game genre and scale. Resist defaulting to a single template.** Outputs should vary across these dimensions:

- **Simulation model**: real-time (fixed tick) vs. turn-based (event-driven) vs. lobby (no sim).
- **State granularity**: one global `state` vs. `MapSchema<Player>` + per-entity schemas vs. filtered per-client views.
- **Auth posture**: anonymous jam game (no auth) vs. account-backed (Auth Module / JWT) vs. room-password only.
- **Matchmaking topology**: quick-match only, quick-match + private rooms, lobby-as-room, region/mode filters.
- **Reconnection policy**: none (arcade score-attack) vs. 30s grace (casual PvP) vs. persistent (async/turn-based).
- **Tick/patch rate**: 60/20 for twitchy shooters, 20/10 for top-down action, event-driven for strategy.
- **Framework integration**: sprite binding (Phaser), mesh binding (Three.js), component state (React/Vue) — the pattern is the same, the glue differs.
- **Waiting-room UX**: strict lockout vs. warmup movement/combat vs. social/lobby behavior.
- **Analytics depth**: lightweight session summaries for early ops vs. replay-grade event/snapshot capture only when the product needs it.

Avoid converging on: "a `MapSchema<Player>` with x/y/hp in the room's default `state`, 20Hz tick, `joinOrCreate('game')`, no filters." That's the tutorial — it's rarely the right answer for a *specific* game.

## Framework integration

Colyseus is framework-agnostic on the client. The server patterns (`references/server.md`) never change. Only the rendering/input glue differs:

- **Phaser** — `references/frameworks/phaser.md`
- **Other frameworks (Three.js, React, Godot, etc.)** — `references/frameworks/README.md` explains the generic pattern and links to any engine-specific files that have been added.

When adding a new framework integration, create `references/frameworks/<name>.md` following the structure of the Phaser reference: connection bootstrap, state-to-render binding, input-to-message mapping, reconnection UX, deployment notes specific to that framework's host.

## Hard rules (short form)

- **NEVER** let the client mutate authoritative state — `room.state` is a mirror.
- **NEVER** trust `options` for identity — that's what `onAuth` is for.
- **NEVER** host the Colyseus process on serverless / scale-to-zero infrastructure.
- **DO NOT** let renderer convenience decide the trust boundary.
- **DO NOT** put renderer-specific fields (sprite refs, animation frame index, camera state) in `Schema`.
- **DO NOT** treat "it worked locally" as proof that reconnects, auth, or deployment are correct.

## Remember

**You are not writing netcode. You are designing a replicated simulation.**

Get the state/messages split right and most problems dissolve. Get it wrong and no amount of cleverness downstream will save you. When in doubt: **the server owns it, the client reflects it, and the wire carries the minimum needed to keep them in agreement.**
