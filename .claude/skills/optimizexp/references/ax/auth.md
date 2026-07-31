---
type: Agent Skill Reference
title: "OptimizeXP AX — AUTH and secrets"
description: "AUTH.md patterns, API keys, egress risk, and agent-safe credential handling."
tags: [hobo, optimizexp, ax, auth, secrets]
timestamp: 2026-07-30T00:00:00Z
---

# AX — AUTH.md, keys, egress

## Purpose of AUTH.md (repo pattern)

A root or docs **AUTH.md** (or equivalent section in `docs/agent-tooling.md` + `.env.example`) should answer:

1. Which tools need keys?
2. Which env vars?
3. What data leaves the machine?
4. How to run fully offline / no-key?
5. How to revoke / rotate?

If `AUTH.md` is missing, treat `docs/agent-tooling.md` § Keys & risks + `.env.example` as the stand-in, and file a finding to add `AUTH.md` when key surface grows.

## HoBo key surface

| Tool | Key | Egress |
|---|---|---|
| gbrain | OpenAI / ZeroEntropy / Voyage | embeds + queries |
| SkillOpt live backends | per backend | prompts/code to provider |
| Superpowers | none (optional telemetry) | telemetry if enabled |
| Serena / headroom / RTK / improve / caveman / ponytail | none | local |

## Harms checklist

- Keys committed or printed in bus transcripts
- Agents asked to paste `.env` contents
- Docs that imply endorsement or unsafe multi-tenant key sharing
- Plaintext secrets in agent context, events, or IaC (product rule: secretless-first)

## Friction / uncertainty

- Tool fails with generic error when key missing
- Multiple places document different variable names
- No `--no-gbrain` style escape hatch in setup

## Optimization moves

1. Single AUTH surface with tables.
2. Fail closed with remediation one-liners.
3. Default setup path requires zero cloud keys.
4. Bus transcripts redact secret-shaped strings.
