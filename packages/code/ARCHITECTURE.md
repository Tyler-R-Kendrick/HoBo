# `@hobo/code` architecture

## Product UI ownership (hard rule)

**Bare interactive `hobo-code` owns its chrome.** The default TTY path is
`InteractiveShell` (`src/interactive-shell.ts`): HoBo logo + Bo, chat transcript,
slash palette, tasks/status focus — **not** stock Pi Agent TUI.

| Mode | When |
|---|---|
| **HoBo shell (default)** | TTY + bare / `chat` |
| **Pi TUI escape hatch** | `HOBO_CODE_TUI=pi` or `hobo-code --pi` only |
| **One-shot verbs** | `help`, `status`, `dispatch`, … |

Pi may still be used as a **completion engine** later; it must not be the
product frame. Optimizexp / persona reviews that only score one-shot verbs
while bare TTY is stock Pi are **invalid**.

```
hobo-code (standalone binary; dispatch default)
    │
    ├─ InteractiveShell (default TTY)  Bo + chat + slash + tasks/status
    ├─ Eve subagents            defineEveAgent / defineEveSubagent (filesystem-first)
    ├─ Secure sandbox stack     DeepAgents + OpenShell + MxC (planSecureSandbox)
    ├─ Workflow Worlds          Local World offline · Vercel World prod (worlds.ts)
    ├─ IsolationAgent surface   createIsolationContext / cleanupIsolation / promoteIsolation
    ├─ HarnessCoreAgent surface createHarnessCore + Rhai subset + Local World checkpoints
    ├─ ScaffoldingAgent surface scaffoldHighValueTemplate + tsAutocodeConventions
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
`parseIsolationContext()`, `parsePromotionRequest()`, and `parseEvidenceTriple()`
into deep-frozen **derived domain types** (`IsolationContext`, `PromotionRequest`,
`EvidenceTriple`). Downstream harness sessions receive those **parsed types**, not
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
- template `public/index.html` + `styles.css` — scaffold first paint + matching step rail
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
