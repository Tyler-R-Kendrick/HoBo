---
type: Competitive Reference
title: "Anon / temporary container hosts — Competitor Reference"
description: "OpenPouch-class anonymous temporary hosting competitors for Examples Temporary (zero project API keys): Clawdship, APPISH, ZeroDeploy, SSHGrid, ttl.sh, Dockup, and blacklisted Instanode."
tags: [hobo, competitors]
competitor:
  slug: anon-container-hosts
  name: "Anonymous container hosts"
  aliases: ["openpouch", "clawdship", "ttl.sh", "zerodeploy", "dockup"]
  primary_category: cloud-application-platforms
  categories: [cloud-application-platforms, self-hosted-paas]
  directness: adjacent
  role: "cohort capture of zero-key temporary container hosts used as the Examples Temporary host matrix"
  posture: [benchmark, provider-target]
  hobo_surface: [provider-matching, delivery]
  evidence: mixed
  status: active
  research_date: 2026-08-12
  sources:
    - https://clawdship.dev/
    - https://ttl.sh/
---

# Anon / temporary container hosts — Competitor Reference

> Captured 2026-08 for HoBo Examples Temporary: browser → same-origin API → remote HTTPS, **zero project API keys**, no user CLI. Fair-use factual surface only ([index](index.md#sources--fair-use)).

HoBo needs **anonymous temporary hosts** that can run Node/Docker (OpenSaaS server) and ideally Convex OCI (≥~512MiB). OpenPouch Instant Lane is the proven Node baseline; competitors below are implemented or fail-closed with evidence.

## Matrix (runtime-oriented)

| Host | Anon? | Runs containers? | HoBo adapter | Proven status |
|---|---|---|---|---|
| **OpenPouch** (`openpouch.sh`) | Yes (no key) | Yes (Node dynamic; anon `memory.max=256MiB`) | `site/scripts/anon-container-hosts/openpouch-http.mts` | **Works** (2026-08 probe: `*.openpouch.sh`); **OOM** for Convex binary |
| **Clawdship** (`clawdship.dev`) | Yes (first deploy auto-account) | Yes (static + Docker tar.gz) | `clawdship.mts` | Adapter shipped; DNS resolves, **TCP:443 timeout** from this env (one-shot, no retry) |
| **APPISH** (`appi.sh`) | Claims push→URL | Yes (OCI push) | `appish-crane.mts` | Login/push-id gated; anon crane → `BLOB_UPLOAD_INVALID` |
| **ZeroDeploy** Drop | Yes | **No** (static / tar.gz site) | `zerodeploy.mts` | **Works** for static (2026-08: `*.zerodeploy.app`, nested `{data.url}`) — not Docker/OCI |
| **SSHGrid** Deploy API | Yes | **No** (tiny static/PHP JSON) | — | Static only; size-capped |
| **ttl.sh** | Yes | **No** (registry only) | — | Not a runner |
| **Dockup** (`dockup.cc`) | No (`dkp_` key) | Yes | — | Credentialed — forbidden for Examples Temporary |
| **Instanode** | Docs claim anon stacks | Docs claim deploy | **Blacklisted** | Live `api.instanode.dev` → nginx **404**; do not re-probe |
| **Lakebed** | Yes (`lakebed deploy`) | Capsule IR (not OCI) | Existing lakebed path | Works for capsules; not Convex OCI |
| **E2B / Offly / SnapDeploy** | No | Yes | — | API key / signup — forbidden |

Sources checked 2026-08: [clawdship.dev](https://clawdship.dev/), [appi.sh](https://appi.sh/), [zerodeploy.dev/agents](https://zerodeploy.dev/agents), [sshgrid.com/api](https://sshgrid.com/api), [ttl.sh](https://ttl.sh/), [dockup.cc/llms.txt](https://dockup.cc/llms.txt), OpenPouch Instant Lane docs.

## Feature surface (competitors)

### Clawdship

```bash
curl -X POST https://api.clawdship.dev/v1/sites \
  -F name=my-api -F type=docker -F slug=my-api -F port=3000 \
  -F archive=@/tmp/archive.tar.gz
```

- Zero signup; first response may include `cship_` API key + billing URL.
- Static or Docker (`Dockerfile` in archive).
- Agent skill: `https://clawdship.dev/skill.md`.

### OpenPouch Instant Lane

```http
POST https://openpouch.sh/api/deployments
Content-Type: application/gzip
X-Openpouch-Project: <slug>
x-openpouch-env: <base64 JSON>
```

Body = gzip tarball of Node project. Anon cgroup **256MiB**.

### ZeroDeploy Drop

```http
POST https://api.zerodeploy.dev/drop
Content-Type: application/gzip
```

Returns `{ url, claim_token, expires_at }`. Ephemeral ~72h. **Not Docker.**

### APPISH

```bash
crane copy --platform linux/amd64 <image> push.to.appi.sh/<slot>/app:port_<port>
# → https://<slot>.appi.sh
```

Free slots documented as dashboard push-id / login.

## HoBo mapping

| Need | Path |
|---|---|
| OpenSaaS anon server | `provisionAnonOpenSaasServer` — OpenPouch HTTP → **Clawdship** → CF Neon shim |
| Generic host chain | `site/scripts/anon-container-hosts/chain.mts` (one-shot + per-host cooldown) |
| Convex OCI | Default fail-closed (`ephemeral-anon.ts`); opt-in `HOBO_CONVEX_OCI_HOST=clawdship` |
| Static anon drop | ZeroDeploy adapter (not wired into OpenSaaS server) |
| Examples Temporary rule | Browser-only; no visitor CLI (`docker`/`wrangler`/`openpouch`/`crane`) |

Env knobs:

- `HOBO_OPENSAAS_SERVER_HOST=auto|openpouch|clawdship|cloudflare`
- `HOBO_OPENPOUCH_TRANSPORT=http|cli` (default `http`)
- `HOBO_CONVEX_OCI_HOST=clawdship|cloudflare|…`
- `HOBO_ANON_HOST_COOLDOWN_DIR` — per-host 6h cooldown files
- `HOBO_ANON_PROBE=openpouch|clawdship|zerodeploy|all` — one-shot probe script

## Differentiators / gaps

- **No zero-key host proven for Convex OCI RAM** yet; OpenPouch too small; CF Temporary Containers 403; Clawdship is the best implemented competitor bet.
- Static Drop APIs (ZeroDeploy/SSHGrid) help demos, not Bindle `container` / Convex self-host.
- Credentialed runners (E2B, Dockup, Workers Paid Containers) stay operator unlocks — not Examples Temporary.

## hobo-mapping

| Competitor capability | HoBo equivalent |
|---|---|
| Anon Instant Lane deploy | Temporary Station + anon host adapters |
| Agent-native one HTTP call | Same-origin `/api/cf-temp/*` → remote host APIs |
| Claim / billing link | Surface `claimUrl` on Temporary ship results |
| Docker from tarball | Clawdship adapter + staged Dockerfile |
| OCI push→URL | APPISH adapter (fail-closed when login-gated) |
| Capsule IR | Lakebed provider (separate path) |
