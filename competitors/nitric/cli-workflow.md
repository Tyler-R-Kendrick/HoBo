# Nitric — CLI, Local Dev & Workflow

> Part of the [Nitric competitor reference](./README.md).

## Install
```bash
brew install nitrictech/tap/nitric   # macOS; Scoop on Windows; binaries otherwise
```

## Core commands
```bash
nitric new [project]        # scaffold from template
nitric stack new            # create a stack (deploy target) file
nitric start                # local: emulate resources + dashboard (hot reload)
nitric run                  # local: build & run each service in Docker (prod-like)
nitric build                # build containers, no deploy
nitric spec                 # print the collected resource specification
nitric up   [-s stack]      # build → collect resources → deploy
nitric down [-s stack]      # tear down (confirm)
nitric stack list | new
nitric version | help | debug | completion
# --ci flag: no styling, auto-confirm
```

## Local development experience
- **`nitric start`** runs the local Nitric server (membrane), launches each service via its `start` command from `nitric.yaml`, hosts APIs on dynamic ports, hot-reloads on change, and opens the **Local Dashboard** (default `http://localhost:49152`).
- **`nitric run`** containerizes each service (one container per service) for a production-like local run.

## Local Dashboard features
- Architecture visualization (services + resources)
- HTTP client to test APIs
- Batch job observation + manual triggers
- SQL DB viewer + query runner
- Schedule trigger buttons
- Bucket file management
- Topic message publish + inspect
- Secret management
- WebSocket connection debugging
- Website preview

## Typical loop
1. `nitric start` → iterate → test locally (note: **OIDC/security rules are NOT enforced locally**).
2. `nitric stack new` → choose provider/region/credentials.
3. `nitric up -s <stack>` → build, collect, deploy; URLs returned.
4. Iterate; re-run `nitric up`. **5.** `nitric down -s <stack>` to remove.

## Testing strategy (as documented)
- **Unit:** separate resources from handlers; mock resources (`jest.spyOn`); test handlers in isolation.
- **Integration:** `nitric start` + an HTTP client (e.g. supertest) against local APIs; verify side effects.
- **Cloud:** deploy a stack; point the same tests at deployed URLs (`process.env.API_URL`).
