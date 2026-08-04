# Server Patterns

Everything authoritative lives here. This reference covers the `Room` lifecycle, `Schema` state design, messaging, the matchmaker, and auth. Targets Colyseus 0.17+.

## Project bootstrap

```bash
npm create colyseus-app@latest ./server
cd server
npm start   # starts on :2567 with a livereload-friendly boilerplate
```

Key layout:
```
src/
  app.config.ts      # defineServer, rooms, transport, express routes
  rooms/
    MyRoom.ts        # Room subclass
    schema/MyState.ts  # Schema subclasses
```

## defineServer / defineRoom

Rooms are declared with `defineRoom` and registered in `app.config.ts`:

```ts
import { defineServer, defineRoom } from "@colyseus/tools";
import { BattleRoom } from "./rooms/BattleRoom";

export default defineServer({
  rooms: {
    battle: defineRoom(BattleRoom, { map: "woods" })
      .filterBy(["mode"])
      .sortBy({ clients: "desc" }),
  },
});
```

Room instances are created **lazily** by the matchmaker, not at boot.

## Lifecycle {#lifecycle}

Colyseus 0.17 exposes five server-side room hooks: `onCreate`, `onAuth`, `onJoin`, `onDrop`, `onReconnect`, `onLeave`, `onDispose`. Treat them as **one lifecycle**, not isolated callbacks — especially the drop/reconnect/leave trio.

| Hook | When it fires | Typical responsibility |
|---|---|---|
| `onCreate(options)` | Room instantiated by matchmaker | Initialize state, set intervals, register `onMessage` handlers |
| `onAuth(client, token, req)` | Before `onJoin`, per joining client | Validate identity; return auth object or throw |
| `onJoin(client, options, auth)` | After auth, client seated | Add player to state; announce membership |
| `onDrop(client, code)` | Unexpected disconnect (WebSocket closed abnormally) | Mark player disconnected; call `allowReconnection` |
| `onReconnect(client)` | Dropped client returned within grace window | Mark player reconnected; re-sync if needed |
| `onLeave(client, consented)` | Permanent departure: clean `leave()` OR reconnection timeout | Delete player from state; persist results |
| `onDispose()` | Room destroyed (last client gone + `autoDispose`) | Final cleanup, DB writes, release external resources |

```ts
import { Room, Client } from "@colyseus/core";
import { MyState, Player } from "./schema/MyState";

export class BattleRoom extends Room<MyState> {
  maxClients = 8;
  autoDispose = true;        // dispose when last client leaves
  patchRate = 1000 / 20;     // 20Hz delta flush (default)

  onCreate(options) {
    this.setState(new MyState());
    this.state.map = options.map ?? "woods";

    // Fixed-step simulation
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / 30);

    // Register message handlers
    this.onMessage("input", (client, payload) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.intent = payload.intent;      // stored, applied in tick()
      p.lastSeq = payload.seq;        // echoed back via state for client reconciliation
    });
    this.onMessage("*", (client, type, payload) => {
      // wildcard — catch unknown messages for logging/debug
    });
  }

  async onAuth(client, token, request) {
    // Return an object → passed to onJoin as `auth`.
    // Throw / return false → reject the connection.
    return { userId: verify(token) };
  }

  onJoin(client, options, auth) {
    const p = new Player();
    p.name = options.name ?? `p_${client.sessionId.slice(0, 4)}`;
    p.userId = auth.userId;
    p.connected = true;
    this.state.players.set(client.sessionId, p);
  }

  async onDrop(client, code) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;

    try {
      await this.allowReconnection(client, 30);  // 30s grace
      // onReconnect fires separately; nothing else to do here
    } catch {
      // Timed out — onLeave(consented=false) will fire; final cleanup happens there
    }
  }

  onReconnect(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
  }

  onLeave(client, consented) {
    // Permanent departure: consented close OR reconnection timeout
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    // last-ditch cleanup: persist match results, release resources
  }

  private tick(dt: number) {
    this.state.players.forEach((p) => {
      // apply p.intent → p.x / p.y, clamp, collide, etc.
    });
  }
}
```

**Key distinctions**:

- `autoDispose = true` → room disposes when empty. Set `false` for persistent/asynchronous games (then wire a manual TTL).
- `maxClients` is enforced by the matchmaker, not by you.
- `patchRate` is the **network** rate; `setSimulationInterval` is the **sim** rate. They are independent.
- **Reconnection is on `onDrop`, not `onLeave`.** `onLeave` fires only *after* the grace window expires (or for a consented close). Putting `allowReconnection` in `onLeave` still works for backwards compat, but prefer the `onDrop` shape in new code — it reads exactly like the lifecycle diagram.
- If you don't want reconnection at all, just omit `onDrop` — the client drop will flow straight to `onLeave(client, false)`.

## State / Schema {#state}

```ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string;
  @type("string") userId: string;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("boolean") connected = true;
  @type(["string"]) inventory = new ArraySchema<string>();
}

export class MyState extends Schema {
  @type("string") map = "woods";
  @type("string") phase: "lobby" | "playing" | "ended" = "lobby";
  @type({ map: Player }) players = new MapSchema<Player>();
}
```

**Rules**:

1. **Only `@type`-decorated fields sync.** Everything else is server-local — perfect for AI blackboards, caches, pools.
2. **Mutate on the server; never on the client.** The framework diff-encodes changes between flushes.
3. **Keep schemas small.** Put short-lived things (projectiles, effects) in `ArraySchema`, but prune aggressively — size matters for the wire.
4. **Use nested schemas** to group related fields (`Inventory`, `Stats`) — they diff independently.
5. **Filtered sync** (per-client visibility):
   ```ts
   @filter(function(client, value, root) {
     return this.teamId === root.players.get(client.sessionId)?.teamId;
   })
   @type("number") secretPlan: number;
   ```
   Use sparingly — `@filter` runs per client per patch.

## Messages {#messages}

Think of messages as **intents (up)** and **events (down)**. State changes do not need messages.

**Up (client → server)** via `this.onMessage("type", handler)`:

```ts
// Validate with Zod (or equivalent) at the boundary
import { z } from "zod";
const InputSchema = z.object({
  intent: z.object({ up: z.boolean(), down: z.boolean(), fire: z.boolean() }),
  seq: z.number().int().nonnegative(),
});

this.onMessage("input", (client, raw) => {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) return;
  const p = this.state.players.get(client.sessionId);
  if (!p) return;
  p.intent = parsed.data.intent;
  p.lastSeq = parsed.data.seq;  // for client-side reconciliation
});
```

**Down (server → clients)**:

- `client.send("damage", { amount: 12, from: "enemy1" })` — one client
- `this.broadcast("phaseStart", { phase: "combat" })` — all clients
- `this.broadcast("hit", data, { except: attacker })` — all except one
- `this.broadcast("damage", data, { afterNextPatch: true })` — delay until the corresponding state patch has flushed (prevents "damage number before HP change")

**Use state, not messages, for**:
- Positions, HP, inventory, scores, phase, timers
- Anything a reconnecting client would need to restore the game's visual state

**Use messages, not state, for**:
- One-shot events that don't need to persist (hit flashes, sound triggers)
- Client-specific intents (input, chat-typed)
- Flow signals ("match starting in 3", "boss appears") where latency matters more than history

## Matchmaking {#matchmaking}

Client-facing matchmaking methods (exposed by default):

- `joinOrCreate(name, options)` — default choice for public lobbies
- `join(name, options)` — strict: join existing or fail
- `create(name, options)` — always new room
- `joinById(id, options)` — private room by share code

Server-side filtering:

```ts
// In app.config.ts
defineRoom(BattleRoom)
  .filterBy(["mode", "region"])          // fields from options considered for matching
  .sortBy({ clients: "desc" })            // fill fullest eligible room first
  .enableRealtimeListing();               // LobbyRoom sees live updates
```

Server-side programmatic matchmaking (for custom flows):

```ts
import { matchMaker } from "@colyseus/core";

const rooms = await matchMaker.query({ name: "battle", private: false });
const res = await matchMaker.joinOrCreate("battle", { mode: "ranked" });
// Give seat to a specific client via HTTP/auth flow:
const seat = await matchMaker.reserveSeatFor(room, { userId });
// Call into a room from outside:
await matchMaker.remoteRoomCall(roomId, "someMethod", [arg1, arg2]);
```

**Metadata vs options**:
- **Options**: passed to `onCreate` / `onJoin`; used for filtering.
- **Metadata**: set via `this.setMetadata({ ... })` at runtime; visible in lobby listings.

**Private rooms**: `this.setPrivate()` to hide from public matchmaking; share `roomId` for `joinById`.

## Auth

Three layers, pick what fits:

1. **Room `onAuth`** — validate per-room join attempts. Return auth object → `onJoin(client, options, auth)`. Throw/return false to reject.
2. **HTTP middleware** — Express-level auth for your HTTP routes (login, account APIs).
3. **Auth Module** (`@colyseus/auth`) — full identity service: email/password, OAuth, JWT sessions. Use when you need account persistence.

```ts
async onAuth(client, token, request) {
  if (!token) throw new ServerError(401, "token required");
  const payload = await verifyJwt(token);
  return { userId: payload.sub, role: payload.role };
}
```

**Principles**:
- Never trust `options` for identity — that's client-controlled.
- `onAuth` runs *before* `maxClients` check and seat reservation.
- Store sensitive fields (internal ids, roles) on `client.auth` or `client.userData`, never on synced state.

## Scaling

Single-process is the default; it handles thousands of CCU for most games. For multi-process:

- **Driver** (`RedisDriver`) — shared room registry.
- **Presence** (`RedisPresence`) — cross-process pub/sub.
- **Load balancer with sticky sessions** — WebSocket connections must stay on the same process.

On **Colyseus Cloud**, all of this is wired for you. Self-hosted → Redis + a process manager (PM2, systemd) + nginx/Caddy for TLS.

## Testing

`@colyseus/testing` spins up a real server in-memory. Excellent for CI:

```ts
import { boot, ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/app.config";

let colyseus: ColyseusTestServer;
beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => colyseus.shutdown());

test("two players see each other", async () => {
  const r1 = await colyseus.connectTo(await colyseus.createRoom("battle", {}));
  const r2 = await colyseus.sdk.joinById(r1.id, {});
  await r1.waitForNextPatch();
  expect(r1.state.players.size).toBe(2);
});
```
