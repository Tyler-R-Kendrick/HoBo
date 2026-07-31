---
type: Architecture Note
title: "DevX: devenv-first local environments; Nix as optional IaC"
description: "Recommend devenv for local/dev shells; treat Nix as an optional IacProvider adapter — never the default multi-cloud IaC path."
tags: [hobo, design, dx, iac, nix, devenv]
---

# DevX: devenv-first; Nix optional (not default IaC)

Maintenance note for local developer environments and where **Nix** sits relative to HoBo's pluggable IaC surface.

## Decisions

1. **Local / contributor DevX is devenv-first.** Prefer [devenv](https://devenv.sh/) (or equivalent declarative shell tooling) for reproducible local toolchains, services, and agent sandboxes. Contributors should not need a full NixOS install or flake-driven cloud apply to develop HoBo.
2. **Cloud / multi-cloud IaC stays pluggable** via the `IacProvider` port ([ADR-0006](./adr/01-architecture-core.md#adr-0006)): **Pulumi · Crossplane · Terraform · OpenTofu** are the first-party adapters. **None is sole primary.**
3. **Nix is optional IaC, never default.** A future `@hobo/iac-nix` (or git-registry module) may realize resources through Nix flakes / NixOS modules for operators who already run that estate. It is **not** the recommended multi-cloud path, not required for `hobo up`, and not implied by yard-first placement.
4. **IaC selection is Yard-scoped** (or Matching under the selected Yard). Camps remain **provider-neutral until attached**; they do not pin cloud or IaC engines ([yard-first-placement ADR](./adr/yard-first-placement.md)).

## Why not Nix-default

| Pressure | Stance |
|---|---|
| Multi-cloud portability | Pulumi/Crossplane/TF/OpenTofu already map cleanly to provider APIs and Matching; NixOS modules are a different, OS-centric model. |
| Agent / CI blast radius | Default paths must work with ordinary Node/TS toolchains and short-lived sandboxes without requiring a system Nix daemon. |
| Operator choice | Self-hosted Yards **configure** their IaC adapter; forcing Nix would break ADR-0006's "no single primary." |
| Local DX | devenv gives hermetic shells without making every deploy path a flake evaluation. |

## Recommended local shape

```text
# contributor / agent sandbox (illustrative)
devenv.nix          # languages, packages, processes for hobo dev
.envrc / direnv     # optional activation
# NOT required:
# flake.nix that applies production cloud resources as the only IaC path
```

Cloud apply still goes through Yard → Planner → `IacProvider.preview|apply` (or Matching under that Yard). Local devenv never substitutes for a registered cloud IaC adapter.

## Package map (aspirational)

| Surface | Role |
|---|---|
| devenv / direnv (repo tooling) | Local shells, services, agent preflight — **DevX only** |
| `@hobo/iac-pulumi` / `-crossplane` / `-terraform` / `-opentofu` | First-party multi-cloud IaC adapters |
| `@hobo/iac-nix` (optional, later) | Optional adapter for Nix-centric operators; never core default |

## Permanent non-goals

- Replacing Pulumi/TF/Crossplane/OpenTofu with Nix as the only production IaC.
- Requiring flakes to run `hobo dev`, `hobo doctor`, or offline draft proofs.
- Camp-level authoring of `iac: nix()` as a substitute for Yard provider selection.

## Related

- [ADR-0006](./adr/01-architecture-core.md#adr-0006) — pluggable IaC; no single primary
- [yard-first-placement ADR](./adr/yard-first-placement.md) — Yard owns provider; Camp neutral until attached
- [developer-experience.md](./developer-experience.md#plan-07) — CLI / local DX
- [control-plane.md](./control-plane.md#plan-04) — `IacProvider` drivers
- [architecture.md](./architecture.md#plan-10) — monorepo package layout (`iac/`)
