---
layout: ../../layouts/Docs.astro
title: The MCP surface
description: "HoBo's MCP control surface: full capability parity with SDK and CLI, scoped credential brokering, and every agent action audited in the event log."
---

# The MCP surface

HoBo exposes its control plane over **MCP (Model Context Protocol)** with full capability parity: anything reachable via SDK or CLI is reachable by an agent over MCP, under the same policy checks and with the same audit trail. MCP isn't a chat integration bolted onto the side — it's the third door into the same house.

## Design commitments

- **Parity, not a subset.** Deploys, plans, inspections, logs, drift, migrations, governance — if the [CLI verb surface](/HoBo/guide/cli/) can express it, the MCP surface can too.
- **Same gates.** MCP commands flow through the same Gateway, the same policy checks, and the same convergence loop as everything else. There are no agent-only shortcuts, in either direction.
- **Events all the way down.** Every MCP-initiated action lands in the append-only event log with the agent's identity attached. An agent's session is replayable exactly like a human's.

## The auth flow

1. **Identify.** The agent authenticates with workload identity (SVID/OIDC) — its own, not a borrowed human key.
2. **Discover.** The machine-readable **capability standard** describes each capability's required scopes, inputs, and effects — designed for tool-use planning, not just documentation.
3. **Request scope.** The agent requests credentials for exactly the task at hand; policy decides. Grants are short-lived and task-scoped.
4. **Act.** Commands emit events; reads hit projections. Long-running operations (a deploy, a migration) surface as event streams the agent can follow.
5. **Expire.** Tokens die on schedule. The next task starts at step 3 — cheap by design, so narrow grants stay ergonomic.

## What agents typically do with it

| Task | Surface |
|---|---|
| "Deploy this bindle to staging" | the same convergence loop as `hobo up`, streamed as events |
| "Why did the app move camps last night?" | time-travel projections — the migration's full decision trail |
| "Watch spend; propose cheaper placements" | Dispatcher signals + policy-bounded migration proposals |
| "Tail the API's logs and diagnose" | camp runtime log streams, read-scoped credentials |
| "We need a provider for this niche host" | the generation pipeline + conformance certification |

## Reading the docs as an agent

This site is maintained as a first-class agent surface:

- [`llms.txt`](/HoBo/llms.txt) is the canonical machine-readable briefing — start there.
- Headings are stable; CLI examples use only canonical verbs; code snippets are complete enough to run, not fragments.
- The [primitives](/HoBo/primitives/) pages define the exact vocabulary the capability standard uses — bindle, camp, yard, junction mean the same thing to the parser as to you.
