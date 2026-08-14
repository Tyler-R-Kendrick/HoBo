# `@hobo/code` architecture

## Product UI ownership (hard rule)

**Bare interactive `hobo-code` owns its chrome.** The default TTY path is
`InteractiveShell` (`src/interactive-shell.ts`): HoBo logo + Bo, chat transcript,
slash palette, tasks/status/resources focus — **not** stock Pi Agent TUI.

| Mode | When |
|---|---|
| **HoBo shell (default)** | TTY + bare / `chat` |
| **Pi TUI escape hatch** | `HOBO_CODE_TUI=pi` or `hobo-code --pi` only |
| **One-shot verbs** | `help`, `status`, `dispatch`, `template`, … |

`hobo-code template` / `/template` / `/templates` is the zero-LLM pattern route (`@hobo/patterns`, ADR-0153). It must not start a completion engine. Bare `/template` and `/templates` list the catalog; extra words search or run a subcommand (`render`, `apply`, …).

Pi may still be used as a **completion engine** later; it must not be the
product frame. Optimizexp / persona reviews that only score one-shot verbs
while bare TTY is stock Pi are **invalid**.

**Chrome obeys `site/DESIGN.md` (rubberhose), enforced by tests.** The shell
draws ink cards with hard sticker shadows, a Chewy title card on entry, one
inverse status strap, and a transcript that owns the viewport. Strict B&W;
vermillion is reserved for a decision that can mutate the real tree and green
for done. `test/rubberhose.test.ts` fails the build on hairline rules, rainbow
accents, geometry drift, or a shrinking content area — the first version of
this shell was a flicker-free *SaaS dashboard* and nothing in the suite could
tell, so nothing objected.

**Promotion applies before it cleans (`src/sandbox-promote.ts`).** The gate
carries the sandbox diff into the canonical tree with `git apply --3way
--index` and only then reclaims the worktree; a failed or empty apply fails
closed with the sandbox intact. Gates are executed (`src/promotion-gates.ts`),
not asserted — they were once hardcoded `pass: true`, which made "gated,
audited" decoration over a literal.

**Panes are real (`src/mux.ts`, `src/agent-registry.ts`).** The multiplexer
used to draw three hardcoded panes that mapped to nothing. Agents are now
auto-detected from evidence (binary on PATH and/or config directory) and each
is seated in its own tmux window. `applyMux` is idempotent — an existing
session is reused and only missing windows added, never killed. The
load-bearing abstraction is the **uniform target**: local, local-inference and
ssh are all just a command in a pane, so a locally spawned inference session
and a remote ssh session share one lifecycle, naming and reattach story.

**Agents work in the devenv workspace, one tree each (`src/workspace.ts`,
`src/agent-workspaces.ts`, `src/rift.ts`).** Panes used to open in
`process.cwd()`. The workspace root is now resolved from `DEVENV_ROOT`, the
nearest devenv config, or the git root, and every agent gets an isolated tree
so parallel agents cannot collide. rift is the default backend (copy-on-write,
near instant); the previous "rift backend" was a placeholder that created an
empty directory holding a JSON marker, so an agent opening it found nothing.
`probeRift` treats presence on PATH as insufficient — the npm package installs
without a platform binary — and falls back to a git worktree cut from the
enclosing repo, reporting the reason.

**hobo-code declares its own environment (`devenv.nix`, `src/devenv.ts`).**
The tools the harness shells out to are named in devenv rather than assumed.
`inspectDevenv` reports whether that toolchain is installed and refuses to
imply a hermetic shell that cannot be entered (nix is Linux/macOS; Windows via
WSL2).

**Tool calling is a separate, purpose-built model (`src/needle-tools.ts`,
`bridges/needle_bridge.py`).** Cactus Needle — 26M params, distilled for
function calling — plans tool calls; the chat SLM only writes prose. The
bridge is a long-lived Python process because loading JAX weights per turn
would cost more than the inference. Tools (`src/local-tools.ts`) are confined
to the sandbox by `resolveInSandbox`, which is the security boundary and is
tested as such. Missing Needle degrades to conversation-only with a reason.

**The default model is adaptive.** `selectChatModel` ranks by the parameter
size the server reports and picks the smallest chat-capable model, because a
1.5B model at ~10s/token on CPU reads as a hang no matter how good the UI is.
`HOBO_CODE_MODEL` overrides; `HOBO_CODE_MAX_TOKENS` bounds generation.

**The engine is local first (`src/ollama-engine.ts`, `src/engine-resolve.ts`).**
A locally hosted SLM is the default so the product's $0 path is real; cloud
BYOK is the fallback. Resolution is local → cloud → honest dispatch-only, and
every failure degrades with an actionable reason. The ollama transport speaks
`/api/chat` NDJSON directly (no vendor SDK between shell and model), streams
each token as it lands, supports abort, reports server-side token counts, and
prices local inference at $0. The local path is conversational today: it has
no tool-use, so it cannot reach the promotion gate on its own.

**pi-tui is a rendering library, not a product frame.** The shell drives
`@earendil-works/pi-tui`'s differential renderer (`TUI` + `StreamTerminal`
adapter in `src/shell-terminal.ts`) while HoBo owns every visible line of
chrome. Render-economy contract (pinned by `test/render-budget.test.ts`):

- repaint only on state change — idle Bo rest ticks request no render;
- unchanged lines are never rewritten (line diff); no full-screen erases;
- input is decoded as atomic sequences (arrows, bracketed paste, resize);
- isolation/dispatch runs on async spawn so the loop never blocks a turn;
- no alternate screen — the transcript survives exit;
- replies are honest: without an engine, a turn *records a compute task*,
  the footer says `engine:none · dispatch-only`, and no reply claims an
  agent acted.

**Completion engine (`src/shell-engine.ts`).** Pi is wired as the engine —
never the frame: `createPiShellEngine` builds a pi `AgentSession` whose cwd
is a **mediated isolation sandbox** (`createIsolationContext`), streams
`text_delta` / tool events into shell turns, and supports Esc cancellation
(`session.abort`). Engine turns never touch the canonical tree. When a turn
actually changes files, the shell raises a **modal approval gate** showing the
blast radius (`git status --porcelain` of the sandbox); only an explicit `y`
runs the audited squash-only promote, `n`/Esc keeps the work sandboxed with
the one-shot command to promote later, and every other key is inert so a
mutation can never be triggered by a stray keystroke. The sandbox stays open
on exit so un-promoted work survives. Provider-reported tokens and cost are
read from the engine session (never estimated) and surface in the footer and
`/cost` as live session spend. Availability is
gated by `shouldAttemptEngine` (BYOK env / pi auth / `HOBO_CODE_ENGINE=pi`;
`=none` opts out) and every failure degrades to the honest dispatch-only
shell with a reason on stderr. The footer shows the model that actually runs
(`pi · <provider>/<model>`, default `HOBO_AGENT_MODEL`).

```
hobo-code (standalone binary; dispatch default)
    │
    ├─ InteractiveShell (default TTY)  Bo + chat + slash + tasks/status/resources
    ├─ Eve subagents            defineEveAgent / defineEveSubagent (filesystem-first)
    ├─ Secure sandbox stack     DeepAgents + OpenShell + MxC (planSecureSandbox)
    ├─ Workflow Worlds          Local World offline · Vercel World prod (worlds.ts)
    ├─ IsolationAgent surface   createIsolationContext / cleanupIsolation / promoteIsolation
    ├─ HarnessCoreAgent surface createHarnessCore + Rhai subset + Local World checkpoints
    ├─ ScaffoldingAgent surface scaffoldHighValueTemplate + scaffoldFromIntent/Atoms + tsAutocodeConventions
    ├─ VisualEvidenceAgent      createOpenUiSession / lockVisualArtifact / emitEvidenceTriple
    ├─ TUIMultiplexerAgent      buildMultiplexerStatus / copyOnHighlight · splash logo+Bo
    ├─ FinOpsMonetizationAgent  createBudgetTracker / sponsoredWaitState
    └─ DocsProofAgent           ADR-0139 + exp-proof + platform matrix runbook
```

## Schema and constraints

- Protobuf records live in [`data-models/code_harness.proto`](./data-models/code_harness.proto).
- CUE constraints bound every protobuf type in [`data-models/code_harness.cue`](./data-models/code_harness.cue).
- PACT consumer evidence lives under [`contracts/pacts/`](./contracts/pacts/).

## Parse, don't validate

Untrusted isolation / promotion / evidence input crosses parser boundaries in
`parseIsolationContext()`, `parsePromotionRequest()`, `parseEvidenceTriple()`, and
`parseGuestEvidenceSubmission()`
into deep-frozen **derived domain types** (`IsolationContext`, `PromotionRequest`,
`EvidenceTriple`, `GuestEvidenceSubmission`). The WIT evidence guest cannot set
verification, origin, actor, timestamps, paths, or URIs; the host stamps those
after parsing and stores large artifacts by digest. Downstream sessions receive parsed types, not
raw DTOs. Invalid values throw at the boundary (parse-don't-validate).

## Event architecture

- **Command** — `hobo-code isolate|session|promote|scaffold|dispatch|config|agent|…` (flat verbs; dispatch default).
- **Config inventory** — `inspectConfigSurface` / `hobo-code config [--stack …]` lists env/flags by persona stack (secrets presence-only; soft `missingCritical` gaps).
- **Agent-native** — `inspectAgentSurface` / `hobo-code agent` inventories human-free auth, MCP/ACP protocols, no-elicitation unattended contract, and self-improve loop (SOTA: MCP Auth 2025-11, ACP stdio JSON-RPC).
- **Event** — `code.IsolationCreated` / `IsolationCleaned` / `PromotionAudited` /
  `EvidenceEmitted` / `VisualLocked` / `BudgetRecorded` (durable under
  `HOBO_HOME/durable/code/<runId>/`).
- **Actor** — `startCodeSession` coordinator owns the run aggregate; IsolationAgent
  owns create/cleanup; promotion is a gated command.
- **Event store** — append-only JSON audits under `HOBO_HOME/durable/code/<runId>/`
  (`isolation.json`, `handback.json`, `promotions/*.json`, `evidence/**`).
- **Materialized view / projection** — multiplexer `AgentPaneState` list + budget
  snapshot projected from session mutations (status surface).
- **Snapshot** — Local World checkpoint (`HOBO_HOME/worlds/<runId>/state.json`) and
  handback report are projection snapshots that survive restart. Production durability
  adapter shape is **Vercel Workflow World** (ADR-0123 / ADR-0139 amendment).
- **Read store** — durable handback / evidence / budget snapshots served without
  replaying ephemeral sandbox state (ephemeral root may already be cleaned).

## Look / feel surfaces

Presentation helpers stay pure and unit-tested:

- **Default loading** — `renderDefaultLoadingScreen` (`splash.ts`): console **HoBo logo** + **Bo idle** from real `assets/bo-idle.png` via deterministic `sprite-tui.ts` half-block conversion (12 frames rest·bounce·blink). Generated frames in `_generated/bo-idle-tui-frames.ts`. **Fixed canvas** so frame advance never reflows. Empty standalone mux paints this instead of empty→★.
- `tui-tree.ts` + `tui-components.tsx` + `tui-layout.ts` + `tui-render.ts` + `tui-broadcast.ts` — retained semantic TUI tree with React-style chrome. `ShellChrome` wraps the surface in `BroadcastFrame` (algorithmic CRT/film bezel) and composes `ChatTranscript`, `SlashPalette`, `ApprovalDialog`, `BtwAside`, `TextPane`, `CommandRail`, and `StatusStrap`. `btw` / `/btw` opens a temporary side-chat (`btw.ts`) that borrows a snapshot of this moment and never joins the main transcript. Every `tui-*` file is DESIGN.md-linted. `pi-tui` stays the Node framebuffer host; DESIGN.md tokens live in `tui-tokens.ts`.
- `renderStatusText` / `renderStatusChip` — Herdr-style adaptive box: panes fold ≤4-wide; health glyphs; focus ▸; quiet omits default ★ next; chip omits herdr
- `herdrMuxCapabilities` / `renderHerdrCapabilityFooter` — discoverable Herdr card (status footer + JSON); dense box stays quiet
- `describeDevTerminalAttach` / `hobo-code attach` — tmux-like reattach + named endpoint; mosh optional; `--mode overlay` Tailscale-shaped (not control-plane admin)
- `grokBuildParity` / `hobo-code tasks` — Grok Build–shaped tasks board + clickable/workflows/subagents compare card (not a Grok Build clone)
- `claudeCodeGuide` / `hobo-code guide` — plain-English Claude Code → hobo-code map for non-dev app builders
- `cursorGuide` / `hobo-code guide --cursor` — Cursor Agent/Composer/Background/BugBot → hobo-code map
- `inspectCost` / `hobo-code cost` — $0 path, budget bar, savings vs frontier, free/local routing, token-tool stack
- `inspectHarnessSurface` / `hobo-code harness` — Pi TUI + Flue run dual surface, skill roots, Eve subagents, self-improve loop, brain notes
- `inspectEditorBridge` / `hobo-code edit` — vim/neovim managed pane bridge (tmux-send, stdio-jsonrpc, ACP-shaped) + `editor/hobo-code.nvim`
- session uses `title` override — 4-line box: brand · run · handback LED · next (LED implies live/final)
- `renderOpenUiHtml` — dark shell + `1 · generate` rail + seal; lede `→edit|→lock|→codegen`; foot `Edit→lock|Lock→codegen|seal`
- `formatHoboCodeResult` — closed panels: one-scan happy path is 3 lines (title · body · rule, soft omitted); FIX + code inline on fails
- `atom-index.ts` — closed intent map first, then retrieve→Valibot→compose→**entity-aware merge**→emit (ADR-0152). Snippet bodies live in `@hobo/patterns` `atoms/` and are also listed by `hobo-code template`. `templates/intents/` owns phrases like "deploy to azure" / "same network". Snippet slots merge by entity; `@hobo.hole` emits `"use training"` / `training.define`, not invented logic. Derived cache `$HOBO_HOME/durable/code/template-index.sqlite`. High-confidence emits with zero inference; low-confidence refuses unless `allowEscalate`. Full `examples/` apps stay composition proofs.
- `example-catalog.ts` + `workspace-actions.ts` + `station-session.ts` — Bo TUI turns "create a hello world app" / "run it" / "debug it" into emitted atoms plus live bindle/debug/controls/report URLs on the logged-in Station. Bindle/debug refer to the named endpoint (`debugViewUrl(namedUrl)`); `loopback ·` prints the `127.0.0.1` listen URL once. Yard serve always returns the Evidence workspace + Bo idle animation on `?__hobo_debug=1`, even when the Bindle is JSON. The strap and Tab-status show station id/name/tenant and the occupancy environment (`HOBO_ENV` / isolation class). `hobo-code dev` forwards `HOBO_STATION` / `HOBO_TENANT` / `HOBO_ENV` to `hobo dev`.
- `session-resources.ts` — Aspire-style **session resource board** for the logged-in Station × `HOBO_ENV`. One projection (`assembleSessionResources`) feeds `/resources`, Tab-resources, `hobo-code resources [--json]`, and `hobo-code dashboard`. Station is occupancy header (ADR-0131), not a topology parent. Each endpoint carries named URL, backend listen URL, resolved addresses, fidelity, and freshness (`live` / `last-seen:<iso>`). Last-seen snapshots live at `HOBO_HOME/durable/code/sessions/<station>/<env>/endpoints.json` (written by `/dev`; persist never aborts a live serve). Cross-station peers require a grant. Local-mode remote backends fail closed. Loopback evidence URLs with `token=` are capability refs, not secrets.
- `session-dashboard.ts` + `session-lifecycle.ts` + `session-otel.ts` — ADR-0111 **local** SPA at `dashboard.code.local.hobo.localhost:8787` (not `apps/dashboard`), OTLP ingest on `otlp.code.local.hobo.localhost:4317`/`:4318`, start/stop/restart, Ready only after a health probe passes, Plan 49 fleet as `camp-deferred` without a Camp. Public URLs are named endpoints; loopback is the listen address.
- `station-sidecars.ts` — a coding session occupies a Station and **starts dashboard + Evidence as occupancy sidecars**. Evidence is a detached Station process (`evidence-sidecar-main`) so it outlives Bindle `/dev`, `startCodeSession.complete()`, and TTY quit. Public Evidence/dashboard/OTLP URLs are `*.hobo.localhost` named endpoints. `/dev` only attaches. Occupancy teardown is `stopStationSidecars` / `hobo-code auth logout`. Discovery: `HOBO_HOME/stations/<id>/sidecars.json`. Opt out: `HOBO_CODE_SIDECARS=0`.
- `@hobo/patterns` — catalog source of truth; OpenUI starter plus atomic snippets. `hobo-code template list|search|render|explain|compose|apply` is the zero-LLM CLI (`0 LLM calls · 0 LLM tokens` on every receipt). Structural apply uses the TypeScript compiler API inside an isolation root. `hobo-code scaffold` remains the high-value starter adapter.
- `review/` — durable review aggregate (ADR-0154). Commands `hobo.code.review-command/v1`; EventStore `hobo-code-reviews`. Coverage, threads, pending publish, exact-effect GitHub submit. Git workbench stays the mutation surface; review records what was inspected.
- template `public/index.html` + `styles.css` — catalog starter first paint + matching step rail
- product binary `hobo-code`: flat verbs, dispatch default, no nested buzz

## Runtime foundations (pinned)

| Concern | Pin | In-repo contract |
|---|---|---|
| Subagent definition | **Vercel Eve** (directory-shaped agents) | `eve.ts` |
| Secure sandbox | **DeepAgents + OpenShell + MxC** | `sandbox-stack.ts` |
| Durable agent runtime | **Vercel Workflows + Worlds** | `worlds.ts` + harness Local World |

None of Eve / DeepAgents / OpenShell / WDK are vendored; adapters stay optional.

## Non-negotiables

1. Agents never freely write the canonical project tree (`mediatedOnly`).
2. Promotion is gated + squash-only + audited under `HOBO_HOME/durable/code/`.
3. Ephemeral sandboxes live under `HOBO_HOME/sandboxes/<runId>`; durable learning under `HOBO_HOME/durable/` and `HOBO_HOME/worlds/`.
4. Token tools stay global/MCP — never vendored into the project workspace.
5. Elevate HOBO-152 / HOBO-394; do not fork a second codegen CLI.
6. Product CLI is `hobo-code` with flat verbs; no nested `buzz` verb.
7. Subagents are Eve-shaped; secure execution prefers DeepAgents+OpenShell (+MxC); durability is World-portable.

## Boundaries

- PACT: `contracts/pacts/code-harness-boundary.pact.json`
- Protobuf/CUE: `data-models/code_harness.{proto,cue}`
- Composition root wires `createCodeCommand` in `@hobo/hobo`

## Virtualized panes (virtual terminal + virtual filesystem)

A tmux pane used to hand an agent a real shell in a real directory. `rift`
separates the *tree* so agents cannot collide, but it does nothing about what a
command **is**: inside its own workspace an agent can still `curl | sh`, read
`~/.aws/credentials` by absolute path, or `rm -rf` its way out. The filesystem
is isolated; the process is not.

Two layers close that, and they answer different questions:

| Layer | Question | Mechanism |
|---|---|---|
| `src/virtual-shell.ts` | what may run, and over which files | [just-bash](https://github.com/vercel-labs/just-bash) — bash implemented in TypeScript |
| `src/virtual-terminal.ts` | what is actually on the pane | [`@xterm/headless`](https://www.npmjs.com/package/@xterm/headless) fed by `tmux pipe-pane` |

**The command layer.** just-bash parses and evaluates bash in-process; there is
no `execve` anywhere. Commands are TypeScript implementations dispatched from a
registry, so a command that is not on the allow-list *does not exist* — `rm`
answers `command not found` rather than being stopped by a rule someone has to
remember to write. Network commands are absent unless a URL allow-list is
declared, so there is nothing to configure around. The filesystem beneath is an
overlay rooted at one directory: reads come from the real tree, writes stay in
memory until promotion, absolute paths outside the root do not resolve, and
symlinks are refused.

`mountFor` picks that directory. For rift's directory-backed tiers it is the
workspace; for the overlay tier it is the **source**, because an overlay merged
path exists only inside the namespace `hobo-rift exec` creates and mounting it
from another process yields an empty tree. In the virtualized case just-bash's
own overlay supplies the copy-on-write, so no kernel mount is involved at all.

**The observation layer.** `tmux capture-pane` returns text tmux has already
interpreted, which cannot answer *when* a prompt appeared or what the screen
held at a moment. `virtual-terminal.ts` runs a VT parser over a pane's raw byte
stream (`pipe-pane -O`) and produces a structured screen buffer — the thing
that would make a pane renderable, gateable and recordable instead of an opaque
rectangle.

**Status: the parser exists and is tested; nothing calls it yet.** The pane
path still writes straight through. Stated plainly because "the harness runs
its own VT parser" reads as a behaviour, and today it is a capability.

**Known limits.** `find -delete` deletes despite `rm` being absent (the
in-memory copy in the default overlay, the real file when writable). A write to
a path outside the root succeeds *into memory* rather than failing, so "nothing
resolves outside the root" holds for reads only. Symlinks are refused, which makes `node_modules`
unreadable in a pnpm tree — and unreadable as a missing file rather than as a
refusal, since `refused` is false. just-bash's `allowSymlinks` does not address
it (it permits only links resolving inside the root, and a pnpm dependency link
points outside), so mounting the repository root rather than a package is the
actual answer.

**What this is not.** just-bash runs inside this process, so it is a governance
and blast-radius boundary — what an agent can name and touch — not a defence
against hostile native code. For that, the pane belongs in a VM or container;
the layering here is what makes the ordinary case reviewable.

## Remote panes go through the Station

`mux --host` used to be `ssh -t <whatever was typed>`: an arbitrary host, an
ambient key in `~/.ssh`, and no record — the least governed path in a product
that brokers privileged access everywhere else.

Dev machines are now **declared** in `devenv.machines.json` beside the devenv
files (`src/dev-machines.ts`), so the reachable set is reviewable alongside the
toolchain. Every field that reaches a command line — id, host, user — is
allowlisted, because an ssh destination like `-oProxyCommand=...` is an
argument rather than a hostname. Each entry becomes a `SessionTarget` for the
Station's privileged-access gateway (`src/machine-sessions.ts`), which applies
the target's isolation-class policy, returns a short-lived authorization, and writes
`pam.SessionStarted` / `pam.SessionDenied`. Panes carry a lease-bound local
SSH-agent socket, never the credential reference or session token, so nothing
short-lived reaches a process table or pane title. The proxy forwards the
SSH-agent protocol to the installed `SSH_AUTH_SOCK`, survives tmux detach,
expires with the Station authorization, and drains redemption/end facts into
the Station Yard audit feed. When the gateway or installed agent is unavailable,
the command is refused rather than falling back to ambient-key selection.

Selecting a sidecar is a versioned decision, not a name lookup. `hobo-code`
composes commands that require an argv-quoting `exec` and the namespace marker,
both of which postdate the first sidecar release — and an older build accepts
the same flags while silently mangling them. `hobo-rift capability --json`
advertises the contract, and a sidecar that does not speak it is bypassed for
the bundled copy rather than trusted because it happened to be first on PATH.
