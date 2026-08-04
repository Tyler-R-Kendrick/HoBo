# Framework Integrations

Colyseus is framework-agnostic on the client. The server patterns in `../server.md` never change. Only the glue between `room.state` callbacks and the render loop differs. This directory holds one file per engine with that glue.

## Available integrations

- [`phaser.md`](./phaser.md) — Phaser 3 / Phaser 4 (2D canvas/WebGL)
- *(add more as needed — see "Adding a new framework" below)*

## The generic integration pattern

Across every engine, the integration reduces to a **thin adapter layer** with three responsibilities:

| Module | Responsibility | Phaser | Three.js | React |
|---|---|---|---|---|
| `net/colyseusClient` | single `Client` at module scope | same | same | same |
| `net/roomSession` | `join`/`leave`/`reconnect`; connection state machine; owned listeners | same | same | same (can also live in a React context) |
| `net/entityRegistry` | `Map<id, renderObject>` canonical across scenes/components | `Map<sid, Sprite>` | `Map<sid, Mesh>` | React state / `useSyncExternalStore` |

Renderer code (scenes / render-loop / components) reads from the registry and calls `roomSession` for intent. The authoritative room code never leaks into renderer files.

Every framework-specific file answers the same four questions. When adding a new one, organize around these:

### 1. Where does the client live in the app lifecycle?

- Singleton that outlives scenes/components? (Phaser: yes — create once, attach to scenes. Three.js: usually yes — module-scoped. React: `useContext` / singleton module.)
- Who owns reconnection state (`reconnectionToken`)? Typically a top-level service, not the render layer.

### 2. How does `room.state` map to render objects?

Every framework has some notion of "spawn a thing, move it, destroy it." Bind those to state callbacks:

| Colyseus callback | Render-side action |
|---|---|
| `$(state).players.onAdd` | Spawn sprite / mesh / component |
| `$(player).onChange` or `listen("x")` | Update transform / tween target |
| `$(state).players.onRemove` | Despawn / cleanup |
| `room.onStateChange` | HUD refresh |
| `room.onMessage("event")` | One-shot VFX / SFX |

Keep a `Map<sessionId, RenderObject>` on the render side. Add/remove via callbacks, never by iterating state in the render loop.

### 3. How does input become `room.send("input", ...)`?

Each framework has an input API (Phaser's keyboard plugin, pointerlock + KeyboardEvent for Three.js, React event handlers). Translate input into **intent payloads** (`{ up, down, left, right, fire }`) — not absolute positions. Send at a fixed rate (e.g. 30Hz) or only on change, not every render frame.

### 4. How is the render loop reconciled with state updates?

Patches arrive at `patchRate` (default 20Hz). Renders run at 60Hz+. For non-local entities, **interpolate** between the last two received positions. For the local player (if predicting), **reconcile** against the latest authoritative position. See `../client.md#client-side-prediction--reconciliation-real-time-only`.

Turn-based / non-action games can skip interpolation entirely — just snap to state.

## Adding a new framework

1. Create `references/frameworks/<framework>.md`.
2. Follow the Phaser file's structure as a reference:
   - Setup & install
   - Where the `Client` lives
   - Scene/component lifecycle + `joinOrCreate` integration
   - State → render binding (with a real example)
   - Input → message
   - Reconnection UX
   - Framework-specific gotchas
3. Reference the generic patterns (`../client.md`, `../server.md`) rather than duplicating them.
4. Add a line to "Available integrations" above.

## Stubs for common targets

Use these as starting points when a dedicated file doesn't yet exist:

**Three.js** — `Client` at module scope; `joinOrCreate` in the app bootstrap; `$(state).entities.onAdd` creates a `Mesh`, stored in `Map<sessionId, Mesh>`; `$(entity).onChange` updates `mesh.userData.target{Position,Quaternion}`, lerp/slerp inside the render loop. Input via `document.addEventListener("keydown")` → intent state → `room.send("input", intent)` on change.

**React** — put the `Client` and `Room` in a context (`ColyseusProvider`). Expose `useRoomState<T>()` that subscribes to callbacks and returns immutable snapshots (or use `useSyncExternalStore`). Render components map over `state.players`. Send on event handlers: `onClick={() => room.send("play", ...)}`. Ideal for lobbies, turn-based games, card/board games.

**Godot / Unity / Defold / GameMaker** — Colyseus ships native SDKs for these. Patterns are equivalent: `JoinOrCreate`, subscribe to schema change events, spawn/despawn scene nodes. Consult the SDK-specific docs for exact API shape; the mental model in `../client.md` still applies.

**WebXR / Babylon.js** — same as Three.js; bind `room.state` to scene nodes; use interpolation aggressively (VR is unforgiving of jitter).

## Framework-independent checklist

Before wiring any framework:

- [ ] Server state schema is stable (adding fields later is cheap; renaming is a migration).
- [ ] Shared types strategy decided (monorepo import, published package, or `import type` relative).
- [ ] Environment URL plumbing works locally *and* against deployed server.
- [ ] Two clients can see each other move in a browser test (prove the loop before stylizing).
- [ ] `onLeave` / `onError` surface visible UI (so "it froze" bugs become "server said error X").
