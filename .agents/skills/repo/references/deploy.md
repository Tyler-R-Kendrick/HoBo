---
type: Agent Skill Reference
title: "Deploy and release handoff"
description: "Handle deploy and release work with mocked default checks, explicit live-service boundaries, and clean handoff evidence."
tags: [hobo, repo, deploy, release]
timestamp: 2026-06-30T00:00:00Z
---

# Deploy And Release Handoff

Deploy only when the user asks for deployment or the task is explicitly release-oriented. Default repo validation must not require live downstream services.

## Deploy Rules

- Read the deployment or release docs before running deploy commands.
- Prefer mocked service-boundary checks in normal agent loops.
- Treat live service checks as manual or release-only unless the task explicitly opts in.
- Capture command, environment, target, and result in the PR or release notes.
- Do not bypass failed status checks to deploy or merge.

## Handoff

When the final deploy or merge is owned by another worker or policy, report the PR, branch, check state, mergeability state, and remaining owner action.
