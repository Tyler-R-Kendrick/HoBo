# Deployment

Where the Colyseus server actually runs, and how the client (typically on a static host like Vercel/Netlify/Cloudflare Pages) reaches it.

## Strong default: Vercel (client) + Colyseus Cloud (server)

Unless you already have infrastructure preferences or constraints, **this is the recommended topology**:

- **Frontend** (Phaser/Three.js/React build) → Vercel. CDN + HTTPS for free.
- **Colyseus server** → Colyseus Cloud. Managed TLS, Redis presence, sticky sessions, monitoring.

Shortest path to production with the least infrastructure work. Everything else in this file is "if you can't or don't want to use Cloud."

## Why not on Vercel / static hosts

Vercel/Netlify/Cloudflare Pages run **serverless functions** — ephemeral, stateless, no persistent WebSockets, no in-memory rooms. Colyseus needs a **long-running Node (or Bun) process** that holds WebSocket sessions and game state in memory. Split the deployment:

- **Client** (Phaser/Three.js/React build) → Vercel/static host. CDN + HTTPS for free.
- **Colyseus server** → a host that runs persistent processes (see below).

## Option A: Colyseus Cloud (recommended default)

First-party managed hosting. Handles TLS, Redis presence/driver, scaling, monitoring, sticky sessions, regions.

**Workflow**:

1. Bootstrap locally: `npm create colyseus-app@latest ./server`.
2. Develop against `ws://localhost:2567`.
3. Sign in at `https://cloud.colyseus.io`, create an application.
4. Deploy (currently via the Cloud dashboard's git integration or `@colyseus/cloud` CLI — consult the dashboard for the current deploy button/command).
5. Cloud provisions a `wss://<your-app>.colyseus.cloud` URL.
6. Point the client env at it: `VITE_COLYSEUS_URL=wss://<your-app>.colyseus.cloud`.

**What Cloud handles**:
- TLS cert and the `wss://` endpoint.
- Multi-process scaling with Redis presence/driver pre-wired.
- Sticky sessions for WebSocket reconnect.
- Logs, live monitor, metrics dashboard.
- Region selection.

**What you still do**:
- Write the rooms and schema.
- Configure CORS (see below) if your client origin differs from the API origin.
- Environment variables via the dashboard.

## Option B: Self-host on a VM / container platform

Pick when you want full control, custom infrastructure, or are running outside the Cloud's supported regions.

| Host | Why pick it |
|---|---|
| **Fly.io** | Global regions, native WebSocket support, cheap small VMs, one-command `fly deploy` |
| **Railway** | Simplest Git-to-deploy for Node; WebSockets supported |
| **Render** | Similar to Railway; persistent Web Services |
| **DigitalOcean App Platform / Droplet** | Classic VPS; full control |
| **Vultr** | Good value VPS; WebSocket-friendly |
| **AWS ECS/Fargate, GCP Cloud Run (min instances + session affinity), Azure Container Apps** | For serious scale / existing cloud footprint |

The important requirement is not the vendor. It is support for long-lived websocket connections and an always-on process model.

### Self-host requirements

Be explicit about the operational pieces Colyseus expects:

- TLS and secure websocket transport in production
- Graceful shutdown behavior during deploys and restarts
- Sticky-session or equivalent websocket-friendly load-balancing when multiple upstream processes exist
- Shared presence/driver infrastructure when scaling beyond one process
- Protected monitoring and logs

**Required regardless of host**:

- **TLS / `wss://`** — your static client is served over HTTPS; browsers block `ws://` from HTTPS pages (mixed content). Use Caddy/Traefik/nginx with Let's Encrypt, or the platform's built-in TLS.
- **Sticky sessions** if behind a load balancer with more than one upstream (WebSocket reconnects must return to the same process).
- **CORS** on the HTTP endpoints (`/matchmake/*`) — whitelist your client origin.
- **Redis** for multi-process (Upstash, Redis Cloud, or self-hosted): `RedisPresence` + `RedisDriver` in `defineServer`.
- **Graceful shutdown**: hook `server.onBeforeShutdown` to drain connections before the platform kills the process.

**Dockerfile sketch** (Node):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 2567
CMD ["node", "build/index.js"]
```

**Fly.io hint**: `fly.toml` must set `services.protocol = "tcp"` and expose internal port 2567 with a `http_checks`/`tcp_checks` health check. Fly supports WebSockets out of the box on standard HTTPS ports.

## Client configuration

Regardless of host:

```
# .env.local (dev)
VITE_COLYSEUS_URL=ws://localhost:2567

# .env.production
VITE_COLYSEUS_URL=wss://<your-app>.colyseus.cloud
```

```ts
const client = new Client(import.meta.env.VITE_COLYSEUS_URL);
```

Vercel → Project Settings → Environment Variables. Inject at build time for Vite/Next. Redeploy the static client after changing.

## CORS

Colyseus' Express app serves `/matchmake/*` HTTP endpoints (used before the WebSocket upgrade for room discovery). If your client origin differs from the server origin:

```ts
// server app.config.ts — pseudocode; adapt to your boilerplate
import cors from "cors";
initializeExpress: (app) => {
  app.use(cors({
    origin: ["https://yourgame.vercel.app", "http://localhost:5173"],
    credentials: true,
  }));
}
```

Cloud usually provides a CORS setting in the dashboard — prefer that to hand-rolled config.

## Auth transport

When frontend and realtime backend are on different subdomains, token-based auth is usually simpler than cookie-coupled assumptions.

Typical pattern:

1. User signs in through your app.
2. Frontend receives a token or session artifact.
3. Frontend sets `client.auth.token` or passes the token during join.
4. Room `onAuth()` validates the token and returns user data.

Keep auth validation deterministic and fast. The room should receive trusted identity data, not perform UI-centric auth flows.

## Suggested environment variables

Backend:

```env
PORT=2567
NODE_ENV=production
CLIENT_ORIGIN=https://game.example.com
JWT_SECRET=replace-me
AUTH_SALT=replace-me-if-using-colyseus-auth
SESSION_SECRET=replace-me-if-using-oauth-flow
```

Frontend:

```env
VITE_COLYSEUS_URL=https://rt.example.com
```

Add game-specific variables as needed for analytics, storage, or external APIs.

## Local dev against a deployed server

Sometimes you want the deployed client against a local server (or vice-versa) for debugging:

- Local server + local client: `ws://localhost:2567`, no CORS fuss.
- Deployed client + local server: expose local via `ngrok http 2567` → `wss://<id>.ngrok.app`; remember CORS needs that origin.
- Deployed client + deployed server: normal production wiring.

## Scaling posture (when to care)

- **1 process** handles several hundred to a few thousand concurrent clients depending on room count and tick rate. Start here.
- **Vertical first**: bump CPU/RAM before splitting processes.
- **Horizontal** (multi-process): only when CPU is saturated *and* you've optimized the hot room. Requires Redis driver+presence + sticky sessions.
- **Multi-region**: Colyseus Cloud handles this; DIY means one deployment per region + region-aware matchmaking on the client.

## Monitoring

- **Cloud**: dashboard provides CCU, room counts, per-room inspection.
- **Self-host**: mount `@colyseus/monitor` at `/colyseus` *behind basic auth*. Never expose it publicly.
- **Logs**: structured JSON logs (pino/winston) are worth the 5 minutes to set up — `onJoin`/`onLeave` with sessionId and roomId make post-mortems tractable.

## Checklist before going live

- [ ] Frontend deployed separately from the Colyseus backend.
- [ ] Client uses `wss://` / `https://` in production (no mixed-content errors).
- [ ] Secure Colyseus URL exposed to the web client via env var.
- [ ] CORS allows only the production client origin(s).
- [ ] Auth flow chosen and validated.
- [ ] `@colyseus/monitor` is either disabled or auth-protected.
- [ ] `allowReconnection` is configured if the game needs it.
- [ ] Join, leave, reconnect, and invalid token paths tested.
- [ ] Rate-limiting / input validation on every `onMessage` handler.
- [ ] Graceful shutdown behavior verified (drains rooms).
- [ ] Logs or monitoring in place for join errors and room crashes.
- [ ] Environment variables (Cloud/Vercel dashboards) match between client and server.
- [ ] One staging environment that mirrors production topology.
- [ ] Multi-process coordination planned before horizontal scale is enabled.
- [ ] You've tested two tabs under simulated 200ms RTT.

## Deployment anti-patterns

- Hardcoding `localhost` URLs in frontend code paths that reach production.
- Coupling room state to a platform that scales to zero.
- Depending on cookies across subdomains without validating actual browser behavior.
- Treating local websocket success as proof that production topology is correct.
- Adding multi-region complexity before you can measure latency and operational need.
- Exposing live room monitoring publicly.
- Scaling to multiple processes without shared infrastructure to coordinate them.
- Assuming dashboard env configuration means the runtime process sees it — use `/health` to verify.
