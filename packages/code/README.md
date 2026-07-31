# `@hobo/code` · binary **`hobo-code`**

Opinionated HoBo-native coding harness and distributed compute.

CLI name is **`hobo-code`** (dash is fine). There is **no** `hobo code` verb and **no** nested `buzz` verb.

## Usage

```bash
# Default verb is dispatch — prompt is the args
hobo-code "refine the openui bindle"
hobo-code dispatch "refine the openui bindle"

hobo-code status
hobo-code session --json
hobo-code scaffold --name demo
hobo-code isolate --json
hobo-code promote --run <id>
hobo-code budget
hobo-code remote
hobo-code platform --json
hobo-code env --json          # hermetic shell + durable layout (nix/devenv optional)
hobo-code join tyler
hobo-code agent worker-codex
hobo-code nodes
hobo-code rooms
hobo-code help
```

## Flat verbs

| Verb | Role |
|---|---|
| **dispatch** (default) | Dispatch work into the hive (pipeline chrome) |
| status | Multiplexer box: folded panes + focus ▸ + chip |
| session | Isolation session + handback folded into mux title |
| scaffold | OpenUI+Astryx template + first paint + step rail |
| isolate / promote | Mediated isolation + gate checklist promote |
| budget / remote / platform | Spend meter · reach · flag LED strip |
| **env** | Hermetic shell detection (devenv/nix/direnv) + durable vs sandbox layout |
| join / agent / nodes / rooms | Hive participants + load bars |

### Hermetic / durable (optional Nix · devenv)

`hobo-code` supports **optional** hermetic developer shells without making Nix monorepo IaC:

| Concern | Behavior |
|---|---|
| **Detect** | `devenv.nix` / `devenv.yaml` / `flake.nix` / `shell.nix` / `.envrc` + process env (`IN_NIX_SHELL`, `DEVENV_ROOT`, `DIRENV_DIR`) |
| **Activate** | You enter the shell (`devenv shell`, `direnv allow`, `nix develop`) — hobo-code does **not** require or spawn Nix |
| **Durable vs sandbox** | Ephemeral: `$HOBO_HOME/sandboxes/<runId>`; durable learning: `$HOBO_HOME/durable/code/` (never inside the sandbox root) |
| **HOBO_HOME** | Prefer a writable path **outside** the Nix store (e.g. `$XDG_STATE_HOME/hobo` or project `.hobo-home`) |

`hobo-code env --json` and `help` / `platform` / `isolate` data payloads include a `hermetic` report. Fidelity labels: `host-default` · `hermetic-declared` · `hermetic-active`. Human chrome always shows `durable · …` so sandbox purity is scannable without scraping JSON.

Optional direnv pairing (still never required for HoBo monorepo IaC):

```bash
# in project .envrc (after devenv/flake setup)
use devenv   # or: use flake
export HOBO_HOME="${HOBO_HOME:-$XDG_STATE_HOME/hobo}"
# then: direnv allow && hobo-code env --json
```

Human output uses structured panels: one-scan happy paths are 3 lines (title · body · rule); multi-row keeps soft band. Status paints a Herdr-style box (quiet + busy ≤4 panes fold to 4 lines); OpenUI drafts ship a dark branded shell + step rail (`1 · generate → 2 · edit → 3 · lock`) with `data-testid="primary"`.

**Default / empty TUI** is a console loading screen: HoBo logo + **Bo idle converted from the real sprite sheet** (`assets/bo-idle.png` → half-block TUI via `sprite-tui.ts`). Rest · bounce · blink; fixed canvas so frame advances never reflow.

Regenerate after sprite edits: `pnpm --filter @hobo/code run gen:bo-idle-tui`.

```text
█  █ ▄▀▀▄ ▄▀▀▄ ▄▀▀▄     
… logo + half-block Bo frames from sprite …
  hobo-code·idle·★

┌───────────────┐
│ hobo-code·○2✓1│
│ ○co·✓sn·○hv   │
└───────────────┘

✓ ★
 ship th…·st
────────────

hobo-code★●hemrd
★d·st·se·sc·i·pr
b·re·pl·ev·n·rm·j·a
```

## Progressive flags (all **ON** by default)

| Flag | Role |
|---|---|
| `code.harness.enabled` | Master switch |
| `code.evidence.visual` | Evidence triple |
| `code.monetization.surface` | Privacy-first sponsored wait (never inspects code) |
| `code.isolation.rift` | Prefer CoW rift when available |
| `code.distributed` | Distributed compute hive |

Disable: `hobo feature set <key> --percent 0` or `HOBO_CODE_MONETIZATION=0`.

## Runtime foundations

| Concern | Pin | Notes |
|---|---|---|
| **Subagents** | [Vercel Eve](https://vercel.com/eve) shape | Filesystem-first `agent/` + nested `subagents/`; `defineEveAgent` / `defineEveSubagent` |
| **Secure sandbox** | DeepAgents + OpenShell + MxC | Orchestration + kernel sandbox + strong isolation class; credentials never in-sandbox |
| **Durable runtime** | Vercel Workflows + Worlds | Local World offline (`HOBO_HOME/worlds/`); Vercel World production adapter |

## Distributed compute

Internal hive model (inspired by [block/buzz](https://github.com/block/buzz), **not** a CLI name): rooms, first-class agent identities, multi-node dispatch (local, named-endpoint, MxC, OpenShell). Secure path = DeepAgents inside OpenShell (+ MxC when stronger). Station-bound; durable under `HOBO_HOME/durable/code/buzz/`.

## Package layout

`src/`, `test/`, `contracts/`, `data-models/` — konsistent production package.
