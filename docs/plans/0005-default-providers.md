---
type: Implementation Plan
title: "Default providers — real adapters for the four port/adapter families"
description: "Plan and Linear scope for shipping HoBo's default provider set as real (non-mocked) adapters: cloud providers (Lakebed/Azure/AWS/GCP), CI runners & build machines (GitHub/Blacksmith.sh/Depot), IaC backends (Pulumi/Crossplane/Terraform), and SWE agents over ACP (Claude/Cursor/Grok/Gemini/Codex/GitHub Copilot SDKs), plus the registry/approval foundation they all register through."
tags: [hobo, plans, providers]
---

# Default providers — real adapters for the four port/adapter families

> Baseline surveyed 2026-07-26 at `795bd9eb` on branch
> `claude/default-providers-setup-uaqxbl`. Linear scope lives in the
> [Default Providers — Real Adapters](https://linear.app/quickdeploy-ai/project/default-providers-real-adapters-7dd4675ce939)
> project (HOBO-710 … HOBO-727). Companion prior-art epic (mocked lane, completed):
> "Providers, IaC & Build Adapters".

## 1. Objective

Ship HoBo's **default provider set as real adapters** — live APIs, real state,
no mocked lanes — so a self-hosted Yard comes up with its default providers
implemented, conformance-certified, registered, and **approved** (the
precondition [walkthrough Part 0/2](../design/walkthrough.md) names before any
`hobo up` happy path exists). Four families, one ports/adapters shape
([control-plane.md §"The three adapter families"](../design/control-plane.md)):

| Family | Port(s) | Requested defaults |
|---|---|---|
| Cloud providers | `CloudProvider` | **Lakebed · Azure · AWS · GCP** |
| CI providers | `RunnerProvider` (`hobo:runner`) + `BuildMachineProvider` (`hobo:build-machine`) | **GitHub · Blacksmith.sh · Depot** |
| IaC providers | `IacProvider` | **Pulumi · Crossplane · Terraform** |
| SWE agents | ACP protocol connector (`connector(..., { protocol: "acp" })`) | **Claude · Cursor · Grok · Gemini · Codex · GitHub Copilot** SDKs |

## 2. Where the repo stands today (survey)

- **Composition root** (`packages/hobo/src/compose.ts`) builds the
  PlannerRegistry statically from **one** provider
  (`createRegistryFromProviders([cloudflare])`). `hobo add` appends
  `provider.Registered` facts to the durable `registry:default` stream, but
  only `hobo registry` reads that stream — the Planner never sees installed
  providers. There is no durable "default providers approved" record.
- **Cloud**: `@hobo/provider-cloudflare` is real and on the deploy path
  (env-gated Cloudflare/Vercel lanes in `selectIacProvider`). AWS/Azure/GCP
  exist only as design rows + the completed mocked-lane proofs (HOBO-153/178/182).
  **Lakebed** is the named head-on competitor
  ([docs/competitors/lakebed.md](../competitors/lakebed.md)) and is *not* in the
  intended-providers table — shipping it as a deploy target is a design addition.
- **IaC**: `@hobo/iac-pulumi` ships but runs an **in-memory Automation-API
  stand-in** (compose.ts "HONEST SCOPE" note). Crossplane, OpenTofu, and
  CDKTF-import-only exist as draft proofs
  (`src/draft/technical-proofs/iac-*-contract`). The design pins Pulumi
  Automation API = primary, Crossplane = k8s substrate, OpenTofu = OSS HCL
  path, CDKTF = import-only.
- **CI**: `RunnerProvider`/`BuildMachineProvider` are specified in
  control-plane.md with adapters named **self-hosted · GitHub · Blacksmith ·
  Depot**, cost-routed by the Dispatcher (ADR-0071); the
  `execution-host-provider-contract` draft proof models them with fixtures only.
- **SWE/ACP**: HoBo deliberately owns **no agent SDK**
  ([sdk-contracts.md §Protocol connectors](../design/sdk-contracts.md)); durable
  agents integrate via A2A/ACP connectors, with HoBo owning SVID identity,
  connector-token brokering, policy, sandbox, and the replayable audit stream
  ([ai-native-agent-auth.md](../design/ai-native-agent-auth.md)). ACP exists
  today only as draft connector proofs; `@agentclientprotocol/sdk` is already
  resolvable in the lockfile (transitively via `@agentv/core`).

## 3. Cross-cutting rules (every adapter, every family)

1. **Authoring contract** (HOBO-87): factory + typed `.with()` builders +
   capability declarations + equivalence map + `realize()` + runtime
   `client()` + Capability Manifest; equivalence mappings + `realize()` are the
   provider's **default Resource Definitions** (HOBO-93).
2. **Conformance-gated**: `@hobo/conformance` green for every claimed port;
   forged/partial claims rejected (HOBO-221 posture). Every adapter gets two CI
   lanes: a **replay lane** (recorded transcripts/fixtures, runs on every PR,
   no credentials) and a **cred-gated live lane**.
3. **Secretless**: credentials only via the broker — OIDC federation to
   provider STS (HOBO-110) for clouds, brokered app/installation tokens for CI
   vendors, brokered API keys for agent SDKs. No static secrets anywhere.
4. **Repo architecture norms** ([AGENTS.md](../../AGENTS.md)): PACT at service
   boundaries, protobuf + CUE `data-models/`, parse-don't-validate derived
   types, event-sourced facts (`provider.Registered`, `dispatch.Decided`,
   `resource.Provisioned`), `npm run architecture:guard` green.
5. **Registered + approved**: every adapter lands an `INSTALLABLE` catalog
   entry and registers through the M0 stream; Matching only considers
   **approved** providers.

## 4. The plan, by milestone

### M0 — Foundation: registry & approval ([HOBO-710](https://linear.app/quickdeploy-ai/issue/HOBO-710))

Fold the durable `registry:default` stream into the PlannerRegistry the
composed runtime hands the Planner, so `hobo add <p>` → `hobo plan` matches
with no restart; record default-provider **approval** as a durable fact so an
un-approved provider is registered-but-unmatchable (with a precise
`deployment.PlanRejected` remediation). This is the slice the branch name
("default-providers-setup") points at, and everything else registers through it.

### M1 — Cloud providers

| Issue | Adapter | Notes |
|---|---|---|
| [HOBO-711](https://linear.app/quickdeploy-ai/issue/HOBO-711) | `@hobo/provider-aws` | Equivalence rows RDS/Aurora PG · S3 · Fargate/App Runner · SQS · ElastiCache; creds via AssumeRoleWithWebIdentity. |
| [HOBO-712](https://linear.app/quickdeploy-ai/issue/HOBO-712) | `@hobo/provider-azure` | The design's canonical worked example (`defaultProvider: azure(...)`); Azure workload identity federation. |
| [HOBO-713](https://linear.app/quickdeploy-ai/issue/HOBO-713) | `@hobo/provider-gcp` | Completes the big three; same unmodified conformance suite = strongest equivalence-model evidence. |
| [HOBO-714](https://linear.app/quickdeploy-ai/issue/HOBO-714) | `@hobo/provider-lakebed` | **Design addition**: ADR + intended-providers row first; honestly-partial capability claims (closed PaaS); default-approved **off** (opt-in). |

### M2 — IaC backends

| Issue | Adapter | Notes |
|---|---|---|
| [HOBO-715](https://linear.app/quickdeploy-ai/issue/HOBO-715) | `@hobo/iac-pulumi` (real) | Replace the in-memory Automation-API stand-in; per-resource stacks; outputs → bindings; refresh → drift. **Do first — every M1 `realize()` targets it.** |
| [HOBO-716](https://linear.app/quickdeploy-ai/issue/HOBO-716) | `@hobo/iac-crossplane` | Promote the draft proof to a real kind/k3d cluster lane; k8s-substrate Camps. |
| [HOBO-717](https://linear.app/quickdeploy-ai/issue/HOBO-717) | `@hobo/iac-terraform` | One HCL-lane adapter driving `tofu` (default, per design) or `terraform`; ⚠ carries a decision checkpoint — the design's id union names `opentofu`, not `terraform`. |

### M3 — CI providers (runners & build machines)

Each adapter implements **both** execution-host ports and publishes real
`cost.json` + free-tier/credit facts so the Dispatcher's CreditLedgerView can
route each job to the cheapest registered option and record `dispatch.Decided`.

| Issue | Adapter | Notes |
|---|---|---|
| [HOBO-718](https://linear.app/quickdeploy-ai/issue/HOBO-718) | `@hobo/runner-github` | workflow_dispatch + run tracking; GitHub App tokens; free-minutes facts. |
| [HOBO-719](https://linear.app/quickdeploy-ai/issue/HOBO-719) | `@hobo/runner-blacksmith` | Fast-runner substitution for the same job shape; first real price/perf routing choice. |
| [HOBO-720](https://linear.app/quickdeploy-ai/issue/HOBO-720) | `@hobo/runner-depot` | Build-machine specialist: remote builds + shared cache; cache economics in the manifest. |

### M4 — SWE agents over ACP

| Issue | Adapter | Notes |
|---|---|---|
| [HOBO-721](https://linear.app/quickdeploy-ai/issue/HOBO-721) | `@hobo/connector-acp` | The enablement slice: ACP client over `@agentclientprotocol/sdk`; session lifecycle; tool-permission requests → HoBo policy decisions (fail closed); SVID-bound audit; Executor sandbox. Proven against a fixture agent before any vendor. |
| [HOBO-723](https://linear.app/quickdeploy-ai/issue/HOBO-723) | `swe-gemini` | Native ACP — thinnest adapter; validates the connector against a stock third-party ACP peer **first**. |
| [HOBO-722](https://linear.app/quickdeploy-ai/issue/HOBO-722) | `swe-claude` | Claude Agent SDK bridge; engine candidate for the generateProvider repair loop (HOBO-207/211). |
| [HOBO-724](https://linear.app/quickdeploy-ai/issue/HOBO-724) | `swe-codex` | Codex SDK/CLI bridge. |
| [HOBO-725](https://linear.app/quickdeploy-ai/issue/HOBO-725) | `swe-copilot` | Copilot SDK/CLI; enterprise installed base. |
| [HOBO-726](https://linear.app/quickdeploy-ai/issue/HOBO-726) | `swe-cursor` | Cursor SDK / `cursor-agent` bridge. |
| [HOBO-727](https://linear.app/quickdeploy-ai/issue/HOBO-727) | `swe-grok` | Least ACP-adjacent — the generalization stress test. |

All six vendor adapters share one **SWE-task session shape** (workspace mount,
tool grants, streamed edits/diffs, final report) defined once in HOBO-721;
every vendor slice is "bridge the SDK's events into that shape", which keeps
the family additive and the seventh vendor cheap.

## 5. Dependency order & parallelism

```
HOBO-710 (M0 foundation)
  ├─► M2: HOBO-715 (iac-pulumi real)  ──►  M1: HOBO-711/712/713/714 (clouds realize through it)
  │        ├─► HOBO-716 (crossplane)             (parallel per cloud once 715 lands)
  │        └─► HOBO-717 (terraform)
  ├─► M3: HOBO-718 ─► HOBO-719/720 (routing needs ≥2 registered to prove itself)
  └─► M4: HOBO-721 (connector-acp) ─► HOBO-723 (gemini, native-ACP reference)
             └─► HOBO-722/724/725/726/727 (parallel vendor bridges)
```

M1, M3, and M4 are independent of each other after M0; within M1 the four
clouds parallelize once HOBO-715 gives `realize()` a live target. Sequencing
inside M4 deliberately runs the native-ACP vendor (Gemini) before the bridged
ones so protocol bugs surface in the connector, not in a vendor shim.

## 6. Decisions & risks to carry into kickoff

1. **Terraform vs OpenTofu naming** (HOBO-717): the design's `IacProvider` id
   union is `"pulumi" | "cdktf" | "crossplane" | "opentofu"`. Recommended: one
   `iac-terraform` package with a binary switch defaulting to `tofu`; either
   way the design doc gets a clarifying sentence.
2. **Lakebed posture** (HOBO-714): deploying to the head-on competitor is a
   strategic design addition → ADR first, default approval **off**, and the
   adapter's honestly-partial capability verdicts are a feature, not a bug.
3. **Live-lane cost/flakiness**: every live CI lane is cred-gated and
   non-blocking for PRs; replay lanes are the merge gate. Free-tier accounts
   for AWS/Azure/GCP/Blacksmith/Depot need provisioning before M1/M3 live
   lanes turn on.
4. **Vendor SDK churn** (M4): the ACP boundary isolates it — vendor breakage
   lands in one adapter's bridge, never in the connector contract. Golden
   transcripts pin behavior per SDK version.
5. **Approval semantics** (M0): "approved" must be a durable fact (replayable,
   auditable), not config — otherwise walkthrough Part 0's "defaults approved"
   claim has no evidence trail.
