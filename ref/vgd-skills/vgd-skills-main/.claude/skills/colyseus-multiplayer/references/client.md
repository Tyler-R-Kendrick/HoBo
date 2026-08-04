# Client Patterns (framework-agnostic)

Covers the TypeScript client SDK (`@colyseus/sdk`). Every framework integration (Phaser, Three.js, React, Vue, vanilla) sits on top of this — the patterns here don't change; only the render/input glue does.

## Philosophy: The Client Reflects State and Expresses Intent

The client should do three jobs well:

1. connect to the right room
2. react to authoritative state changes
3. send player intent without claiming authority

Anything beyond that is renderer glue or latency management.

## Install

```bash
npm install @colyseus/sdk
```

## Connect & join

```ts
import { Client, Callbacks } from "@colyseus/sdk";
import type { server } from "../../server/src/app.config";

const url = import.meta.env.VITE_COLYSEUS_URL ?? "http://localhost:2567";
const client = new Client<typeof server>(url);

const room = await client.joinOrCreate("battle", {
  name: localStorage.getItem("playerName") ?? "anon",
  mode: "casual",
});

// Save for reconnection
sessionStorage.setItem("reconnectionToken", room.reconnectionToken);
sessionStorage.setItem("roomId", room.roomId);
```

Use `http://localhost:2567` locally and `https://...` in production browser builds.

**Method picker**:

| Method | Use when |
|---|---|
| `joinOrCreate(name, opts)` | Public match — default choice |
| `join(name, opts)` | Must join existing (e.g. specific mode already running) |
| `create(name, opts)` | Always new (private room host) |
| `joinById(id, opts)` | Joining a shared room code |
| `consumeSeatReservation(reservation)` | Backend-controlled matchmaking (server reserved a seat) |
| `reconnect(token)` | Resuming after disconnect |

Default to `joinOrCreate` until a stronger product flow says otherwise.

## Sharing types between server and client

The strongest typing comes from importing the server's `app.config` type:

```ts
import { Client } from "@colyseus/sdk";
import type { server } from "../../server/src/app.config";

const client = new Client<typeof server>(import.meta.env.VITE_COLYSEUS_URL);
```

This gives typed `room.state` without shipping server code. Other approaches:

- Monorepo: `packages/shared/schema/` imported by both.
- Polyrepo: server publishes types via `tsc --declaration` → `@myproj/schema` on npm.
- Quick-and-dirty: `import type` from a relative path if client/server are siblings.

If the repo is split, publish shared types or declarations rather than duplicating schema shape by hand.

## State callbacks {#callbacks}

Use `Callbacks` for entity lifecycle and fine-grained field changes. This is better than polling `room.state` during every render frame.

```ts
import { Callbacks } from "@colyseus/sdk";

const callbacks = Callbacks.get(room);

// Whole-state field change
callbacks.listen("phase", (currentValue, previousValue) => {
  console.log("phase changed:", previousValue, "->", currentValue);
});

// Collection additions / removals
callbacks.onAdd("players", (player, sessionId) => {
  spawnAvatar(sessionId, player);

  // Per-entity field subscriptions
  callbacks.listen(player, "hp", (currentHp, previousHp) => {
    updateHealthBar(sessionId, currentHp);
  });
});

callbacks.onRemove("players", (player, sessionId) => {
  despawnAvatar(sessionId);
});

// Everything-else fallback
room.onStateChange((state) => {
  // Fires once per patch. Useful for HUDs that read many fields at once.
});
```

**Rule of thumb**: prefer `listen` / `onAdd` / `onRemove` for granular, per-entity bindings. Use `onStateChange` only for broad HUD refreshes.

## Sending and receiving messages

Messages are for intents and transient events.

```ts
// Up (intents)
room.send("input", { intent, seq: inputSeq++ });

// Down (events)
room.onMessage("damage", ({ amount, from }) => {
  playHitSfx();
  spawnDamageNumber(amount);
});

// Wildcard for debugging
room.onMessage("*", (type, payload) => console.debug("msg", type, payload));
```

Good inputs:
- current directional intent
- aim vector
- selected ability
- ready / interact / emote

Bad inputs:
- absolute authoritative position
- trusted damage amounts
- direct inventory mutation

## Reconnection

Persist the reconnection token and try resume first.

```ts
const existingToken = sessionStorage.getItem("reconnectionToken");

let room;
try {
  room = existingToken
    ? await client.reconnect(existingToken)
    : await client.joinOrCreate("battle", { mode: "duo" });
} catch {
  room = await client.joinOrCreate("battle", { mode: "duo" });
}

sessionStorage.setItem("reconnectionToken", room.reconnectionToken);
```

Also handle lifecycle explicitly:

```ts
room.onLeave((code) => {
  // code 1000 = normal, 1006 = abnormal drop
  if (code !== 1000) showReconnectUI();
});

room.onError((code, message) => {
  console.error("room error", code, message);
});

room.onReconnect(() => {
  hideReconnectUI();
});
```

## Client-side prediction & reconciliation (real-time only)

Only use this for games that actually need it. Pattern:

1. Send input sequence numbers with intent
2. Predict locally for the controlled entity
3. Snap or correct from authoritative server state
4. Replay unacknowledged inputs if needed
5. Interpolate remote entities

```ts
const localInputs: { seq: number; intent: Intent }[] = [];
function sendInput(intent: Intent) {
  const seq = ++inputSeq;
  localInputs.push({ seq, intent });
  room.send("input", { seq, intent });
  applyIntentLocally(intent);          // predict
}

// When server state updates for my player, reconcile
const callbacks = Callbacks.get(room);
callbacks.onAdd("players", (player, sessionId) => {
  if (sessionId !== room.sessionId) return;  // remote — handled differently

  callbacks.listen(player, "x", () => {
    // Snap to server position
    localPlayer.x = player.x;
    localPlayer.y = player.y;
    // Replay inputs the server hasn't ack'd yet (server echoes lastSeq in state)
    const ackedSeq = player.lastSeq;
    const pending = localInputs.filter(i => i.seq > ackedSeq);
    localInputs.length = 0;
    localInputs.push(...pending);
    pending.forEach(i => applyIntentLocally(i.intent));
  });
});

// Interpolate remote players (smooth out 20Hz → 60Hz)
callbacks.onAdd("players", (player, sid) => {
  if (sid === room.sessionId) return;  // local handled above
  const avatar = remoteAvatars.get(sid)!;
  callbacks.listen(player, "x", () => {
    avatar.targetX = player.x;
    avatar.targetY = player.y;
    avatar.targetTime = performance.now();
  });
});
// In render loop: lerp avatar.x/y toward avatar.targetX/Y with ~100ms lag
```

For turn-based, card, social, or relaxed co-op games, skip this complexity until real latency testing proves you need it.

## Leaving cleanly

```ts
await room.leave(true);  // consented=true → server's onLeave sees consented=true
```

Call this on page unload where possible:
```ts
window.addEventListener("beforeunload", () => room.leave(true));
```

## Environment config

Never hardcode the URL. Vite example:

```
# .env.local
VITE_COLYSEUS_URL=http://localhost:2567

# .env.production
VITE_COLYSEUS_URL=https://<your-app>.colyseus.cloud
```

```ts
const client = new Client(import.meta.env.VITE_COLYSEUS_URL);
```

## Debugging checklist

- Log join success, `roomId`, and `sessionId`
- Attach `room.onError`, `room.onLeave`, and `room.onMessage("*", ...)` during bring-up
- The server ships `@colyseus/monitor` — mount `/colyseus` and inspect live rooms, state, clients
- Test with at least two tabs; three is better
- Simulate latency instead of assuming localhost behavior generalizes
- Confirm the client is reading env-configured URLs rather than hardcoded localhost values

## Client anti-patterns

- Polling `room.state` every frame instead of using callbacks for entity lifecycle
- Sending every render-frame transform as a message
- Mutating the local mirror of `room.state`
- Creating multiple active room sessions accidentally during scene or route changes
- Skipping visible reconnect and error UI, leaving the game to appear frozen
