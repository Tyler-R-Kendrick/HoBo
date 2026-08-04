# Phaser Integration

Specific guidance for wiring Colyseus into a Phaser 3 / Phaser 4 game. Read `../client.md` first for the generic client patterns — this file only covers the Phaser-specific glue.

## Install

```bash
npm install @colyseus/sdk
```

No Phaser-specific Colyseus package exists; the standard SDK works.

## Recommended client shape (thin adapter layer)

Resist putting network code inside scenes. A thin adapter layer keeps the room model independent of Phaser's scene lifecycle and lets you swap renderers later without touching networking:

```
src/
  net/
    colyseusClient.ts      # creates the Client (env-configured URL)
    roomSession.ts         # joinOrCreate / reconnect; owns room reference + listeners
    entityRegistry.ts      # Map<sessionId, Phaser.GameObjects.Sprite>
  scenes/
    BootScene.ts           # asset loading
    MenuScene.ts           # matchmaking UI; calls roomSession.join(...)
    GameScene.ts           # renders state, sends intent; NO authoritative rules
    UIScene.ts             # HUD, connection banners (reads room status, doesn't own it)
```

- **`colyseusClient.ts`** — a single `Client` instance at module scope.
- **`roomSession.ts`** — `join/leave/reconnect` plus a small state machine (`idle | connecting | connected | dropped | reconnecting | failed`). Owned listeners live here so they can be torn down on scene changes.
- **`entityRegistry.ts`** — the canonical `Map<id, renderObject>`. Scenes read/write through it instead of building their own maps per-scene.
- **Scenes** consume `roomSession` and the registry. They never call `client.joinOrCreate` directly.

This is the *Phaser* adapter shape. For other engines, see `../README.md` — the three modules have equivalents (e.g. Three.js uses an object-map registry and a module-scoped renderer root).

## Architecture: where does the `Client` live?

The Colyseus `Client` and the active `Room` should **outlive scenes**, since Phaser creates/destroys scenes freely during gameplay. Three common approaches:

1. **Registry (simplest)** — attach once, read from any scene:
   ```ts
   // main.ts bootstrap
   const client = new Client(import.meta.env.VITE_COLYSEUS_URL);
   game.registry.set("colyseusClient", client);
   // Later, in any scene:
   const client = this.registry.get("colyseusClient") as Client;
   ```

2. **Module singleton** — a plain TS module exporting `client` and `room`. Works; easy to test.

3. **Custom plugin** — install as a `Phaser.Plugins.BasePlugin`. Cleanest for larger games; more ceremony.

For a jam-scale project, use option 1.

## Lifecycle integration

A typical flow splits across three scenes: `BootScene` (loads assets) → `LobbyScene` (connects/matches) → `GameScene` (renders + plays).

### Connect in LobbyScene

```ts
export class LobbyScene extends Phaser.Scene {
  async create() {
    const client = this.registry.get("colyseusClient") as Client;
    this.add.text(400, 300, "Finding match…").setOrigin(0.5);

    try {
      const room = await client.joinOrCreate<MyState>("battle", {
        name: localStorage.getItem("playerName") ?? "anon",
      });
      this.registry.set("colyseusRoom", room);
      sessionStorage.setItem("reconnectionToken", room.reconnectionToken);
      this.scene.start("GameScene");
    } catch (err) {
      this.add.text(400, 340, `Error: ${err.message}`).setOrigin(0.5);
    }
  }
}
```

### Render in GameScene

```ts
export class GameScene extends Phaser.Scene {
  private room!: Room<MyState>;
  private avatars = new Map<string, Phaser.GameObjects.Sprite>();
  private localIntent = { up: false, down: false, left: false, right: false, fire: false };
  private inputSeq = 0;

  create() {
    this.room = this.registry.get("colyseusRoom") as Room<MyState>;
    const callbacks = Callbacks.get(this.room);

    // Spawn/despawn avatars
    callbacks.onAdd("players", (player, sessionId) => {
      const sprite = this.add.sprite(player.x, player.y, "hero");
      sprite.setData("sessionId", sessionId);
      sprite.setData("targetX", player.x);
      sprite.setData("targetY", player.y);
      this.avatars.set(sessionId, sprite);

      callbacks.listen(player, "x", () => {
        sprite.setData("targetX", player.x);
        sprite.setData("targetY", player.y);
        sprite.setData("targetTime", this.time.now);
      });

      callbacks.listen(player, "hp", (hp) => {
        // update a health bar; flash red on decrease
      });
    });

    callbacks.onRemove("players", (_, sessionId) => {
      this.avatars.get(sessionId)?.destroy();
      this.avatars.delete(sessionId);
    });

    // One-shot events
    this.room.onMessage("hit", ({ targetSessionId, amount }) => {
      this.avatars.get(targetSessionId)?.setTint(0xff0000);
      this.time.delayedCall(100, () => this.avatars.get(targetSessionId)?.clearTint());
    });

    // Input
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.setIntent(ev, true));
    this.input.keyboard!.on("keyup", (ev: KeyboardEvent) => this.setIntent(ev, false));

    // Cleanup on scene shutdown / game close
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.room.removeAllListeners();
    });
    this.game.events.once(Phaser.Core.Events.DESTROY, () => this.room.leave(true));
  }

  update(time: number, delta: number) {
    // Send intent at 30Hz, not every frame
    if (time - (this as any)._lastSent > 33) {
      this.room.send("input", { intent: this.localIntent, seq: ++this.inputSeq });
      (this as any)._lastSent = time;
    }

    // Interpolate remote avatars toward their target position
    const lerp = 1 - Math.pow(0.001, delta / 1000);  // smooth @ any fps
    this.avatars.forEach((sprite, sid) => {
      const tx = sprite.getData("targetX");
      const ty = sprite.getData("targetY");
      sprite.x = Phaser.Math.Linear(sprite.x, tx, lerp);
      sprite.y = Phaser.Math.Linear(sprite.y, ty, lerp);
    });
  }

  private setIntent(ev: KeyboardEvent, down: boolean) {
    switch (ev.code) {
      case "ArrowUp": case "KeyW": this.localIntent.up = down; break;
      case "ArrowDown": case "KeyS": this.localIntent.down = down; break;
      case "ArrowLeft": case "KeyA": this.localIntent.left = down; break;
      case "ArrowRight": case "KeyD": this.localIntent.right = down; break;
      case "Space": this.localIntent.fire = down; break;
    }
  }
}
```

## State-to-sprite binding principles

- **One authoritative `Map<sessionId, Sprite>`** on the scene. Never iterate `room.state.players` in `update()` — use `callbacks.onAdd`/`callbacks.onRemove` for lifecycle.
- **Store target positions on the sprite** via `setData`/`getData`; lerp toward them in `update()`. Prevents 20Hz jitter.
- **Physics bodies optional**: for authoritative servers, you usually don't want client-side physics fighting the server. Use Arcade bodies only for client-only VFX (particles, debris).
- **Local player branch**: if you client-predict, treat `avatars.get(this.room.sessionId)` as a special case — drive it from local input, reconcile to server state in `callbacks.listen(player, "x", ...)`.

## Input → messages

- **Translate to intents, not actions.** `{ up: true, fire: true }` — the server decides what happens.
- **Fixed cadence (30Hz) is enough** for action games. Every render frame is wasteful and gives nothing.
- **Alternative: send-on-change.** Dispatch only when the intent object differs from the last sent one. Lowest bandwidth; needs a "keep-alive" every second so the server knows you're still holding the key.
- **Pointer/touch**: for mouse aim, send `{ aim: { x, y } }` alongside keyboard intents, still at a capped rate.

## Reconnection UX

Wrap the `LobbyScene` connect in a reconnection attempt first:

```ts
const token = sessionStorage.getItem("reconnectionToken");
let room: Room<MyState>;
try {
  if (!token) throw new Error();
  room = await client.reconnect(token);
} catch {
  room = await client.joinOrCreate<MyState>("battle", {...});
}
```

In `GameScene`:

```ts
this.room.onLeave((code) => {
  if (code === 1000) return;  // normal close
  // Freeze the scene, show a reconnecting overlay, try client.reconnect(...)
  this.scene.pause();
  this.scene.launch("ReconnectingScene");
});
```

## Tilemaps, enemies, projectiles

Same rule: if the server owns it, it's in `state`; if it's local VFX, it isn't.

- **Tilemap**: usually static per match → send as `state.map` (name only) on `onCreate`; load the actual tilemap client-side from assets.
- **Server-owned enemies / projectiles**: `MapSchema<Enemy>` / `ArraySchema<Projectile>`. Bind to sprites via the same `onAdd`/`onChange`/`onRemove` pattern.
- **Client-only effects** (muzzle flash, damage numbers, explosions): triggered by `room.onMessage("hit", ...)` / `("explosion", ...)`; Phaser tweens/particles handle the visuals.

## Animation guidance

Usually synchronize gameplay facts, not animation state directly:

- Synchronize velocity or movement direction.
- Decide walk, idle, hurt, and death animations locally from authoritative facts.
- Use server broadcasts for rare one-shot events that must line up across clients.

Do not network every frame of an animation unless the gameplay genuinely depends on exact frame identity.

## Phaser-specific gotchas

- **Arcade physics collisions can fight the server.** If the server says the player is at (100, 200) but the client body collided with a wall at (98, 200), the sprite snaps on the next patch and looks jittery. Solution: disable client physics for networked bodies, or use client physics *only* for prediction and accept occasional snaps.
- **`scene.restart()` drops your subscriptions.** The `Room` persists (it's on the game registry), but scene-scoped `onAdd`/`onMessage` listeners die. Re-subscribe in every `create()`.
- **Scene transitions while a patch is arriving** can cause "added a sprite to a destroyed scene" errors. Unsubscribe in `SHUTDOWN`:
  ```ts
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.room.removeAllListeners());
  ```
- **Hot reload (Vite HMR) keeps the old Room around.** Expected in dev; avoid by manually leaving on dispose:
  ```ts
  if (import.meta.hot) {
    import.meta.hot.dispose(() => this.registry.get("colyseusRoom")?.leave(true));
  }
  ```
- **Phaser 4 differences**: Scene API is identical for networking purposes; the renderer change doesn't affect this. Reference `../../phaser4-gamedev` (if present in your skills) for v3→v4 rendering concerns.

## Sharing schema types

If your server package lives at `../server/`, import types only:

```ts
import type { MyState, Player } from "../../server/src/rooms/schema/MyState";

const room = await client.joinOrCreate<MyState>("battle", {...});
// room.state.players is now Map<string, Player>, fully typed
```

This requires no runtime coupling — types are erased at build.

## How this adapts to other renderers

The same Colyseus model survives renderer changes:

- Phaser uses sprite registries and scene lifecycle hooks
- Three.js uses object maps and render-loop interpolation
- React uses subscribed view models and component lifecycles
- ECS-based clients use entity IDs and systems that read authoritative snapshots

Only the adapter changes. The room model, message design, and trust boundaries should not.

## Minimal testing loop

1. `npm run dev` (server) on `:2567`.
2. `npm run dev` (client) on `:5173`.
3. Open two browser tabs (or two devices on your LAN — remember to bind server to `0.0.0.0`).
4. Move one; verify the other sees it.
5. Throttle network to 200ms RTT in devtools; verify interpolation is smooth.
6. Kill the server; verify the client shows a reconnect UI instead of freezing silently.
