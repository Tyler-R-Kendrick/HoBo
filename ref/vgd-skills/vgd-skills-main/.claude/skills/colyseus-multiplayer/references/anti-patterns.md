# Anti-Patterns

Common Colyseus mistakes, with the reason each is wrong and the correct alternative. Each anti-pattern is independent — use as a checklist during code review.

## State vs. messages

❌ **Sending `{ type: "move", x, y }` every frame instead of mutating state.**
*Why bad:* bandwidth scales O(clients²), there's no delta compression, reconnecting clients don't see current positions, and you've reinvented state sync poorly.
*Do:* mutate `player.x` / `player.y` on the server — patches compress and persist automatically.

❌ **Broadcasting a `{ type: "hpChanged", hp }` message alongside the state update.**
*Why bad:* now you have two sources of truth that can diverge, and the client must merge them. HP already syncs via state.
*Do:* let state carry HP. Use a separate message only for the *transient* event ("hit" with attacker info, damage number) that state doesn't need to persist.

❌ **Putting one-shot events in state (e.g. `state.lastExplosion = {...}`) then clearing them next tick.**
*Why bad:* late-arriving patches may miss the transient value, the field churns every patch, and all clients re-render on a non-durable field.
*Do:* `broadcast("explosion", {...})` — fire-and-forget is what messages are for.

## Authority

❌ **Trusting `room.send("teleport", { x, y })` from the client.**
*Why bad:* any client can send anything. This is a wallhack / speedhack waiting to happen.
*Do:* accept *intents* (`{ intent: { up: true } }`), validate, then mutate state server-side. The server decides what happens.

❌ **Mutating `room.state` from the client.**
*Why bad:* `room.state` is a local mirror; the next patch overwrites it. Mutations silently vanish.
*Do:* send a message; let the server mutate; watch the state callback fire.

❌ **Using `options` in `onJoin` as identity.**
*Why bad:* options are client-supplied and trivially spoofed.
*Do:* verify identity in `onAuth`, store on `client.auth`, use that.

## Schema design

❌ **One monolithic `GameState` with every entity as a top-level field.**
*Why bad:* every change re-diffs the whole root; nested subscriptions don't work; client callbacks get noisy.
*Do:* break into `MapSchema<Player>`, `ArraySchema<Projectile>`, nested `Inventory` — each diffs independently.

❌ **Putting non-replicated data (AI blackboards, pathfinding caches, RNG state) on the `Schema`.**
*Why bad:* wastes bandwidth and leaks server internals to every client.
*Do:* keep a plain class on the room (`this.ai = new AIController()`). Only `@type`-decorated fields sync.

❌ **Storing derived values (e.g. `totalDamage = sum of hits`) as synced state.**
*Why bad:* every recomputation patches; clients can derive it themselves from the inputs that *do* sync.
*Do:* sync the raw inputs; compute derived values on read (server or client).

❌ **Unbounded `ArraySchema` growth (e.g. chat log, combat log).**
*Why bad:* wire size keeps rising; late joiners see massive initial state.
*Do:* cap at N entries (rolling window), or move history to a persistent store and only sync the "last N visible" slice.

## Lifecycle

❌ **Blocking `onCreate` with a slow `await` (DB, external API).**
*Why bad:* matchmaker has timeouts; clients get generic failures.
*Do:* do the slow work in `onAuth` (before the room is even reserved), or kick it off async with a loading phase in state.

❌ **Forgetting to `allowReconnection` on real-time games.**
*Why bad:* a one-second Wi-Fi blip kicks the player and forfeits the match.
*Do:* implement `onDrop(client)` and `await this.allowReconnection(client, 30)` there. `onLeave` only fires after the grace window times out.

❌ **Clearing player state eagerly in `onDrop` even when `allowReconnection` is pending.**
*Why bad:* the reconnected player returns to an empty slot.
*Do:* mark `player.connected = false` during the grace window; only delete inside `onLeave` (which fires after the reconnection promise rejects).

❌ **`autoDispose = false` without a manual dispose path.**
*Why bad:* empty rooms linger forever, leaking processes and memory.
*Do:* if you need persistence across zero clients, wire an explicit TTL (`this.clock.setTimeout(() => this.disconnect(), 10 * 60_000)`).

## Matchmaking

❌ **No `filterBy` → everyone piles into one room (or random fragmentation).**
*Why bad:* `joinOrCreate("battle", { mode: "ranked" })` and `{ mode: "casual" }` match the same pool.
*Do:* `.filterBy(["mode", "region"])` in `defineRoom` so the matcher respects the options.

❌ **Using `joinById` as the *default* flow.**
*Why bad:* there's no server-side assignment; each client needs to know the id somehow (out-of-band).
*Do:* `joinById` only for private / invited rooms (share the id as a code). Public → `joinOrCreate` with filters.

❌ **Client-side "find best server" loops that call `getAvailableRooms` and pick one.**
*Why bad:* race conditions — two clients pick the same room, one fails. The matchmaker already solves this atomically.
*Do:* just call `joinOrCreate`; trust the server's selection (configurable via `.sortBy`).

## Messaging discipline

❌ **Using `this.broadcast` where `client.send` would do.**
*Why bad:* "you died" sent to everyone is weird; wastes bandwidth; reveals info to opponents.
*Do:* `client.send("died", ...)` for per-client events; `broadcast` only for events every client needs.

❌ **Not using `afterNextPatch: true` for events tied to state.**
*Why bad:* "you took 12 damage" arrives before the HP patch — damage number appears, bar doesn't drop yet.
*Do:* `this.broadcast("damage", { amount }, { afterNextPatch: true })`.

❌ **No input validation on `onMessage` handlers.**
*Why bad:* a malformed payload crashes the handler and drops the whole room.
*Do:* Zod (or equivalent) `.safeParse` at the boundary; silently ignore on failure, or log.

## Client wiring

❌ **Hardcoding `ws://localhost:2567` in client code.**
*Why bad:* production builds on Vercel/static hosting can't reach localhost; mixed-content blocks `ws://` from HTTPS pages.
*Do:* env var (`VITE_COLYSEUS_URL`), `wss://` in production.

❌ **Reading `room.state.players.get(id).x` every render frame and never using callbacks.**
*Why bad:* you miss additions/removals, can't animate transitions, and your render is tightly coupled to schema shape.
*Do:* `$(room.state).players.onAdd` to spawn, `$(player).onChange` to react.

❌ **No `room.onLeave` / `room.onError` handlers.**
*Why bad:* drops produce silent failures; the game just "freezes" from the player's POV.
*Do:* always handle both; surface a visible reconnect UI.

## Scaling / ops

❌ **Running multi-process without Redis driver + presence.**
*Why bad:* matchmaker on process A doesn't see rooms on process B; `remoteRoomCall` fails.
*Do:* `RedisDriver` + `RedisPresence` (or deploy to Colyseus Cloud, which configures this).

❌ **No sticky sessions behind the load balancer.**
*Why bad:* WebSocket reconnects hit a different process, blow up.
*Do:* configure sticky sessions in your LB (Fly, nginx `ip_hash`, ALB stickiness).

❌ **Exposing `@colyseus/monitor` in production without auth.**
*Why bad:* anyone can inspect live rooms, client sessions, and state.
*Do:* put it behind basic auth or disable in prod.
