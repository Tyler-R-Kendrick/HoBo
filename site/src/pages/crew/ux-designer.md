---
layout: ../../layouts/Docs.astro
title: UX Designer operator
description: "Crew UX Designer: generate and maintain app UI against design.md through the ui-render port."
---

# UX Designer operator

**Mission:** generate and maintain the application **UI** against **design.md** through the `ui-render` port.

## What it does

- Produces UI artifacts typed from domain records and reactive to materializations.
- Enforces design-system gates: violations of design.md are **blocked**, not “best effort.”
- Uses MCP tools such as `generate-ui` / `update-ui`.
- Persists mutations with the same provenance/policy path as other generated code.

## Engines behind `ui-render`

OpenUI / json-render / mcp-apps or custom adapters — swappable; design.md remains the trust gate.

## Policy

UI that would ship PII-laden patterns or break accessibility gates is a policy/guardrail concern, not a silent merge.

## Related

[SWE](/HoBo/crew/swe/) · [Shared model](/HoBo/crew/shared-model/)
